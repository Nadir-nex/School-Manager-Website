"use strict";

const INSTALLER_FILE = "School-Manager-Setup.exe";
const SCAN_IMAGES = [
  "assets/images/scan-paid.png",
  "assets/images/scan-unpaid.png",
];

const TRANSLATIONS = [
  [
    "نساعدك على إعداد البرنامج، إدخال أول بياناتك، تدريب الشخص الذي سيستعمله، وضبط طباعة الوصولات. وعندما يصل تحديث جديد أو تحتاج إلى تعديل ممكن، لن تبدأ من الصفر.",
    "Nous vous aidons à démarrer, à former l’utilisateur quotidien et à régler l’impression. Une mise à jour ou une évolution réalisable ne vous oblige pas à repartir de zéro.",
  ],
  [
    "نبذل كل ما يمكن لضبط الطابعة والتعريف والهوامش والقص. يعتمد النجاح أيضاً على سلامة الطابعة ووجود تعريف Windows متوافق، ولا يشمل الدعم إصلاح الأعطال المادية.",
    "Nous faisons le maximum pour le réglage. Le résultat dépend aussi de l’état du matériel et d’un pilote Windows compatible.",
  ],
  [
    "لا يكتفي البرنامج بعلامة «دفع». تابع كل فوج وشهر، اعرف المتأخرين، سجّل التخفيضات والحالات الخاصة، اطبع الوصولات وراجع تحليلاتك دون إعادة الحساب يدوياً.",
    "Suivez chaque groupe et chaque mois, repérez les retards, gérez remises et cas particuliers, imprimez les reçus et consultez vos analyses sans recalcul manuel.",
  ],
  [
    "أنشئ رمز QR لكل تلميذ من داخل البرنامج، واطبع البطاقة بالتصميم الذي يناسب مدرستك. عند المسح تظهر الصورة والهوية والفوج وحالة الدفع والحضور مباشرة.",
    "Créez un QR pour chaque élève et imprimez la carte comme vous le souhaitez. Au scan, photo, identité, groupe, paiement et présence apparaissent immédiatement.",
  ],
  [
    "نستقبل الطلبات وندرسها حسب فائدتها وإمكانية تنفيذها واستقرار البرنامج. الإضافات والتعديلات الممكنة لا تحمل رسوم تطوير إضافية.",
    "Les demandes sont étudiées selon leur utilité, leur faisabilité et la stabilité du logiciel. Les évolutions réalisables ne sont pas facturées.",
  ],
  [
    "كل ما تحتاجه لتسيير التلاميذ والأفواج والمدفوعات والحضور في برنامج Windows واحد، مع تدريب حقيقي ودعم يبقى معك.",
    "Élèves, groupes, paiements et présences dans un seul logiciel Windows, avec une vraie formation et un accompagnement qui continue.",
  ],
  [
    "يبدأ التفعيل بعد أن تجرّب البرنامج في العمل الحقيقي. تبقى بيانات التجربة كما هي بعد الشراء.",
    "L’activation vient après l’essai réel. Toutes les données créées pendant l’essai restent en place.",
  ],
  [
    "المقارنة ليست في عدد الأزرار. الفرق الحقيقي هو ما تستطيع تجربته، وما تحصل عليه بعد الشراء.",
    "La vraie différence se mesure dans ce que vous testez et ce que vous recevez après l’achat.",
  ],
  [
    "تحصل الرخصة المفعّلة على تحديثات البرنامج المنشورة مستقبلاً دون رسوم تجديد شهرية أو سنوية.",
    "La licence activée reçoit les futures mises à jour publiées sans frais mensuels ou annuels.",
  ],
  [
    "التجربة، المرافقة، والتطوير ليست إضافات مدفوعة نخفيها بعد الشراء؛ إنها جزء من البرنامج.",
    "L’essai, l’accompagnement et l’évolution du logiciel font partie du produit, sans supplément après l’achat.",
  ],
  [
    "نساعدك على اختيار الإعدادات والهوامش والقص والطباعة العربية حتى نصل لأفضل نتيجة ممكنة.",
    "Nous vous aidons à régler papier, marges, coupe et impression arabe pour le meilleur résultat possible.",
  ],
  [
    "لا. تحصل على جميع الخصائص لمدة 90 يوماً من أول تشغيل، دون بطاقة بنكية أو تسجيل مسبق.",
    "Non. Toutes les fonctions sont disponibles pendant 90 jours, sans carte bancaire ni inscription.",
  ],
  [
    "90 يوماً كاملة تكفي لتعرف إن كان البرنامج سيصبح جزءاً حقيقياً من عملك اليومي.",
    "90 jours complets pour savoir s’il mérite une place dans votre travail quotidien.",
  ],
  [
    "نستقبل إضافاتك وتعديلاتك الممكنة ونضمّها إلى البرنامج دون رسوم تطوير إضافية.",
    "Nous étudions et intégrons les ajouts et modifications réalisables sans frais de développement.",
  ],
  [
    "أنشئ البطاقات وغيّرها واطبعها كما تريد. تظهر صورة التلميذ وحالته عند المسح.",
    "Créez, modifiez et imprimez les cartes. La photo et le statut de l’élève apparaissent au scan.",
  ],
  [
    "شرح عملي للتلاميذ، الأفواج، المدفوعات، QR، النسخ الاحتياطي والتقارير.",
    "Élèves, groupes, paiements, QR, sauvegardes et rapports en situation réelle.",
  ],
  [
    "جرّب جميع الخصائص في مدرستك ومع بياناتك الحقيقية قبل أن تدفع أي شيء.",
    "Testez toutes les fonctions dans votre école, avec vos vraies données, avant de payer.",
  ],
  [
    "تحديثات دائمة واستقبال الإضافات والتعديلات الممكنة دون رسوم إضافية.",
    "Mises à jour durables et demandes réalisables sans frais supplémentaires.",
  ],
  [
    "نُدرّبك أنت أو الموظف الذي سيستعمل البرنامج، ونبقى معك عند الحاجة.",
    "Nous formons la personne qui utilisera le logiciel et restons disponibles en cas de besoin.",
  ],
  [
    "تحصل على تحديثات البرنامج القادمة دون رسوم تجديد شهرية أو سنوية.",
    "Recevez les futures mises à jour sans frais de renouvellement mensuels ou annuels.",
  ],
  [
    "بطاقة تنشئها وتغيّرها كما تريد، مع ظهور الصورة والحالة عند المسح",
    "Carte librement créée et modifiée, avec photo et statut au scan",
  ],
  [
    "اختيار الطابعة، حجم الورق، الهوامش، القص، المحاذاة والنص العربي.",
    "Choix de l’imprimante, papier, marges, coupe, alignement et arabe.",
  ],
  [
    "لا. ينشئ البرنامج البطاقات، ويمكن مسحها بكاميرا حاسوب متوافقة.",
    "Non. Le logiciel crée les cartes et une caméra d’ordinateur compatible suffit pour les scanner.",
  ],
  [
    "Windows 10/11 • العربية والفرنسية • لا تحتاج إلى بطاقة بنكية",
    "Windows 10/11 • Arabe et français • Sans carte bancaire",
  ],
  [
    "برنامج تسيير المدارس — صُمّم للعمل اليومي الحقيقي.",
    "Logiciel de gestion scolaire — conçu pour le vrai travail quotidien.",
  ],
  [
    "لا اشتراك شهري • لا اشتراك سنوي • لا رسوم تجديد",
    "Sans mensualité • Sans abonnement annuel • Sans renouvellement",
  ],
  [
    "اعرف من دفع. اعرف من حضر. وسيّر مدرستك بوضوح.",
    "Sachez qui a payé. Sachez qui est présent. Gérez clairement.",
  ],
  [
    "لا تحتاج إلى قارئ خاص؛ تكفي كاميرا متوافقة",
    "Aucun lecteur spécial : une caméra compatible suffit",
  ],
  [
    "متأخرات، تخفيضات، وصولات وتحليلات مترابطة",
    "Retards, remises, reçus et analyses reliés",
  ],
  [
    "إنشاء الرمز وتغييره وإعادة طباعته متى شئت",
    "Recréez et réimprimez le code à tout moment",
  ],
  [
    "برنامج تسيير المدارس الخاصة ومراكز الدعم",
    "Logiciel de gestion pour écoles et centres de soutien",
  ],
  [
    "تحديثات مدى الحياة وتعديلات ممكنة مجاناً",
    "Mises à jour à vie et évolutions réalisables gratuites",
  ],
  [
    "جرّبه أولاً. ادفع فقط عندما يثبت فائدته.",
    "Testez d’abord. Payez quand le logiciel a fait ses preuves.",
  ],
  [
    "ظهرت الصورة وحالة الدفع فور مسح البطاقة",
    "Photo et statut du paiement affichés dès le scan",
  ],
  [
    "الحالة الخضراء بعد تسجيل حضور تلميذ دفع",
    "État vert après l’enregistrement d’un élève à jour",
  ],
  [
    "حسابات أوضح. مفاجآت أقل في نهاية الشهر.",
    "Des comptes clairs. Moins de surprises en fin de mois.",
  ],
  [
    "قد تحتاج إلى تسجيل يدوي أو أداة منفصلة",
    "Une saisie manuelle ou un outil séparé peut être nécessaire",
  ],
  [
    "صورة واضحة للتحقق من هوية صاحب البطاقة",
    "Photo claire pour vérifier l’identité",
  ],
  [
    "تنبيه أحمر: التلميذ حاضر والدفع متأخر",
    "Alerte rouge : présence enregistrée, paiement en retard",
  ],
  [
    "جرّب البرنامج في مدرستك قبل أن تدفع.",
    "Testez-le dans votre école avant de payer.",
  ],
  [
    "قد تضطر لاتخاذ القرار خلال مدة أقصر",
    "Vous devrez peut-être décider sur une période plus courte",
  ],
  ["تنبيهات مرئية وصوتية للحالات المهمة", "Alertes visuelles et sonores"],
  [
    "ستة وعود واضحة. لا حزم ولا مفاجآت.",
    "Six engagements clairs. Aucun forfait caché.",
  ],
  [
    "تدريب عملي وضبط طابعة الوصولات معك",
    "Formation pratique et réglage de l’imprimante avec vous",
  ],
  [
    "قد توجد رسوم تجديد أو تطوير منفصلة",
    "Renouvellement ou développement parfois facturé séparément",
  ],
  ["وصولات عربية وتقارير قابلة للتصدير", "Reçus arabes et exports"],
  ["الإضافات والتعديلات الممكنة مجاناً", "Évolutions réalisables gratuites"],
  [
    "برنامج لا يتركك وحدك بعد التنزيل.",
    "Un logiciel qui ne vous abandonne pas après le téléchargement.",
  ],
  [
    "بطاقة واحدة. كل ما تحتاجه أمامك.",
    "Une carte. Toutes les informations utiles.",
  ],
  ["هل يحتاج الحضور إلى جهاز QR خاص؟", "Faut-il un lecteur QR spécial ?"],
  ["الرياضيات — السنة الثالثة ثانوي", "Mathématiques — 3e année secondaire"],
  [
    "قد تحتاج إلى جمع الأرقام يدوياً",
    "Les chiffres peuvent devoir être regroupés manuellement",
  ],
  ["تحليل حسب الشهر والفوج والأستاذ", "Analyse par mois, groupe et enseignant"],
  [
    "تنزيل مباشر لملف تثبيت Windows.",
    "Téléchargement direct de l’installeur Windows.",
  ],
  [
    "لن تستلم البرنامج وتُترك وحدك.",
    "Vous ne recevez pas un logiciel pour rester seul.",
  ],
  ["90 يوماً للتجربة بجميع الخصائص", "90 jours d’essai complet"],
  ["المساعدة في ضبط طابعة الوصولات", "Aide au réglage de l’imprimante"],
  ["رخصة دائمة لجهاز Windows واحد", "Licence permanente pour un PC Windows"],
  ["ماذا تعني تحديثات مدى الحياة؟", "Que signifie « mises à jour à vie » ?"],
  [
    "هل كل طلب تغيير يُنفّذ فوراً؟",
    "Toute demande est-elle exécutée immédiatement ?",
  ],
  ["Afficher le site en français", "عرض الموقع بالعربية"],
  ["حمّل البرنامج — جرّبه مجاناً", "Télécharger — essai gratuit"],
  [
    "تتولى الإعداد والتجربة بنفسك",
    "Vous gérez seul les essais et les réglages",
  ],
  ["هل النسخة التجريبية محدودة؟", "L’essai est-il limité ?"],
  ["تجربة كاملة بجميع الخصائص", "Essai complet, toutes fonctions incluses"],
  ["90 يوماً للتجربة الكاملة", "90 jours d’essai complet"],
  ["دفعة متأخرة تحتاج متابعة", "Paiements à relancer"],
  ["متابعة الديون والمتأخرات", "Suivi des dettes et retards"],
  ["كل شيء واضح قبل أن تبدأ.", "Tout est clair avant de commencer."],
  ["دفعة واحدة — دون اشتراك", "Paiement unique — sans abonnement"],
  ["حالة دفع مستقلة لكل فوج", "Paiement indépendant par groupe"],
  ["متابعة مستحقات الأساتذة", "Suivi des parts enseignants"],
  ["التدريب والدعم المتواصل", "Formation et suivi continu"],
  ["هل تضمنون عمل أي طابعة؟", "Garantissez-vous toute imprimante ?"],
  ["تم التعرف على التلميذة", "Élève identifiée"],
  ["طلبات التطوير مجاناً", "Demandes d’évolution gratuites"],
  ["90 يوماً بكل الخصائص", "90 jours, toutes fonctions"],
  ["المرافقة بعد التثبيت", "Après l’installation"],
  ["حضور ذكي ببطاقات QR", "Présence intelligente par QR"],
  ["تدريب ودعم متواصلان", "Formation et suivi continu"],
  ["أقوى ما في البرنامج", "Le cœur du logiciel"],
  ["إجمالي مداخيل الشهر", "Revenus du mois"],
  ["تخفيضات وأسعار خاصة", "Remises et tarifs spéciaux"],
  ["ما الذي تحصل عليه؟", "Ce que vous obtenez"],
  ["ضبط طابعة الوصولات", "Réglage de l’imprimante"],
  ["تحديثات مدى الحياة", "Mises à jour à vie"],
  ["في الحلول المعتادة", "Solutions habituelles"],
  ["تحديثات مدى الحياة", "Mises à jour à vie"],
  ["رقم التلميذ: 0248", "N° élève : 0248"],
  ["العربية والفرنسية", "Arabe et français"],
  ["أسئلة قبل التنزيل", "Avant de télécharger"],
  ["تبديل سطوع الموقع", "Changer la luminosité du site"],
  ["QR وصورة التلميذ", "QR et photo"],
  ["التدريب والطباعة", "Formation et impression"],
  ["تم تسجيل الحضور", "Présence enregistrée"],
  ["نظام مالي مفصّل", "Finance détaillée"],
  ["الكاميرا جاهزة", "Caméra prête"],
  ["النسخة الكاملة", "Version complète"],
  ["النظام المالي", "Finance"],
  ["ما بعد الشراء", "Après l’achat"],
  ["سعر واحد واضح", "Un prix clair"],
  ["الحضور الذكي", "Présence intelligente"],
  ["سارة بن يوسف", "Sarah Benyoucef"],
  ["مداخيل الشهر", "Revenus du mois"],
  ["مدفوع ومسجّل", "Payé et présent"],
  ["2,840,000 دج", "2 840 000 DA"],
  ["نسبة التحصيل", "Taux de collecte"],
  ["مع برنامجنا", "Avec notre logiciel"],
  ["دفع شهر أوت", "Paiement d’août"],
  ["حضور اليوم", "Présents aujourd’hui"],
  ["لماذا نحن؟", "Pourquoi nous ?"],
  ["دفعة واحدة", "Paiement unique"],
  ["30,000 دج", "30 000 DA"],
  ["حصة اليوم", "Séance du jour"],
  ["غير مدفوع", "Non payé"],
  ["90 يوماً", "90 jours"],
  ["التلاميذ", "Élèves"],
  ["ما يهمك", "Ce qui compte"],
  ["التجربة", "Essai"],
  ["التدريب", "Formation"],
  ["الطباعة", "Impression"],
  ["التطوير", "Évolution"],
  ["مدفوع", "Payé"],
  ["الفوج", "Groupe"],
  ["مسجّل", "Enregistré"],
  ["rtl", "ltr"],
  ["94%", "94 %"],
  ["FR", "AR"],
];
const ARABIC_TO_FRENCH = new Map(TRANSLATIONS);
const FRENCH_TO_ARABIC = new Map(
  TRANSLATIONS.map(([arabic, french]) => [french, arabic]),
);

const languageButton = document.querySelector(".language-button");
const themeButton = document.querySelector(".icon-button");
const root = document.documentElement;

document.querySelectorAll("a.download-button").forEach((link) => {
  link.href = "./" + INSTALLER_FILE;
  link.setAttribute("download", INSTALLER_FILE);
});

function translateValue(value, dictionary) {
  if (!value) return value;
  if (dictionary.has(value)) return dictionary.get(value);

  let translated = value;
  for (const [source, target] of dictionary) {
    translated = translated.split(source).join(target);
  }
  return translated;
}

function translatePage(language) {
  const toFrench = language === "fr";
  const dictionary = toFrench ? ARABIC_TO_FRENCH : FRENCH_TO_ARABIC;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((node) => {
    if (node.parentElement?.closest("script, style")) return;
    node.nodeValue = translateValue(node.nodeValue, dictionary);
  });

  document
    .querySelectorAll("[aria-label], [title], [alt]")
    .forEach((element) => {
      for (const attribute of ["aria-label", "title", "alt"]) {
        if (element.hasAttribute(attribute)) {
          element.setAttribute(
            attribute,
            translateValue(element.getAttribute(attribute), dictionary),
          );
        }
      }
    });

  root.lang = language;
  root.dir = toFrench ? "ltr" : "rtl";
  localStorage.setItem("school-manager-language", language);
}

languageButton?.addEventListener("click", () => {
  translatePage(root.lang === "ar" ? "fr" : "ar");
});

function applyTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem("school-manager-theme", theme);
}

themeButton?.addEventListener("click", () => {
  applyTheme(root.dataset.theme === "dark" ? "light" : "dark");
});

const preferredTheme = localStorage.getItem("school-manager-theme");
if (preferredTheme) {
  applyTheme(preferredTheme);
} else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  applyTheme("dark");
}

const scannerButtons = [...document.querySelectorAll(".scan-switcher button")];
const scannerImage = document.querySelector(".active-scan-shot img");
const scannerCaption = document.querySelector(".active-scan-shot figcaption");

scannerButtons.forEach((button, index) => {
  button.addEventListener("click", () => {
    scannerButtons.forEach((item, itemIndex) => {
      item.classList.toggle("active", itemIndex === index);
      item.classList.remove("state-0", "state-1");
      if (itemIndex === index) item.classList.add("state-" + index);
      item.setAttribute("aria-selected", String(itemIndex === index));
    });

    if (scannerImage) scannerImage.src = SCAN_IMAGES[index];
    if (scannerCaption) {
      scannerCaption.textContent = scannerButtons[index].textContent.trim();
    }
  });
});

const analysisProof = document.querySelector(".analysis-proof");
if (analysisProof) {
  analysisProof.innerHTML = [
    '<div class="analysis-mobile-scroll">',
    '  <button class="shot-open analysis-image-button" type="button" aria-label="تكبير صورة التحليل المالي">',
    '    <img class="analysis-image" src="assets/images/revenue-analysis.png" alt="واجهة التحليل المالي في البرنامج">',
    "  </button>",
    "</div>",
    '<p class="analysis-scroll-hint">اسحب اللوحة أفقياً لرؤية التفاصيل بحجم واضح</p>',
  ].join("\n");
}

function openLightbox(imageSource, imageAlt) {
  const overlay = document.createElement("div");
  overlay.className = "image-lightbox";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = [
    '<button type="button" class="lightbox-close" aria-label="إغلاق">×</button>',
    '<div class="lightbox-scroll">',
    '  <img src="' + imageSource + '" alt="' + (imageAlt || "") + '">',
    "</div>",
  ].join("\n");

  const close = () => overlay.remove();
  overlay.addEventListener("click", close);
  overlay.querySelector(".lightbox-close")?.addEventListener("click", close);
  overlay
    .querySelector(".lightbox-scroll")
    ?.addEventListener("click", (event) => event.stopPropagation());
  document.body.appendChild(overlay);
}

document.addEventListener("click", (event) => {
  const button = event.target.closest(".shot-open");
  if (!button) return;
  const image = button.querySelector("img");
  if (image) openLightbox(image.src, image.alt);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape")
    document.querySelector(".image-lightbox")?.remove();
});

const savedLanguage = localStorage.getItem("school-manager-language");
if (savedLanguage === "fr") translatePage("fr");
