/**
 * Le registre des ronds.
 *
 * Il ne stocke **aucune horodatation**. Ce n'est pas un oubli : c'est la
 * règle 10 de l'idée 2 (« Rien ne s'accumule d'un message à l'autre, et jamais
 * sur une personne ») rendue impossible à violer. Un chronomètre, une moyenne
 * de temps de réponse ou un historique des hésitations demanderaient une donnée
 * qui n'existe nulle part ici. Pour ajouter une surveillance à Didascalie, il
 * faudrait d'abord modifier ce fichier — et c'est exactement le point.
 *
 * Deux axes, volontairement séparés :
 *   • `etat`  — partagé, monotone, gouverné par le treillis.
 *   • `range` — local à cet appareil, réversible, jamais publié (idée 2,
 *               acte VI, plan 3 : « il ne prétend pas communiquer, il range
 *               ton écran »).
 *
 * @module model/ring
 */

import { Etat, join, avance, estEtat } from '../kernel/lattice.js';

/**
 * Clé plate, préfixée par les longueurs : deux triplets différents ne peuvent
 * pas produire la même chaîne, même si un identifiant contient le séparateur.
 * Une Map plate plutôt qu'une Map de Maps — une seule allocation par passage,
 * et rien à nettoyer quand un fil se ferme.
 */
function cle(messageId, rang, personneId) {
  return `${messageId.length}:${messageId}|${rang}|${personneId}`;
}

/** Clé du registre local « rangé », qui ne concerne personne d'autre. */
function cleLocale(messageId, rang) {
  return `${messageId.length}:${messageId}|${rang}`;
}

export class RegistreDesRonds {
  constructor() {
    /** @type {Map<string, number>} état partagé, par (message, rang, personne) */
    this._etats = new Map();
    /** @type {Set<string>} passages rangés — local, jamais publié */
    this._ranges = new Set();
    /** @type {Set<string>} messages auxquels une personne a déjà répondu une fois */
    this._entames = new Set();
    /** @type {Set<string>} messages dont la ligne du bas a déjà paru */
    this._lignesVues = new Set();
    /** @type {Set<(c:{messageId:string,rang:number,personneId:string})=>void>} */
    this._ecoutes = new Set();
  }

  /**
   * Verse un fait au registre. Idempotent et commutatif : rejouer la file
   * d'attente du réseau après une reconnexion ne peut rien abîmer.
   *
   * @param {string} messageId
   * @param {number} rang
   * @param {string} personneId qui a répondu — moi, ou un membre du groupe
   * @param {number} etat
   * @returns {boolean} vrai si l'état a réellement avancé (l'interface anime alors)
   */
  observer(messageId, rang, personneId, etat) {
    if (!estEtat(etat)) return false;
    const k = cle(messageId, rang, personneId);
    const avant = this._etats.get(k) ?? Etat.VIDE;
    const apres = join(avant, etat);
    if (!avance(avant, apres)) return false;
    this._etats.set(k, apres);
    if (apres === Etat.REPONDU) {
      this._entames.add(`${messageId.length}:${messageId}|${personneId}`);
    }
    for (const f of this._ecoutes) f({ messageId, rang, personneId });
    return true;
  }

  /**
   * L'état d'un passage pour une personne donnée. Le rond affiché est toujours
   * **le tien** (idée 2, acte VI, plan 2) ; le groupe se lit à côté, en gris.
   * @returns {number}
   */
  etat(messageId, rang, personneId) {
    return this._etats.get(cle(messageId, rang, personneId)) ?? Etat.VIDE;
  }

  /**
   * Le décompte d'un groupe pour un passage : « 3 sur 5 ont répondu · pas toi ».
   * Ne renvoie que des nombres — jamais la liste de qui n'a pas répondu, qui
   * serait un tableau d'attributions par personne (interdit de la planche).
   *
   * @param {string} messageId
   * @param {number} rang
   * @param {readonly string[]} membres
   * @param {string} moi
   * @returns {{repondu:number, promis:number, total:number, moiAussi:boolean}}
   */
  decompte(messageId, rang, membres, moi) {
    let repondu = 0;
    let promis = 0;
    for (const p of membres) {
      const e = this.etat(messageId, rang, p);
      if (e === Etat.REPONDU) repondu++;
      else if (e === Etat.PROMIS) promis++;
    }
    return {
      repondu,
      promis,
      total: membres.length,
      moiAussi: this.etat(messageId, rang, moi) === Etat.REPONDU,
    };
  }

  /**
   * Le bilan que l'auteur voit sur son **propre** message : « 2 passages sur 4
   * ont une réponse ». Un fait, jamais un reproche — et aucune notification ne
   * le porte jamais (idée 2, règle 9).
   *
   * @param {string} messageId
   * @param {number} nbPassages
   * @param {readonly string[]} destinataires
   * @returns {{repondus:number, promis:number, total:number}}
   */
  bilanAuteur(messageId, nbPassages, destinataires) {
    let repondus = 0;
    let promis = 0;
    for (let r = 0; r < nbPassages; r++) {
      /** @type {number} */
      let meilleur = Etat.VIDE;
      for (const p of destinataires) meilleur = join(meilleur, this.etat(messageId, r, p));
      if (meilleur === Etat.REPONDU) repondus++;
      else if (meilleur === Etat.PROMIS) promis++;
    }
    return { repondus, promis, total: nbPassages };
  }

  // ── Rangé : local, réversible, jamais publié ───────────────────────────────

  /** @returns {boolean} le nouvel état */
  basculerRange(messageId, rang) {
    const k = cleLocale(messageId, rang);
    if (this._ranges.has(k)) {
      this._ranges.delete(k);
      return false;
    }
    this._ranges.add(k);
    return true;
  }

  estRange(messageId, rang) {
    return this._ranges.has(cleLocale(messageId, rang));
  }

  // ── La ligne du bas ───────────────────────────────────────────────────────

  /**
   * Faut-il montrer « il reste N passages » ?
   *
   * Trois verrous, tous nécessaires (idée 2, règle 8) :
   *   1. seulement après ta **première** réponse à ce message — un message
   *      auquel tu n'as pas encore répondu n'est pas un problème, c'est un
   *      message ;
   *   2. **une seule fois** — la méthode est un cliquet : le second appel
   *      renvoie null, quoi qu'il arrive ensuite ;
   *   3. jamais de notification : c'est l'appelant qui l'affiche *dans le fil*,
   *      là où tu es déjà.
   *
   * @param {string} messageId
   * @param {number} nbPassages
   * @param {string} moi
   * @returns {{restants:number, premierSansReponse:number}|null}
   */
  reclamerLigneDuBas(messageId, nbPassages, moi) {
    if (nbPassages < 2) return null;
    if (!this._entames.has(`${messageId.length}:${messageId}|${moi}`)) return null;
    if (this._lignesVues.has(messageId)) return null;

    let restants = 0;
    let premier = -1;
    for (let r = 0; r < nbPassages; r++) {
      if (this.estRange(messageId, r)) continue;
      if (this.etat(messageId, r, moi) === Etat.REPONDU) continue;
      restants++;
      if (premier === -1) premier = r;
    }
    if (restants === 0) return null;

    this._lignesVues.add(messageId);
    return { restants, premierSansReponse: premier };
  }

  /** @param {(c:{messageId:string,rang:number,personneId:string})=>void} f */
  ecouter(f) {
    this._ecoutes.add(f);
    return () => this._ecoutes.delete(f);
  }
}
