"use strict";

const INSTALLER_FILE = "School-Manager-Setup.exe";
const UPDATE_MANIFEST_FILE = "update.json";
const SCAN_IMAGES = [
  "assets/images/scan-paid.png",
  "assets/images/scan-unpaid.png",
];

const TRANSLATIONS = [
  [
    "تحتاج وحدة QR إلى وحدة الجدول والحضور لأنها تسجّل حضور التلميذ داخل حصصه. عند اختيار QR تُضاف وحدة الحضور تلقائياً إلى الحاسبة.",
    "Le module QR nécessite Planning et présences, car il enregistre l’élève dans ses séances. En choisissant QR, le module Présences est ajouté automatiquement au calcul.",
  ],
  [
    "ابدأ بالأساسيات، ثم أضف الوحدات التي تختصر عملك فعلاً. سترى السعر النهائي والتخفيض المناسب مباشرة.",
    "Commencez par l’essentiel, puis ajoutez uniquement les modules qui simplifient réellement votre travail. Le prix final et la remise apparaissent immédiatement.",
  ],
  [
    "اختر النسخة الشاملة إذا أردت كل قوة البرنامج. أو ارجع إلى الحاسبة لتدفع فقط مقابل الوحدات التي ستستعملها فعلاً.",
    "Choisissez la version complète pour profiter de toute la puissance du logiciel, ou revenez au calculateur pour ne payer que les modules réellement utiles.",
  ],
  [
    "اختر اسماً لترى بالضبط ما تضيفه الوحدة إلى عملك اليومي قبل أن تقرر شراءها.",
    "Sélectionnez un module pour voir précisément ce qu’il apporte à votre travail avant de l’acheter.",
  ],
  [
    "قلب المدرسة المنظّم: كل تلميذ وفوج وأستاذ ودفعة في مكان واحد، واضح وسريع ولا يحتاج إلى جداول متناثرة.",
    "Le cœur organisé de votre établissement : chaque élève, groupe, enseignant et paiement au même endroit, sans fichiers dispersés.",
  ],
  [
    "كل الوحدات بـ 40,000 دج بدلاً من 48,000 دج.",
    "Tous les modules à 40 000 DA au lieu de 48 000 DA.",
  ],
  [
    "ستة وعود واضحة، مهما كانت الوحدات التي تختارها.",
    "Six engagements clairs, quels que soient les modules choisis.",
  ],
  [
    "ادفع فقط مقابل الأدوات التي تحتاجها مؤسستك.",
    "Payez uniquement pour les outils dont votre établissement a besoin.",
  ],
  [
    "البرنامج الأساسي كاملاً، ويمكنك إضافة أي وحدة لاحقاً.",
    "Le logiciel de base complet, avec la possibilité d’ajouter un module plus tard.",
  ],
  [
    "الأساسيات + الجدول والحضور + الأدوات والتقارير.",
    "L’essentiel + planning et présences + outils et rapports.",
  ],
  [
    "التلاميذ، الأفواج، الأساتذة، المدفوعات والإعدادات",
    "Élèves, groupes, enseignants, paiements et paramètres",
  ],
  [
    "الجدول والحضور وQR والتقارير والتحليل والطباعة",
    "Planning, présences, QR, rapports, analyses et impression",
  ],
  [
    "جميع الوحدات الحالية مشمولة",
    "Tous les modules actuels sont inclus",
  ],
  [
    "تعمل مع وحدة الجدول والحضور",
    "Fonctionne avec le module Planning et présences",
  ],
  [
    "كل الوحدات الحالية في رخصة واحدة دائمة.",
    "Tous les modules actuels dans une licence permanente.",
  ],
  [
    "تحتاج وحدة QR إلى وحدة الجدول والحضور",
    "Le module QR nécessite Planning et présences",
  ],
  [
    "حوّل الأرقام إلى مؤشرات مالية واضحة",
    "Transformez vos chiffres en indicateurs financiers clairs",
  ],
  [
    "تقارير جاهزة وتصدير PDF وExcel وCSV",
    "Rapports prêts à l’emploi et exports PDF, Excel et CSV",
  ],
  [
    "طباعة حرارية تلقائية عند تسجيل الدفع",
    "Impression thermique automatique après paiement",
  ],
  [
    "خطط الحصص وسجّل الحضور يدوياً بدقة",
    "Planifiez les séances et enregistrez précisément les présences",
  ],
  [
    "وفّر 8,000 دج • لا اشتراك شهري • لا رسوم تجديد",
    "Économisez 8 000 DA • Sans mensualité • Sans renouvellement",
  ],
  [
    "تحصل الرخصة المفعّلة على تحديثات البرنامج والوحدات التي اشتريتها دون رسوم تجديد شهرية أو سنوية.",
    "La licence activée reçoit les mises à jour du logiciel et des modules achetés sans frais de renouvellement mensuels ou annuels.",
  ],
  ["ملفات تلاميذ كاملة مع الصور والبيانات", "Fiches élèves complètes avec photos et données"],
  ["إدارة الأفواج والأساتذة والأسعار", "Gestion des groupes, enseignants et tarifs"],
  ["حساب ذكي للشهر الأول والحالات الخاصة", "Calcul intelligent du premier mois et des cas particuliers"],
  ["نسخ احتياطي واسترجاع آمن للبيانات", "Sauvegarde et restauration sécurisées des données"],
  ["العربية والفرنسية مع واجهة واضحة", "Arabe et français dans une interface claire"],
  ["دفع مستقل لكل فوج وشهر", "Paiement indépendant par groupe et par mois"],
  ["ابدأ بما تحتاجه اليوم", "Commencez avec ce dont vous avez besoin aujourd’hui"],
  ["للعمل اليومي المنظّم", "Pour une gestion quotidienne organisée"],
  ["كل قوة البرنامج دون تنازل", "Toute la puissance du logiciel, sans compromis"],
  ["الأساسيات مع الجدول والحضور والتقارير.", "L’essentiel avec planning, présences et rapports."],
  ["كوّن نسختك واحسب سعرها", "Composez votre version et calculez son prix"],
  ["عند اختيار QR تُضاف وحدة الحضور تلقائياً إلى الحاسبة.", "En choisissant QR, le module Présences est ajouté automatiquement au calculateur."],
  ["هل يمكن شراء وحدة QR وحدها؟", "Peut-on acheter le module QR seul ?"],
  ["ابتداءً من 20,000 دج", "À partir de 20 000 DA"],
  ["ادفع فقط مقابل الوحدات التي تحتاجها", "Ne payez que les modules utiles"],
  ["كوّن نسختك", "Composez votre version"],
  ["اختيار وحدات البرنامج", "Choix des modules du logiciel"],
  ["البرنامج الأساسي", "Logiciel de base"],
  ["الجدول والحضور", "Planning et présences"],
  ["مولّد وقارئ QR", "Générateur et scanner QR"],
  ["الأدوات والتقارير", "Outils et rapports"],
  ["طابعة الوصولات", "Imprimante de reçus"],
  ["يعمل مع وحدة الجدول والحضور", "Fonctionne avec Planning et présences"],
  ["مشمول دائماً", "Toujours inclus"],
  ["يتطلب الحضور", "Présences requises"],
  ["التحليل", "Analyse"],
  ["اختيارك الحالي", "Votre sélection"],
  ["حزمة التسيير", "Pack Gestion"],
  ["السعر النهائي", "Prix final"],
  ["السعر منفصلاً:", "Prix séparé :"],
  ["وفّرت 3,000 دج", "Vous économisez 3 000 DA"],
  ["شاهد خصائص كل وحدة", "Voir les fonctions de chaque module"],
  ["أو اختر حزمة جاهزة", "Ou choisissez un pack prêt à l’emploi"],
  ["الأساسية", "Essentiel"],
  ["التسيير", "Gestion"],
  ["الشاملة", "Complète"],
  ["الأكثر ملاءمة", "Recommandée"],
  ["اختر الأساسية", "Choisir Essentiel"],
  ["اختر حزمة التسيير", "Choisir Gestion"],
  ["اختر النسخة الشاملة", "Choisir la version complète"],
  ["توفير 3,000 دج", "Économisez 3 000 DA"],
  ["توفير 8,000 دج", "Économisez 8 000 DA"],
  ["خصائص الوحدات", "Fonctions des modules"],
  ["كل وحدة صُمّمت لتحلّ مشكلة حقيقية.", "Chaque module résout un problème concret."],
  ["وحدات البرنامج", "Modules du logiciel"],
  ["قاعدة عملك اليومية", "La base de votre travail quotidien"],
  ["السعر", "Prix"],
  ["أقوى تخفيض", "La meilleure économie"],
  ["كوّن نسختك واحسب سعرها", "Composez votre version et calculez son prix"],
  ["48,000 دج", "48 000 DA"],
  ["40,000 دج", "40 000 DA"],
  ["33,000 دج", "33 000 DA"],
  ["20,000 دج", "20 000 DA"],
  ["8,000 دج", "8 000 DA"],
  ["7,000 دج", "7 000 DA"],
  ["6,000 دج", "6 000 DA"],
  ["5,000 دج", "5 000 DA"],
  ["4,000 دج", "4 000 DA"],
  [
    "اضغط الصورة للتكبير ورؤية الواجهة كاملة",
    "Touchez l’image pour l’agrandir et voir toute l’interface",
  ],
  [
    "اسحب اللوحة أفقياً لرؤية التفاصيل بحجم واضح",
    "Faites glisser horizontalement pour voir les détails clairement",
  ],
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
const normalizeTranslationKey = (value) => value.replace(/\s+/g, " ").trim();
const NORMALIZED_ARABIC_TO_FRENCH = new Map(
  TRANSLATIONS.map(([arabic, french]) => [
    normalizeTranslationKey(arabic),
    french,
  ]),
);
const NORMALIZED_FRENCH_TO_ARABIC = new Map(
  TRANSLATIONS.map(([arabic, french]) => [
    normalizeTranslationKey(french),
    arabic,
  ]),
);

const languageButton = document.querySelector(".language-button");
const themeButton = document.querySelector(".icon-button");
const root = document.documentElement;

document.querySelectorAll("a.download-button").forEach((link) => {
  link.href = "/" + INSTALLER_FILE;
  link.setAttribute("download", INSTALLER_FILE);
});

function translateValue(value, dictionary) {
  if (!value) return value;
  const normalized = normalizeTranslationKey(value);
  if (!normalized) return value;
  const leadingSpace = value.match(/^\s*/)?.[0] || "";
  const trailingSpace = value.match(/\s*$/)?.[0] || "";
  return dictionary.has(normalized)
    ? leadingSpace + dictionary.get(normalized) + trailingSpace
    : value;
}

function translatePage(language) {
  const toFrench = language === "fr";
  const dictionary = toFrench
    ? NORMALIZED_ARABIC_TO_FRENCH
    : NORMALIZED_FRENCH_TO_ARABIC;

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
  document.dispatchEvent(new CustomEvent("school-manager:language-change"));
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

const MODULE_PRICES = {
  attendance: 7000,
  qr: 6000,
  reports: 6000,
  analysis: 5000,
  printer: 4000,
};
const CORE_PRICE = 20000;
const PLAN_MODULES = {
  essential: [],
  management: ["attendance", "reports"],
  complete: ["attendance", "qr", "reports", "analysis", "printer"],
};
const BUILDER_COPY = {
  ar: {
    essential: {
      name: "النسخة الأساسية",
      description: "البرنامج الأساسي بكل ما تحتاجه لبدء التسيير.",
    },
    management: {
      name: "حزمة التسيير",
      description: "الأساسيات مع الجدول والحضور والتقارير.",
    },
    complete: {
      name: "النسخة الشاملة",
      description: "كل الوحدات الحالية بأقوى تخفيض متاح.",
    },
    completeUpgrade: {
      name: "النسخة الشاملة أوفر",
      description:
        "وصل اختيارك إلى سعر النسخة الشاملة، لذلك تحصل على جميع الوحدات بالسعر نفسه.",
    },
    custom: {
      name: "نسختك الخاصة",
      description: "سعر محسوب حسب الوحدات التي اخترتها فقط.",
    },
    listPrice: "السعر منفصلاً:",
    saving: "وفّرت",
  },
  fr: {
    essential: {
      name: "Version Essentiel",
      description: "Le logiciel de base avec tout le nécessaire pour commencer.",
    },
    management: {
      name: "Pack Gestion",
      description: "L’essentiel avec planning, présences et rapports.",
    },
    complete: {
      name: "Version Complète",
      description: "Tous les modules actuels avec la meilleure remise.",
    },
    completeUpgrade: {
      name: "La version Complète est plus avantageuse",
      description:
        "Votre sélection atteint le prix de la version Complète : tous les modules sont donc inclus au même prix.",
    },
    custom: {
      name: "Votre version sur mesure",
      description: "Un prix calculé uniquement selon les modules choisis.",
    },
    listPrice: "Prix séparé :",
    saving: "Vous économisez",
  },
};

const FEATURE_CONTENT = {
  core: {
    number: "01",
    price: 20000,
    ar: {
      kicker: "قاعدة عملك اليومية",
      title: "البرنامج الأساسي",
      description:
        "مركز التحكم الهادئ الذي كانت مؤسستك تحتاجه: كل تلميذ وفوج وأستاذ ودفعة في مكان واحد، واضح وسريع.",
      features: [
        "ملفات تلاميذ كاملة مع الصور والبيانات",
        "إدارة الأفواج والأساتذة والأسعار",
        "دفع مستقل لكل فوج وشهر",
        "حساب ذكي للشهر الأول والحالات الخاصة",
        "نسخ احتياطي واسترجاع آمن للبيانات",
        "العربية والفرنسية مع واجهة واضحة",
      ],
    },
    fr: {
      kicker: "La base de votre travail quotidien",
      title: "Logiciel de base",
      description:
        "Le centre de contrôle serein qui manquait à votre établissement : chaque élève, groupe, enseignant et paiement au même endroit.",
      features: [
        "Fiches élèves complètes avec photos et données",
        "Gestion des groupes, enseignants et tarifs",
        "Paiement indépendant par groupe et par mois",
        "Calcul intelligent du premier mois et des cas particuliers",
        "Sauvegarde et restauration sécurisées des données",
        "Arabe et français dans une interface claire",
      ],
    },
  },
  attendance: {
    number: "02",
    price: 7000,
    ar: {
      kicker: "كل حصة تحت السيطرة",
      title: "الجدول والحضور",
      description:
        "حوّل الأسبوع المزدحم إلى جدول واضح، واعرف من حضر كل حصة دون دفاتر متفرقة أو تخمين في نهاية الشهر.",
      features: [
        "جدول أسبوعي واضح لكل فوج وأستاذ",
        "إنشاء الحصص وتعديلها وإلغاؤها",
        "تسجيل الحضور والغياب يدوياً",
        "منع تسجيل الحضور قبل موعد الحصة",
        "سجل حضور مرتب داخل ملف التلميذ",
        "القاعدة اللازمة لإضافة حضور QR",
      ],
    },
    fr: {
      kicker: "Chaque séance sous contrôle",
      title: "Planning et présences",
      description:
        "Transformez une semaine chargée en planning lisible et sachez qui a assisté à chaque séance, sans cahiers dispersés.",
      features: [
        "Planning hebdomadaire par groupe et enseignant",
        "Création, modification et annulation des séances",
        "Présences et absences enregistrées manuellement",
        "Blocage des présences avant l’heure de la séance",
        "Historique ordonné dans la fiche de l’élève",
        "Base nécessaire pour ajouter les présences par QR",
      ],
    },
  },
  qr: {
    number: "03",
    price: 6000,
    dependency: true,
    ar: {
      kicker: "ثوانٍ بدل الطوابير",
      title: "مولّد وقارئ QR",
      description:
        "بطاقة واحدة تجعل الاستقبال أسرع وأكثر احترافاً: امسح الرمز، تحقّق من الصورة، وسجّل الحضور فوراً.",
      dependency: "تُشترى مع وحدة الجدول والحضور.",
      features: [
        "إنشاء رمز خاص لكل تلميذ وإعادة طباعته",
        "مسح سريع بكاميرا حاسوب متوافقة",
        "إظهار صورة التلميذ للتحقق من هويته",
        "تسجيل الحضور داخل الحصة المناسبة",
        "إظهار حالة الدفع مع تنبيهات مرئية وصوتية",
        "معالجة الحضور التعويضي من نفس النظام",
      ],
    },
    fr: {
      kicker: "Des secondes au lieu des files d’attente",
      title: "Générateur et scanner QR",
      description:
        "Une seule carte rend l’accueil plus rapide et professionnel : scannez, vérifiez la photo et enregistrez la présence immédiatement.",
      dependency: "S’achète avec le module Planning et présences.",
      features: [
        "QR unique par élève, modifiable et réimprimable",
        "Scan rapide avec une caméra d’ordinateur compatible",
        "Photo de l’élève affichée pour vérifier son identité",
        "Présence enregistrée dans la séance correspondante",
        "Statut de paiement avec alertes visuelles et sonores",
        "Gestion des présences de rattrapage dans le même système",
      ],
    },
  },
  reports: {
    number: "04",
    price: 6000,
    ar: {
      kicker: "بياناتك جاهزة للاستعمال",
      title: "الأدوات والتقارير",
      description:
        "حوّل ما سجّلته طوال الشهر إلى ملفات مرتبة وجاهزة للطباعة أو المشاركة، دون إعادة كتابة أي معلومة.",
      features: [
        "نافذة تصدير واحدة وبسيطة",
        "ملفات PDF وExcel وCSV",
        "تقارير المدفوعات والمتأخرات",
        "تقارير الحضور عند امتلاك وحدته",
        "كشوف الأساتذة والمبالغ المستحقة",
        "قوائم تلاميذ وأفواج جاهزة للطباعة",
      ],
    },
    fr: {
      kicker: "Vos données prêtes à servir",
      title: "Outils et rapports",
      description:
        "Transformez les données du mois en documents propres, prêts à imprimer ou partager, sans ressaisie.",
      features: [
        "Une seule fenêtre d’export, simple et claire",
        "Formats PDF, Excel et CSV",
        "Rapports de paiements et de retards",
        "Rapports de présences lorsque le module est acquis",
        "Relevés enseignants et montants dus",
        "Listes d’élèves et de groupes prêtes à imprimer",
      ],
    },
  },
  analysis: {
    number: "05",
    price: 5000,
    ar: {
      kicker: "الأرقام تبدأ في الكلام",
      title: "التحليل",
      description:
        "لا تكتفِ بجمع المال؛ افهم أين يتحرك. لوحات واضحة تكشف المداخيل والمصاريف والنتيجة الحقيقية بسرعة.",
      features: [
        "نظرة فورية على المداخيل والنتيجة الصافية",
        "تحليل حسب الشهر والفوج والأستاذ",
        "رسوم بيانية سهلة القراءة",
        "متابعة الديون ونسب التحصيل",
        "مقارنة الفترات واكتشاف الاتجاهات",
        "أرقام تساعدك على اتخاذ قرار أسرع",
      ],
    },
    fr: {
      kicker: "Les chiffres commencent à parler",
      title: "Analyse",
      description:
        "Ne vous contentez pas d’encaisser : comprenez les mouvements. Des tableaux clairs révèlent revenus, charges et résultat réel.",
      features: [
        "Vue immédiate des revenus et du résultat net",
        "Analyse par mois, groupe et enseignant",
        "Graphiques simples à lire",
        "Suivi des dettes et du taux de collecte",
        "Comparaison des périodes et détection des tendances",
        "Indicateurs utiles pour décider plus vite",
      ],
    },
  },
  printer: {
    number: "06",
    price: 4000,
    ar: {
      kicker: "الدفع ينتهي بوصل احترافي",
      title: "طابعة الوصولات",
      description:
        "اجعل كل عملية دفع تبدو منظمة وموثوقة: وصل واضح يُطبع تلقائياً، بالعربية، وبمعلومات الفوج الصحيح.",
      features: [
        "التعرّف على الطابعات الحرارية المثبتة",
        "طباعة تلقائية عند تحويل الدفع إلى مدفوع",
        "تنسيق عربي واضح يلتف دون ضغط النص",
        "اختبار الطباعة والقص من الإعدادات",
        "وصل مستقل لكل فوج ومدفوعاته",
        "ملف PDF احتياطي عند تعذر الطباعة",
      ],
    },
    fr: {
      kicker: "Chaque paiement se termine proprement",
      title: "Imprimante de reçus",
      description:
        "Donnez à chaque paiement une finition organisée et fiable : un reçu clair, imprimé automatiquement avec le bon groupe.",
      features: [
        "Détection des imprimantes thermiques installées",
        "Impression automatique après validation du paiement",
        "Mise en page arabe lisible, sans texte compressé",
        "Test d’impression et de coupe depuis les paramètres",
        "Reçu indépendant pour chaque groupe payé",
        "PDF de secours si l’impression échoue",
      ],
    },
  },
};

const moduleInputs = [
  ...document.querySelectorAll('.module-option input[name="modules"]'),
];
const planCards = [...document.querySelectorAll("[data-plan-card]")];
const featureTabs = [...document.querySelectorAll("[data-feature-tab]")];
let activeFeatureId = "core";

function formatDzd(amount) {
  if (root.lang === "fr") {
    return amount.toLocaleString("fr-FR") + " DA";
  }
  return amount.toLocaleString("en-US") + " دج";
}

function sameSelection(selected, expected) {
  return (
    selected.size === expected.length &&
    expected.every((moduleId) => selected.has(moduleId))
  );
}

function selectedModules() {
  return new Set(
    moduleInputs.filter((input) => input.checked).map((input) => input.value),
  );
}

function setSelectedModules(moduleIds) {
  const selected = new Set(moduleIds);
  moduleInputs.forEach((input) => {
    input.checked = selected.has(input.value);
  });
  updateModuleBuilder();
}

function updateModuleBuilder() {
  const selected = selectedModules();
  const language = root.lang === "fr" ? "fr" : "ar";
  const copy = BUILDER_COPY[language];
  const listPrice = [...selected].reduce(
    (total, moduleId) => total + MODULE_PRICES[moduleId],
    CORE_PRICE,
  );

  let planId = "custom";
  let copyId = "custom";
  let finalPrice = listPrice;
  let displayedListPrice = listPrice;
  const includesManagementBundle =
    selected.has("attendance") && selected.has("reports");

  if (includesManagementBundle) {
    finalPrice -= 3000;
  }

  if (sameSelection(selected, PLAN_MODULES.essential)) {
    planId = "essential";
    copyId = "essential";
  } else if (sameSelection(selected, PLAN_MODULES.management)) {
    planId = "management";
    copyId = "management";
  } else if (
    sameSelection(selected, PLAN_MODULES.complete) ||
    finalPrice >= 40000
  ) {
    planId = "complete";
    copyId = sameSelection(selected, PLAN_MODULES.complete)
      ? "complete"
      : "completeUpgrade";
    finalPrice = 40000;
    displayedListPrice = 48000;
  }

  const saving = displayedListPrice - finalPrice;
  const planCopy = copy[copyId];
  const nameElement = document.querySelector("[data-summary-plan]");
  const descriptionElement = document.querySelector(
    "[data-summary-description]",
  );
  const totalElement = document.querySelector("[data-builder-total]");
  const listPriceElement = document.querySelector("[data-builder-list-price]");
  const savingElement = document.querySelector("[data-builder-saving]");

  if (nameElement) nameElement.textContent = planCopy.name;
  if (descriptionElement) descriptionElement.textContent = planCopy.description;
  if (totalElement) totalElement.textContent = formatDzd(finalPrice);
  if (listPriceElement) {
    listPriceElement.hidden = saving === 0;
    listPriceElement.innerHTML =
      copy.listPrice + " <s>" + formatDzd(displayedListPrice) + "</s>";
  }
  if (savingElement) {
    savingElement.hidden = saving === 0;
    savingElement.textContent = copy.saving + " " + formatDzd(saving);
  }

  planCards.forEach((card) => {
    const isActive = card.dataset.planCard === planId;
    card.classList.toggle("active", isActive);
    card.querySelector("button")?.setAttribute("aria-pressed", String(isActive));
  });
}

moduleInputs.forEach((input) => {
  input.addEventListener("change", () => {
    const attendance = moduleInputs.find(
      (item) => item.value === "attendance",
    );
    const qr = moduleInputs.find((item) => item.value === "qr");

    if (input.value === "qr" && input.checked && attendance) {
      attendance.checked = true;
    }
    if (input.value === "attendance" && !input.checked && qr) {
      qr.checked = false;
    }
    updateModuleBuilder();
  });
});

document.querySelectorAll("[data-plan-select]").forEach((button) => {
  button.addEventListener("click", () => {
    setSelectedModules(PLAN_MODULES[button.dataset.planSelect] || []);
  });
});

function renderFeaturePanel(featureId) {
  const feature = FEATURE_CONTENT[featureId] || FEATURE_CONTENT.core;
  const language = root.lang === "fr" ? "fr" : "ar";
  const content = feature[language];
  const panel = document.querySelector("[data-feature-panel]");
  if (!panel) return;

  activeFeatureId = featureId;
  panel.querySelector("[data-feature-number]").textContent = feature.number;
  panel.querySelector("[data-feature-kicker]").textContent = content.kicker;
  panel.querySelector("[data-feature-title]").textContent = content.title;
  panel.querySelector("[data-feature-description]").textContent =
    content.description;
  panel.querySelector("[data-feature-price-label]").textContent =
    language === "fr" ? "Prix" : "السعر";
  panel.querySelector("[data-feature-price]").textContent = formatDzd(
    feature.price,
  );

  const dependency = panel.querySelector("[data-feature-dependency]");
  dependency.hidden = !feature.dependency;
  dependency.textContent = content.dependency || "";

  const list = panel.querySelector("[data-feature-list]");
  list.replaceChildren(
    ...content.features.map((featureText) => {
      const item = document.createElement("li");
      item.textContent = featureText;
      return item;
    }),
  );

  featureTabs.forEach((tab) => {
    const isActive = tab.dataset.featureTab === featureId;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
    if (isActive) {
      if (!tab.id) tab.id = "module-tab-" + featureId;
      panel.setAttribute("aria-labelledby", tab.id);
    }
  });
}

featureTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => renderFeaturePanel(tab.dataset.featureTab));
  tab.addEventListener("keydown", (event) => {
    let nextIndex = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % featureTabs.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + featureTabs.length) % featureTabs.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = featureTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    featureTabs[nextIndex].focus();
    renderFeaturePanel(featureTabs[nextIndex].dataset.featureTab);
  });
});

document.addEventListener("school-manager:language-change", () => {
  updateModuleBuilder();
  renderFeaturePanel(activeFeatureId);
});

updateModuleBuilder();
renderFeaturePanel(activeFeatureId);

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
