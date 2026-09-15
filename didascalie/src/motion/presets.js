/**
 * Les allures — ce que les réglages appellent « animation ».
 *
 * Une allure n'est pas une liste d'animations : c'est un jeu de **durées, de
 * courbes et de distances**. Les chorégraphies (l'anneau, la bascule, le
 * remplissage) sont écrites une seule fois, en fonction de ces jetons. Changer
 * d'allure ne change donc jamais *ce qui* bouge — seulement *comment*. C'est ce
 * qui permet d'en offrir cinq sans multiplier par cinq le code à vérifier, et
 * d'être certain qu'aucune allure ne peut violer la règle 5 de l'idée 1
 * (« jamais un déplacement : rien ne bouge sous le pouce »).
 *
 * @module motion/presets
 */

/**
 * Échantillonne un ressort amorti et l'écrit en courbe CSS `linear()`.
 *
 * Un `cubic-bezier` ne peut pas dépasser 1 puis revenir : il ne sait donc pas
 * faire un vrai rebond. `linear()` le sait, et reste une courbe CSS — donc
 * calculée par le compositeur, hors du fil principal, et insensible à un
 * JavaScript occupé. C'est la façon la moins chère d'avoir un ressort honnête
 * sur un téléphone d'entrée de gamme.
 *
 * @param {object} opts
 * @param {number} [opts.raideur]
 * @param {number} [opts.amortissement]
 * @param {number} [opts.masse]
 * @param {number} [opts.echantillons]
 * @returns {{easing:string, dureeMs:number}}
 */
export function ressort({ raideur = 180, amortissement = 20, masse = 1, echantillons = 34 } = {}) {
  const w0 = Math.sqrt(raideur / masse);
  const zeta = amortissement / (2 * Math.sqrt(raideur * masse));

  // Durée jusqu'à extinction visuelle (~0,4 % d'écart), bornée pour rester utile.
  const dureeS = zeta < 1 ? -Math.log(0.004) / (zeta * w0) : 4 / w0;
  const dureeMs = Math.min(1400, Math.max(120, Math.round(dureeS * 1000)));

  const points = [];
  for (let i = 0; i <= echantillons; i++) {
    const t = (i / echantillons) * dureeS;
    let v;
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      v = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    } else {
      v = 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    }
    points.push(Math.round(v * 10000) / 10000);
  }
  points[points.length - 1] = 1;
  return { easing: `linear(${points.join(',')})`, dureeMs };
}

/** `linear()` est récent ; sur un navigateur plus ancien on retombe sur une bézier proche. */
export function courbeDisponible() {
  try {
    return typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0,1)');
  } catch {
    return false;
  }
}

const BEZIER_RESSORT = 'cubic-bezier(.22,1.2,.36,1)';
const BEZIER_SORTIE = 'cubic-bezier(.4,0,1,1)';
const BEZIER_ENTREE = 'cubic-bezier(0,0,.2,1)';

function courbe(spec) {
  return courbeDisponible() ? spec.easing : spec.repli;
}

/**
 * @typedef {object} Allure
 * @property {string} id
 * @property {string} nom
 * @property {string} note
 * @property {{vif:number, base:number, ample:number}} durees en ms
 * @property {{entree:string, sortie:string, ressort:string}} courbes
 * @property {{nudge:number, glisse:number}} distances en px
 * @property {number} anneau amplitude du halo (facteur d'échelle)
 * @property {boolean} respire le battement lent de l'ambre
 */

function construire(id, nom, note, opts) {
  const r = ressort(opts.ressort);
  return Object.freeze({
    id,
    nom,
    note,
    durees: Object.freeze(opts.durees),
    courbes: Object.freeze({
      entree: courbe({ easing: BEZIER_ENTREE, repli: BEZIER_ENTREE }),
      sortie: courbe({ easing: BEZIER_SORTIE, repli: BEZIER_SORTIE }),
      ressort: courbe({ easing: r.easing, repli: BEZIER_RESSORT }),
    }),
    distances: Object.freeze(opts.distances),
    anneau: opts.anneau,
    respire: opts.respire,
  });
}

/** Les cinq allures proposées dans les réglages. */
export const ALLURES = Object.freeze({
  /** Le défaut de la maison : sûr de lui, jamais bavard. */
  didascalie: construire('didascalie', 'Didascalie', 'L’allure de la maison : franche, courte, un ressort discret.', {
    durees: { vif: 140, base: 240, ample: 340 },
    distances: { nudge: 6, glisse: 10 },
    ressort: { raideur: 190, amortissement: 22 },
    anneau: 1,
    respire: true,
  }),

  /** Pour qui trouve que ça bouge trop — ou pour un téléphone fatigué. */
  sobre: construire('sobre', 'Sobre', 'Presque rien : des fondus courts, aucun déplacement.', {
    durees: { vif: 90, base: 130, ample: 170 },
    distances: { nudge: 0, glisse: 0 },
    ressort: { raideur: 320, amortissement: 34 },
    anneau: 0.45,
    respire: false,
  }),

  /** Plus démonstratif : les transitions se laissent voir. */
  ample: construire('ample', 'Ample', 'Des gestes plus larges, un ressort qui se laisse voir.', {
    durees: { vif: 200, base: 360, ample: 520 },
    distances: { nudge: 10, glisse: 18 },
    ressort: { raideur: 130, amortissement: 15 },
    anneau: 1.5,
    respire: true,
  }),

  /** Matière plutôt que vitesse : ça pèse un peu, et ça se pose. */
  papier: construire('papier', 'Papier', 'Un léger dépassement, puis ça se pose — comme une feuille.', {
    durees: { vif: 160, base: 300, ample: 440 },
    distances: { nudge: 8, glisse: 14 },
    ressort: { raideur: 150, amortissement: 13 },
    anneau: 1.2,
    respire: true,
  }),

  /** Rien ne bouge. Identique à ce que produit « animations réduites » du système. */
  aucune: Object.freeze({
    id: 'aucune',
    nom: 'Aucune',
    note: 'Tout apparaît d’un coup. Rien ne bouge, rien ne fond.',
    durees: Object.freeze({ vif: 0, base: 0, ample: 0 }),
    courbes: Object.freeze({ entree: 'linear', sortie: 'linear', ressort: 'linear' }),
    distances: Object.freeze({ nudge: 0, glisse: 0 }),
    anneau: 0,
    respire: false,
  }),
});

/** @param {string} id @returns {Allure} */
export function allure(id) {
  return ALLURES[id] ?? ALLURES.didascalie;
}

/**
 * Applique l'intensité des réglages (0 à 1) à une allure.
 *
 * À 0 on obtient exactement « Aucune » — le curseur et la liste déroulante ne
 * peuvent donc pas se contredire, quel que soit l'ordre dans lequel on y touche.
 *
 * @param {Allure} a
 * @param {number} intensite
 * @returns {Allure}
 */
export function doser(a, intensite) {
  const k = Math.max(0, Math.min(1, Number.isFinite(intensite) ? intensite : 1));
  if (k === 1) return a;
  if (k === 0) return ALLURES.aucune;
  return Object.freeze({
    ...a,
    durees: Object.freeze({
      vif: Math.round(a.durees.vif * k),
      base: Math.round(a.durees.base * k),
      ample: Math.round(a.durees.ample * k),
    }),
    distances: Object.freeze({
      nudge: Math.round(a.distances.nudge * k),
      glisse: Math.round(a.distances.glisse * k),
    }),
    anneau: a.anneau * k,
  });
}
