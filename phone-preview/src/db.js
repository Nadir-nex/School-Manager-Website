// Read-only SQLite layer. The ONLY database access the UI gets.
// - Database lives in memory (sql.js), opened from validated ZIP bytes.
// - `PRAGMA query_only = ON`: the engine itself rejects INSERT/UPDATE/
//   DELETE/DDL, verified by tests.
// - Every exported function is a fixed SELECT with bound parameters.
//   There is no generic query entry point and no write API.
const ACTIVE = "archived_at IS NULL";

function rows(db, sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    return out;
  } finally {
    stmt.free();
  }
}

export function openDatabase(SQL, dbBytes) {
  const db = new SQL.Database(dbBytes);
  db.exec("PRAGMA query_only = ON");
  const check = db.exec("PRAGMA integrity_check")[0]?.values?.[0]?.[0];
  if (check !== "ok") {
    db.close();
    const error = new Error("integrity-check failed");
    error.code = "integrity-check";
    throw error;
  }
  return db;
}

export function closeDatabase(db) {
  try {
    db.close();
  } catch {
    /* already closed */
  }
}

function likePattern(search) {
  return `%${String(search || "").trim().toLowerCase()}%`;
}

export function listTeachers(db) {
  return rows(db, `SELECT id, name FROM teachers WHERE ${ACTIVE} ORDER BY name COLLATE NOCASE`);
}

export function listGroups(db, { teacherId = null, search = "" } = {}) {
  const params = [];
  let where = `g.${ACTIVE}`;
  if (teacherId) {
    where += ` AND tg.teacher_id = ?`;
    params.push(Number(teacherId));
  }
  if (String(search).trim()) {
    where += ` AND LOWER(g.name) LIKE ?`;
    params.push(likePattern(search));
  }
  return rows(
    db,
    `SELECT g.id, g.name, g.price,
            t.id AS teacher_id, t.name AS teacher_name,
            (SELECT COUNT(*) FROM student_groups sg
              JOIN students s ON s.id = sg.student_id
             WHERE sg.group_id = g.id AND s.${ACTIVE}) AS student_count
     FROM groups g
     LEFT JOIN teacher_groups tg ON tg.group_id = g.id
     LEFT JOIN teachers t ON t.id = tg.teacher_id AND t.${ACTIVE}
     WHERE ${where}
     ORDER BY g.name COLLATE NOCASE`,
    params
  );
}

export function getGroup(db, groupId) {
  const found = listGroups(db).filter((g) => g.id === Number(groupId));
  return found[0] || null;
}

export function listStudentsInGroup(db, groupId, { search = "" } = {}) {
  const params = [Number(groupId)];
  let extra = "";
  if (String(search).trim()) {
    extra = ` AND (LOWER(s.name) LIKE ? OR CAST(s.student_number AS TEXT) LIKE ?)`;
    const q = String(search).trim().toLowerCase();
    params.push(`%${q}%`, `%${q}%`);
  }
  return rows(
    db,
    `SELECT s.id, s.student_number, s.name
     FROM student_groups sg JOIN students s ON s.id = sg.student_id
     WHERE sg.group_id = ? AND s.${ACTIVE} ${extra}
     ORDER BY s.name COLLATE NOCASE`,
    params
  );
}

export function getStudent(db, studentId) {
  const found = rows(db, `SELECT id, student_number, name FROM students WHERE id = ? AND ${ACTIVE}`, [
    Number(studentId)
  ]);
  if (!found[0]) return null;
  const groups = rows(
    db,
    `SELECT g.id, g.name, g.price,
            t.id AS teacher_id, t.name AS teacher_name
     FROM student_groups sg
     JOIN groups g ON g.id = sg.group_id
     LEFT JOIN teacher_groups tg ON tg.group_id = g.id
     LEFT JOIN teachers t ON t.id = tg.teacher_id AND t.${ACTIVE}
     WHERE sg.student_id = ?
     ORDER BY g.name COLLATE NOCASE`,
    [Number(studentId)]
  );
  return { ...found[0], groups };
}

// History-safe: LEFT JOIN groups so payments survive group changes
// and group archival (mirrors desktop listPaymentHistory).
export function studentPaymentHistory(db, studentId) {
  return rows(
    db,
    `SELECT p.year, p.month, p.payment_date, p.amount, p.group_id,
            g.name AS group_name
     FROM payments p LEFT JOIN groups g ON g.id = p.group_id
     WHERE p.student_id = ?
     ORDER BY p.year DESC, p.month DESC`,
    [Number(studentId)]
  );
}

// Month matrix over CURRENT enrollment (desktop listPaymentStatusForPeriod
// semantics): one row per enrolled student × group cell.
export function monthPayments(db, { year, month, groupId = null, teacherId = null, search = "" } = {}) {
  const params = [Number(year), Number(month)];
  let extra = "";
  if (groupId) {
    extra += ` AND g.id = ?`;
    params.push(Number(groupId));
  }
  if (teacherId) {
    extra += ` AND tg.teacher_id = ?`;
    params.push(Number(teacherId));
  }
  if (String(search).trim()) {
    extra += ` AND (LOWER(s.name) LIKE ? OR CAST(s.student_number AS TEXT) LIKE ?)`;
    const q = String(search).trim().toLowerCase();
    params.push(`%${q}%`, `%${q}%`);
  }
  return rows(
    db,
    `SELECT s.id AS student_id, s.student_number, s.name AS student_name,
            g.id AS group_id, g.name AS group_name, g.price,
            t.name AS teacher_name,
            p.amount, p.payment_date,
            CASE WHEN p.id IS NULL THEN 0 ELSE 1 END AS paid
     FROM student_groups sg
     JOIN students s ON s.id = sg.student_id
     JOIN groups g ON g.id = sg.group_id
     LEFT JOIN teacher_groups tg ON tg.group_id = g.id
     LEFT JOIN teachers t ON t.id = tg.teacher_id AND t.${ACTIVE}
     LEFT JOIN payments p ON p.student_id = s.id AND p.group_id = g.id
       AND p.year = ? AND p.month = ?
     WHERE s.${ACTIVE} AND g.${ACTIVE} ${extra}
     ORDER BY g.name COLLATE NOCASE, s.name COLLATE NOCASE`,
    params
  );
}

// Distinct covered months present in payments (for the month selector).
export function monthsAvailable(db) {
  return rows(
    db,
    `SELECT DISTINCT year, month FROM payments ORDER BY year DESC, month DESC`
  );
}

export function groupMonthSummary(db, { year, month, groupId }) {
  const cell = rows(
    db,
    `SELECT COUNT(*) AS students,
            COUNT(p.id) AS paid_count,
            COALESCE(SUM(p.amount), 0) AS collected
     FROM student_groups sg
     JOIN students s ON s.id = sg.student_id
     JOIN groups g ON g.id = sg.group_id
     LEFT JOIN payments p ON p.student_id = s.id AND p.group_id = g.id
       AND p.year = ? AND p.month = ?
     WHERE sg.group_id = ? AND s.${ACTIVE} AND g.${ACTIVE}`,
    [Number(year), Number(month), Number(groupId)]
  )[0];
  return cell || { students: 0, paid_count: 0, collected: 0 };
}

export function sessionsForGroupMonth(db, groupId, yearMonth) {
  return rows(
    db,
    `SELECT se.id, se.session_date, se.start_time, se.end_time,
            CASE WHEN st.session_id IS NULL THEN 0 ELSE 1 END AS initialized,
            (SELECT COUNT(*) FROM attendance a WHERE a.session_id = se.id) AS present_count
     FROM sessions se
     LEFT JOIN attendance_session_state st ON st.session_id = se.id
     WHERE se.group_id = ? AND substr(se.session_date, 1, 7) = ?
     ORDER BY se.session_date, se.start_time`,
    [Number(groupId), String(yearMonth)]
  );
}

// Presence-based: rows = present. Students without a row in an
// initialized session were recorded absent; in an uninitialized
// session their status is unknown (never reported as absent).
export function sessionAttendance(db, sessionId) {
  const session = rows(
    db,
    `SELECT se.id, se.group_id, se.session_date, se.start_time, se.end_time,
            g.name AS group_name,
            CASE WHEN st.session_id IS NULL THEN 0 ELSE 1 END AS initialized
     FROM sessions se
     JOIN groups g ON g.id = se.group_id
     LEFT JOIN attendance_session_state st ON st.session_id = se.id
     WHERE se.id = ?`,
    [Number(sessionId)]
  )[0];
  if (!session) return null;
  const presentIds = new Set(
    rows(db, `SELECT student_id FROM attendance WHERE session_id = ?`, [Number(sessionId)]).map(
      (r) => r.student_id
    )
  );
  const roster = listStudentsInGroup(db, session.group_id);
  return {
    ...session,
    students: roster.map((s) => ({
      ...s,
      present: presentIds.has(s.id) ? 1 : 0,
      status: session.initialized ? (presentIds.has(s.id) ? "present" : "absent") : "unknown"
    }))
  };
}
