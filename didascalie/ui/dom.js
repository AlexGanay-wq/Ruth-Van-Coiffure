/**
 * Construire du DOM, sans jamais passer par du HTML.
 *
 * Ce module n'expose **aucun** chemin vers `innerHTML`, `outerHTML`,
 * `insertAdjacentHTML` ou `document.write`. Ce n'est pas de la prudence
 * décorative : dans une messagerie, chaque bulle affiche du texte écrit par
 * quelqu'un d'autre, et un passage cité est réaffiché dans quatre endroits
 * différents (la bulle, l'annonce, la notification, l'aperçu). Il suffit qu'un
 * seul de ces quatre chemins concatène une chaîne pour que toute l'app soit
 * percée.
 *
 * En n'ayant pas la fonction, on n'a pas le risque. Le texte passe par
 * `textContent`, qui ne peut rien interpréter.
 *
 * @module ui/dom
 */

import { nettoyer } from '../src/security/text.js';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * Attributs acceptés. Tout le reste est ignoré silencieusement — en
 * particulier `on*`, `href` et `style`, qui sont les trois façons habituelles
 * de faire exécuter quelque chose à une page.
 *
 * Les gestionnaires d'événements passent par `on:` (voir plus bas), c'est-à-dire
 * par `addEventListener` : une fonction, jamais une chaîne à évaluer.
 */
const ATTRS_SURS = /^(class|id|role|tabindex|type|value|placeholder|disabled|hidden|title|width|height|viewBox|fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|stroke-dasharray|stroke-dashoffset|d|cx|cy|r|x|y|rx|ry|x1|x2|y1|y2|points|transform|aria-[a-z-]+|data-[a-z-]+)$/;

/**
 * Crée un élément.
 *
 * @param {string} balise `div`, `button`, ou `svg:path` pour le SVG.
 * @param {object} [props] attributs ; `on:clic` pour un écouteur ; `style:` pour
 *   une propriété personnalisée CSS (jamais une chaîne de style brute).
 * @param {(Node|string|null|undefined|false)[]} [enfants]
 * @returns {Element}
 */
export function h(balise, props = {}, enfants = []) {
  const estSvg = balise.startsWith('svg:') || balise === 'svg';
  const nom = balise.startsWith('svg:') ? balise.slice(4) : balise;
  const el = estSvg ? document.createElementNS(SVG, nom) : document.createElement(nom);

  for (const [cle, val] of Object.entries(props || {})) {
    if (val === null || val === undefined || val === false) continue;

    if (cle.startsWith('on:')) {
      const type = cle.slice(3);
      if (typeof val === 'function') el.addEventListener(type, val, { passive: type !== 'submit' });
      continue;
    }
    // Uniquement des propriétés personnalisées : `--jauge`, `--halo`. Une
    // propriété CSS arbitraire permettrait de repositionner un élément
    // par-dessus un autre, ce qui est la moitié d'un détournement d'interface.
    if (cle.startsWith('style:--')) {
      el.style.setProperty(cle.slice(6), String(val));
      continue;
    }
    if (cle === 'texte') {
      el.textContent = nettoyer(String(val));
      continue;
    }
    if (!ATTRS_SURS.test(cle)) continue;
    if (val === true) el.setAttribute(cle, '');
    else el.setAttribute(cle, String(val));
  }

  for (const enfant of enfants.flat()) {
    if (enfant === null || enfant === undefined || enfant === false) continue;
    el.appendChild(typeof enfant === 'string' ? document.createTextNode(nettoyer(enfant)) : enfant);
  }
  return el;
}

/** Remplace le contenu d'un élément. */
export function remplir(el, ...enfants) {
  while (el.firstChild) el.removeChild(el.firstChild);
  for (const e of enfants.flat()) {
    if (e === null || e === undefined || e === false) continue;
    el.appendChild(typeof e === 'string' ? document.createTextNode(nettoyer(e)) : e);
  }
  return el;
}

/**
 * Une icône du jeu de l'app. Les chemins sont écrits ici, en dur : une icône
 * n'est jamais construite à partir d'une donnée venue du réseau.
 * @param {string} nom
 */
export function icone(nom, props = {}) {
  const chemins = CHEMINS[nom];
  if (!chemins) throw new Error(`didascalie/ui: icône inconnue « ${nom} »`);
  return h(
    'svg',
    {
      viewBox: '0 0 24 24',
      fill: chemins.plein ? 'currentColor' : 'none',
      stroke: chemins.plein ? 'none' : 'currentColor',
      'stroke-width': props['stroke-width'] ?? 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      class: props.class,
    },
    chemins.d.map((d) => h('svg:path', { d })),
  );
}

/** @type {Readonly<Record<string, {d: string[], plein?: boolean}>>} */
const CHEMINS = Object.freeze({
  micro: { d: ['M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z', 'M5 10a7 7 0 0 0 14 0M12 19v3'] },
  camera: { d: ['M2.5 6.5h13v11h-13z', 'M15.5 11l6-3.5v9l-6-3.5z'] },
  trombone: { d: ['M21.4 11l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5'] },
  lire: { plein: true, d: ['M7 4.5v15l13-7.5z'] },
  pause: { plein: true, d: ['M7 4h3.5v16H7zM13.5 4H17v16h-3.5z'] },
  arreter: { plein: true, d: ['M6 6h12v12H6z'] },
  coche: { d: ['M4 12.5l5.5 5.5L20 6.5'] },
  sablier: { d: ['M7 3h10M7 21h10M8 3c0 4 8 5 8 9s-8 5-8 9M16 3c0 4-8 5-8 9s8 5 8 9'] },
  retour: { d: ['M9 14l-5-5 5-5', 'M4 9h11a5 5 0 0 1 0 10h-3'] },
  monter: { d: ['M12 19V5M6 11l6-6 6 6'] },
  ecrire: { d: ['M3 19l5-14 5 14M4.7 14.5h6.6M15 19l3-9 3 9M15.9 16.2h4.2'] },
  reglages: { d: ['M4 7h16M4 12h16M4 17h16', 'M9 7v0M15 12v0M7 17v0'] },
  croix: { d: ['M6 6l12 12M18 6L6 18'] },
});

/** Annonce au lecteur d'écran. Poli : n'interrompt jamais une lecture en cours. */
export function creerAnnonceur() {
  const zone = h('div', {
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
    class: 'dsc-sr',
  });
  document.body.appendChild(zone);
  let dernier = '';
  return (texte) => {
    const t = nettoyer(String(texte || ''));
    if (!t || t === dernier) return;
    dernier = t;
    zone.textContent = t;
  };
}
