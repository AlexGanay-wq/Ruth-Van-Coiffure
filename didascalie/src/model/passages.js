/**
 * Les passages — la découpe d'un message, et la façon de la viser.
 *
 * Un message peut porter 0, 1 ou N passages. Les trois cas sont différents et
 * c'est délibéré :
 *   • 0 passage  → un message d'avant la découpe. Rien ne change rétroactivement
 *                  (idée 2, acte VI, plan 4).
 *   • 1 passage  → pas de rond (idée 2, règle 7), et viser le passage revient à
 *                  viser le message entier (idée 3, règle 9).
 *   • N passages → le régime complet.
 *
 * @module model/passages
 */

/**
 * @typedef {object} Passage
 * @property {number} debut   Seconde de début dans le média (0 pour du texte).
 * @property {number} fin     Seconde de fin, exclusive. Pour du texte, fin === debut.
 * @property {string} [texte] Le texte du passage, s'il y en a un.
 * @property {number} [silence] La pause, en secondes, qui a fait naître ce
 *   passage — mesurée chez celui qui envoie, et posée sur le passage qui
 *   **commence** là. Absente sur du texte, et sur les médias d'avant la mesure.
 */

/**
 * @typedef {object} Message
 * @property {string} id
 * @property {'texte'|'vocal'|'video'} voix
 * @property {string} auteurId
 * @property {readonly Passage[]} passages
 * @property {number} [duree] Durée du média en secondes.
 */

/** Un message découpé porte-t-il des ronds ? (idée 2, règle 7) */
export function porteDesRonds(message) {
  return nombreDePassages(message) > 1;
}

/** @param {Message|null|undefined} message */
export function nombreDePassages(message) {
  return message && Array.isArray(message.passages) ? message.passages.length : 0;
}

/**
 * Le rang brut sous la tête de lecture, sans aucune indulgence.
 * Renvoie -1 si `t` ne tombe dans aucun passage (silence de tête, ou média
 * dont la découpe ne couvre pas toute la durée).
 *
 * Recherche dichotomique : appelée à chaque image d'animation pendant la
 * lecture, sur des vocaux qui peuvent porter des dizaines de passages.
 *
 * @param {readonly Passage[]} passages
 * @param {number} t secondes
 * @returns {number} index, ou -1
 */
export function rangBrut(passages, t) {
  if (!Array.isArray(passages) || passages.length === 0) return -1;
  if (!Number.isFinite(t)) return -1;
  let bas = 0;
  let haut = passages.length - 1;
  while (bas <= haut) {
    const milieu = (bas + haut) >> 1;
    const p = passages[milieu];
    if (t < p.debut) haut = milieu - 1;
    else if (t >= p.fin) bas = milieu + 1;
    else return milieu;
  }
  return -1;
}

/**
 * Le rang *visé*, avec la seconde et demie d'indulgence.
 *
 * L'idée 3, règle 5 : « Un toucher dans la seconde et demie qui suit une
 * frontière vise le passage précédent. » On répond à ce qu'on vient d'entendre,
 * pas à ce qui commence — parce qu'une main est plus lente qu'une oreille.
 *
 * Sans cette règle, la planche estime qu'une réponse sur cinq atterrirait à
 * côté ; et une fonction qui se trompe une fois sur cinq, on ne s'en sert plus.
 *
 * @param {readonly Passage[]} passages
 * @param {number} t secondes
 * @param {number} graceMs fenêtre d'indulgence, en millisecondes
 * @returns {number} index, ou -1
 */
export function rangVise(passages, t, graceMs) {
  const brut = rangBrut(passages, t);
  if (brut <= 0) return brut;
  const grace = Number.isFinite(graceMs) && graceMs > 0 ? graceMs / 1000 : 0;
  const depuisLaFrontiere = t - passages[brut].debut;
  return depuisLaFrontiere < grace ? brut - 1 : brut;
}

/**
 * Le passage qui suit — là où la lecture reprend après qu'une réponse est
 * posée (idée 3, règle 4). Renvoie -1 quand il n'y a plus rien après :
 * l'appelant sait alors que le message est fini.
 * @param {readonly Passage[]} passages
 * @param {number} rang
 * @returns {number}
 */
export function rangSuivant(passages, rang) {
  const n = Array.isArray(passages) ? passages.length : 0;
  return rang >= 0 && rang + 1 < n ? rang + 1 : -1;
}

/**
 * Le rang en toutes lettres, en français, tel que les planches l'écrivent :
 * « 1ᵉʳ passage », « 2ᵉ passage ». Jamais « passage 1 » — l'app parle comme on
 * parle.
 * @param {number} rang index base 0
 * @returns {string}
 */
export function nommerRang(rang) {
  const n = rang + 1;
  return n === 1 ? '1ᵉʳ passage' : `${n}ᵉ passage`;
}

/**
 * La cause d'une coupe, en toutes lettres : « 0,9 s de silence ».
 *
 * Ce que l'écart dit pendant qu'il s'ouvre. La durée est celle qu'on a
 * **entendue**, pas celle qu'on voit entre deux bornes : la coupe tombe au
 * milieu du silence, donc les passages se suivent sans trou, et l'écart visible
 * n'est pas l'écart entendu. Rien à dire quand rien n'a été mesuré — un texte,
 * un média d'avant la mesure — ou quand la mesure est absurde : on ne fabrique
 * pas une cause.
 *
 * @param {number|undefined} secondes
 * @param {{court?:boolean}} [opts] `court` : « 0,9 s » seul, là où la place
 *   manque — entre deux images d'une vidéo, l'écart fait six pixels.
 * @returns {string|null}
 */
export function direLeSilence(secondes, opts = {}) {
  if (typeof secondes !== 'number' || !Number.isFinite(secondes) || secondes <= 0) return null;
  const dixiemes = Math.round(secondes * 10);
  if (dixiemes === 0) return null;
  const entier = Math.floor(dixiemes / 10);
  const reste = dixiemes % 10;
  const nombre = reste === 0 ? String(entier) : `${entier},${reste}`;
  return opts.court ? `${nombre} s` : `${nombre} s de silence`;
}

/**
 * Bornes d'un passage, pour `playSlice`. Renvoie null si le rang n'existe pas —
 * l'appelant doit alors retomber sur le message entier plutôt que de jouer
 * n'importe quoi.
 * @param {readonly Passage[]} passages
 * @param {number} rang
 * @returns {{debut:number, fin:number}|null}
 */
export function bornes(passages, rang) {
  if (!Array.isArray(passages) || rang < 0 || rang >= passages.length) return null;
  const p = passages[rang];
  return { debut: p.debut, fin: p.fin };
}
