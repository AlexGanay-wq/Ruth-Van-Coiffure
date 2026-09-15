/**
 * Les chorégraphies — les gestes de l'app, écrits une fois.
 *
 * Chacune est une fonction pure : elle reçoit l'allure choisie dans les
 * réglages et renvoie des images-clés. Aucune ne touche au DOM, aucune ne lit
 * l'heure, aucune ne décide si elle doit jouer — c'est le moteur qui tranche.
 * Elles sont donc lisibles d'un bloc, et vérifiables sans navigateur.
 *
 * Toutes respectent la même contrainte, héritée de l'idée 1, règle 5 :
 * **rien ne bouge sous le pouce**. Ce qui s'allume s'allume par-dessus, sur une
 * couche à part ; ce qui se déplace est ce que personne n'est en train de viser.
 *
 * @module motion/choreography
 */

/**
 * @typedef {{images: Keyframe[], options: KeyframeAnimationOptions & {duration:number}}} Plan
 * @typedef {import('./presets.js').Allure} Allure
 */
export {};

// ── L'anneau : ce que vise le composeur ───────────────────────────────────

/**
 * Le halo qui dit « c'est ce passage-là ».
 *
 * Joué sur une **couche superposée**, jamais sur la bulle : la bulle garde sa
 * taille, sa position et sa boîte de frappe pendant toute l'animation. On peut
 * toucher le passage au milieu du halo sans que la cible se dérobe.
 *
 * @param {Allure} a
 * @param {{persistant?:boolean}} [p]
 * @returns {Plan}
 */
export function anneau(a, p = {}) {
  const amp = 0.04 * a.anneau;
  return {
    images: [
      { opacity: 0, transform: `scale(${1 + amp * 1.6})` },
      { opacity: 1, transform: 'scale(1)' },
    ],
    options: {
      duration: a.durees.base,
      easing: a.courbes.ressort,
      fill: p.persistant === false ? 'none' : 'forwards',
    },
  };
}

/**
 * Le passage s'allume **une seule fois**, puis s'éteint.
 *
 * C'est ce que demandent « Y aller » (idée 2, acte IV) et l'ouverture du fil
 * sur un passage depuis une notification (idée 1, règle 8) : montrer où
 * regarder, sans laisser une marque permanente qui ferait croire à un état.
 *
 * @param {Allure} a
 * @returns {Plan}
 */
export function anneauUneFois(a) {
  const amp = 0.05 * a.anneau;
  return {
    images: [
      { opacity: 0, transform: `scale(${1 + amp * 2})`, offset: 0 },
      { opacity: 1, transform: 'scale(1)', offset: 0.28 },
      { opacity: 1, transform: 'scale(1)', offset: 0.62 },
      { opacity: 0, transform: `scale(${1 + amp})`, offset: 1 },
    ],
    options: { duration: a.durees.ample + a.durees.base, easing: a.courbes.entree, fill: 'none' },
  };
}

// ── La bascule d'adresse ──────────────────────────────────────────────────

/**
 * L'annonce change de passage — au fil de la lecture, ou parce qu'un doigt
 * s'est posé ailleurs.
 *
 * L'idée 3 le décrit exactement : « Le changement est **muet mais lisible** —
 * on le voit sans le chercher, on ne l'entend jamais. » D'où un glissement de
 * quelques pixels seulement, dans le sens de la marche : vers le haut quand on
 * avance dans le média, vers le bas quand on remonte. Le sens est l'information ;
 * la distance n'est que ce qu'il faut pour la rendre perceptible.
 *
 * @param {Allure} a
 * @param {{sens?:number}} [p]
 * @returns {Plan}
 */
export function adresseSort(a, p = {}) {
  const d = a.distances.nudge * (p.sens >= 0 ? -1 : 1);
  return {
    images: [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: `translateY(${d}px)` },
    ],
    options: { duration: a.durees.vif, easing: a.courbes.sortie, fill: 'forwards' },
  };
}

/** @param {Allure} a @param {{sens?:number}} [p] @returns {Plan} */
export function adresseEntre(a, p = {}) {
  const d = a.distances.nudge * (p.sens >= 0 ? 1 : -1);
  return {
    images: [
      { opacity: 0, transform: `translateY(${d}px)` },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    options: { duration: a.durees.base, easing: a.courbes.ressort, fill: 'none' },
  };
}

/**
 * « Au fil, plutôt » : l'annonce se replie.
 *
 * Elle s'efface vers le bas, d'où elle est venue — le composeur redevient celui
 * du fil. Aucune hauteur n'est animée : c'est le conteneur qui se retire de la
 * mise en page une fois l'animation finie, en une seule fois.
 *
 * @param {Allure} a
 * @returns {Plan}
 */
export function retourAuFil(a) {
  return {
    images: [
      { opacity: 1, transform: 'translateY(0) scaleY(1)' },
      { opacity: 0, transform: `translateY(${a.distances.nudge}px) scaleY(.9)` },
    ],
    options: { duration: a.durees.vif, easing: a.courbes.sortie, fill: 'forwards' },
  };
}

// ── Le rond ───────────────────────────────────────────────────────────────

/**
 * Le rond se remplit : une réponse existe.
 *
 * Le disque monte du centre avec le ressort de l'allure, et la coche se trace
 * derrière lui. `strokeDashoffset` repeint, mais sur un chemin de onze pixels :
 * le coût est nul, et c'est la seule façon d'avoir une coche qui *s'écrit* au
 * lieu d'apparaître.
 *
 * @param {Allure} a
 * @returns {Plan}
 */
export function rondSeRemplit(a) {
  return {
    images: [
      { transform: 'scale(.35)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1 },
    ],
    options: { duration: a.durees.base, easing: a.courbes.ressort, fill: 'forwards' },
  };
}

/** La coche qui s'écrit. `longueur` est la longueur du chemin SVG. */
export function cocheSecrit(a, { longueur = 24 } = {}) {
  return {
    images: [{ strokeDashoffset: longueur }, { strokeDashoffset: 0 }],
    options: {
      duration: a.durees.base,
      delay: Math.round(a.durees.vif * 0.4),
      easing: a.courbes.entree,
      fill: 'both',
    },
  };
}

/**
 * L'ambre respire — « je te réponds bientôt ».
 *
 * Un battement lent et de très faible amplitude : assez pour distinguer une
 * promesse d'un rond vide au coin de l'œil, jamais assez pour attirer le
 * regard. Une promesse n'est pas une alerte. Les allures qui ne respirent pas
 * renvoient un plan vide, que le moteur ignore.
 *
 * @param {Allure} a
 * @returns {Plan}
 */
export function promesseRespire(a) {
  if (!a.respire) return { images: [], options: { duration: 0 } };
  return {
    images: [
      { opacity: 0.62, transform: 'scale(.94)' },
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0.62, transform: 'scale(.94)' },
    ],
    options: { duration: 2600, easing: 'ease-in-out', iterations: Infinity },
  };
}

// ── La réponse qui s'accroche ─────────────────────────────────────────────

/**
 * Le geste signature : une réponse arrive et **s'accroche sous son passage**.
 *
 * C'est la thèse de l'app rendue visible en trois cents millisecondes. La bulle
 * ne tombe pas du ciel comme dans une messagerie ordinaire : elle monte
 * *depuis* le passage auquel elle répond, légèrement resserrée, et se pose.
 * L'origine de la transformation est fixée côté interface sur le bord qui
 * touche le passage, pour que le mouvement parte du bon endroit.
 *
 * @param {Allure} a
 * @returns {Plan}
 */
export function reponseSaccroche(a) {
  const d = a.distances.glisse;
  return {
    images: [
      { opacity: 0, transform: `translateY(${-d}px) scale(.94)` },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ],
    options: { duration: a.durees.ample, easing: a.courbes.ressort, fill: 'none' },
  };
}

/**
 * Le trait qui relie le passage à sa réponse, tracé de haut en bas.
 * Un `scaleY` depuis le bord haut : aucune hauteur n'est animée.
 * @param {Allure} a
 * @returns {Plan}
 */
export function connecteurSetend(a) {
  return {
    images: [
      { transform: 'scaleY(0)', opacity: 0.2 },
      { transform: 'scaleY(1)', opacity: 1 },
    ],
    options: { duration: a.durees.base, easing: a.courbes.entree, fill: 'none' },
  };
}

// ── La fenêtre des cinq secondes ──────────────────────────────────────────

/**
 * Le filet qui s'épuise sous une réponse fraîche.
 *
 * Idée 3, règle 10 : « Pendant cinq secondes, une réponse peut être refaite ou
 * redirigée. » La durée vient des **réglages**, pas de l'allure : c'est un délai
 * qui engage l'utilisateur, pas une préférence esthétique. Réduire les
 * animations ne doit pas raccourcir le temps qu'on a pour se raviser — et
 * l'interface garde donc son compte à rebours même quand ce plan ne joue pas.
 *
 * Linéaire, toujours : une barre de temps qui accélère est un mensonge.
 *
 * @param {Allure} a
 * @param {{dureeMs?:number}} [p]
 * @returns {Plan}
 */
export function fenetreSepuise(a, p = {}) {
  return {
    images: [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
    options: { duration: Math.max(0, p.dureeMs ?? 5000), easing: 'linear', fill: 'forwards' },
  };
}

// ── Le passage en cours de lecture ────────────────────────────────────────

/**
 * Le passage qu'on est en train d'entendre.
 *
 * Opacité seule : c'est le seul effet qui ne déplace rien, ne redessine pas la
 * bordure, et reste lisible sur les deux peaux (jour et nuit) sans avoir à
 * connaître la couleur de fond.
 *
 * @param {Allure} a
 * @returns {Plan}
 */
export function passageSallume(a) {
  return {
    images: [{ opacity: 0.55 }, { opacity: 1 }],
    options: { duration: a.durees.vif, easing: a.courbes.entree, fill: 'forwards' },
  };
}

/**
 * Les deux mots que le rond ouvre : « d'accord » et « je te réponds bientôt ».
 * Ils arrivent décalés de quelques dizaines de millisecondes, pour qu'on les
 * lise comme deux choix et non comme un bloc.
 *
 * @param {Allure} a
 * @param {{index?:number}} [p]
 * @returns {Plan}
 */
export function motSePose(a, p = {}) {
  const i = p.index ?? 0;
  return {
    images: [
      { opacity: 0, transform: `translateY(${a.distances.nudge * 0.6}px) scale(.96)` },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ],
    options: {
      duration: a.durees.base,
      delay: i * Math.round(a.durees.vif * 0.45),
      easing: a.courbes.ressort,
      fill: 'backwards',
    },
  };
}
