/**
 * La Porte, et le rang qui vient d'ailleurs.
 *
 * Deux contrôles qui ne se ressemblent pas mais qui protègent la même chose :
 * la certitude qu'une réponse est partie **là où on a voulu**, et **parce qu'on
 * l'a voulu**.
 *
 * @module security/gate
 */

import { nombreDePassages } from '../model/passages.js';

// ── 1. Le rang reçu ────────────────────────────────────────────────────────

/**
 * Un rang de passage arrivé par le réseau n'est pas une donnée : c'est une
 * affirmation d'un pair. Elle peut être vieille (le message a été redécoupé),
 * abîmée (migration), ou hostile.
 *
 * La planche donne elle-même le repli, et c'est ce qui rend le chantier sûr :
 *
 *   « Si la réponse vise le message entier, la ligne redit simplement "Copine
 *     répond à ton message". **Sans découpe, rien ne change.** »
 *
 * Donc : un rang invalide ne lève pas d'exception et ne jette pas le message —
 * il retombe sur le message entier. Perdre une adresse est un désagrément ;
 * perdre un message est une faute.
 *
 * @param {unknown} rang
 * @param {import('../model/passages.js').Message|null} message
 * @returns {{rang:number, retombe:boolean}} rang -1 = le message entier
 */
export function rangDeConfiance(rang, message) {
  const n = nombreDePassages(message);
  if (n < 2) return { rang: -1, retombe: n === 0 ? false : true };
  if (!Number.isInteger(rang)) return { rang: -1, retombe: true };
  const r = /** @type {number} */ (rang);
  if (r < 0 || r >= n) return { rang: -1, retombe: true };
  return { rang: r, retombe: false };
}

// ── 2. La Porte ────────────────────────────────────────────────────────────

/**
 * « Aucun message ne part sans un geste. »
 *
 * C'est une règle de la maison avant d'être une règle de sécurité, et les deux
 * lectures tombent au même endroit. Un envoi déclenché par autre chose qu'un
 * doigt — un script injecté, un `click()` synthétique, une pub qui se
 * superpose au composeur — n'est pas un geste.
 *
 * `Event.isTrusted` est mis à `false` par le navigateur pour tout événement
 * fabriqué en JavaScript ; il n'est pas falsifiable depuis la page. On y ajoute
 * deux conditions que le détournement d'interface (*clickjacking*) ne peut pas
 * satisfaire en même temps :
 *
 *   • l'événement doit être récent — un événement rejoué plus tard est refusé ;
 *   • la fenêtre doit avoir le focus au moment du geste.
 *
 * @param {Event|null|undefined} ev
 * @param {{maintenant?:number, ageMaxMs?:number, focus?:boolean}} [opts]
 * @returns {{ouvre:boolean, motif:string}}
 */
export function laPorte(ev, opts = {}) {
  if (!ev || typeof ev !== 'object') return { ouvre: false, motif: 'aucun-geste' };
  if (ev.isTrusted !== true) return { ouvre: false, motif: 'geste-fabrique' };

  const ageMax = opts.ageMaxMs ?? 5000;
  const maintenant = opts.maintenant ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const quand = typeof ev.timeStamp === 'number' ? ev.timeStamp : maintenant;
  if (maintenant - quand > ageMax) return { ouvre: false, motif: 'geste-rejoue' };

  const focus = opts.focus ?? (typeof document === 'undefined' ? true : document.hasFocus());
  if (!focus) return { ouvre: false, motif: 'fenetre-sans-focus' };

  return { ouvre: true, motif: 'geste' };
}

// ── 3. Les identifiants ────────────────────────────────────────────────────

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Un identifiant local, tiré du générateur cryptographique de la plateforme.
 *
 * `Math.random` est prévisible : sur un identifiant de réponse, ça donne à
 * quiconque observe une poignée d'identifiants de quoi deviner les suivants.
 * Le coût du bon générateur étant nul, il n'y a pas d'arbitrage à faire.
 *
 * Le rejet modulo est évité en écartant les octets hors du plus grand multiple
 * de la taille de l'alphabet — sinon les premières lettres sortiraient un peu
 * plus souvent que les dernières.
 *
 * @param {number} [longueur]
 * @returns {string}
 */
export function identifiant(longueur = 16) {
  const n = ALPHABET.length;
  const limite = 256 - (256 % n);
  const sortie = [];
  const tampon = new Uint8Array(longueur * 2);
  const crypto = globalThis.crypto;
  if (!crypto || typeof crypto.getRandomValues !== 'function') {
    throw new Error('didascalie: aucun générateur cryptographique disponible');
  }
  while (sortie.length < longueur) {
    crypto.getRandomValues(tampon);
    for (const octet of tampon) {
      if (octet < limite) {
        sortie.push(ALPHABET[octet % n]);
        if (sortie.length === longueur) break;
      }
    }
  }
  return sortie.join('');
}
