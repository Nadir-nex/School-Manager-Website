import { translate, isRtl, availableLanguages } from "./i18n.js";
import { formatDZD } from "./export.js";
import { generateDemoData, computeDashboard } from "./demo-data.js";

function t(key) { return translate(state.lang, key); }
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getInitialSettings() {
  const storedStudents = sessionStorage.getItem("mc.demo.students");
  const storedGroups = sessionStorage.getItem("mc.demo.groups");
  const storedTeachers = sessionStorage.getItem("mc.demo.teachers");
  const studentCount = storedStudents ? Number(storedStudents) : 200;
  const groupCount = storedGroups ? Number(storedGroups) : 8;
  const teacherCount = storedTeachers ? Number(storedTeachers) : 3;
  return {
    seed: String(Math.floor(Math.random() * 1000000000)),
    month: currentMonth(),
    studentCount,
    groupCount,
    teacherCount
  };
}

const initial = getInitialSettings();
const state = {
  lang: localStorage.getItem("mc.lang") || "ar",
  seed: initial.seed,
  studentCount: initial.studentCount,
  groupCount: initial.groupCount,
  teacherCount: initial.teacherCount,
  genMonth: initial.month,
  data: null,
  dashboard: null,
  activeScreen: "overview",
  drawerOpen: false,
  settingsOpen: false,
  expenses: [{ id: 1, nameKey: "payments.rent", amount: 25000 }],
  paymentsMonth: initial.month,
  attendanceGroupId: null,
  attendanceSessionId: null,
  attendanceMonth: initial.month,
  studentsFilters: { q: "", groupId: "all", teacherId: "all", status: "all" },
  expenseName: "",
  expenseAmount: ""
};

if (!availableLanguages().includes(state.lang)) state.lang = "ar";

function persistSettings() {
  sessionStorage.setItem("mc.demo.students", String(state.studentCount));
  sessionStorage.setItem("mc.demo.groups", String(state.groupCount));
  sessionStorage.setItem("mc.demo.teachers", String(state.teacherCount));
}

function regenerate() {
  state.genMonth = currentMonth();
  state.data = generateDemoData({
    month: state.genMonth,
    studentCount: state.studentCount,
    groupCount: state.groupCount,
    teacherCount: state.teacherCount,
    seed: state.seed
  });
  state.dashboard = computeDashboard(state.data);
  state.paymentsMonth = state.genMonth;
  state.attendanceMonth = state.genMonth;
  state.attendanceGroupId = null;
  state.attendanceSessionId = null;
  persistSettings();
  render();
}

function groupById(id) { return state.data.groups.find((g) => g.id === Number(id)); }
function teacherById(id) { return state.data.teachers.find((t) => t.id === Number(id)); }
function studentById(id) { return state.data.students.find((s) => s.id === Number(id)); }
function activeGroups() { return state.data.groups.filter((g) => !g.archived); }
function activeStudents() { return state.data.students.filter((s) => !s.archived); }
function activeTeachers() { return state.data.teachers.filter((t) => !t.archived); }
function membershipsForStudent(studentId) {
  return state.data.memberships.filter((m) => m.studentId === studentId && activeGroups().some((g) => g.id === m.groupId));
}
function groupsForStudent(studentId) {
  return membershipsForStudent(studentId).map((m) => groupById(m.groupId)).filter(Boolean);
}
function teachersForStudent(studentId) {
  const ids = new Set(groupsForStudent(studentId).map((g) => g.teacherId).filter(Boolean));
  return activeTeachers().filter((t) => ids.has(t.id));
}
function paymentFor(studentId, groupId, year, month) {
  return state.data.payments.find((p) => p.studentId === studentId && p.groupId === groupId && p.year === year && p.month === month);
}
function studentPaymentStatus(studentId, groupId, year, month) {
  const memberships = membershipsForStudent(studentId);
  const relevant = groupId === "all" ? memberships : memberships.filter((m) => m.groupId === Number(groupId));
  if (!relevant.length) return null;
  const statuses = relevant.map((m) => {
    const group = groupById(m.groupId);
    const payment = paymentFor(studentId, m.groupId, year, month);
    if (!payment) return "unpaid";
    if (group.price !== null && payment.amount < group.price) return "partial";
    return "paid";
  });
  if (statuses.includes("unpaid")) return "unpaid";
  if (statuses.includes("partial")) return "partial";
  return "paid";
}
function studentAttendanceCount(studentId) {
  const groupIds = new Set(membershipsForStudent(studentId).map((m) => m.groupId));
  const relevantSessions = state.data.sessions.filter((s) => groupIds.has(s.groupId));
  const initialized = relevantSessions.filter((s) => s.initialized);
  const attended = state.data.attendance.filter((a) => a.studentId === studentId && initialized.some((s) => s.id === a.sessionId)).length;
  return { attended, recorded: initialized.length };
}

function setLang(lang) {
  if (!availableLanguages().includes(lang)) return;
  state.lang = lang;
  try { localStorage.setItem("mc.lang", lang); } catch { /* private mode */ }
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl(lang) ? "rtl" : "ltr";
  render();
}

function setScreen(screen) {
  state.activeScreen = screen;
  state.drawerOpen = false;
  render();
}

function monthLabel(year, month) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function parseMonth(value) {
  const [y, m] = String(value).split("-").map(Number);
  return { year: y, month: m };
}
function formatWeekdays(weekdays) {
  return (weekdays || []).map((day) => {
    try {
      return new Intl.DateTimeFormat(state.lang, { weekday: "short" }).format(new Date(2024, 0, 7 + Number(day)));
    } catch {
      return String(day);
    }
  }).join(", ");
}
function formatSessionDate(value) {
  try {
    return new Intl.DateTimeFormat(state.lang, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date(`${value}T00:00:00`));
  } catch {
    return String(value);
  }
}

function renderTrendChart(trendMonths) {
  const rtl = isRtl(state.lang);
  const width = 320;
  const height = 170;
  const padTop = 12;
  const padBottom = 34;
  const padGutter = rtl ? 70 : 46;
  const padInner = 12;
  const padLeft = rtl ? padInner : padGutter;
  const padRight = rtl ? padGutter : padInner;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const max = Math.max(...trendMonths.map((m) => m.amount), 1);
  const min = 0;
  const xStep = trendMonths.length > 1 ? plotW / (trendMonths.length - 1) : 0;
  const points = trendMonths.map((m, i) => {
    const ratio = trendMonths.length > 1 ? i / (trendMonths.length - 1) : 0;
    const x = rtl ? (width - padRight) - ratio * plotW : padLeft + ratio * plotW;
    const y = padTop + plotH - ((m.amount - min) / (max - min)) * plotH;
    return { x, y, value: m.amount, label: `${m.year}-${String(m.month).padStart(2, "0")}` };
  });
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length-1].x.toFixed(1)} ${padTop + plotH} L ${points[0].x.toFixed(1)} ${padTop + plotH} Z`;
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const y = padTop + plotH - ratio * plotH;
    const value = Math.round(min + (max - min) * ratio);
    const labelX = rtl ? width - padRight + 20 : padLeft - 6;
    const anchor = rtl ? "start" : "end";
    return `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" class="grid-line" />
      <text x="${labelX}" y="${y + 4}" class="axis-label" text-anchor="${anchor}">${Math.round(value / 1000)}k</text>`;
  }).join("");
  const xLabels = points.map((p) => `<text x="${p.x.toFixed(1)}" y="${height - 12}" class="axis-label" text-anchor="middle">${p.label.slice(5)}</text>`).join("");
  const circles = points.map((p, i) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" class="trend-point" tabindex="0" data-index="${i}" data-value="${p.value}" data-label="${p.label}" />`).join("");
  return `
    <div class="chart-wrap">
      <svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(t("dashboard.collectionsOverTime"))}">
        ${gridLines}
        <path d="${areaPath}" class="trend-area" />
        <path d="${linePath}" class="trend-line" />
        ${circles}
        ${xLabels}
      </svg>
      <div class="chart-tooltip" id="chart-tooltip" hidden></div>
    </div>
  `;
}

function renderDrawer() {
  const items = [
    ["overview", "nav.overview"],
    ["students", "nav.students"],
    ["payments", "nav.payments"],
    ["attendance", "nav.attendance"]
  ].map(([id, key]) => `<button class="drawer-item ${state.activeScreen === id ? "active" : ""}" data-screen="${id}">${esc(t(key))}</button>`).join("");
  return `
    <div class="drawer-backdrop ${state.drawerOpen ? "open" : ""}" data-action="close-drawer"></div>
    <aside class="drawer ${state.drawerOpen ? "open" : ""}" aria-hidden="${state.drawerOpen ? "false" : "true"}">
      <div class="drawer-header">
        <strong>Nex Core</strong>
        <button class="icon-btn" data-action="close-drawer" aria-label="${esc(t("common.close"))}">×</button>
      </div>
      <nav class="drawer-nav">${items}</nav>
      <button class="drawer-settings" data-action="open-settings">${esc(t("common.settings"))}</button>
    </aside>
  `;
}

function renderHeader() {
  return `
    <header class="app-header">
      <button class="icon-btn" data-action="open-drawer" aria-label="Menu">☰</button>
      <div class="header-title">
        <p class="eyebrow">Nex Core</p>
        <h1>School Manager</h1>
      </div>
      <div class="header-actions">
        <button class="icon-btn" data-action="open-settings" aria-label="${esc(t("common.settings"))}">⚙</button>
        <select id="lang-select" aria-label="${esc(t("common.language"))}">
          ${availableLanguages().map((lang) => `<option value="${lang}" ${lang === state.lang ? "selected" : ""}>${lang.toUpperCase()}</option>`).join("")}
        </select>
      </div>
    </header>
  `;
}

function renderOverview() {
  const d = state.dashboard;
  const trendMax = Math.max(...d.trendMonths.map((m) => m.amount), 1);
  const attention = d.attention.length
    ? d.attention.map((item) => `<li><span class="attention-label">${esc(t(`dashboard.attention.${item.key}`))}</span><strong class="attention-count">${item.count}</strong></li>`).join("")
    : `<li><span>${esc(t("dashboard.noAttention"))}</span></li>`;
  const attendanceTotal = d.presentCount + d.absentCount + d.notRecordedSessions;
  const attendancePercent = attendanceTotal > 0 ? Math.round((d.presentCount / attendanceTotal) * 100) : 0;
  const presentPct = attendanceTotal > 0 ? (d.presentCount / attendanceTotal) * 100 : 0;
  const absentPct = attendanceTotal > 0 ? (d.absentCount / attendanceTotal) * 100 : 0;
  const notRecordedPct = attendanceTotal > 0 ? (d.notRecordedSessions / attendanceTotal) * 100 : 0;
  const attendanceGradient = `conic-gradient(var(--paid) 0 ${presentPct}%, var(--unpaid) ${presentPct}% ${presentPct + absentPct}%, var(--partial) ${presentPct + absentPct}% 100%)`;
  return `
    ${renderHeader()}
    <section class="demo-banner" role="status">${esc(t("dashboard.demoBadge"))}</section>
    <main class="screen">
      <h2 class="screen-title">${esc(t("dashboard.welcome"))}</h2>
      <section class="metric-grid metric-grid--four">
        <article class="metric"><span>${esc(t("dashboard.students"))}</span><strong>${d.activeStudents}</strong></article>
        <article class="metric"><span>${esc(t("dashboard.groups"))}</span><strong>${d.activeGroups}</strong></article>
        <article class="metric"><span>${esc(t("dashboard.teachers"))}</span><strong>${d.activeTeachers}</strong></article>
        <article class="metric"><span>${esc(t("dashboard.sessionsThisMonth"))}</span><strong>${d.sessionCount}</strong></article>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>${esc(t("dashboard.collected"))}</h2>
          <strong>${esc(formatDZD(d.collected, state.lang))}</strong>
        </div>
        <div class="status-bar" aria-label="Payment status">
          <span class="status-segment paid" style="width:${(d.paidCount / Math.max(1, d.paidCount + d.partialCount + d.unpaidCount) * 100)}%"></span>
          <span class="status-segment partial" style="width:${(d.partialCount / Math.max(1, d.paidCount + d.partialCount + d.unpaidCount) * 100)}%"></span>
          <span class="status-segment unpaid" style="width:${(d.unpaidCount / Math.max(1, d.paidCount + d.partialCount + d.unpaidCount) * 100)}%"></span>
        </div>
        <ul class="status-list">
          <li><span class="dot paid"></span>${esc(t("dashboard.paid"))}: <strong>${d.paidCount}</strong></li>
          <li><span class="dot partial"></span>${esc(t("dashboard.partial"))}: <strong>${d.partialCount}</strong></li>
          <li><span class="dot unpaid"></span>${esc(t("dashboard.unpaid"))}: <strong>${d.unpaidCount}</strong></li>
          <li>${esc(t("dashboard.outstanding"))}: <strong>${esc(formatDZD(d.outstanding, state.lang))}</strong> ${d.unknownPriceCount ? `(${d.unknownPriceCount} ${esc(t("dashboard.priceUnknown"))})` : ""}</li>
        </ul>
      </section>

      <section class="panel">
        <h2>${esc(t("dashboard.collectionsOverTime"))}</h2>
        ${renderTrendChart(d.trendMonths)}
      </section>

      <section class="panel">
        <h2>${esc(t("dashboard.attendanceSummary"))}</h2>
        <div class="attendance-summary">
          <div class="attendance-ring" style="background:${attendanceGradient}">
            <span>${attendancePercent}%</span>
          </div>
          <ul class="status-list">
            <li><span class="dot paid"></span>${esc(t("attendance.present"))}: <strong>${d.presentCount}</strong></li>
            <li><span class="dot unpaid"></span>${esc(t("attendance.absent"))}: <strong>${d.absentCount}</strong></li>
            <li><span class="dot partial"></span>${esc(t("dashboard.notRecorded"))}: <strong>${d.notRecordedSessions} ${esc(t("dashboard.notRecordedSessions"))}</strong></li>
          </ul>
        </div>
        <p class="meta">${esc(t("attendance.notRecorded"))}: ${d.notRecordedSessions} ${esc(t("dashboard.notRecordedSessions"))}</p>
      </section>

      <section class="panel">
        <h2>${esc(t("dashboard.attention"))}</h2>
        <ul class="attention-list">${attention}</ul>
      </section>
    </main>
    ${renderSettingsModal()}
    ${renderDrawer()}
  `;
}

function renderStudents() {
  const filters = state.studentsFilters;
  const groupOptions = [`<option value="all">${esc(t("students.allGroups"))}</option>`]
    .concat(activeGroups().map((g) => `<option value="${g.id}" ${String(filters.groupId) === String(g.id) ? "selected" : ""}>${esc(g.name)}</option>`)).join("");
  const teacherOptions = [`<option value="all">${esc(t("students.allTeachers"))}</option>`]
    .concat(activeTeachers().map((te) => `<option value="${te.id}" ${String(filters.teacherId) === String(te.id) ? "selected" : ""}>${esc(te.name)}</option>`)).join("");
  const statusOptions = ["all", "paid", "partial", "unpaid"].map((s) => `<option value="${s}" ${filters.status === s ? "selected" : ""}>${s === "all" ? esc(t("students.allStatuses")) : esc(t(`dashboard.${s}`))}</option>`).join("");

  const filtered = activeStudents().filter((student) => {
    const q = filters.q.trim().toLowerCase();
    if (q && !student.name.toLowerCase().includes(q) && !String(student.studentNumber).includes(q)) return false;
    const groups = groupsForStudent(student.id);
    if (filters.groupId !== "all" && !groups.some((g) => String(g.id) === String(filters.groupId))) return false;
    if (filters.teacherId !== "all" && !groups.some((g) => String(g.teacherId) === String(filters.teacherId))) return false;
    const st = studentPaymentStatus(student.id, filters.groupId, parseMonth(state.genMonth).year, parseMonth(state.genMonth).month);
    if (filters.status !== "all" && st !== filters.status) return false;
    return true;
  });

  const rows = filtered.map((student) => {
    const groups = groupsForStudent(student.id);
    const teachers = teachersForStudent(student.id);
    const status = studentPaymentStatus(student.id, filters.groupId, parseMonth(state.genMonth).year, parseMonth(state.genMonth).month);
    const attendance = studentAttendanceCount(student.id);
    const statusClass = status === "paid" ? "paid" : status === "partial" ? "partial" : "unpaid";
    return `
      <article class="student-row student-row--${statusClass}">
        <div class="student-main">
          <strong>${esc(student.name)}</strong>
          <span class="muted">#${student.studentNumber}</span>
        </div>
        <div class="student-meta">
          <span>${esc(groups.map((g) => g.name).join(", ") || "-")}</span>
          <span>${esc(teachers.map((teacher) => teacher.name).join(", ") || "-")}</span>
        </div>
        <div class="student-status">
          <span class="meta">${attendance.attended}/${attendance.recorded} ${esc(t("students.attended"))}</span>
        </div>
      </article>
    `;
  }).join("");

  return `
    ${renderHeader()}
    <main class="screen">
      <h2 class="screen-title">${esc(t("students.title"))}</h2>
      <section class="panel filters-panel">
        <input id="student-search" type="search" placeholder="${esc(t("students.search"))}" value="${esc(filters.q)}" />
        <div class="form-grid">
          <select id="filter-group">${groupOptions}</select>
          <select id="filter-teacher">${teacherOptions}</select>
          <select id="filter-status">${statusOptions}</select>
        </div>
        <button class="btn btn-secondary" data-action="reset-student-filters">${esc(t("students.resetFilters"))}</button>
      </section>
      <section class="status-legend" aria-label="Payment status legend">
        <span class="legend-item"><span class="legend-dot paid"></span>${esc(t("dashboard.paid"))}</span>
        <span class="legend-item"><span class="legend-dot partial"></span>${esc(t("dashboard.partial"))}</span>
        <span class="legend-item"><span class="legend-dot unpaid"></span>${esc(t("dashboard.unpaid"))}</span>
      </section>
      <section class="list-section">
        ${filtered.length ? rows : `<p class="empty">${esc(t("students.noResults"))}</p>`}
      </section>
    </main>
    ${renderSettingsModal()}
    ${renderDrawer()}
  `;
}

function renderPayments() {
  const selected = parseMonth(state.paymentsMonth);
  const monthPayments = state.data.payments.filter((p) => p.year === selected.year && p.month === selected.month);
  const collected = monthPayments.reduce((sum, p) => sum + p.amount, 0);

  const cells = [];
  for (const m of state.data.memberships) {
    const student = studentById(m.studentId);
    const group = groupById(m.groupId);
    if (!student || !group || student.archived || group.archived) continue;
    const payment = paymentFor(student.id, group.id, selected.year, selected.month);
    let status = "unpaid";
    if (payment) status = (group.price !== null && payment.amount < group.price) ? "partial" : "paid";
    cells.push({ student, group, payment, status });
  }
  const paidCount = cells.filter((c) => c.status === "paid").length;
  const partialCount = cells.filter((c) => c.status === "partial").length;
  const unpaidCount = cells.filter((c) => c.status === "unpaid").length;
  const outstanding = cells.reduce((sum, c) => {
    if (c.status === "unpaid") return sum + (c.group.price || 0);
    if (c.status === "partial") return sum + Math.max(0, (c.group.price || 0) - (c.payment?.amount || 0));
    return sum;
  }, 0);

  const groupSummaries = activeGroups().map((group) => {
    const groupCells = cells.filter((c) => c.group.id === group.id);
    const groupCollected = groupCells.reduce((sum, c) => sum + (c.payment?.amount || 0), 0);
    return {
      group,
      collected: groupCollected,
      paid: groupCells.filter((c) => c.status === "paid").length,
      partial: groupCells.filter((c) => c.status === "partial").length,
      unpaid: groupCells.filter((c) => c.status === "unpaid").length
    };
  }).filter((g) => g.paid + g.partial + g.unpaid > 0);

  const teacherSummaries = activeTeachers().map((teacher) => {
    const teacherGroups = activeGroups().filter((g) => g.teacherId === teacher.id);
    const collectedAmount = teacherGroups.reduce((sum, g) => sum + (groupSummaries.find((x) => x.group.id === g.id)?.collected || 0), 0);
    return { teacher, collected: collectedAmount, groups: teacherGroups.length };
  }).filter((t) => t.groups > 0);

  const expenseTotal = state.expenses.reduce((sum, e) => sum + e.amount, 0);

  return `
    ${renderHeader()}
    <main class="screen">
      <h2 class="screen-title">${esc(t("payments.title"))}</h2>
      <section class="panel">
        <div class="metric-grid metric-grid--four">
          <article class="metric"><span>${esc(t("dashboard.collected"))}</span><strong>${esc(formatDZD(collected, state.lang))}</strong></article>
          <article class="metric"><span>${esc(t("dashboard.paid"))}</span><strong>${paidCount}</strong></article>
          <article class="metric"><span>${esc(t("dashboard.partial"))}</span><strong>${partialCount}</strong></article>
          <article class="metric"><span>${esc(t("dashboard.unpaid"))}</span><strong>${unpaidCount}</strong></article>
        </div>
        <p class="meta">${esc(t("payments.outstanding"))}: <strong>${esc(formatDZD(outstanding, state.lang))}</strong></p>
      </section>

      <section class="panel">
        <h2>${esc(t("payments.byGroup"))}</h2>
        <div class="summary-list">
          ${groupSummaries.map((g) => `
            <article class="summary-row summary-row--stacked">
              <strong class="summary-title">${esc(g.group.name)}</strong>
              <span class="summary-meta">${g.paid} ${esc(t("dashboard.paid"))} · ${g.partial} ${esc(t("dashboard.partial"))} · ${g.unpaid} ${esc(t("dashboard.unpaid"))}</span>
              <strong class="summary-amount">${esc(formatDZD(g.collected, state.lang))}</strong>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="panel">
        <h2>${esc(t("payments.byTeacher"))}</h2>
        <div class="summary-list">
          ${teacherSummaries.map((ts) => `
            <article class="summary-row summary-row--stacked">
              <div>
                <strong>${esc(ts.teacher.name)}</strong>
                <span class="meta">${ts.groups} groups · ${esc(formatDZD(ts.collected, state.lang))}</span>
              </div>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="panel finance-panel">
        <h2>${esc(t("payments.expenses"))}</h2>
        <div class="finance-summary">
          <div class="finance-card">
            <span>${esc(t("dashboard.collected"))}</span>
            <strong>${esc(formatDZD(collected, state.lang))}</strong>
          </div>
          <div class="finance-card expense">
            <span>${esc(t("payments.expenses"))}</span>
            <strong>${esc(formatDZD(expenseTotal, state.lang))}</strong>
          </div>
          <div class="finance-card net">
            <span>${esc(t("payments.netAfterExpenses"))}</span>
            <strong>${esc(formatDZD(collected - expenseTotal, state.lang))}</strong>
          </div>
        </div>
        <div class="expense-form">
          <input id="expense-name" type="text" placeholder="${esc(t("payments.expenseName"))}" value="${esc(state.expenseName)}" />
          <input id="expense-amount" type="number" min="0" placeholder="${esc(t("payments.expenseAmount"))}" value="${esc(state.expenseAmount)}" />
          <button class="btn" data-action="add-expense">${esc(t("payments.addExpense"))}</button>
        </div>
        <div class="summary-list">
          ${state.expenses.map((e) => `
            <article class="summary-row">
              <span>${esc(e.nameKey ? t(e.nameKey) : e.name)}</span>
              <div class="row-actions">
                <strong>${esc(formatDZD(e.amount, state.lang))}</strong>
                <button class="btn btn-secondary" data-action="remove-expense" data-id="${e.id}">${esc(t("payments.remove"))}</button>
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    </main>
    ${renderSettingsModal()}
    ${renderDrawer()}
  `;
}

function renderAttendance() {
  const selectedMonth = parseMonth(state.attendanceMonth);
  const monthSessions = state.data.sessions.filter((s) => s.sessionDate.startsWith(monthLabel(selectedMonth.year, selectedMonth.month)));
  const groups = activeGroups();

  if (state.attendanceSessionId) {
    const session = state.data.sessions.find((s) => s.id === Number(state.attendanceSessionId));
    const group = session ? groupById(session.groupId) : null;
    const rosterMembers = state.data.memberships.filter((m) => m.groupId === session.groupId).map((m) => studentById(m.studentId)).filter(Boolean);
    const uniqueRoster = [...new Map(rosterMembers.map((s) => [s.id, s])).values()];
    const presentIds = new Set(state.data.attendance.filter((a) => a.sessionId === session.id).map((a) => a.studentId));
    const rows = uniqueRoster.map((student) => {
      const present = presentIds.has(student.id);
      let status = "notRecorded";
      if (session.initialized) status = present ? "present" : "absent";
      const statusClass = status === "present" ? "paid" : status === "absent" ? "unpaid" : "partial";
      return `<li><span>${esc(student.name)}</span><span class="badge ${statusClass}">${esc(t(`attendance.${status === "notRecorded" ? "notRecorded" : status}`))}</span></li>`;
    }).join("");
    return `
      ${renderHeader()}
      <main class="screen">
        <button class="btn btn-secondary" data-action="attendance-back-sessions">${esc(t("attendance.backToSessions"))}</button>
        <h2 class="screen-title">${esc(group?.name || "")} — ${esc(session.sessionDate)}</h2>
        <p class="meta">${esc(session.startTime)}–${esc(session.endTime)}</p>
        <ul class="roster-list">${rows || `<li class="empty">${esc(t("attendance.noRoster"))}</li>`}</ul>
      </main>
      ${renderSettingsModal()}
      ${renderDrawer()}
    `;
  }

  if (state.attendanceGroupId) {
    const group = groupById(state.attendanceGroupId);
    const sessions = monthSessions.filter((s) => s.groupId === group.id).sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
    const sessionCards = sessions.map((session) => {
      const present = state.data.attendance.filter((a) => a.sessionId === session.id).length;
      return `<button class="session-card" data-action="open-session" data-id="${session.id}">
        <strong>${esc(formatSessionDate(session.sessionDate))}</strong>
        <span class="meta">${esc(session.startTime)}–${esc(session.endTime)}</span>
        <span class="meta">${present} ${esc(t("attendance.present"))} · ${session.initialized ? "" : esc(t("attendance.notRecorded"))}</span>
      </button>`;
    }).join("");
    return `
      ${renderHeader()}
      <main class="screen">
        <button class="btn btn-secondary" data-action="attendance-back-groups">${esc(t("attendance.backToGroups"))}</button>
        <h2 class="screen-title">${esc(group?.name || "")}</h2>
        <p class="meta">${esc(group?.teacherId ? teacherById(group.teacherId)?.name : "")}</p>
        <p class="meta">Select a session to view attendance.</p>
        <div class="session-list">${sessionCards || `<p class="empty">${esc(t("attendance.noSessions"))}</p>`}</div>
      </main>
      ${renderSettingsModal()}
      ${renderDrawer()}
    `;
  }

  const groupCards = groups.map((group) => {
    const sessions = monthSessions.filter((s) => s.groupId === group.id);
    const initialized = sessions.filter((s) => s.initialized).length;
    const present = state.data.attendance.filter((a) => sessions.some((s) => s.id === a.sessionId)).length;
    return `<button class="group-card" data-action="open-attendance-group" data-id="${group.id}">
      <strong>${esc(group.name)}</strong>
      <span class="meta">${esc(group.teacherId ? teacherById(group.teacherId)?.name : t("common.unknown"))}</span>
      <span class="meta">${sessions.length} ${esc(t("attendance.sessions"))} · ${initialized} ${esc(t("dashboard.initialized"))}</span>
      <span class="meta">${initialized} ${esc(t("dashboard.initialized"))} · ${present} ${esc(t("attendance.present"))}</span>
    </button>`;
  }).join("");

  return `
    ${renderHeader()}
    <main class="screen">
      <h2 class="screen-title">${esc(t("attendance.title"))}</h2>
      <p class="meta">Select a group to view its sessions.</p>
      <div class="group-list">${groupCards}</div>
    </main>
    ${renderSettingsModal()}
    ${renderDrawer()}
  `;
}

function renderSettingsModal() {
  if (!state.settingsOpen) return "";
  return `
    <div class="modal-backdrop" data-action="close-settings"></div>
    <section class="modal">
      <h2>${esc(t("common.settings"))}</h2>
      <label class="field"><span>${esc(t("dashboard.studentCount"))}</span><input id="setting-students" type="number" min="10" max="500" value="${state.studentCount}" /></label>
      <label class="field"><span>Groups</span><input id="setting-groups" type="number" min="1" max="20" value="${state.groupCount}" /></label>
      <label class="field"><span>${esc(t("dashboard.teacherCount"))}</span><input id="setting-teachers" type="number" min="1" max="4" value="${state.teacherCount}" /></label>
      <div class="modal-actions">
        <button class="btn" data-action="apply-settings">${esc(t("dashboard.regenerate"))}</button>
        <button class="btn btn-secondary" data-action="close-settings">${esc(t("common.close"))}</button>
      </div>
    </section>
  `;
}

function renderScreen() {
  if (state.activeScreen === "students") return renderStudents();
  if (state.activeScreen === "payments") return renderPayments();
  if (state.activeScreen === "attendance") return renderAttendance();
  return renderOverview();
}

function render() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = isRtl(state.lang) ? "rtl" : "ltr";
  if (!state.data) regenerate();
  const root = document.getElementById("app");
  root.innerHTML = renderScreen();
  // drawer is already included in screen templates; avoid duplicate:
  // remove extra if duplicated by checking? Templates include drawer once.
  bindEvents();
  bindChartTooltip();
}

function bindChartTooltip() {
  const tooltip = document.getElementById("chart-tooltip");
  if (!tooltip) return;
  const points = document.querySelectorAll(".trend-point");
  points.forEach((point) => {
    const show = () => {
      tooltip.hidden = false;
      tooltip.textContent = `${point.dataset.label}: ${formatDZD(Number(point.dataset.value), state.lang)}`;
    };
    const hide = () => { tooltip.hidden = true; };
    point.addEventListener("mouseenter", show);
    point.addEventListener("focus", show);
    point.addEventListener("mouseleave", hide);
    point.addEventListener("blur", hide);
    point.addEventListener("click", show);
  });
}

function bindEvents() {
  const langSelect = document.querySelector("#lang-select");
  if (langSelect) langSelect.addEventListener("change", (e) => setLang(e.target.value));

  document.querySelectorAll("[data-action='open-drawer']").forEach((el) => el.addEventListener("click", () => { state.drawerOpen = true; render(); }));
  document.querySelectorAll("[data-action='close-drawer']").forEach((el) => el.addEventListener("click", () => { state.drawerOpen = false; render(); }));
  document.querySelectorAll("[data-screen]").forEach((el) => el.addEventListener("click", () => setScreen(el.dataset.screen)));
  document.querySelectorAll("[data-action='open-settings']").forEach((el) => el.addEventListener("click", () => { state.settingsOpen = true; render(); }));
  document.querySelectorAll("[data-action='close-settings']").forEach((el) => el.addEventListener("click", () => { state.settingsOpen = false; render(); }));

  const studentsSearch = document.querySelector("#student-search");
  if (studentsSearch) studentsSearch.addEventListener("input", (e) => { state.studentsFilters.q = e.target.value; render(); });
  const filterGroup = document.querySelector("#filter-group");
  if (filterGroup) filterGroup.addEventListener("change", (e) => { state.studentsFilters.groupId = e.target.value; render(); });
  const filterTeacher = document.querySelector("#filter-teacher");
  if (filterTeacher) filterTeacher.addEventListener("change", (e) => { state.studentsFilters.teacherId = e.target.value; render(); });
  const filterStatus = document.querySelector("#filter-status");
  if (filterStatus) filterStatus.addEventListener("change", (e) => { state.studentsFilters.status = e.target.value; render(); });
  document.querySelectorAll("[data-action='reset-student-filters']").forEach((el) => el.addEventListener("click", () => {
    state.studentsFilters = { q: "", groupId: "all", teacherId: "all", status: "all" };
    render();
  }));

  state.paymentsMonth = state.genMonth;
  state.attendanceMonth = state.genMonth;

  document.querySelectorAll("[data-action='open-attendance-group']").forEach((el) => el.addEventListener("click", () => { state.attendanceGroupId = Number(el.dataset.id); state.attendanceSessionId = null; render(); }));
  document.querySelectorAll("[data-action='open-session']").forEach((el) => el.addEventListener("click", () => { state.attendanceSessionId = Number(el.dataset.id); render(); }));
  document.querySelectorAll("[data-action='attendance-back-groups']").forEach((el) => el.addEventListener("click", () => { state.attendanceGroupId = null; state.attendanceSessionId = null; render(); }));
  document.querySelectorAll("[data-action='attendance-back-sessions']").forEach((el) => el.addEventListener("click", () => { state.attendanceSessionId = null; render(); }));

  const expenseName = document.querySelector("#expense-name");
  if (expenseName) expenseName.addEventListener("input", (e) => { state.expenseName = e.target.value; });
  const expenseAmount = document.querySelector("#expense-amount");
  if (expenseAmount) expenseAmount.addEventListener("input", (e) => { state.expenseAmount = e.target.value; });
  document.querySelectorAll("[data-action='add-expense']").forEach((el) => el.addEventListener("click", () => {
    const name = state.expenseName.trim();
    const amount = Number(state.expenseAmount);
    if (!name || !Number.isFinite(amount) || amount < 0) return;
    state.expenses.push({ id: Date.now(), name, amount });
    state.expenseName = "";
    state.expenseAmount = "";
    render();
  }));
  document.querySelectorAll("[data-action='remove-expense']").forEach((el) => el.addEventListener("click", () => {
    const id = Number(el.dataset.id);
    state.expenses = state.expenses.filter((e) => e.id !== id);
    render();
  }));

  document.querySelectorAll("[data-action='apply-settings']").forEach((el) => el.addEventListener("click", () => {
    state.studentCount = Number(document.querySelector("#setting-students").value) || state.studentCount;
    state.groupCount = Number(document.querySelector("#setting-groups").value) || state.groupCount;
    state.teacherCount = Number(document.querySelector("#setting-teachers").value) || state.teacherCount;
    state.seed = String(Math.floor(Math.random() * 1000000000));
    state.settingsOpen = false;
    regenerate();
  }));
  document.querySelectorAll("[data-action='new-seed']").forEach((el) => el.addEventListener("click", () => {
    state.seed = String(Math.floor(Math.random() * 1000000000));
    regenerate();
  }));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (state.drawerOpen) { state.drawerOpen = false; render(); }
      if (state.settingsOpen) { state.settingsOpen = false; render(); }
    }
  });
}

document.title = "Nex Core — School Manager";
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { regenerate(); });
} else {
  regenerate();
}
