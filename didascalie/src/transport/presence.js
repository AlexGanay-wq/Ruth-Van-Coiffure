/**
 * La ligne de frappe, et le seul champ neuf de tout le chantier.
 *
 * L'idée 1 tient en une phrase d'ingénierie : `typing.{uid}` porte désormais,
 * en plus, **le rang du passage visé et la voix**. Tout le reste — la
 * notification, l'aperçu de la liste, l'ancre du fil — ne fait que lire une
 * donnée qui voyage déjà.
 *
 * Quatre propriétés, qui sont toutes des règles de la planche devenues du code :
 *
 * 1. **Éphémère par construction.** Aucun journal, aucun tampon d'historique.
 *    Se retirer *efface* ; ça ne pose pas une pierre tombale. La règle 4 dit
 *    « la ligne s'éteint et ne laisse aucune trace », et il n'y a ici aucun
 *    endroit où une trace pourrait subsister.
 *
 * 2. **Publiée seulement quand on compose vraiment.** Pas à l'ouverture d'une
 *    rangée : « ouvrir pour lire ne s'annonce pas » (règle 2). L'appelant doit
 *    donc appeler `composer()`, jamais `viser()`.
 *
 * 3. **Groupée dans le temps.** Publier à chaque touche enverrait le **rythme
 *    de frappe** de quelqu'un sur le réseau — une donnée biométrique reconnue,
 *    et suffisante pour distinguer deux personnes sur le même compte. On
 *    regroupe donc à un envoi par seconde, avec un peu de hasard, ce qui
 *    économise aussi la batterie et la donnée mobile.
 *
 * 4. **Périmée toute seule.** Une app tuée au milieu d'une phrase laisserait
 *    sinon « Copine écrit… » pour l'éternité. Chaque annonce porte sa date de
 *    péremption, et le lecteur ignore ce qui est périmé sans rien avoir à
 *    nettoyer.
 *
 * @module transport/presence
 */

import { rangDeConfiance } from '../security/gate.js';

/** Au-delà, une annonce de frappe est considérée comme abandonnée. */
export const PEREMPTION_MS = 6000;

/** Un envoi par seconde au plus, plus un peu de hasard pour ne pas se synchroniser. */
const GROUPAGE_MS = 1000;
const HASARD_MS = 250;

/**
 * @typedef {object} Frappe
 * @property {string} personneId
 * @property {'ecrit'|'enregistre'|'filme'} voix
 * @property {string|null} messageId le message visé, ou null pour le fil
 * @property {number} rang -1 = le message entier
 * @property {number} perimeA horodatage d'expiration (horloge locale du lecteur)
 */

/**
 * Le côté qui publie. Un par fil ouvert.
 */
export class Annonceur {
  /**
   * @param {object} o
   * @param {(charge:object|null)=>void} o.publier
   *   Pose la charge sur `typing.{uid}` — ou l'efface si `null`. C'est le seul
   *   point de contact avec le réseau : Firebase, WebSocket, ce que vous voulez.
   * @param {() => number} [o.maintenant]
   */
  constructor({ publier, maintenant = () => Date.now() }) {
    this._publier = publier;
    this._maintenant = maintenant;
    /** @type {object|null} */
    this._enAttente = null;
    /** @type {any} */
    this._minuteur = null;
    // -Infinity et non 0 : la toute première frappe part immédiatement, sans
    // dépendre de la valeur que renvoie l'horloge injectée. Avec 0, le code
    // ne marchait que parce que `Date.now()` est un grand nombre — une
    // coïncidence, et donc un piège pour qui remplace l'horloge.
    /** @type {number} */
    this._dernierEnvoi = -Infinity;
    /** @type {string} */
    this._dernierResume = '';
  }

  /**
   * On compose. À appeler au premier caractère, ou au micro armé — jamais à
   * l'ouverture d'une rangée.
   *
   * @param {object} o
   * @param {'ecrit'|'enregistre'|'filme'} o.voix
   * @param {import('../address/composer.js').Adresse} o.adresse
   */
  composer({ voix, adresse }) {
    const charge = {
      voix,
      messageId: adresse.kind === 'fil' ? null : adresse.messageId,
      rang: adresse.kind === 'passage' ? adresse.rang : -1,
    };
    // Rien de neuf à dire : on n'use pas le réseau pour répéter.
    const resume = `${charge.voix}|${charge.messageId}|${charge.rang}`;
    if (resume === this._dernierResume && this._minuteur) return;
    this._enAttente = charge;

    const depuis = this._maintenant() - this._dernierEnvoi;
    if (depuis >= GROUPAGE_MS) {
      this._vider();
      return;
    }
    if (!this._minuteur) {
      const attente = GROUPAGE_MS - depuis + Math.random() * HASARD_MS;
      this._minuteur = setTimeout(() => this._vider(), attente);
    }
  }

  /**
   * On renonce, ou on a envoyé. La ligne s'éteint **et ne laisse rien**.
   * Publie `null` : c'est une suppression, pas un drapeau « a arrêté d'écrire ».
   */
  retirer() {
    if (this._minuteur) {
      clearTimeout(this._minuteur);
      this._minuteur = null;
    }
    this._enAttente = null;
    this._dernierResume = '';
    this._dernierEnvoi = -Infinity;
    this._publier(null);
  }

  _vider() {
    this._minuteur = null;
    const charge = this._enAttente;
    if (!charge) return;
    this._enAttente = null;
    this._dernierResume = `${charge.voix}|${charge.messageId}|${charge.rang}`;
    this._dernierEnvoi = this._maintenant();
    this._publier({ ...charge, perimeA: this._dernierEnvoi + PEREMPTION_MS });
  }
}

/**
 * Le côté qui lit. Traduit les annonces brutes en la **phrase** que montre la
 * ligne de frappe.
 *
 * Idée 1, règle 9 — et c'est la règle du ton, reprise mot pour mot :
 *   • une personne  → on la nomme, et on nomme son passage ;
 *   • deux          → on nomme les deux, sans les rangs ; les couleurs disent
 *                     lesquels, sur les passages eux-mêmes ;
 *   • trois et plus → on **compte**. « Annoncer trois adresses reviendrait à
 *                     n'en annoncer aucune. »
 *
 * @param {readonly Frappe[]} frappes
 * @param {object} ctx
 * @param {number} ctx.maintenant
 * @param {(id:string)=>string} ctx.nomDe
 * @param {(id:string)=>(import('../model/passages.js').Message|null)} ctx.message
 * @param {boolean} [ctx.enGroupe]
 * @returns {{texte:string, cibles:{messageId:string, rang:number, personneId:string}[]}|null}
 */
export function lireLesFrappes(frappes, ctx) {
  const vivantes = (frappes || []).filter((f) => f && f.perimeA > ctx.maintenant);
  if (vivantes.length === 0) return null;

  const cibles = [];
  for (const f of vivantes) {
    if (!f.messageId) continue;
    const { rang } = rangDeConfiance(f.rang, ctx.message(f.messageId));
    cibles.push({ messageId: f.messageId, rang, personneId: f.personneId });
  }

  if (vivantes.length >= 3) {
    return { texte: `${vivantes.length} personnes répondent`, cibles };
  }

  if (vivantes.length === 2) {
    const [a, b] = vivantes;
    return { texte: `${ctx.nomDe(a.personneId)} et ${ctx.nomDe(b.personneId)} répondent`, cibles };
  }

  const f = vivantes[0];
  const nom = ctx.nomDe(f.personneId);
  const { rang, retombe } = rangDeConfiance(f.rang, f.messageId ? ctx.message(f.messageId) : null);

  // Sans découpe, rien ne change : la ligne d'aujourd'hui, mot pour mot.
  if (!f.messageId || rang < 0) {
    if (retombe && f.messageId) return { texte: `${nom} répond à ton message`, cibles };
    return { texte: verbe(nom, f.voix, null), cibles };
  }
  return { texte: verbe(nom, f.voix, rang), cibles };
}

/** Idée 1, règle 3 : la ligne dit aussi **dans quelle voix**. */
function verbe(nom, voix, rang) {
  const ou = rang === null ? '' : ` au ${rang + 1 === 1 ? '1ᵉʳ' : `${rang + 1}ᵉ`} passage`;
  if (voix === 'enregistre') return `${nom} enregistre un vocal${ou ? ` pour le${ou.slice(3)}` : ''}`;
  if (voix === 'filme') return `${nom} filme une réponse${ou ? ` pour le${ou.slice(3)}` : ''}`;
  return rang === null ? `${nom} écrit…` : `${nom} répond${ou}`;
}
