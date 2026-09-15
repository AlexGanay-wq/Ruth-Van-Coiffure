/**
 * Les réglages.
 *
 * Deux familles, et une frontière nette entre elles :
 *
 *   • **Manières de répondre** — elles changent où va une réponse. Elles
 *     engagent donc l'utilisateur vis-à-vis de quelqu'un d'autre.
 *   • **Animation** — elle ne change que ce que l'on voit. Elle n'engage
 *     personne.
 *
 * La frontière compte pour une raison pratique : l'intensité d'animation peut
 * tomber à zéro sans conséquence, tandis que la fenêtre de correction, elle,
 * ne doit **jamais** être raccourcie par une préférence esthétique. C'est
 * pourquoi elle vit dans la première famille, à côté du mode de réponse, et
 * non à côté de l'allure.
 *
 * Ce qui n'est **pas** réglable, et pourquoi :
 *   • « Ne rien annoncer » — la règle 2 de l'idée 3 (« jamais d'adresse
 *     silencieuse ») n'est pas une préférence. Le réglage choisit la longueur
 *     de l'annonce, pas son existence.
 *   • L'appui long pour parler — tranché le 2 septembre. Un réglage n'est pas
 *     une porte dérobée pour ce qui a été décidé.
 *   • Un accusé de lecture par passage, un chronomètre — interdits par la loi
 *     des planches. On ne propose pas une case à cocher pour une surveillance.
 *
 * @module settings/schema
 */

import { ModeDeReponse } from '../address/composer.js';
import { ALLURES } from '../motion/presets.js';

/**
 * @typedef {object} Reglages
 * @property {string} modeDeReponse
 * @property {'ecrire'|'parler'|'filmer'|'joindre'} voixParDefaut
 * @property {number} graceFrontiereMs
 * @property {number} fenetreCorrectionMs
 * @property {boolean} annonceCompacte
 * @property {boolean} reprendreApresReponse
 * @property {boolean} rondDaccord
 * @property {boolean} rondPromesse
 * @property {boolean} rondRepondre
 * @property {string} decoupe
 * @property {string} allure
 * @property {number} intensiteAnimation
 * @property {boolean} suivreLeSysteme
 * @property {number} version
 */

/** @type {Readonly<Reglages>} */
export const DEFAUTS = Object.freeze({
  // ── Manières de répondre ────────────────────────────────────────────────
  modeDeReponse: ModeDeReponse.PAUSE_REPOND,
  /** La voix mise en avant dans la rangée. Les quatre restent toujours accessibles. */
  voixParDefaut: 'parler',
  /** L'indulgence après une frontière de passage (idée 3, règle 5). */
  graceFrontiereMs: 1500,
  /** Le temps pour se raviser (idée 3, règle 10). */
  fenetreCorrectionMs: 5000,
  /** Annonce courte (« ↩ 2ᵉ passage ») plutôt que la phrase entière. */
  annonceCompacte: false,
  /** Reprendre la lecture au passage suivant après avoir posé une réponse. */
  reprendreApresReponse: true,

  // ── Ce que le rond ouvre ────────────────────────────────────────────────
  // Le rond n'envoie jamais rien tout seul (idée 2, règle 4) : il ouvre des
  // portes. Lesquelles, c'est un choix — au moins une reste toujours ouverte.
  /** « d'accord » — ferme un passage simple en deux gestes. */
  rondDaccord: true,
  /** « je te réponds bientôt » — la promesse, qui marche sur n'importe quel passage. */
  rondPromesse: true,
  /**
   * « Répondre » — ouvre la rangée du passage, pour les phrases où aucun des
   * deux mots ne convient (« Et tu arrives vers quelle heure ? »). C'est la
   * sortie du cas limite sans que l'app ait à deviner quoi que ce soit.
   */
  rondRepondre: true,

  // ── Animation ───────────────────────────────────────────────────────────
  /**
   * Ce qui coupe un message en passages quand il arrive. `goutte` est
   * l'animation de l'app, celle qui existe ; les autres sont des alternatives
   * au choix. Ne change jamais où va une réponse.
   */
  decoupe: 'goutte',
  allure: 'didascalie',
  intensiteAnimation: 1,
  /** Suivre « animations réduites » du système. Vrai par défaut, et ça se respecte. */
  suivreLeSysteme: true,

  /** Pour faire vieillir le format sans perdre les choix de quelqu'un. */
  version: 1,
});

const VOIX = new Set(['ecrire', 'parler', 'filmer', 'joindre']);

/** Les découpes proposées. La première est celle de l'app. */
export const DECOUPES = Object.freeze([
  { id: 'goutte', nom: 'La goutte', note: 'L’animation de l’app : quelque chose tombe, et le bloc se coupe.', defaut: true },
  { id: 'didascalie', nom: 'La didascalie', note: 'Une indication de scène s’écrit entre les phrases, et les écarte.' },
  { id: 'point', nom: 'Le point devient le rond', note: 'Le point final de chaque phrase va dans la marge et s’ouvre en rond.' },
  { id: 'respiration', nom: 'La respiration', note: 'Une voix lit ; le bloc se coupe là où elle reprend son souffle.' },
  { id: 'adresse', nom: 'L’adresse', note: 'Chaque passage est nommé en naissant ; le nom se replie dans le rond.' },
]);
const IDS_DECOUPES = new Set(DECOUPES.map((d) => d.id));
const GRACES = [0, 1000, 1500, 3000];
const FENETRES = [0, 5000, 10000, 20000];

function choisirParmi(v, liste, defaut) {
  return liste.includes(v) ? v : defaut;
}

/**
 * Valide et normalise un objet de réglages venant du disque, d'une
 * synchronisation, ou d'un formulaire.
 *
 * Ne lève jamais. Un réglage illisible retombe sur son défaut, champ par champ :
 * une préférence abîmée ne doit pas empêcher quelqu'un d'ouvrir sa messagerie,
 * et encore moins réinitialiser les onze autres.
 *
 * @param {unknown} brut
 * @returns {Readonly<Reglages>}
 */
export function valider(brut) {
  const o = brut && typeof brut === 'object' ? /** @type {any} */ (brut) : {};
  const modes = Object.values(ModeDeReponse);

  return Object.freeze({
    modeDeReponse: choisirParmi(o.modeDeReponse, modes, DEFAUTS.modeDeReponse),
    voixParDefaut: VOIX.has(o.voixParDefaut) ? o.voixParDefaut : DEFAUTS.voixParDefaut,
    graceFrontiereMs: choisirParmi(o.graceFrontiereMs, GRACES, DEFAUTS.graceFrontiereMs),
    fenetreCorrectionMs: choisirParmi(o.fenetreCorrectionMs, FENETRES, DEFAUTS.fenetreCorrectionMs),
    annonceCompacte: o.annonceCompacte === true,
    reprendreApresReponse: o.reprendreApresReponse !== false,

    ...portesDuRond(o),
    decoupe: IDS_DECOUPES.has(o.decoupe) ? o.decoupe : DEFAUTS.decoupe,

    allure: Object.prototype.hasOwnProperty.call(ALLURES, o.allure) ? o.allure : DEFAUTS.allure,
    intensiteAnimation: bornerIntensite(o.intensiteAnimation),
    suivreLeSysteme: o.suivreLeSysteme !== false,

    version: DEFAUTS.version,
  });
}

/**
 * Les trois portes du rond. Si quelqu'un les ferme toutes — par un réglage
 * abîmé ou par jeu — le rond redeviendrait un bouton qui ne fait rien, ce que
 * la planche appelle « un journal intime ». On rouvre alors les trois.
 */
function portesDuRond(o) {
  const portes = {
    rondDaccord: o.rondDaccord !== false,
    rondPromesse: o.rondPromesse !== false,
    rondRepondre: o.rondRepondre !== false,
  };
  if (!portes.rondDaccord && !portes.rondPromesse && !portes.rondRepondre) {
    return { rondDaccord: true, rondPromesse: true, rondRepondre: true };
  }
  return portes;
}

function bornerIntensite(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : DEFAUTS.intensiteAnimation;
  return Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
}

/**
 * La description des réglages, pour construire l'écran sans le coder en dur.
 * L'écran des réglages se génère à partir d'ici : ajouter une option ne demande
 * de toucher qu'à ce fichier, et le libellé ne peut pas se désynchroniser de
 * ce que la valeur fait réellement.
 */
export const FORMULAIRE = Object.freeze([
  {
    titre: 'Répondre',
    note: 'Où va votre réponse, et comment vous la visez.',
    champs: [
      {
        cle: 'modeDeReponse',
        libelle: 'Pendant un vocal ou une vidéo',
        options: [
          {
            valeur: ModeDeReponse.PAUSE_REPOND,
            nom: 'La pause est la réponse',
            note: 'Le composeur suit le passage en cours. Un toucher arrête la lecture et enregistre.',
          },
          {
            valeur: ModeDeReponse.TOUCHER_DABORD,
            nom: 'Toucher le passage d’abord',
            note: 'La lecture ne vise rien. Vous choisissez le passage, puis vous répondez.',
          },
          {
            valeur: ModeDeReponse.FIL_TOUJOURS,
            nom: 'Toujours au fil',
            note: 'Le composeur du bas parle au fil. Les réponses inline passent par la rangée d’un passage.',
          },
        ],
      },
      {
        cle: 'voixParDefaut',
        libelle: 'Voix mise en avant',
        note: 'Les quatre restent accessibles ; celle-ci est simplement la plus à portée de pouce.',
        options: [
          { valeur: 'ecrire', nom: 'Écrire' },
          { valeur: 'parler', nom: 'Parler' },
          { valeur: 'filmer', nom: 'Filmer' },
          { valeur: 'joindre', nom: 'Joindre' },
        ],
      },
      {
        cle: 'graceFrontiereMs',
        libelle: 'Indulgence après une frontière',
        note: 'Juste après le début d’un passage, votre réponse vise encore le précédent — celui que vous venez d’entendre.',
        options: [
          { valeur: 0, nom: 'Aucune' },
          { valeur: 1000, nom: '1 s' },
          { valeur: 1500, nom: '1,5 s', defaut: true },
          { valeur: 3000, nom: '3 s' },
        ],
      },
      {
        cle: 'fenetreCorrectionMs',
        libelle: 'Temps pour se raviser',
        note: 'Après l’envoi, refaire la réponse ou la rediriger vers un autre passage.',
        options: [
          { valeur: 0, nom: 'Aucun' },
          { valeur: 5000, nom: '5 s', defaut: true },
          { valeur: 10000, nom: '10 s' },
          { valeur: 20000, nom: '20 s' },
        ],
      },
      {
        cle: 'rondDaccord',
        libelle: 'Le rond ouvre « d’accord »',
        note: 'Ferme un passage simple en deux gestes.',
        bascule: true,
        groupe: 'Ce que le rond ouvre',
      },
      {
        cle: 'rondPromesse',
        libelle: 'Le rond ouvre « je te réponds bientôt »',
        note: 'La promesse — elle marche sur n’importe quel passage.',
        bascule: true,
        groupe: 'Ce que le rond ouvre',
      },
      {
        cle: 'rondRepondre',
        libelle: 'Le rond ouvre « Répondre »',
        note: 'La rangée du passage, pour les phrases où aucun des deux mots ne convient. Au moins une des trois portes reste toujours ouverte.',
        bascule: true,
        groupe: 'Ce que le rond ouvre',
      },
      {
        cle: 'annonceCompacte',
        libelle: 'Annonce courte',
        note: '« ↩ 2ᵉ passage » au lieu de la phrase entière. L’adresse est toujours annoncée.',
        bascule: true,
      },
      {
        cle: 'reprendreApresReponse',
        libelle: 'Enchaîner après une réponse',
        note: 'La lecture repart au début du passage suivant.',
        bascule: true,
      },
    ],
  },
  {
    titre: 'Animation',
    note: 'Ce que vous voyez bouger. Ne change jamais où va une réponse.',
    champs: [
      {
        cle: 'decoupe',
        libelle: 'La découpe d’un message',
        note: 'Ce qui sépare un message en passages quand il arrive. « La goutte » est l’animation de l’app.',
        options: DECOUPES.map((d) => ({ valeur: d.id, nom: d.nom, note: d.note, defaut: d.defaut })),
      },
      {
        cle: 'allure',
        libelle: 'Allure',
        options: Object.values(ALLURES).map((a) => ({ valeur: a.id, nom: a.nom, note: a.note })),
      },
      {
        cle: 'intensiteAnimation',
        libelle: 'Intensité',
        curseur: { min: 0, max: 1, pas: 0.05 },
        note: 'À zéro, plus rien ne bouge — quelle que soit l’allure choisie.',
      },
      {
        cle: 'suivreLeSysteme',
        libelle: 'Suivre « animations réduites » du système',
        note: 'Activé, le réglage de votre téléphone l’emporte sur l’allure choisie ici.',
        bascule: true,
      },
    ],
  },
]);
