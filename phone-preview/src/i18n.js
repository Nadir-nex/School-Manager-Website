// Small trilingual dictionary. Core school words reuse the desktop
// i18n/core.csv translations verbatim (Students/Étudiants/الطلاب, …);
// mobile-only strings are new. No network, no dependencies.
export const LANGUAGES = ["en", "fr", "ar"];
export const RTL_LANGUAGES = new Set(["ar"]);

const STRINGS = {
  "app.title": { en: "School Companion", fr: "Compagnon scolaire", ar: "مرافق المدرسة" },
  "app.demoBadge": {
    en: "DEMO — synthetic data, not a real school",
    fr: "DÉMO — données fictives, pas une vraie école",
    ar: "تجريبي — بيانات وهمية، ليست مدرسة حقيقية"
  },
  "nav.payments": { en: "Payments", fr: "Paiements", ar: "المدفوعات" },
  "nav.students": { en: "Students", fr: "Étudiants", ar: "الطلاب" },
  "nav.attendance": { en: "Attendance", fr: "Présence", ar: "الحضور" },
  "nav.home": { en: "Home", fr: "Accueil", ar: "الرئيسية" },
  "nav.back": { en: "Back", fr: "Retour", ar: "رجوع" },
  "common.loading": { en: "Loading…", fr: "Chargement…", ar: "جارٍ التحميل…" },
  "common.loadingData": { en: "Loading demo data…", fr: "Chargement des données démo…", ar: "جارٍ تحميل البيانات التجريبية…" },
  "common.openingDb": { en: "Opening database…", fr: "Ouverture de la base…", ar: "جارٍ فتح قاعدة البيانات…" },
  "common.skipToScan": {
    en: "Scanner works without loaded data.",
    fr: "Le scanner fonctionne sans données chargées.",
    ar: "يعمل الماسح دون تحميل البيانات."
  },
  "common.search": { en: "Search", fr: "Recherche", ar: "البحث" },
  "common.all": { en: "All", fr: "Tous", ar: "الكل" },
  "common.unknown": { en: "Unknown", fr: "Inconnu", ar: "غير معروف" },
  "common.noTeacher": { en: "No teacher", fr: "Sans enseignant", ar: "بدون أستاذ" },
  "common.noPrice": { en: "Price not set", fr: "Prix non défini", ar: "السعر غير محدد" },
  "common.students": { en: "students", fr: "élèves", ar: "تلاميذ" },
  "common.refresh": { en: "Refresh", fr: "Actualiser", ar: "تحديث" },
  "common.print": { en: "Print / PDF", fr: "Imprimer / PDF", ar: "طباعة / PDF" },
  "common.excel": { en: "Excel", fr: "Excel", ar: "إكسل" },
  "common.language": { en: "Language", fr: "Langue", ar: "اللغة" },
  "common.close": { en: "Close", fr: "Fermer", ar: "إغلاق" },
  "common.retry": { en: "Retry", fr: "Réessayer", ar: "إعادة المحاولة" },
  "home.tagline": {
    en: "Read-only school reports",
    fr: "Rapports scolaires en lecture seule",
    ar: "تقارير مدرسية للقراءة فقط"
  },
  "home.source": { en: "Source", fr: "Source", ar: "المصدر" },
  "students.title": { en: "Students", fr: "Étudiants", ar: "الطلاب" },
  "students.searchGroups": { en: "Search groups…", fr: "Rechercher un groupe…", ar: "ابحث عن فوج…" },
  "students.searchStudents": { en: "Name or number…", fr: "Nom ou numéro…", ar: "الاسم أو الرقم…" },
  "students.filterTeacher": { en: "Teacher", fr: "Enseignant", ar: "الأستاذ" },
  "students.filterGroup": { en: "Group", fr: "Groupe", ar: "الفوج" },
  "students.groups": { en: "Groups", fr: "Groupes", ar: "الأفواج" },
  "students.inGroup": { en: "Students in group", fr: "Élèves du groupe", ar: "تلاميذ الفوج" },
  "students.memberOf": { en: "Member of", fr: "Membre de", ar: "عضو في" },
  "students.historyNote": {
    en: "Group assignments shown are current. Past assignments are not preserved by the database.",
    fr: "Les affectations affichées sont actuelles. La base ne conserve pas l’historique des affectations.",
    ar: "الانتماءات المعروضة حالية. قاعدة البيانات لا تحفظ سجل الانتماءات السابقة."
  },
  "payments.title": { en: "Payments", fr: "Paiements", ar: "المدفوعات" },
  "payments.month": { en: "Month", fr: "Mois", ar: "الشهر" },
  "payments.paid": { en: "Paid", fr: "Payé", ar: "مدفوع" },
  "payments.unpaid": { en: "Unpaid", fr: "Non payé", ar: "غير مدفوع" },
  "payments.amount": { en: "Amount", fr: "Montant", ar: "المبلغ" },
  "payments.date": { en: "Payment date", fr: "Date de paiement", ar: "تاريخ الدفع" },
  "payments.coveredMonth": { en: "Covered month", fr: "Mois couvert", ar: "الشهر المغطى" },
  "payments.collected": { en: "Collected", fr: "Encaissé", ar: "المحصّل" },
  "payments.history": { en: "Payment history", fr: "Historique des paiements", ar: "سجل المدفوعات" },
  "payments.summaryStudents": { en: "Students", fr: "Élèves", ar: "التلاميذ" },
  "payments.summaryPaid": { en: "Paid", fr: "Payés", ar: "المدفوع" },
  "payments.amountDiffersNote": {
    en: "Some amounts differ from the current group price. The database does not say why — this is not automatically arrears or a discount.",
    fr: "Certains montants diffèrent du prix actuel du groupe. La base n’indique pas pourquoi — ce n’est automatiquement ni un arriéré ni une remise.",
    ar: "بعض المبالغ تختلف عن سعر الفوج الحالي. قاعدة البيانات لا توضح السبب — وهذا ليس متأخرات أو تخفيضاً تلقائياً."
  },
  "attendance.title": { en: "Attendance", fr: "Présence", ar: "الحضور" },
  "attendance.sessions": { en: "Sessions", fr: "Séances", ar: "الحصص" },
  "attendance.present": { en: "Present", fr: "Présent", ar: "حاضر" },
  "attendance.absent": { en: "Absent", fr: "Absent", ar: "غائب" },
  "attendance.notRecorded": {
    en: "Not recorded yet — do not read as absent.",
    fr: "Pas encore enregistré — ne pas interpréter comme absent.",
    ar: "لم يُسجَّل بعد — لا يُقرأ كغياب."
  },
  "attendance.empty": {
    en: "No attendance records available.",
    fr: "Aucun relevé de présence disponible.",
    ar: "لا توجد سجلات حضور متاحة."
  },
  "attendance.uninitialized": {
    en: "Session not initialized",
    fr: "Séance non initialisée",
    ar: "الحصة غير مهيأة"
  },
  "errors.loadFailed": {
    en: "Could not load data.",
    fr: "Impossible de charger les données.",
    ar: "تعذر تحميل البيانات."
  },
  "errors.invalidBackup": {
    en: "Invalid backup file.",
    fr: "Fichier de sauvegarde invalide.",
    ar: "ملف النسخة الاحتياطية غير صالح."
  },
  "nav.scan": { en: "Scan Desktop QR", fr: "Scanner le QR du bureau", ar: "مسح رمز سطح المكتب" },
  "scan.title": { en: "Connect to desktop", fr: "Connecter au bureau", ar: "الاتصال بسطح المكتب" },
  "scan.start": { en: "Start camera", fr: "Démarrer la caméra", ar: "تشغيل الكاميرا" },
  "scan.cancel": { en: "Cancel", fr: "Annuler", ar: "إلغاء" },
  "scan.hint": {
    en: "Point the camera at the Desktop connection QR shown in the desktop Settings.",
    fr: "Pointez la caméra vers le QR de connexion affiché dans les paramètres du bureau.",
    ar: "وجّه الكاميرا نحو رمز الاتصال المعروض في إعدادات سطح المكتب."
  },
  "scan.denied": {
    en: "Camera permission was denied. Allow camera access and try again, or paste the code below.",
    fr: "Accès caméra refusé. Autorisez la caméra puis réessayez, ou collez le code ci-dessous.",
    ar: "تم رفض إذن الكاميرا. اسمح بالوصول إلى الكاميرا وحاول مجدداً، أو الصق الرمز أدناه."
  },
  "scan.noCamera": {
    en: "No camera is available on this device. Paste the code below instead.",
    fr: "Aucune caméra disponible sur cet appareil. Collez le code ci-dessous.",
    ar: "لا توجد كاميرا متاحة على هذا الجهاز. الصق الرمز أدناه بدلاً من ذلك."
  },
  "scan.invalid": {
    en: "This code is not readable. Try again or paste the code manually.",
    fr: "Ce code est illisible. Réessayez ou collez le code manuellement.",
    ar: "هذا الرمز غير مقروء. حاول مجدداً أو الصق الرمز يدوياً."
  },
  "scan.foreign": {
    en: "This is not a desktop connection code. Scan the Desktop connection QR from Settings.",
    fr: "Ce n’est pas un code de connexion du bureau. Scannez le QR de connexion depuis les paramètres.",
    ar: "هذا ليس رمز اتصال سطح المكتب. امسح رمز الاتصال من الإعدادات."
  },
  "scan.version": {
    en: "This connection code uses an unsupported version. Update the app and try again.",
    fr: "Ce code utilise une version non prise en charge. Mettez l’application à jour puis réessayez.",
    ar: "يستخدم رمز الاتصال هذا إصداراً غير مدعوم. حدّث التطبيق وحاول مجدداً."
  },
  "scan.offline": {
    en: "The server cannot be reached. Check the connection and try again.",
    fr: "Serveur injoignable. Vérifiez la connexion puis réessayez.",
    ar: "تعذر الوصول إلى الخادم. تحقق من الاتصال وحاول مجدداً."
  },
  "scan.unknown": {
    en: "This installation is not registered. Publish a backup from the desktop first.",
    fr: "Cette installation n’est pas enregistrée. Publiez d’abord une sauvegarde depuis le bureau.",
    ar: "هذا التثبيت غير مسجّل. انشر نسخة احتياطية من سطح المكتب أولاً."
  },
  "scan.locked": {
    en: "This school is currently locked. Contact support.",
    fr: "Cette école est actuellement verrouillée. Contactez l’assistance.",
    ar: "هذه المدرسة مقفلة حالياً. اتصل بالدعم."
  },
  "scan.noBackup": {
    en: "Desktop identified, but no published backup exists yet.",
    fr: "Bureau identifié, mais aucune sauvegarde publiée pour le moment.",
    ar: "تم تحديد سطح المكتب، لكن لا توجد نسخة منشورة بعد."
  },
  "scan.manualLabel": { en: "Or paste the connection code", fr: "Ou collez le code de connexion", ar: "أو الصق رمز الاتصال" },
  "scan.manualPlaceholder": { en: "https://…#sm-phone-v1=…", fr: "https://…#sm-phone-v1=…", ar: "https://…#sm-phone-v1=…" },
  "scan.useCode": { en: "Use this code", fr: "Utiliser ce code", ar: "استخدام هذا الرمز" },
  "scan.successTitle": { en: "Desktop identified", fr: "Bureau identifié", ar: "تم تحديد سطح المكتب" },
  "scan.dataset": { en: "Latest backup", fr: "Dernière sauvegarde", ar: "أحدث نسخة" },
  "scan.publishedAt": { en: "Published at", fr: "Publiée le", ar: "تاريخ النشر" },
  "scan.size": { en: "Size", fr: "Taille", ar: "الحجم" },
  "scan.school": { en: "School", fr: "École", ar: "المدرسة" },
  "scan.downloadPending": {
    en: "Download is not connected yet. Identification only — nothing was downloaded.",
    fr: "Le téléchargement n’est pas encore connecté. Identification uniquement — rien n’a été téléchargé.",
    ar: "التنزيل غير متصل بعد. تحديد الهوية فقط — لم يُنزَّل أي شيء."
  },
  "scan.retry": { en: "Scan again", fr: "Scanner à nouveau", ar: "مسح مجدداً" },
  "app.product": { en: "Nex Core — School Manager", fr: "Nex Core — Gestionnaire scolaire", ar: "Nex Core — مدير المدرسة" },
  "dashboard.title": { en: "School overview", fr: "Vue d’ensemble de l’école", ar: "نظرة عامة على المدرسة" },
  "dashboard.month": { en: "Covered month", fr: "Mois couvert", ar: "الشهر المغطى" },
  "dashboard.collected": { en: "Tuition collected", fr: "Frais collectés", ar: "الرسوم المحصّلة" },
  "dashboard.paid": { en: "Paid", fr: "Payés", ar: "مدفوع" },
  "dashboard.partial": { en: "Partial", fr: "Partiel", ar: "جزئي" },
  "dashboard.unpaid": { en: "Unpaid", fr: "Non payés", ar: "غير مدفوع" },
  "dashboard.students": { en: "Active students", fr: "Élèves actifs", ar: "التلاميذ النشطون" },
  "dashboard.groups": { en: "Active groups", fr: "Groupes actifs", ar: "الأفواج النشطة" },
  "dashboard.teachers": { en: "Teachers", fr: "Enseignants", ar: "الأساتذة" },
  "dashboard.sessions": { en: "Sessions", fr: "Séances", ar: "الحصص" },
  "dashboard.attendance": { en: "Attendance", fr: "Présence", ar: "الحضور" },
  "dashboard.initialized": { en: "Initialized sessions", fr: "Séances initialisées", ar: "حصص مُهيّأة" },
  "dashboard.present": { en: "Present", fr: "Présents", ar: "حاضرون" },
  "dashboard.absent": { en: "Absent", fr: "Absents", ar: "غائبون" },
  "dashboard.notRecorded": { en: "Not recorded", fr: "Non enregistré", ar: "غير مسجّل" },
  "dashboard.trend": { en: "Monthly collection trend", fr: "Tendance mensuelle des collections", ar: "اتجاه التحصيل الشهري" },
  "dashboard.attention": { en: "Needs attention", fr: "À surveiller", ar: "يحتاج إلى انتباه" },
  "dashboard.noAttention": { en: "Nothing needs attention.", fr: "Rien à surveiller.", ar: "لا يوجد ما يحتاج إلى انتباه." },
  "dashboard.outstanding": { en: "Outstanding", fr: "Reste à payer", ar: "المتبقي" },
  "dashboard.priceUnknown": { en: "Price not set", fr: "Prix non défini", ar: "السعر غير محدد" },
  "dashboard.demoSettings": { en: "Demo settings", fr: "Paramètres de démo", ar: "إعدادات تجريبية" },
  "dashboard.demoBadge": { en: "Fictional demo data", fr: "Données de démonstration fictives", ar: "بيانات تجريبية وهمية" },
  "dashboard.regenerate": { en: "Regenerate", fr: "Régénérer", ar: "إعادة إنشاء" },
  "dashboard.seed": { en: "Seed", fr: "Graine", ar: "البذرة" },
  "dashboard.studentCount": { en: "Students", fr: "Élèves", ar: "التلاميذ" },
  "dashboard.teacherCount": { en: "Teachers", fr: "Enseignants", ar: "الأساتذة" },
  "dashboard.upcoming": { en: "Coming soon", fr: "Bientôt disponible", ar: "قريباً" },
  "nav.overview": { en: "Overview", fr: "Vue d’ensemble", ar: "نظرة عامة" },
  "nav.more": { en: "More", fr: "Plus", ar: "المزيد" },
  "dashboard.attention.unpaid": { en: "students unpaid", fr: "élèves non payés", ar: "تلاميذ غير مدفوعين" },
  "dashboard.attention.unassigned": { en: "groups without teacher", fr: "groupes sans enseignant", ar: "أفواج بدون أستاذ" },
  "dashboard.attention.unknownPrice": { en: "groups with unknown price", fr: "groupes au prix inconnu", ar: "أفواج بسعر غير محدد" },
  "dashboard.attention.uninitialized": { en: "uninitialized sessions", fr: "séances non initialisées", ar: "حصص غير مُهيّأة" },
  "dashboard.welcome": { en: "School overview", fr: "Vue d’ensemble de l’école", ar: "نظرة عامة على المدرسة" },
  "dashboard.sessionsThisMonth": { en: "Sessions this month", fr: "Séances ce mois", ar: "حصص هذا الشهر" },
  "dashboard.collectionsOverTime": { en: "Collections over time", fr: "Collections dans le temps", ar: "التحصيل عبر الزمن" },
  "dashboard.attendanceSummary": { en: "Attendance summary", fr: "Résumé de la présence", ar: "ملخص الحضور" },
  "dashboard.notRecordedSessions": { en: "sessions not recorded", fr: "séances non enregistrées", ar: "حصص غير مسجّلة" },
  "nav.students": { en: "Students", fr: "Élèves", ar: "الطلاب" },
  "nav.payments": { en: "Payments", fr: "Paiements", ar: "المدفوعات" },
  "nav.attendance": { en: "Attendance", fr: "Présence", ar: "الحضور" },
  "nav.overview": { en: "Overview", fr: "Vue d’ensemble", ar: "نظرة عامة" },
  "students.title": { en: "Students", fr: "Élèves", ar: "الطلاب" },
  "students.search": { en: "Search name or number", fr: "Rechercher nom ou numéro", ar: "ابحث بالاسم أو الرقم" },
  "students.filterGroup": { en: "Group", fr: "Groupe", ar: "الفوج" },
  "students.filterTeacher": { en: "Teacher", fr: "Enseignant", ar: "الأستاذ" },
  "students.filterStatus": { en: "Status", fr: "Statut", ar: "الحالة" },
  "students.allGroups": { en: "All groups", fr: "Tous les groupes", ar: "كل الأفواج" },
  "students.allTeachers": { en: "All teachers", fr: "Tous les enseignants", ar: "كل الأساتذة" },
  "students.allStatuses": { en: "All statuses", fr: "Tous les statuts", ar: "كل الحالات" },
  "students.resetFilters": { en: "Reset filters", fr: "Réinitialiser", ar: "إعادة ضبط" },
  "students.noResults": { en: "No students match these filters.", fr: "Aucun élève ne correspond.", ar: "لا يوجد تلاميذ مطابقون." },
  "students.overallStatus": { en: "Overall", fr: "Global", ar: "إجمالي" },
  "students.attended": { en: "attended", fr: "présents", ar: "حاضر" },
  "students.recordedSessions": { en: "recorded sessions", fr: "séances enregistrées", ar: "حصص مسجّلة" },
  "students.noRecordedSessions": { en: "No recorded sessions", fr: "Aucune séance enregistrée", ar: "لا توجد حصص مسجّلة" },
  "payments.title": { en: "Payments", fr: "Paiements", ar: "المدفوعات" },
  "payments.month": { en: "Payment month", fr: "Mois de paiement", ar: "شهر الدفع" },
  "payments.collected": { en: "Collected", fr: "Collecté", ar: "المحصّل" },
  "payments.outstanding": { en: "Outstanding", fr: "Reste", ar: "المتبقي" },
  "payments.byGroup": { en: "By group", fr: "Par groupe", ar: "حسب الفوج" },
  "payments.byTeacher": { en: "By teacher", fr: "Par enseignant", ar: "حسب الأستاذ" },
  "payments.expenses": { en: "Recurring monthly expenses", fr: "Charges mensuelles récurrentes", ar: "النفقات الشهرية المتكررة" },
  "payments.rent": { en: "Rent", fr: "Loyer", ar: "الإيجار" },
  "payments.addExpense": { en: "Add expense", fr: "Ajouter une charge", ar: "إضافة نفقة" },
  "payments.expenseName": { en: "Expense name", fr: "Nom de la charge", ar: "اسم النفقة" },
  "payments.expenseAmount": { en: "Amount (DZD)", fr: "Montant (DZD)", ar: "المبلغ (دج)" },
  "payments.remove": { en: "Remove", fr: "Supprimer", ar: "حذف" },
  "payments.netAfterExpenses": { en: "Net after recurring expenses", fr: "Net après charges", ar: "الصافي بعد النفقات" },
  "attendance.title": { en: "Attendance", fr: "Présence", ar: "الحضور" },
  "attendance.groups": { en: "Groups", fr: "Groupes", ar: "الأفواج" },
  "attendance.sessions": { en: "Sessions", fr: "Séances", ar: "الحصص" },
  "attendance.present": { en: "Present", fr: "Présent", ar: "حاضر" },
  "attendance.absent": { en: "Absent", fr: "Absent", ar: "غائب" },
  "attendance.notRecorded": { en: "Not recorded", fr: "Non enregistré", ar: "غير مسجّل" },
  "attendance.backToGroups": { en: "Back to groups", fr: "Retour aux groupes", ar: "العودة للأفواج" },
  "attendance.backToSessions": { en: "Back to sessions", fr: "Retour aux séances", ar: "العودة للحصص" },
  "attendance.noSessions": { en: "No sessions for this month.", fr: "Aucune séance ce mois.", ar: "لا توجد حصص هذا الشهر." },
  "attendance.noRoster": { en: "No roster for this session.", fr: "Aucune liste pour cette séance.", ar: "لا توجد قائمة لهذا الحصة." },
  "common.settings": { en: "Demo settings", fr: "Paramètres de démo", ar: "إعدادات تجريبية" },
  "common.close": { en: "Close", fr: "Fermer", ar: "إغلاق" },
  "common.all": { en: "All", fr: "Tous", ar: "الكل" },
  "demo.newSeed": { en: "New seed", fr: "Nouvelle graine", ar: "بذرة جديدة" }
};

export function translate(lang, key) {
  const entry = STRINGS[key];
  if (!entry) return key;
  return entry[lang] || entry.en;
}

export function isRtl(lang) {
  return RTL_LANGUAGES.has(lang);
}

export function availableLanguages() {
  return [...LANGUAGES];
}

// Test helper: every key must exist in every language.
export function translationKeys() {
  return Object.keys(STRINGS);
}

export function checkTranslations() {
  const missing = [];
  for (const key of Object.keys(STRINGS)) {
    for (const lang of LANGUAGES) {
      if (!STRINGS[key][lang]) missing.push(`${key}:${lang}`);
    }
  }
  return missing;
}
