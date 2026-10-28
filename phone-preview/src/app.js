// Phone-first read-only UI. Hash router, three sections, demo banner.
// All data comes from the read-only db.js layer; no writes exist here.
import { translate, isRtl, availableLanguages } from "./i18n.js";
import * as DB from "./db.js";
import { createDemoZipProvider, createCloudBackupProvider } from "./providers.js";
import { exportXlsx, printReport, formatDZD } from "./export.js";
import { parseConnectionPayload, resolveInstallation } from "./scan.js";

const state = {
  lang: localStorage.getItem("mc.lang") || "ar",
  db: null,
  manifest: null,
  sourceLabel: "",
  demoMode: true,
  resolved: null
};

if (!availableLanguages().includes(state.lang)) state.lang = "ar";

const t = (key) => translate(state.lang, key);
const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function setLang(lang) {
  if (!availableLanguages().includes(lang)) return;
  state.lang = lang;
  try {
    localStorage.setItem("mc.lang", lang);
  } catch {
    /* private mode */
  }
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl(lang) ? "rtl" : "ltr";
  render();
}

function monthLabel(year, month) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function currentFilters() {
  const hash = location.hash || "#/";
  const [, query] = hash.split("?");
  return Object.fromEntries(new URLSearchParams(query || ""));
}

function go(path) {
  if (location.hash === `#${path}`) render();
  else location.hash = `#${path}`;
}

function withFilters(base, patch) {
  const current = currentFilters();
  const merged = { ...current, ...patch };
  for (const key of Object.keys(merged)) {
    if (merged[key] === "" || merged[key] == null) delete merged[key];
  }
  const query = new URLSearchParams(merged).toString();
  return `${base}${query ? `?${query}` : ""}`;
}

function shell(content, { title = "", showBack = true, actions = "" } = {}) {
  return `
  <header class="topbar no-print">
    ${showBack ? `<button class="icon-btn" data-nav="#/" aria-label="${esc(t("nav.back"))}">‹</button>` : `<span class="logo">◈</span>`}
    <h1>${esc(title)}</h1>
    <select id="lang-select" aria-label="${esc(t("common.language"))}">
      ${availableLanguages()
        .map((l) => `<option value="${l}" ${l === state.lang ? "selected" : ""}>${l.toUpperCase()}</option>`)
        .join("")}
    </select>
  </header>
  ${state.demoMode ? `<div class="demo-banner">${esc(t("app.demoBadge"))}</div>` : ""}
  <main class="content">${content}</main>
  <div class="actions no-print">${actions}</div>`;
}

function emptyState(text) {
  return `<p class="empty">${esc(text)}</p>`;
}

// ---------------- Home ----------------
// Build marker shown on the home screen so any install can be
// identified at a glance (must match android versionName).
const APP_VERSION = "1.3";

function viewHome() {
  return shell(
    `
    <p class="tagline">${esc(t("home.tagline"))}</p>
    <nav class="home-nav">
      <button class="home-btn scan-btn" data-nav="/scan"><span class="home-emoji">📷</span><span>${esc(t("nav.scan"))}</span></button>
      <button class="home-btn" data-nav="/payments"><span class="home-emoji">💰</span><span>${esc(t("nav.payments"))}</span></button>
      <button class="home-btn" data-nav="/students"><span class="home-emoji">👥</span><span>${esc(t("nav.students"))}</span></button>
      <button class="home-btn" data-nav="/attendance"><span class="home-emoji">📋</span><span>${esc(t("nav.attendance"))}</span></button>
    </nav>
    <p class="source-line">${esc(t("home.source"))}: ${esc(state.sourceLabel || t("common.unknown"))}</p>
    <p class="source-line">App v${esc(APP_VERSION)}</p>`,
    { title: t("app.title"), showBack: false }
  );
}

// ---------------- Students ----------------
function viewStudents() {
  const f = currentFilters();
  const teachers = DB.listTeachers(state.db);
  const groups = DB.listGroups(state.db, { teacherId: f.teacher || null, search: f.q || "" });
  const options = (items, value, label) =>
    `<option value="">${esc(t("common.all"))}</option>` +
    items.map((i) => `<option value="${i.id}" ${String(i.id) === String(value || "") ? "selected" : ""}>${esc(i.name)}</option>`).join("");

  const list = groups.length
    ? `<ul class="cards">${groups
        .map(
          (g) => `<li><button class="card" data-nav="/students/group/${g.id}">
            <span class="card-title">${esc(g.name)}</span>
            <span class="card-meta">${g.student_count} ${esc(t("common.students"))} · ${esc(g.teacher_name || t("common.noTeacher"))}${
            g.price == null ? ` · ${esc(t("common.noPrice"))}` : ""
          }</span>
          </button></li>`
        )
        .join("")}</ul>`
    : emptyState(t("attendance.empty"));

  return shell(
    `
    <h2>${esc(t("students.groups"))}</h2>
    <div class="filters no-print">
      <input id="f-q" type="search" placeholder="${esc(t("students.searchGroups"))}" value="${esc(f.q || "")}" />
      <label>${esc(t("students.filterTeacher"))}
        <select id="f-teacher">${options(teachers, f.teacher)}</select>
      </label>
    </div>
    ${list}`,
    { title: t("students.title") }
  );
}

function viewGroupDetail(groupId) {
  const group = DB.getGroup(state.db, groupId);
  if (!group) return shell(emptyState(t("errors.loadFailed")), { title: t("students.title") });
  const f = currentFilters();
  const students = DB.listStudentsInGroup(state.db, groupId, { search: f.q || "" });
  return shell(
    `
    <h2>${esc(group.name)}</h2>
    <p class="meta">${esc(group.teacher_name || t("common.noTeacher"))} · ${
      group.price == null ? esc(t("common.noPrice")) : esc(formatDZD(group.price, state.lang))
    }</p>
    <h3>${esc(t("students.inGroup"))} (${students.length})</h3>
    <div class="filters no-print">
      <input id="f-q" type="search" placeholder="${esc(t("students.searchStudents"))}" value="${esc(f.q || "")}" />
    </div>
    ${
      students.length
        ? `<ul class="cards">${students
            .map(
              (s) => `<li><button class="card" data-nav="/students/detail/${s.id}">
                <span class="card-title">${esc(s.name)}</span>
                <span class="card-meta">#${esc(s.student_number ?? "—")}</span>
              </button></li>`
            )
            .join("")}</ul>`
        : emptyState(t("attendance.empty"))
    }
    <div class="export-row no-print">
      <button class="btn" id="btn-print">${esc(t("common.print"))}</button>
      <button class="btn" id="btn-xlsx">${esc(t("common.excel"))}</button>
    </div>`,
    { title: group.name }
  );
}

function viewStudentDetail(studentId) {
  const student = DB.getStudent(state.db, studentId);
  if (!student) return shell(emptyState(t("errors.loadFailed")), { title: t("students.title") });
  const history = DB.studentPaymentHistory(state.db, studentId);
  return shell(
    `
    <h2>${esc(student.name)}</h2>
    <p class="meta">#${esc(student.student_number ?? "—")}</p>
    <h3>${esc(t("students.memberOf"))}</h3>
    <ul class="list">${student.groups.map((g) => `<li>${esc(g.name)} <span class="muted">· ${esc(g.teacher_name || t("common.noTeacher"))}</span></li>`).join("") || `<li>${esc(t("common.unknown"))}</li>`}</ul>
    <p class="note">${esc(t("students.historyNote"))}</p>
    <h3>${esc(t("payments.history"))}</h3>
    ${
      history.length
        ? `<ul class="list">${history
            .map(
              (p) => `<li>${esc(monthLabel(p.year, p.month))} · ${esc(p.group_name || t("common.unknown"))} · ${esc(formatDZD(p.amount, state.lang))} <span class="muted">${esc(p.payment_date)}</span></li>`
            )
            .join("")}</ul>`
        : emptyState(t("attendance.empty"))
    }
    <div class="export-row no-print">
      <button class="btn" id="btn-print">${esc(t("common.print"))}</button>
      <button class="btn" id="btn-xlsx">${esc(t("common.excel"))}</button>
    </div>`,
    { title: student.name }
  );
}

// ---------------- Payments ----------------
function defaultMonth() {
  const months = DB.monthsAvailable(state.db);
  if (months[0]) return { year: months[0].year, month: months[0].month };
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function viewPayments() {
  const f = currentFilters();
  const def = defaultMonth();
  const year = Number(f.year || def.year);
  const month = Number(f.month || def.month);
  const teachers = DB.listTeachers(state.db);
  const groups = DB.listGroups(state.db, { teacherId: f.teacher || null });
  const rows = DB.monthPayments(state.db, {
    year,
    month,
    groupId: f.group || null,
    teacherId: f.teacher || null,
    search: f.q || ""
  });
  const summary = f.group
    ? DB.groupMonthSummary(state.db, { year, month, groupId: f.group })
    : {
        students: new Set(rows.map((r) => `${r.student_id}:${r.group_id}`)).size,
        paid_count: rows.filter((r) => r.paid).length,
        collected: rows.filter((r) => r.paid).reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
      };
  const differs = rows.some((r) => r.paid && r.price != null && Number(r.amount) !== Number(r.price));
  const groupOptions =
    `<option value="">${esc(t("common.all"))}</option>` +
    groups.map((g) => `<option value="${g.id}" ${String(g.id) === String(f.group || "") ? "selected" : ""}>${esc(g.name)}</option>`).join("");
  const teacherOptions =
    `<option value="">${esc(t("common.all"))}</option>` +
    teachers.map((i) => `<option value="${i.id}" ${String(i.id) === String(f.teacher || "") ? "selected" : ""}>${esc(i.name)}</option>`).join("");

  return shell(
    `
    <h2>${esc(t("payments.title"))} — ${esc(monthLabel(year, month))}</h2>
    <div class="filters no-print">
      <label>${esc(t("payments.month"))} <input id="f-month" type="month" value="${esc(monthLabel(year, month))}" /></label>
      <input id="f-q" type="search" placeholder="${esc(t("students.searchStudents"))}" value="${esc(f.q || "")}" />
      <label>${esc(t("students.filterGroup"))} <select id="f-group">${groupOptions}</select></label>
      <label>${esc(t("students.filterTeacher"))} <select id="f-teacher">${teacherOptions}</select></label>
    </div>
    <div class="summary">
      <div><strong>${summary.students}</strong><span>${esc(t("payments.summaryStudents"))}</span></div>
      <div><strong>${summary.paid_count}</strong><span>${esc(t("payments.summaryPaid"))}</span></div>
      <div><strong>${esc(formatDZD(summary.collected, state.lang))}</strong><span>${esc(t("payments.collected"))}</span></div>
    </div>
    ${differs ? `<p class="note">${esc(t("payments.amountDiffersNote"))}</p>` : ""}
    ${
      rows.length
        ? `<ul class="cards">${rows
            .map(
              (r) => `<li><button class="card" data-nav="/payments/student/${r.student_id}">
                <span class="card-title">${esc(r.student_name)}</span>
                <span class="badge ${r.paid ? "paid" : "unpaid"}">${esc(r.paid ? t("payments.paid") : t("payments.unpaid"))}</span>
                <span class="card-meta">${esc(r.group_name)} · ${
                r.paid ? `${esc(formatDZD(r.amount, state.lang))} · ${esc(r.payment_date)}` : esc(t("payments.coveredMonth")) + " " + esc(monthLabel(year, month))
              }</span>
              </button></li>`
            )
            .join("")}</ul>`
        : emptyState(t("attendance.empty"))
    }
    <div class="export-row no-print">
      <button class="btn" id="btn-print">${esc(t("common.print"))}</button>
      <button class="btn" id="btn-xlsx">${esc(t("common.excel"))}</button>
    </div>`,
    { title: t("payments.title") }
  );
}

// ---------------- Attendance ----------------
function viewAttendance() {
  const f = currentFilters();
  const teachers = DB.listTeachers(state.db);
  const groups = DB.listGroups(state.db, { teacherId: f.teacher || null });
  const teacherOptions =
    `<option value="">${esc(t("common.all"))}</option>` +
    teachers.map((i) => `<option value="${i.id}" ${String(i.id) === String(f.teacher || "") ? "selected" : ""}>${esc(i.name)}</option>`).join("");
  const groupOptions =
    `<option value="">—</option>` +
    groups.map((g) => `<option value="${g.id}" ${String(g.id) === String(f.group || "") ? "selected" : ""}>${esc(g.name)}</option>`).join("");
  const def = defaultMonth();
  const ym = f.ym || monthLabel(def.year, def.month);
  let sessions = [];
  if (f.group) sessions = DB.sessionsForGroupMonth(state.db, f.group, ym);

  return shell(
    `
    <h2>${esc(t("attendance.title"))}</h2>
    <div class="filters no-print">
      <label>${esc(t("students.filterTeacher"))} <select id="f-teacher">${teacherOptions}</select></label>
      <label>${esc(t("students.filterGroup"))} <select id="f-group">${groupOptions}</select></label>
      <label>${esc(t("payments.month"))} <input id="f-ym" type="month" value="${esc(ym)}" /></label>
      <input id="f-q" type="search" placeholder="${esc(t("students.searchStudents"))}" value="${esc(f.q || "")}" />
    </div>
    ${
      !f.group
        ? emptyState(t("students.filterGroup"))
        : sessions.length
          ? `<ul class="cards">${sessions
              .map(
                (s) => `<li><button class="card" data-nav="/attendance/session/${s.id}">
                  <span class="card-title">${esc(s.session_date)} · ${esc(s.start_time)}</span>
                  <span class="card-meta">${s.present_count} ${esc(t("attendance.present"))}${
                  s.initialized ? "" : ` · ${esc(t("attendance.uninitialized"))}`
                }</span>
                </button></li>`
              )
              .join("")}</ul>`
          : emptyState(t("attendance.empty"))
    }`,
    { title: t("attendance.title") }
  );
}

function viewSession(sessionId) {
  const f = currentFilters();
  const detail = DB.sessionAttendance(state.db, sessionId);
  if (!detail) return shell(emptyState(t("errors.loadFailed")), { title: t("attendance.title") });
  const q = String(f.q || "").trim().toLowerCase();
  const students = detail.students.filter(
    (s) => !q || s.name.toLowerCase().includes(q) || String(s.student_number || "").includes(q)
  );
  return shell(
    `
    <h2>${esc(detail.group_name)} — ${esc(detail.session_date)}</h2>
    <p class="meta">${esc(detail.start_time)}–${esc(detail.end_time)}</p>
    ${detail.initialized ? "" : `<p class="note">${esc(t("attendance.notRecorded"))}</p>`}
    <div class="filters no-print">
      <input id="f-q" type="search" placeholder="${esc(t("students.searchStudents"))}" value="${esc(f.q || "")}" />
    </div>
    <ul class="list">${students
      .map(
        (s) => `<li>${esc(s.name)} <span class="muted">#${esc(s.student_number ?? "—")}</span>
          <span class="badge ${s.status === "present" ? "paid" : s.status === "absent" ? "unpaid" : ""}">${
          s.status === "present" ? esc(t("attendance.present")) : s.status === "absent" ? esc(t("attendance.absent")) : esc(t("attendance.notRecorded"))
        }</span></li>`
      )
      .join("")}</ul>
    <div class="export-row no-print">
      <button class="btn" id="btn-print">${esc(t("common.print"))}</button>
      <button class="btn" id="btn-xlsx">${esc(t("common.excel"))}</button>
    </div>`,
    { title: t("attendance.title") }
  );
}

// ---------------- Scan (desktop connection) ----------------
// Camera scanning runs entirely in the WebView: getUserMedia (the native
// shell bridges the permission prompt, no native scanner component) +
// jsQR decoding per frame. Duplicate frames are suppressed; an accepted
// scan stops the camera before any network use.
const scanSession = { stream: null, raf: 0, running: false, busy: false, lastText: "", lastAt: 0 };
const scanUi = { phase: "idle", code: null, data: null };

function stopCameraTracks() {
  scanSession.running = false;
  if (scanSession.raf) cancelAnimationFrame(scanSession.raf);
  scanSession.raf = 0;
  try {
    const video = document.querySelector("#scan-video");
    if (video) video.srcObject = null;
  } catch {
    /* ignore */
  }
  if (scanSession.stream) {
    try {
      scanSession.stream.getTracks().forEach((track) => track.stop());
    } catch {
      /* ignore */
    }
    scanSession.stream = null;
  }
}

function stopScan() {
  stopCameraTracks();
  scanSession.busy = false;
}

function scanErrorKey(code) {
  const map = {
    "foreign-qr": "scan.foreign",
    "unsupported-version": "scan.version",
    "resolve-unreachable": "scan.offline",
    unknown_installation: "scan.unknown",
    customer_locked: "scan.locked"
  };
  return map[code] || "scan.invalid";
}

function showScanResult(phase, code = null, data = null) {
  scanUi.phase = phase;
  scanUi.code = code;
  scanUi.data = data;
  const hash = (location.hash || "#/").split("?")[0];
  if (hash === "#/scan") render();
}

async function handleScannedText(text) {
  const now = Date.now();
  if (scanSession.busy) return;
  if (text === scanSession.lastText && now - scanSession.lastAt < 3000) return;
  scanSession.lastText = text;
  scanSession.lastAt = now;
  let hashes;
  try {
    ({ hashes } = parseConnectionPayload(text));
  } catch (error) {
    showScanResult("error", (error && error.code) || "invalid-qr");
    return;
  }
  scanSession.busy = true;
  stopCameraTracks();
  showScanResult("working");
  try {
    const data = await resolveInstallation({ hashes });
    state.resolved = data;
    showScanResult("success", null, data);
  } catch (error) {
    showScanResult("error", (error && error.code) || "resolve-failed");
  } finally {
    scanSession.busy = false;
  }
}

function scanFrame() {
  if (!scanSession.running) return;
  try {
    const video = document.querySelector("#scan-video");
    const canvas = document.querySelector("#scan-canvas");
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && typeof window.jsQR === "function") {
      const width = 640;
      const height = Math.round((640 * video.videoHeight) / Math.max(1, video.videoWidth)) || 480;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, width, height);
      const found = window.jsQR(ctx.getImageData(0, 0, width, height).data, width, height);
      if (found && found.data) handleScannedText(found.data);
    }
  } catch {
    /* a bad frame must never kill the loop */
  }
  scanSession.raf = requestAnimationFrame(scanFrame);
}

async function startCamera() {
  if (scanSession.running || scanSession.busy) return;
  if (typeof window.jsQR !== "function") {
    showScanResult("error", "invalid-qr");
    return;
  }
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    showScanResult("error", "no-camera");
    return;
  }
  scanUi.phase = "scanning";
  scanUi.code = null;
  render();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    });
    if (!scanSession.running && scanUi.phase === "scanning") {
      // View re-rendered while permission was pending; attach anyway.
    }
    scanSession.stream = stream;
    const video = document.querySelector("#scan-video");
    if (!video) {
      stopCameraTracks();
      return;
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    scanSession.running = true;
    scanSession.raf = requestAnimationFrame(scanFrame);
  } catch (error) {
    stopCameraTracks();
    const name = (error && error.name) || "";
    showScanResult("error", name === "NotAllowedError" || name === "SecurityError" ? "denied" : "no-camera");
  }
}

function formatBytes(size) {
  const n = Number(size);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function viewScan() {
  const phase = scanUi.phase;
  let stage = "";
  if (phase === "success" && scanUi.data) {
    const data = scanUi.data;
    stage = `
    <div class="card success">
      <span class="card-title">${esc(t("scan.successTitle"))}</span>
      ${data.schoolName ? `<span class="card-meta">${esc(t("scan.school"))}: ${esc(data.schoolName)}</span>` : ""}
      ${
        data.backupAvailable
          ? `<span class="card-meta">${esc(t("scan.dataset"))}: ${esc(data.datasetId || "—")}</span>
             <span class="card-meta">${esc(t("scan.publishedAt"))}: ${esc(data.publishedAt || "—")}</span>
             <span class="card-meta num">${esc(t("scan.size"))}: ${esc(formatBytes(data.archiveSize))}</span>`
          : `<span class="card-meta">${esc(t("scan.noBackup"))}</span>`
      }
      <p class="note">${esc(t("scan.downloadPending"))}</p>
    </div>`;
  } else if (phase === "error") {
    const key = scanUi.code === "denied" ? "scan.denied" : scanUi.code === "no-camera" ? "scan.noCamera" : scanErrorKey(scanUi.code);
    stage = `<p class="error">${esc(t(key))}</p>`;
  } else if (phase === "working") {
    stage = `<p>${esc(t("common.loading"))}</p>`;
  }
  const showStart = phase === "idle" || phase === "error";
  return shell(
    `
    <h2>${esc(t("scan.title"))}</h2>
    <div class="scan-stage no-print">
      <video id="scan-video" playsinline muted></video>
      <canvas id="scan-canvas" hidden></canvas>
    </div>
    <p class="meta">${esc(t("scan.hint"))}</p>
    ${stage}
    <div class="export-row no-print">
      ${showStart ? `<button class="btn" id="btn-scan-start">${esc(t("scan.start"))}</button>` : ""}
      <button class="btn" data-nav="#/">${esc(t("scan.cancel"))}</button>
      ${phase === "success" || phase === "error" ? `<button class="btn" id="btn-scan-retry">${esc(t("scan.retry"))}</button>` : ""}
    </div>
    <h3>${esc(t("scan.manualLabel"))}</h3>
    <div class="filters no-print">
      <textarea id="scan-manual" rows="3" dir="ltr" placeholder="${esc(t("scan.manualPlaceholder"))}"></textarea>
      <button class="btn" id="btn-scan-manual">${esc(t("scan.useCode"))}</button>
    </div>`,
    { title: t("scan.title") }
  );
}

// ---------------- Export wiring ----------------
function currentReportData() {
  const hash = location.hash || "#/";
  const path = hash.split("?")[0];
  const f = currentFilters();
  if (path.startsWith("#/payments")) {
    const def = defaultMonth();
    const year = Number(f.year || def.year);
    const month = Number(f.month || def.month);
    const rows = DB.monthPayments(state.db, { year, month, groupId: f.group || null, teacherId: f.teacher || null, search: f.q || "" });
    return {
      name: `payments-${monthLabel(year, month)}`,
      headers: ["Student", "Number", "Group", "Status", "Amount (DZD)", "Payment date"],
      rows: rows.map((r) => [r.student_name, r.student_number ?? "", r.group_name, r.paid ? "paid" : "unpaid", r.paid ? r.amount : "", r.paid ? r.payment_date : ""])
    };
  }
  if (path.startsWith("#/attendance/session/")) {
    const detail = DB.sessionAttendance(state.db, path.split("/")[3]);
    if (!detail) return null;
    return {
      name: `attendance-${detail.session_date}`,
      headers: ["Student", "Number", "Status"],
      rows: detail.students.map((s) => [s.name, s.student_number ?? "", s.status])
    };
  }
  if (path.startsWith("#/students/group/")) {
    const group = DB.getGroup(state.db, path.split("/")[3]);
    if (!group) return null;
    const students = DB.listStudentsInGroup(state.db, group.id, { search: f.q || "" });
    return {
      name: `group-${group.name}`,
      headers: ["Student", "Number", "Group", "Teacher"],
      rows: students.map((s) => [s.name, s.student_number ?? "", group.name, group.teacher_name || ""])
    };
  }
  if (path.startsWith("#/students/detail/")) {
    const student = DB.getStudent(state.db, path.split("/")[3]);
    if (!student) return null;
    const history = DB.studentPaymentHistory(state.db, student.id);
    return {
      name: `student-${student.student_number ?? student.id}`,
      headers: ["Year", "Month", "Group", "Amount (DZD)", "Payment date"],
      rows: history.map((p) => [p.year, p.month, p.group_name || "", p.amount, p.payment_date])
    };
  }
  return null;
}

function bindGlobal() {
  document.body.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) {
      go(nav.dataset.nav);
      return;
    }
    if (event.target.closest("#btn-print")) {
      printReport();
      return;
    }
    if (event.target.closest("#btn-xlsx")) {
      const report = currentReportData();
      if (report) exportXlsx(report.name, [{ name: "Report", headers: report.headers, rows: report.rows }]);
      return;
    }
    if (event.target.closest("#btn-scan-start") || event.target.closest("#btn-scan-retry")) {
      scanUi.phase = "idle";
      scanUi.code = null;
      scanUi.data = null;
      startCamera();
      return;
    }
    if (event.target.closest("#btn-scan-manual")) {
      const field = document.querySelector("#scan-manual");
      if (field) handleScannedText(field.value);
    }
  });
  document.body.addEventListener("change", (event) => {
    if (event.target.id === "lang-select") {
      setLang(event.target.value);
      return;
    }
    const map = { "f-teacher": "teacher", "f-group": "group" };
    if (map[event.target.id]) {
      const base = (location.hash || "#/").split("?")[0].slice(1);
      go(withFilters(base, { ...currentFilters(), [map[event.target.id]]: event.target.value }));
    }
    if (event.target.id === "f-month" && event.target.value) {
      const [year, month] = event.target.value.split("-").map(Number);
      const base = (location.hash || "#/").split("?")[0].slice(1);
      go(withFilters(base, { ...currentFilters(), year, month }));
    }
    if (event.target.id === "f-ym" && event.target.value) {
      const base = (location.hash || "#/").split("?")[0].slice(1);
      go(withFilters(base, { ...currentFilters(), ym: event.target.value }));
    }
  });
  document.body.addEventListener("input", (event) => {
    if (event.target.id === "f-q") {
      clearTimeout(window.__mcSearchTimer);
      const value = event.target.value;
      window.__mcSearchTimer = setTimeout(() => {
        const base = (location.hash || "#/").split("?")[0].slice(1);
        const active = document.activeElement === event.target;
        const pos = event.target.selectionStart;
        go(withFilters(base, { ...currentFilters(), q: value }));
        if (active) {
          const again = document.querySelector("#f-q");
          if (again) {
            again.focus();
            try {
              again.setSelectionRange(pos, pos);
            } catch {
              /* ignore */
            }
          }
        }
      }, 350);
    }
  });
  window.addEventListener("hashchange", render);
}

function render() {
  const root = document.getElementById("app");
  const currentPath = (location.hash || "#/").split("?")[0];
  // Leaving the scanner always releases the camera.
  if (currentPath !== "#/scan") stopScan();
  // The scanner never needs the database: it works even when no backup
  // is loaded, so it is reachable before (and without) demo data.
  if (currentPath === "#/scan") {
    root.innerHTML = viewScan();
    return;
  }
  if (!state.db) {
    root.innerHTML = shell(
      `<p>${esc(t("common.loading"))}</p>
       <p class="meta" id="boot-status"></p>
       <div class="export-row no-print">
         <button class="btn" data-nav="/scan">📷 ${esc(t("nav.scan"))}</button>
       </div>
       <p class="meta">${esc(t("common.skipToScan"))}</p>`,
      { title: t("app.title"), showBack: false }
    );
    return;
  }
  const hash = location.hash || "#/";
  const path = hash.split("?")[0];
  let html;
  if (path === "#/" || path === "#") html = viewHome();
  else if (path === "#/scan") html = viewScan();
  else if (path === "#/students") html = viewStudents();
  else if (path.startsWith("#/students/group/")) html = viewGroupDetail(path.split("/")[3]);
  else if (path.startsWith("#/students/detail/")) html = viewStudentDetail(path.split("/")[3]);
  else if (path === "#/payments") html = viewPayments();
  else if (path.startsWith("#/payments/student/")) html = viewStudentDetail(path.split("/")[3]);
  else if (path === "#/attendance") html = viewAttendance();
  else if (path.startsWith("#/attendance/session/")) html = viewSession(path.split("/")[3]);
  else html = viewHome();
  root.innerHTML = html;
}

async function boot() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = isRtl(state.lang) ? "rtl" : "ltr";
  bindGlobal();
  render(); // loading state
  const setBootStatus = (key) => {
    const el = document.querySelector("#boot-status");
    if (el) el.textContent = t(key);
  };
  const withTimeout = (promise, ms, code) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error(code), { code })), ms))
    ]);
  try {
    // Demo provider now; swap to the documented cloud provider when the
    // authenticated download flow exists (see providers.js).
    const useCloud = new URLSearchParams(location.search).get("source") === "cloud";
    const provider = useCloud ? createCloudBackupProvider() : createDemoZipProvider("demo/school-demo.zip");
    setBootStatus("common.loadingData");
    const { dbBytes, manifest } = await withTimeout(provider.load(), 25000, "load-timeout");
    setBootStatus("common.openingDb");
    if (typeof window.initSqlJs !== "function") {
      throw Object.assign(new Error("sql-missing"), { code: "sql-missing" });
    }
    const SQL = await withTimeout(
      window.initSqlJs({ locateFile: (file) => `node_modules/sql.js/dist/${file}` }),
      25000,
      "sql-timeout"
    );
    state.db = DB.openDatabase(SQL, dbBytes);
    state.manifest = manifest;
    state.sourceLabel = manifest.schemaVersion ? `backup v${manifest.schemaVersion}` : "backup";
    state.demoMode = !useCloud;
    if (!location.hash) location.hash = "#/";
    render();
  } catch (error) {
    document.getElementById("app").innerHTML = shell(
      `<p class="error">${esc(t("errors.loadFailed"))} (${esc(error.code || error.message)})</p>
       <div class="export-row no-print">
         <button class="btn" onclick="location.reload()">${esc(t("common.retry"))}</button>
         <button class="btn" data-nav="/scan">📷 ${esc(t("nav.scan"))}</button>
       </div>`,
      { title: t("app.title"), showBack: false }
    );
  }
}

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();

// Exported for tests (module graph runs in node with injected deps).
export { state, currentReportData, monthLabel };
export { viewHome, viewStudents, viewPayments, viewAttendance };
