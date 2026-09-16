/**
 * L'adresse du composeur — le cœur de l'idée 3.
 *
 * « Pendant la lecture d'un vocal ou d'une vidéo, le composeur du fil devient
 * la rangée du passage en cours. »
 *
 * La planche prévient du seul vrai risque de ce chantier :
 *
 *   « Le risque est de dupliquer la rangée — il faut que ce soit la **même**,
 *     sinon les deux copies dériveront, comme la bulle du 24 août. »
 *
 * D'où ce fichier. Il n'existe qu'**une** adresse pour tout le fil, tenue ici,
 * et l'interface s'y abonne. Il n'y a pas de seconde rangée à synchroniser
 * parce qu'il n'y a pas de seconde rangée. Aucun élément de DOM n'est touché
 * ici : cette machine est pure, et donc vérifiable au banc d'essai.
 *
 * @module address/composer
 */

import { rangVise, rangBrut, nombreDePassages, nommerRang, rangSuivant } from '../model/passages.js';
import { enQuelquesMots } from '../security/text.js';

/**
 * @typedef {{kind:'fil'}} AdresseFil
 * @typedef {{kind:'message', messageId:string}} AdresseMessage
 * @typedef {{kind:'passage', messageId:string, rang:number, raison:'lecture'|'toucher'|'fin'}} AdressePassage
 * @typedef {AdresseFil|AdresseMessage|AdressePassage} Adresse
 */

/** @type {AdresseFil} */
const AU_FIL = Object.freeze({ kind: 'fil' });

/**
 * Les trois manières de répondre, offertes dans les réglages.
 *
 * Le talkie-walkie (appui long pour parler) ne figure **pas** ici : il a été
 * tranché le 2 septembre, et la planche est explicite — « On ne rouvre pas une
 * décision pour une fonction nouvelle. » Un réglage n'est pas un endroit où
 * faire rentrer par la fenêtre ce qui est sorti par la porte.
 *
 * @readonly
 */
export const ModeDeReponse = Object.freeze({
  /** Le défaut, et l'idée 3 en entier : la pause et la réponse sont le même geste. */
  PAUSE_REPOND: 'pause-repond',
  /** Prudent : la lecture n'adresse rien ; seul un toucher sur un passage vise. */
  TOUCHER_DABORD: 'toucher-dabord',
  /** Conservateur : le composeur parle toujours au fil ; l'inline passe par la rangée d'un passage. */
  FIL_TOUJOURS: 'fil-toujours',
});

/** Deux adresses sont-elles la même ? Évite de réémettre pour rien. */
export function memeAdresse(a, b) {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'fil') return true;
  if (a.kind === 'message') return a.messageId === b.messageId;
  return a.messageId === b.messageId && a.rang === b.rang;
}

export class Composeur {
  /**
   * @param {object} options
   * @param {(id:string)=>(import('../model/passages.js').Message|null)} options.message
   *   Comment retrouver un message par son identifiant.
   * @param {() => {modeDeReponse:string, graceFrontiereMs:number}} options.reglages
   *   Lu à chaque événement : changer un réglage prend effet immédiatement,
   *   sans re-câbler quoi que ce soit.
   */
  constructor({ message, reglages }) {
    this._message = message;
    this._reglages = reglages;
    /** @type {Adresse} */
    this._adresse = AU_FIL;
    /** @type {string|null} le message dont la lecture est en cours */
    this._enLecture = null;
    /**
     * Quelqu'un a demandé « au fil, plutôt » et la lecture continue.
     *
     * Sans ce loquet, la règle 7 est inapplicable dès qu'un média joue : on
     * touche l'annonce, elle disparaît, et l'image suivante de la lecture
     * repose aussitôt l'adresse sur le passage en cours. Le bouton de sortie
     * n'ouvrirait que pendant seize millisecondes.
     *
     * Le loquet se lève dès qu'on redit explicitement où l'on veut répondre —
     * toucher un passage — ou qu'on quitte le message.
     */
    this._refuseLaLecture = false;
    /**
     * Le passage choisi **délibérément** — par un doigt, ou par la reprise
     * automatique après une réponse. L'indulgence de la règle 5 ne peut jamais
     * ramener l'adresse en deçà de ce plancher.
     *
     * Sans lui : on répond au 1ᵉʳ passage, la lecture reprend au début du 2ᵉ,
     * et pendant une seconde et demie le composeur vise encore le 1ᵉʳ — celui
     * auquel on vient justement de répondre. La règle 5 protège la main de
     * quelqu'un qui réagit à ce qu'il entend ; elle n'a pas à défaire ce que
     * ce même quelqu'un vient de désigner.
     *
     * @type {{messageId:string, rang:number}|null}
     */
    this._plancher = null;
    /**
     * Le message qu'un doigt a désigné **pendant qu'un autre joue**.
     *
     * Trouvé en jouant la démonstration le 16 septembre : un vocal joue, on
     * touche une phrase d'un texte plus haut — et l'image suivante de la
     * lecture repose l'adresse sur le passage du vocal. Le toucher ne tenait
     * que seize millisecondes. La règle 1 (« le composeur suit le passage en
     * cours ») vaut pour le message qu'on écoute ; elle n'a pas à défaire ce
     * qu'on vient de désigner ailleurs. La lecture d'un autre message ne
     * déplace donc plus l'adresse tant que ce choix tient — et il tient jusqu'à
     * ce qu'on touche le message qui joue, l'annonce, ou qu'on quitte le fil.
     *
     * @type {string|null}
     */
    this._choisi = null;
    /** @type {'ecrit'|'enregistre'|'filme'|null} */
    this._voix = null;
    /** @type {Set<(a:Adresse, p:{precedente:Adresse, sens:number})=>void>} */
    this._ecoutes = new Set();
  }

  /** @returns {Adresse} */
  get adresse() {
    return this._adresse;
  }

  /** Vrai quand le composeur ne parle plus au fil mais à un passage. */
  get estInline() {
    return this._adresse.kind !== 'fil';
  }

  // ── Les entrées ───────────────────────────────────────────────────────────

  /**
   * La tête de lecture a bougé. Appelé à chaque image par le métronome partagé.
   *
   * Règle 1 — le composeur suit le passage en cours.
   * Règle 5 — avec la seconde et demie d'indulgence après une frontière.
   * Règle 9 — un message à un seul passage vise le message entier.
   *
   * @param {string} messageId
   * @param {number} t secondes
   * @param {{saut?:boolean}} [opts] `saut` : la position vient d'être **posée**
   *   (reprise au passage suivant, déplacement du curseur) et non atteinte en
   *   jouant. L'indulgence de la règle 5 ne s'applique pas : elle existe parce
   *   qu'une main est plus lente qu'une oreille, ce qui n'a aucun sens quand
   *   c'est l'app elle-même qui a placé la tête de lecture. Sans cette
   *   distinction, reprendre au début du passage suivant viserait aussitôt le
   *   précédent, et la règle 4 ne marcherait jamais.
   */
  lecture(messageId, t, opts = {}) {
    const { modeDeReponse, graceFrontiereMs } = this._reglages();
    this._enLecture = messageId;
    if (modeDeReponse !== ModeDeReponse.PAUSE_REPOND) return;
    if (this._refuseLaLecture) return;
    if (this._choisi !== null && this._choisi !== messageId) return;

    const msg = this._message(messageId);
    const n = nombreDePassages(msg);
    if (n === 0) return;
    if (n === 1) {
      this._poser({ kind: 'message', messageId });
      return;
    }
    const brut = rangBrut(msg.passages, t);
    if (brut < 0) return; // silence de tête : on ne vise rien plutôt que de viser mal

    let rang;
    if (opts.saut) {
      rang = brut;
      this._plancher = { messageId, rang };
    } else {
      rang = rangVise(msg.passages, t, graceFrontiereMs);
      const p = this._plancher;
      if (p && p.messageId === messageId && brut >= p.rang && rang < p.rang) {
        rang = p.rang;
      }
    }
    this._poser({ kind: 'passage', messageId, rang, raison: 'lecture' });
  }

  /**
   * Un doigt s'est posé sur un passage.
   *
   * Règle 6 — « Toucher un passage le joue **et** en fait la cible : une seule
   * règle, aucune exception à retenir. » Vrai dans les trois modes : c'est le
   * chemin d'aujourd'hui, et il ne disparaît jamais.
   *
   * @param {string} messageId
   * @param {number} rang
   */
  toucherPassage(messageId, rang) {
    this._refuseLaLecture = false;
    const msg = this._message(messageId);
    const n = nombreDePassages(msg);
    if (n === 0) return;
    // Un doigt sur le message qui joue rend la main à la lecture ; un doigt
    // ailleurs la lui retire, le temps de répondre là où l'on a désigné.
    this._choisi = this._enLecture !== null && this._enLecture !== messageId ? messageId : null;
    if (n === 1) {
      this._poser({ kind: 'message', messageId });
      return;
    }
    if (rang < 0 || rang >= n) return;
    this._plancher = { messageId, rang };
    this._poser({ kind: 'passage', messageId, rang, raison: 'toucher' });
  }

  /**
   * L'annonce a été touchée : « au fil, plutôt ».
   *
   * Règle 7. La sortie est dans l'annonce elle-même — pas de réglage, pas de
   * tiroir : la porte est là où est la porte d'entrée.
   */
  toucherAnnonce() {
    // Le loquet ne vaut que tant que la lecture pourrait reposer une adresse.
    this._refuseLaLecture = this._enLecture !== null;
    this._choisi = null;
    this._poser(AU_FIL);
  }

  /**
   * Le média est arrivé au bout.
   *
   * Règle 8 — « l'adresse reste sur le dernier passage entendu : c'est là qu'est
   * ta pensée. » On requalifie seulement la raison, pour que l'interface puisse
   * dire « le dernier entendu » au lieu de « en cours ».
   *
   * @param {string} messageId
   */
  finDeLecture(messageId) {
    if (this._enLecture === messageId) {
      this._enLecture = null;
      // Ce qui motivait le choix d'un autre message n'existe plus : la
      // prochaine lecture repart avec ses droits.
      this._choisi = null;
    }
    const a = this._adresse;
    if (a.kind === 'passage' && a.messageId === messageId && a.raison !== 'fin') {
      this._poser({ ...a, raison: 'fin' });
    }
  }

  /**
   * On quitte le message — un autre média démarre, ou le fil se ferme.
   * Règle 8, seconde moitié : « elle s'efface en quittant le message. »
   * @param {string} messageId
   */
  quitterMessage(messageId) {
    if (this._enLecture === messageId) {
      this._enLecture = null;
      this._choisi = null;
    }
    this._refuseLaLecture = false;
    if (this._choisi === messageId) this._choisi = null;
    if (this._plancher && this._plancher.messageId === messageId) this._plancher = null;
    const a = this._adresse;
    if (a.kind !== 'fil' && a.messageId === messageId) this._poser(AU_FIL);
  }

  /** Le fil se ferme : rien ne survit à la sortie. */
  quitterLeFil() {
    this._enLecture = null;
    this._voix = null;
    this._refuseLaLecture = false;
    this._choisi = null;
    this._plancher = null;
    this._poser(AU_FIL);
  }

  // ── La voix en cours, pour la ligne de frappe (idée 1, règle 3) ────────────

  /**
   * On compose *vraiment* : premier caractère, ou micro armé.
   *
   * Idée 1, règle 2 : ouvrir une rangée pour **lire** ne s'annonce pas. C'est
   * pour ça que cette méthode est distincte de `toucherPassage` — un regard
   * n'est pas une intention.
   *
   * @param {'ecrit'|'enregistre'|'filme'} voix
   */
  commencerACompose(voix) {
    this._voix = voix;
  }

  /**
   * On renonce. Idée 1, règle 4 : « la ligne s'éteint et ne laisse aucune
   * trace. » Jamais « a commencé à répondre puis a effacé » — une hésitation
   * n'appartient qu'à celui qui hésite.
   */
  renoncer() {
    this._voix = null;
  }

  /** @returns {'ecrit'|'enregistre'|'filme'|null} */
  get voix() {
    return this._voix;
  }

  // ── Après avoir posé une réponse ──────────────────────────────────────────

  /**
   * Une réponse vient d'être posée. Règle 4 : « la lecture reprend au début du
   * passage **suivant**. »
   *
   * Ne déplace rien tout seul : renvoie à l'appelant le rang où reprendre, ou
   * -1 s'il n'y a plus rien après. C'est le lecteur qui joue, pas le composeur —
   * il n'a aucune raison de connaître un élément `<audio>`.
   *
   * @returns {{messageId:string, rangSuivant:number}|null}
   */
  apresAvoirPose() {
    this._voix = null;
    const a = this._adresse;
    if (a.kind !== 'passage') return null;
    const msg = this._message(a.messageId);
    const suivant = rangSuivant(msg ? msg.passages : [], a.rang);
    if (suivant >= 0) {
      this._refuseLaLecture = false;
      this._poser({ kind: 'passage', messageId: a.messageId, rang: suivant, raison: 'lecture' });
    }
    return { messageId: a.messageId, rangSuivant: suivant };
  }

  // ── L'annonce, en toutes lettres ──────────────────────────────────────────

  /**
   * Ce que la ligne au-dessus du composeur dit.
   *
   * Règle 2 : **il l'annonce toujours**, avant tout geste. Jamais d'adresse
   * silencieuse. C'est pour ça que cette méthode ne renvoie jamais de chaîne
   * vide quand l'adresse est inline — et que les réglages n'offrent pas de
   * « ne rien annoncer » : ils choisissent la *longueur*, pas l'existence.
   *
   * Elle cite aussi **ce qu'elle vise**, pas seulement son rang : `extrait`
   * porte les premiers mots d'un passage écrit (cinq au plus — ce sont les
   * mots de l'autre, et l'écran peut être lu par-dessus l'épaule), et `voix` la
   * matière du message, pour que l'interface montre l'image d'un passage filmé
   * ou les bornes d'un passage parlé. « 2ᵉ passage » est un rang ; « Pain, vin,
   * fromage. » est une phrase, et c'est à une phrase qu'on répond.
   *
   * @param {{compacte?:boolean}} [opts]
   * @returns {{texte:string, sortie:boolean, rang:number, extrait:string|null, voix:string|null}|null} null = au fil
   */
  annonce(opts = {}) {
    const a = this._adresse;
    if (a.kind === 'fil') return null;

    const msg = this._message(a.messageId);
    const voix = msg ? msg.voix : null;

    if (a.kind === 'message') {
      const seul = msg && msg.passages[0];
      return { texte: 'ta réponse ira à ce message', sortie: true, rang: -1, extrait: extraitDe(seul), voix };
    }

    const p = msg && msg.passages[a.rang];
    const nom = nommerRang(a.rang);
    const extrait = extraitDe(p);

    if (opts.compacte) {
      return { texte: `↩ ${nom}`, sortie: true, rang: a.rang, extrait, voix };
    }

    let texte = `ta réponse ira au ${nom}`;
    if (a.raison === 'lecture' && p && p.fin > p.debut) {
      texte += ` · ${horloge(p.debut)} → ${horloge(p.fin)}`;
    } else if (a.raison === 'fin') {
      texte += ' — le dernier entendu';
    }
    return { texte, sortie: true, rang: a.rang, extrait, voix };
  }

  // ── Interne ───────────────────────────────────────────────────────────────

  /** @param {Adresse} suivante */
  _poser(suivante) {
    const precedente = this._adresse;
    // `memeAdresse` compare la *cible*, pas la raison — c'est la bonne sémantique
    // pour l'extérieur (« est-ce le même passage ? »). Ici il en faut une plus
    // fine : passer de « en cours » à « le dernier entendu » ne change pas la
    // cible mais change l'annonce, et doit donc être émis.
    const memeRaison = raisonDe(precedente) === raisonDe(suivante);
    if (memeAdresse(precedente, suivante) && memeRaison) return;
    this._adresse = Object.freeze(suivante);
    // Le sens du mouvement, pour que l'animation de bascule glisse dans la
    // bonne direction : +1 on avance dans le média, -1 on remonte.
    const sens = sensDuMouvement(precedente, suivante);
    for (const f of this._ecoutes) f(this._adresse, { precedente, sens });
  }

  /**
   * @param {(a:Adresse, p:{precedente:Adresse, sens:number})=>void} f
   * @returns {() => void} pour se désabonner
   */
  ecouter(f) {
    this._ecoutes.add(f);
    return () => this._ecoutes.delete(f);
  }
}

/** Les premiers mots d'un passage écrit, ou rien : un son n'a pas d'extrait. */
function extraitDe(p) {
  if (!p || typeof p.texte !== 'string') return null;
  const e = enQuelquesMots(p.texte);
  return e || null;
}

/** La raison n'existe que sur une adresse de passage ; ailleurs, il n'y en a pas. */
function raisonDe(a) {
  return a && a.kind === 'passage' ? a.raison : null;
}

function sensDuMouvement(avant, apres) {
  if (avant.kind === 'passage' && apres.kind === 'passage' && avant.messageId === apres.messageId) {
    // Même rang : seule la raison a changé. Rien n'a bougé, donc rien ne glisse —
    // sinon la ligne sauterait à la fin de chaque vocal, sans raison visible.
    if (apres.rang === avant.rang) return 0;
    return apres.rang > avant.rang ? 1 : -1;
  }
  if (avant.kind === 'fil') return 1;
  if (apres.kind === 'fil') return -1;
  return 1;
}

/** 0:07, 1:04 — jamais 00:07, l'app parle comme on parle. */
function horloge(s) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
