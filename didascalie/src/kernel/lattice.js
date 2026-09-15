/**
 * Treillis — le socle algébrique des états qui ne reculent jamais.
 *
 * La loi de l'idée 2, règle 6 : « Un rond plein ne se vide jamais. »
 * Plutôt que de garder cette règle dans un `if` quelque part (où elle finira
 * par être contournée par un chemin de code oublié), on la rend *structurelle* :
 * l'état d'un passage vit dans un demi-treillis supérieur, et la seule
 * opération d'écriture est la borne supérieure (`join`). Reculer n'est pas
 * interdit — c'est inexprimable.
 *
 * Effet de bord heureux : `join` est commutatif, associatif et idempotent, donc
 * l'état converge quel que soit l'ordre d'arrivée des faits sur le réseau.
 * Deux appareils qui se resynchronisent après une coupure tombent d'accord
 * sans arbitre, sans horloge, et sans « dernier écrivain gagne » — lequel
 * aurait pu, lui, vider un rond plein.
 *
 * @module kernel/lattice
 */

/**
 * Les trois états d'un passage, et rien d'autre (idée 2, règle 2).
 * L'ordre numérique *est* l'ordre du treillis : vide < promis < répondu.
 * @readonly
 * @enum {number}
 */
export const Etat = Object.freeze({
  /** Personne n'a répondu à ce passage. Ce n'est pas un problème : c'est un message. */
  VIDE: 0,
  /** « Je te réponds bientôt » — une promesse, pas une fermeture. */
  PROMIS: 1,
  /** Une réponse existe. Quelle qu'elle soit. Terminal. */
  REPONDU: 2,
});

/** @type {readonly number[]} */
const ETATS = Object.freeze([Etat.VIDE, Etat.PROMIS, Etat.REPONDU]);

/**
 * Vrai si `v` est un état du treillis. Tout ce qui vient du réseau passe par ici.
 * @param {unknown} v
 * @returns {v is number}
 */
export function estEtat(v) {
  return typeof v === 'number' && ETATS.includes(v);
}

/**
 * La borne supérieure : la seule écriture permise.
 *
 * Un fait inconnu ou corrompu (réseau, pair malveillant, migration ratée) est
 * traité comme VIDE — l'élément neutre — plutôt que rejeté par une exception.
 * Un message ne doit jamais être rendu illisible par un champ abîmé.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number} le plus avancé des deux états
 */
export function join(a, b) {
  const x = estEtat(a) ? a : Etat.VIDE;
  const y = estEtat(b) ? b : Etat.VIDE;
  return x > y ? x : y;
}

/**
 * Vrai si l'état n'acceptera plus aucune transition. Sert à l'interface :
 * un rond terminal ne s'annonce pas comme touchable (idée 2, acte II, plan 4 —
 * « Toucher un rond plein ne fait rien »).
 * @param {number} etat
 * @returns {boolean}
 */
export function estTerminal(etat) {
  return join(etat, Etat.REPONDU) === etat;
}

/**
 * Vrai si passer de `avant` à `apres` fait réellement avancer l'état.
 * Permet à l'interface de n'animer que les vraies transitions : rejouer
 * l'animation de remplissage sur un rond déjà plein serait un clignotement.
 * @param {number} avant
 * @param {number} apres
 * @returns {boolean}
 */
export function avance(avant, apres) {
  return join(avant, apres) !== avant;
}
