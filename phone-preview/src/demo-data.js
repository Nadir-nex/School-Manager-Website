// Deterministic synthetic school data for the browser demonstration.
// This module never touches a real database or network. It produces a
// coherent domain model plus derived dashboard metrics.

const FIRST_NAMES = ["Amine", "Lina", "Yacine", "Sara", "Mohamed", "Nadia", "Karim", "Imane", "Sofiane", "Meriem", "Walid", "Dounia"];
const LAST_NAMES = ["Benali", "Kaci", "Amrane", "Boudiaf", "Hadj", "Mebarki", "Zeroual", "Belkacem", "Toumi", "Ait", "Saadi", "Mansouri"];
const GROUP_NAMES = ["Mathematics", "Physics", "French", "English", "Arabic", "Science", "Support", "Advanced"];
const TEACHER_NAMES = ["Amine Benali", "Sara Haddad", "Karim Toumi", "Nadia Mansouri"];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedNumber(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) return Math.trunc(seed) || 1;
  const text = String(seed ?? "42");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

function int(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function addMonths(year, month, delta) {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

function dateFor(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function generateDemoData(options = {}) {
  const now = new Date();
  const selectedMonth = options.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yearText, monthText] = String(selectedMonth).split("-");
  const year = Number(yearText) || now.getFullYear();
  const month = Number(monthText) || (now.getMonth() + 1);
  const studentCount = Math.max(1, Number(options.studentCount) || 200);
  const groupCount = Math.max(1, Number(options.groupCount) || Math.max(4, Math.round(studentCount / 24)));
  const teacherCount = Math.min(TEACHER_NAMES.length, Math.max(1, Number(options.teacherCount) || 3));
  const rng = mulberry32(seedNumber(options.seed));

  const teachers = Array.from({ length: teacherCount }, (_, index) => ({
    id: index + 1,
    name: TEACHER_NAMES[index],
    archived: index === teacherCount - 1 && rng() < 0.15
  }));

  const groups = Array.from({ length: groupCount }, (_, index) => {
    const priceRoll = rng();
    const price = priceRoll < 0.12 ? null : int(rng, 1200, 3200);
    const archived = index === groupCount - 1 && rng() < 0.12;
    const durationStart = rng() < 0.25 ? addMonths(year, month, -1) : { year, month };
    const weekdays = [...new Set([int(rng, 0, 6), int(rng, 0, 6)])].sort((a, b) => a - b);
    return {
      id: index + 1,
      name: `${pick(rng, GROUP_NAMES)} — Group ${String.fromCharCode(65 + (index % 8))}`,
      price,
      teacherId: rng() < 0.1 ? null : ((index % teacherCount) + 1),
      archived,
      weekdays,
      startYear: durationStart.year,
      startMonth: durationStart.month,
      endYear: year,
      endMonth: month
    };
  });

  const students = Array.from({ length: studentCount }, (_, index) => ({
    id: index + 1,
    studentNumber: 100 + index + 1,
    name: `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`,
    joinDate: rng() < 0.2 ? dateFor(year, month, int(rng, 2, 20)) : dateFor(year - 1, month, int(rng, 1, 28)),
    archived: index < 3 && rng() < 0.4
  }));

  const memberships = [];
  for (const student of students) {
    if (student.archived) continue;
    const primaryGroup = (student.id % groupCount) + 1;
    memberships.push({ studentId: student.id, groupId: primaryGroup });
    if (rng() < 0.16) {
      const secondGroup = ((student.id + 3) % groupCount) + 1;
      if (secondGroup !== primaryGroup) memberships.push({ studentId: student.id, groupId: secondGroup });
    }
  }

  const teacherAssignments = groups
    .filter((group) => group.teacherId !== null && !group.archived)
    .map((group) => ({ teacherId: group.teacherId, groupId: group.id }));

  const payments = [];
  let paymentId = 1;
  const coveredMonths = [];
  for (let offset = -5; offset <= 0; offset += 1) coveredMonths.push(addMonths(year, month, offset));

  for (const covered of coveredMonths) {
    for (const membership of memberships) {
      const group = groups.find((item) => item.id === membership.groupId);
      const student = students.find((item) => item.id === membership.studentId);
      if (!group || !student || group.archived || student.archived) continue;
      if (rng() > 0.72 && covered.year === year && covered.month === month) continue;
      if (rng() > 0.86 && !(covered.year === year && covered.month === month)) continue;

      const price = group.price;
      let amount;
      const roll = rng();
      if (price === null) {
        amount = int(rng, 500, 2500);
      } else if (roll < 0.72) {
        amount = price;
      } else if (roll < 0.86) {
        amount = Math.max(1, price - int(rng, 100, Math.max(100, Math.round(price * 0.35))));
      } else {
        amount = price + int(rng, 1, Math.max(1, Math.round(price * 0.1)));
      }

      const cashMonth = rng() < 0.85 ? covered : addMonths(covered.year, covered.month, 1);
      const paymentDate = dateFor(cashMonth.year, cashMonth.month, int(rng, 1, 28));
      payments.push({
        id: paymentId++,
        studentId: student.id,
        groupId: group.id,
        year: covered.year,
        month: covered.month,
        amount,
        paymentDate
      });
    }
  }

  const sessions = [];
  let sessionId = 1;
  const attendance = [];
  for (const group of groups) {
    if (group.archived) continue;
    const sessionCount = int(rng, 1, 4);
    for (let index = 0; index < sessionCount; index += 1) {
      const day = Math.min(28, 3 + index * 7 + int(rng, 0, 2));
      const initialized = rng() > 0.28;
      const session = {
        id: sessionId++,
        groupId: group.id,
        sessionDate: dateFor(year, month, day),
        startTime: "09:00",
        endTime: "10:30",
        initialized
      };
      sessions.push(session);

      if (!initialized) continue;
      const roster = memberships.filter((item) => item.groupId === group.id).map((item) => item.studentId);
      const uniqueRoster = [...new Set(roster)];
      for (const studentId of uniqueRoster) {
        if (rng() < 0.82) attendance.push({ sessionId: session.id, studentId });
      }
    }
  }

  return {
    selectedMonth: { year, month },
    seed: options.seed ?? 42,
    teachers,
    groups,
    students,
    memberships,
    teacherAssignments,
    payments,
    sessions,
    attendance
  };
}

export function computeDashboard(data) {
  const selected = data.selectedMonth;
  const activeStudents = data.students.filter((student) => !student.archived).length;
  const activeGroups = data.groups.filter((group) => !group.archived).length;
  const activeTeachers = data.teachers.filter((teacher) => !teacher.archived).length;

  const selectedPayments = data.payments.filter((payment) => payment.year === selected.year && payment.month === selected.month);
  const collected = selectedPayments.reduce((sum, payment) => sum + payment.amount, 0);

  const cells = [];
  for (const membership of data.memberships) {
    const student = data.students.find((item) => item.id === membership.studentId);
    const group = data.groups.find((item) => item.id === membership.groupId);
    if (!student || !group || student.archived || group.archived) continue;
    const payment = selectedPayments.find((item) => item.studentId === student.id && item.groupId === group.id);
    cells.push({ student, group, payment });
  }

  const paidCount = cells.filter((cell) => cell.payment).length;
  const partialCount = cells.filter((cell) => cell.payment && cell.group.price !== null && cell.payment.amount < cell.group.price).length;
  const unpaidCount = cells.filter((cell) => !cell.payment).length;
  const outstanding = cells.reduce((sum, cell) => {
    if (!cell.group.price || !cell.payment) {
      return sum + (cell.group.price || 0);
    }
    return sum + Math.max(0, cell.group.price - cell.payment.amount);
  }, 0);
  const unknownPriceCount = cells.filter((cell) => cell.group.price === null).length;

  const selectedSessions = data.sessions.filter((session) => session.sessionDate.startsWith(monthKey(selected.year, selected.month)));
  const initializedSessions = selectedSessions.filter((session) => session.initialized);
  const presentCount = data.attendance.filter((row) => initializedSessions.some((session) => session.id === row.sessionId)).length;
  const rosterSize = initializedSessions.reduce((sum, session) => {
    const groupMembers = new Set(data.memberships.filter((item) => item.groupId === session.groupId).map((item) => item.studentId));
    return sum + groupMembers.size;
  }, 0);
  const absentCount = Math.max(0, rosterSize - presentCount);
  const notRecordedSessions = selectedSessions.filter((session) => !session.initialized).length;

  const trendMonths = [];
  for (let offset = -5; offset <= 0; offset += 1) {
    const covered = addMonths(selected.year, selected.month, offset);
    const amount = data.payments
      .filter((payment) => payment.year === covered.year && payment.month === covered.month)
      .reduce((sum, payment) => sum + payment.amount, 0);
    trendMonths.push({ ...covered, amount });
  }

  const attention = [];
  if (unpaidCount > 0) attention.push({ key: "unpaid", count: unpaidCount });
  if (data.groups.some((group) => !group.archived && group.teacherId === null)) {
    attention.push({ key: "unassigned", count: data.groups.filter((group) => !group.archived && group.teacherId === null).length });
  }
  if (unknownPriceCount > 0) attention.push({ key: "unknownPrice", count: unknownPriceCount });
  if (notRecordedSessions > 0) attention.push({ key: "uninitialized", count: notRecordedSessions });

  return {
    activeStudents,
    activeGroups,
    activeTeachers,
    collected,
    paidCount,
    partialCount,
    unpaidCount,
    outstanding,
    unknownPriceCount,
    initializedSessions: initializedSessions.length,
    sessionCount: selectedSessions.length,
    presentCount,
    absentCount,
    notRecordedSessions,
    trendMonths,
    attention
  };
}
