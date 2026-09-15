/**
 * Didascalie — les réponses inline, en état de marche.
 *
 * Ce fichier est la démonstration : il câble le moteur (dans `src/`) à un fil
 * de conversation réel. Tout ce qui décide de quelque chose vit dans `src/` et
 * ne connaît pas le DOM ; tout ce qui dessine vit ici et ne décide de rien.
 *
 * Le fil rejoue la scène des planches : le message de Testeur pour samedi, son
 * vocal en trois passages, sa vidéo en trois passages.
 */

import { metronome } from '../src/kernel/ticker.js';
import { Etat } from '../src/kernel/lattice.js';
import { RegistreDesRonds } from '../src/model/ring.js';
import { nommerRang, bornes, nombreDePassages } from '../src/model/passages.js';
import { Composeur } from '../src/address/composer.js';
import { Moteur } from '../src/motion/engine.js';
import { valider, FORMULAIRE } from '../src/settings/schema.js';
import { Annonceur, lireLesFrappes } from '../src/transport/presence.js';
import { laPorte, identifiant } from '../src/security/gate.js';
import { h, remplir, icone, creerAnnonceur } from '../ui/dom.js';
import { jouerDecoupe } from '../ui/decoupe.js';

// ── L'état de l'app ────────────────────────────────────────────────────────

const MOI = 'moi';
const LUI = 'testeur';

let reglages = charger();
const registre = new RegistreDesRonds();
const moteur = new Moteur(() => reglages);
const dire = creerAnnonceur();

/** @type {Map<string, object>} les messages du fil, par identifiant */
const messages = new Map();
/** @type {{messageId:string, rang:number, id:string, voix:string, texte:string, fenetreFinA:number}[]} */
let reponses = [];
/** @type {{id:string, personneId:string, voix:string, messageId:string|null, rang:number, perimeA:number}[]} */
let frappesDesAutres = [];

const composeur = new Composeur({
  message: (id) => messages.get(id) ?? null,
  reglages: () => reglages,
});

const annonceur = new Annonceur({
  publier: (charge) => {
    // Dans la vraie app : une écriture sur `typing.{uid}`. Ici on se contente
    // de le montrer dans la console, pour qu'on voie ce qui part vraiment.
    if (charge) console.info('[typing.moi]', charge);
    else console.info('[typing.moi] effacé');
  },
});

// ── Les données du fil ─────────────────────────────────────────────────────

function construireLeFil() {
  messages.clear();
  for (const m of [
    {
      id: 'texte1',
      voix: 'texte',
      auteurId: LUI,
      heure: '10:12',
      passages: [
        { debut: 0, fin: 0, texte: 'Voilà ce que je prends pour samedi.' },
        { debut: 0, fin: 0, texte: 'Pain, vin, fromage.' },
        { debut: 0, fin: 0, texte: 'Tu peux t’occuper du dessert ?' },
        { debut: 0, fin: 0, texte: 'Et tu arrives vers quelle heure ?' },
      ],
    },
    {
      id: 'vocal1',
      voix: 'vocal',
      auteurId: LUI,
      heure: '11:49',
      duree: 41,
      passages: [
        { debut: 0, fin: 14 },
        { debut: 14, fin: 28 },
        { debut: 28, fin: 41 },
      ],
    },
    {
      id: 'video1',
      voix: 'video',
      auteurId: LUI,
      heure: '11:58',
      duree: 19,
      passages: [
        { debut: 0, fin: 6 },
        { debut: 6, fin: 13 },
        { debut: 13, fin: 19 },
      ],
    },
  ]) {
    messages.set(m.id, m);
  }
}

// ── Le lecteur ─────────────────────────────────────────────────────────────

/**
 * Un seul lecteur pour tout le fil : deux médias ne peuvent pas jouer en même
 * temps, ce qui évite d'avoir à décider lequel des deux le composeur vise.
 */
const lecteur = {
  messageId: /** @type {string|null} */ (null),
  position: 0,
  jusqua: Infinity,
  enMarche: false,
  /** @type {(()=>void)|null} */
  arreterMetronome: null,

  jouer(messageId, depuis = 0, jusqua = Infinity) {
    if (this.messageId && this.messageId !== messageId) {
      composeur.quitterMessage(this.messageId);
    }
    this.messageId = messageId;
    this.position = depuis;
    this.jusqua = jusqua;
    this.enMarche = true;
    // Position posée par l'app, pas atteinte en jouant : pas d'indulgence.
    composeur.lecture(messageId, depuis, { saut: true });
    if (!this.arreterMetronome) {
      this.arreterMetronome = metronome.abonner((_t, dt) => this.battement(dt));
    }
    rendre();
  },

  battement(dtMs) {
    if (!this.enMarche || !this.messageId) return;
    const msg = messages.get(this.messageId);
    if (!msg) return this.stop();

    this.position += dtMs / 1000;
    const bout = Math.min(this.jusqua, msg.duree ?? 0);

    if (this.position >= bout) {
      this.position = bout;
      const finDuMedia = bout >= (msg.duree ?? 0) - 0.001;
      this.pause();
      if (finDuMedia) composeur.finDeLecture(this.messageId);
      rendreLecture();
      rendreBarre();
      return;
    }
    composeur.lecture(this.messageId, this.position);
    rendreLecture();
  },

  pause() {
    this.enMarche = false;
    if (this.arreterMetronome) {
      this.arreterMetronome();
      this.arreterMetronome = null;
    }
  },

  stop() {
    this.pause();
    if (this.messageId) composeur.quitterMessage(this.messageId);
    this.messageId = null;
    this.position = 0;
    rendre();
  },
};

// ── L'enregistrement ───────────────────────────────────────────────────────

const micro = {
  actif: false,
  voix: /** @type {'enregistre'|'filme'} */ ('enregistre'),
  debut: 0,
  /** @type {(()=>void)|null} */
  arreterMetronome: null,

  /**
   * Idée 3, règle 3 : « Un toucher sur 🎙 ou 🎥 : la lecture s'arrête,
   * l'enregistrement part. » Les deux dans le même geste.
   */
  demarrer(voix) {
    if (lecteur.enMarche) lecteur.pause();
    this.actif = true;
    this.voix = voix;
    this.debut = performance.now();
    composeur.commencerACompose(voix);
    annonceur.composer({ voix, adresse: composeur.adresse });
    // Ne surtout pas rendre la barre à chaque image : le bouton « arrêter »
    // serait détaché du document soixante fois par seconde, donc impossible à
    // toucher. Seul le chiffre du chronomètre change — c'est un nœud de texte.
    this.arreterMetronome = metronome.abonner(() => {
      if (refs.chrono) refs.chrono.textContent = this.chrono;
    });
    rendre();
    dire(`Enregistrement. ${texteAnnonce() ?? 'au fil'}`);
  },

  /** Règle 4 : « la réponse se pose, et la lecture reprend au passage suivant. » */
  poser() {
    if (!this.actif) return;
    const secondes = Math.max(1, Math.round((performance.now() - this.debut) / 1000));
    this.actif = false;
    if (this.arreterMetronome) {
      this.arreterMetronome();
      this.arreterMetronome = null;
    }
    annonceur.retirer();
    deposerReponse(this.voix === 'filme' ? 'video' : 'vocal', `0:${String(secondes).padStart(2, '0')}`);
  },

  get chrono() {
    const s = Math.floor((performance.now() - this.debut) / 1000);
    return `0:${String(s).padStart(2, '0')}`;
  },
};

// ── Poser une réponse ──────────────────────────────────────────────────────

/**
 * @param {'texte'|'vocal'|'video'} voix
 * @param {string} contenu
 */
function deposerReponse(voix, contenu) {
  const adresse = composeur.adresse;
  const messageId = adresse.kind === 'fil' ? null : adresse.messageId;
  const rang = adresse.kind === 'passage' ? adresse.rang : -1;

  const reponse = {
    id: identifiant(10),
    messageId,
    rang,
    voix,
    texte: contenu,
    fenetreFinA: Date.now() + reglages.fenetreCorrectionMs,
    neuve: true,
  };
  reponses.push(reponse);

  if (messageId !== null && rang >= 0) {
    // Toute réponse remplit le rond — un mot, un vocal, une vidéo, un fichier.
    // L'état ne juge pas la réponse (idée 2, règle 3).
    registre.observer(messageId, rang, MOI, Etat.REPONDU);
  }

  const suite = composeur.apresAvoirPose();
  rendre();

  if (reglages.fenetreCorrectionMs > 0) {
    setTimeout(() => {
      reponse.neuve = false;
      rendre();
    }, reglages.fenetreCorrectionMs);
  } else {
    reponse.neuve = false;
  }

  // Reprendre au passage suivant, si le réglage le demande.
  if (suite && suite.rangSuivant >= 0 && reglages.reprendreApresReponse && messageId) {
    const msg = messages.get(messageId);
    if (msg && msg.duree) {
      const b = bornes(msg.passages, suite.rangSuivant);
      if (b) lecteur.jouer(messageId, b.debut, msg.duree);
    }
  }
  dire(messageId && rang >= 0 ? `Réponse posée au ${nommerRang(rang)}.` : 'Réponse envoyée au fil.');
}

/** Idée 3, règle 10 : rediriger une réponse fraîche vers un autre passage. */
function redirigerReponse(reponse, nouveauRang) {
  reponse.rang = nouveauRang;
  registre.observer(reponse.messageId, nouveauRang, MOI, Etat.REPONDU);
  reponse.neuve = false;
  rendre();
  dire(`Réponse déplacée au ${nommerRang(nouveauRang)}.`);
}

function refaireReponse(reponse) {
  reponses = reponses.filter((r) => r !== reponse);
  rendre();
  dire('Réponse retirée. Vous pouvez la refaire.');
}

// ── Le rendu ───────────────────────────────────────────────────────────────

const $fil = document.getElementById('fil');
const $barre = document.getElementById('barre');

/**
 * La mise à jour de la tête de lecture, soixante fois par seconde.
 *
 * Surtout **pas** un rendu complet : reconstruire la barre à chaque image
 * détacherait le bouton qu'un doigt est en train de viser (il devient
 * inclicable), effacerait le texte en cours de saisie, et ferait perdre le
 * focus au clavier. On ne touche donc qu'à deux choses par passage — une
 * propriété personnalisée et deux classes — ce qui ne déclenche qu'une
 * recomposition, jamais une remise en page.
 */
function rendreLecture() {
  const msgId = lecteur.messageId;
  if (!msgId) return;
  const msg = messages.get(msgId);
  if (!msg) return;
  const rangActif = rangSousLaTete(msg);

  for (const el of $fil.querySelectorAll(`[data-msg="${CSS.escape(msgId)}"]`)) {
    const r = Number(el.dataset.rang);
    const p = msg.passages[r];
    if (!p) continue;
    const actif = r === rangActif;
    const lu = lecteur.position >= p.fin;
    const jauge = actif
      ? Math.min(1, Math.max(0, (lecteur.position - p.debut) / (p.fin - p.debut)))
      : lu ? 1 : 0;
    el.style.setProperty('--jauge', jauge.toFixed(4));
    el.classList.toggle('en-cours', actif);
    el.classList.toggle('lu', lu && !actif);
  }
}

/** Les éléments à animer, repérés d'un rendu à l'autre. */
const vus = { annonce: '', reponses: new Set(), ronds: new Map() };

function rendre() {
  rendreFil();
  rendreBarre();
}

function rendreFil() {
  const enfants = [];
  enfants.push(h('div', { class: 'jour', texte: 'Aujourd’hui' }));

  for (const msg of messages.values()) {
    enfants.push(rendreMessage(msg));
    const ligne = ligneDuBasPour(msg);
    if (ligne) enfants.push(ligne);
  }
  remplir($fil, ...enfants);
  animerLesNouveautes();
}

function rendreMessage(msg) {
  const bloc = h('div', { class: 'msg' }, [
    h('div', { class: 'auteur', texte: `Testeur, ${msg.heure}.` }),
  ]);

  const n = nombreDePassages(msg);
  const avecRonds = n > 1; // idée 2, règle 7

  if (msg.voix === 'texte') {
    for (let r = 0; r < n; r++) {
      bloc.appendChild(rendrePassageTexte(msg, r, avecRonds));
    }
  } else {
    bloc.appendChild(rendreMedia(msg));
    for (let r = 0; r < n; r++) {
      for (const rep of reponses.filter((x) => x.messageId === msg.id && x.rang === r)) {
        bloc.appendChild(rendreReponse(rep, msg));
      }
    }
  }

  // Le bilan que l'auteur voit sur son propre message — ici, pour la
  // démonstration, on le montre sous le message de Testeur.
  const bilan = registre.bilanAuteur(msg.id, n, [MOI]);
  if (avecRonds && bilan.repondus + bilan.promis > 0) {
    bloc.appendChild(
      h('div', { class: 'bilan' }, [
        h('span', { class: 'pt s' }),
        `${bilan.repondus} passage${bilan.repondus > 1 ? 's' : ''} sur ${bilan.total} ${bilan.repondus > 1 ? 'ont' : 'a'} une réponse`,
        bilan.promis > 0 ? h('span', { class: 'pt a' }) : null,
        bilan.promis > 0 ? `${bilan.promis} promis` : null,
      ]),
    );
  }
  return bloc;
}

function rendrePassageTexte(msg, rang, avecRonds) {
  const etat = registre.etat(msg.id, rang, MOI);
  const range = registre.estRange(msg.id, rang);
  const adresse = composeur.adresse;
  const vise = adresse.kind === 'passage' && adresse.messageId === msg.id && adresse.rang === rang;

  const corps = h('div', { class: 'corps' });

  const bulle = h('button', {
    class: `bulle${vise ? ' vise' : ''}`,
    'aria-label': `${nommerRang(rang)} : ${msg.passages[rang].texte}. Toucher pour répondre.`,
    'on:click': () => {
      composeur.toucherPassage(msg.id, rang);
      ouvertsDeuxMots.clear();
      rendre();
    },
  }, [msg.passages[rang].texte]);
  corps.appendChild(bulle);

  // Les deux mots que le rond ouvre.
  if (ouvertsDeuxMots.has(`${msg.id}|${rang}`) && etat !== Etat.REPONDU) {
    corps.appendChild(rendreDeuxMots(msg, rang));
  }

  for (const rep of reponses.filter((x) => x.messageId === msg.id && x.rang === rang)) {
    corps.appendChild(rendreReponse(rep, msg));
  }

  const ligne = h('div', { class: `passage${range ? ' range' : ''}` });
  if (avecRonds) ligne.appendChild(rendreRond(msg, rang, etat, range));
  ligne.appendChild(corps);
  return ligne;
}

function rendreRond(msg, rang, etat, range) {
  const classes = ['rond'];
  if (range) classes.push('range');
  else if (etat === Etat.REPONDU) classes.push('repondu');
  else if (etat === Etat.PROMIS) classes.push('promis');

  const terminal = etat === Etat.REPONDU;
  const rond = h('button', {
    class: classes.join(' '),
    'aria-label': terminal
      ? `${nommerRang(rang)} : répondu`
      : etat === Etat.PROMIS
        ? `${nommerRang(rang)} : réponse promise`
        : `${nommerRang(rang)} : sans réponse. Toucher pour répondre en deux mots.`,
    'aria-disabled': terminal ? 'true' : null,
    'on:click': () => {
      // Toucher un rond plein ne fait rien (idée 2, acte II, plan 4).
      if (terminal) {
        dire('Ce passage a déjà sa réponse.');
        return;
      }
      const cle = `${msg.id}|${rang}`;
      if (ouvertsDeuxMots.has(cle)) ouvertsDeuxMots.delete(cle);
      else {
        ouvertsDeuxMots.clear();
        ouvertsDeuxMots.add(cle);
      }
      rendre();
    },
    'on:contextmenu': (ev) => {
      ev.preventDefault();
      registre.basculerRange(msg.id, rang);
      rendre();
    },
  }, [
    h('span', { class: 'disque' }),
    etat === Etat.REPONDU ? icone('coche', { 'stroke-width': 3.4 }) : null,
    etat === Etat.PROMIS ? icone('sablier', { 'stroke-width': 2.2 }) : null,
  ]);

  vus.ronds.set(`${msg.id}|${rang}`, { el: rond, etat });
  return rond;
}

/**
 * « Le rond n'envoie plus rien tout seul : il ouvre deux mots. »
 * L'app ne choisit jamais le mot à ta place — elle propose les deux qui
 * existent, et c'est toi qui en dis un.
 */
function rendreDeuxMots(msg, rang) {
  const zone = h('div', { class: 'deux-mots' });
  const choix = [];

  if (reglages.rondDaccord) {
    choix.push({
      texte: 'd’accord',
      ic: icone('coche', { 'stroke-width': 3 }),
      classe: '',
      faire: (ev) => {
        if (!laPorte(ev).ouvre) return;
        composeur.toucherPassage(msg.id, rang);
        deposerReponse('texte', 'd’accord');
        ouvertsDeuxMots.clear();
      },
    });
  }

  if (reglages.rondPromesse) {
    choix.push({
      texte: 'je te réponds bientôt',
      ic: icone('sablier', { 'stroke-width': 2.2 }),
      classe: ' ambre',
      faire: (ev) => {
        if (!laPorte(ev).ouvre) return;
        // Une promesse est une réponse : elle voyage comme telle.
        registre.observer(msg.id, rang, MOI, Etat.PROMIS);
        reponses.push({
          id: identifiant(10),
          messageId: msg.id,
          rang,
          voix: 'texte',
          texte: 'je te réponds bientôt',
          neuve: false,
          promesse: true,
        });
        ouvertsDeuxMots.clear();
        rendre();
        dire(`Promesse posée au ${nommerRang(rang)}.`);
      },
    });
  }

  // La troisième porte : quand aucun des deux mots ne convient — « Et tu
  // arrives vers quelle heure ? » — on ouvre la rangée du passage. L'app ne
  // devine pas quelles phrases acceptent « d'accord » ; elle offre la sortie.
  if (reglages.rondRepondre) {
    choix.push({
      texte: 'Répondre',
      ic: icone('retour', { 'stroke-width': 2.2 }),
      classe: ' sobre',
      faire: (ev) => {
        if (!laPorte(ev).ouvre) return;
        composeur.toucherPassage(msg.id, rang);
        ouvertsDeuxMots.clear();
        rendre();
        refs.champ?.focus();
        dire(`Réponse au ${nommerRang(rang)}.`);
      },
    });
  }

  choix.forEach((c, i) => {
    const bouton = h('button', { class: `mot${c.classe}`, 'on:click': c.faire }, [c.ic, c.texte]);
    zone.appendChild(bouton);
    moteur.jouer(bouton, 'motSePose', { index: i });
  });
  return zone;
}

function rendreMedia(msg) {
  const enCours = lecteur.messageId === msg.id;
  const rangEnCours = enCours ? rangSousLaTete(msg) : -1;

  const bulle = h('div', { class: 'bulle', style: '--x' }, []);
  bulle.classList.remove('vise');
  const adresse = composeur.adresse;
  if (adresse.kind === 'passage' && adresse.messageId === msg.id) bulle.classList.add('vise');

  const icone_ = msg.voix === 'vocal' ? '🎙️' : '🎬';
  const etatTexte = enCours
    ? lecteur.enMarche ? 'en lecture' : 'en pause'
    : `${msg.passages.length} passages`;
  bulle.appendChild(
    h('div', { class: 'media-titre' }, [
      `${icone_} ${msg.voix === 'vocal' ? 'Vocal' : 'Vidéo'} de Testeur `,
      h('span', { texte: `· ${horloge(msg.duree)} · ${etatTexte}` }),
    ]),
  );

  bulle.appendChild(msg.voix === 'vocal' ? rendreRail(msg, rangEnCours) : rendreVignettes(msg, rangEnCours));
  return bulle;
}

/** Le vocal : une bande par passage. */
function rendreRail(msg, rangEnCours) {
  const rail = h('div', { class: 'rail' });
  msg.passages.forEach((p, r) => {
    const actif = r === rangEnCours;
    const lu = lecteur.messageId === msg.id && lecteur.position >= p.fin;
    const jauge = actif ? Math.min(1, Math.max(0, (lecteur.position - p.debut) / (p.fin - p.debut))) : lu ? 1 : 0;

    const seg = h('button', {
      class: `segment${actif ? ' en-cours' : ''}${lu && !actif ? ' lu' : ''}`,
      'data-msg': msg.id,
      'data-rang': String(r),
      'style:--jauge': jauge.toFixed(4),
      'aria-label': `${nommerRang(r)}, de ${horloge(p.debut)} à ${horloge(p.fin)}. Toucher pour l’écouter et y répondre.`,
      'on:click': () => toucherPassageMedia(msg, r),
    }, [
      h('span', { class: 'jauge' }),
      h('span', { class: 'bouton-lire' }, [icone(actif && lecteur.enMarche ? 'pause' : 'lire')]),
      h('span', { class: 'onde' }, ondes(r, 22)),
      h('span', { class: 'tt', texte: actif && !lecteur.enMarche ? 'en pause' : `${horloge(p.debut)} → ${horloge(p.fin)}` }),
    ]);
    rail.appendChild(seg);
  });
  return rail;
}

/**
 * La vidéo : **trois vignettes**, et non « 3 passages · touchez pour répondre ».
 *
 * C'est la dette du 9 septembre, celle que la passation met en tête : « on ne
 * marque pas un passage qu'on ne voit pas ». Les idées 2, 3 et 5 la supposent
 * toutes les trois, donc elle passe avant elles.
 */
function rendreVignettes(msg, rangEnCours) {
  const grille = h('div', { class: 'vignettes' });
  msg.passages.forEach((p, r) => {
    const actif = r === rangEnCours;
    const lu = lecteur.messageId === msg.id && lecteur.position >= p.fin;
    const jauge = actif ? Math.min(1, Math.max(0, (lecteur.position - p.debut) / (p.fin - p.debut))) : lu ? 1 : 0;

    const v = h('button', {
      class: `vignette${actif ? ' en-cours' : ''}${lu && !actif ? ' lu' : ''}`,
      'data-msg': msg.id,
      'data-rang': String(r),
      'style:--jauge': jauge.toFixed(4),
      'aria-label': `${nommerRang(r)} de la vidéo, à ${horloge(p.debut)}. Toucher pour le voir et y répondre.`,
      'on:click': () => toucherPassageMedia(msg, r),
    }, [
      h('span', { class: 'im', 'style:--f': String(r) }),
      h('span', { class: 'pl' }, [icone(actif && lecteur.enMarche ? 'pause' : 'lire')]),
      h('span', { class: 'tt', texte: horloge(p.debut) }),
      h('span', { class: 'jg' }, [h('i')]),
    ]);
    // Les « images » de la démonstration : trois dégradés, aucun fichier à charger.
    v.querySelector('.im').style.background = CADRES[r % CADRES.length];
    grille.appendChild(v);
  });
  return grille;
}

const CADRES = [
  'linear-gradient(155deg,#6E5A43,#C2A184 70%,#E4D2BB)',
  'linear-gradient(155deg,#3F6079,#7FA0B6 70%,#CBDCE7)',
  'linear-gradient(155deg,#4A6B4E,#8FB093 70%,#D6E4D7)',
];

/** Règle 6 : toucher un passage le joue **et** en fait la cible. */
function toucherPassageMedia(msg, rang) {
  const b = bornes(msg.passages, rang);
  composeur.toucherPassage(msg.id, rang);
  if (b && msg.duree) {
    if (lecteur.messageId === msg.id && lecteur.enMarche && rangSousLaTete(msg) === rang) {
      lecteur.pause();
      rendre();
      return;
    }
    lecteur.jouer(msg.id, b.debut, msg.duree);
  } else {
    rendre();
  }
}

function rangSousLaTete(msg) {
  const a = composeur.adresse;
  if (a.kind === 'passage' && a.messageId === msg.id) return a.rang;
  return -1;
}

function rendreReponse(rep, msg) {
  const bloc = h('div', { class: 'reponse-accrochee' });
  bloc.appendChild(h('div', { class: 'connecteur' }));

  const bulle = h('div', { class: 'bulle moi' }, [
    rep.voix === 'vocal' ? `🎙 ${rep.texte}` : rep.voix === 'video' ? `🎬 ${rep.texte}` : rep.texte,
  ]);
  bloc.appendChild(bulle);

  bloc.appendChild(
    h('div', { class: 'tampon' }, [
      'Toi ✓ · ',
      h('b', { texte: rep.rang >= 0 ? `réponse au ${nommerRang(rep.rang)}` : 'au fil' }),
    ]),
  );

  // La fenêtre des cinq secondes.
  if (rep.neuve && reglages.fenetreCorrectionMs > 0 && rep.rang >= 0) {
    const filet = h('span', { class: 'filet' });
    const fenetre = h('div', { class: 'fenetre' }, [
      h('button', { texte: 'Refaire', 'on:click': () => refaireReponse(rep) }),
      rep.rang + 1 < msg.passages.length
        ? h('button', {
            class: 'corr',
            texte: `plutôt le ${nommerRang(rep.rang + 1)}`,
            'on:click': () => redirigerReponse(rep, rep.rang + 1),
          })
        : null,
      filet,
    ]);
    bloc.appendChild(fenetre);
    moteur.jouer(filet, 'fenetreSepuise', { dureeMs: Math.max(0, rep.fenetreFinA - Date.now()) });
    if (moteur.calme) filet.style.transform = 'scaleX(0)';
  }

  if (rep.neuve) vus.reponses.add(rep.id);
  return bloc;
}

/** « Il reste deux passages » — au bon moment, une seule fois. */
const lignesAffichees = new Map();
function ligneDuBasPour(msg) {
  const n = nombreDePassages(msg);
  if (!lignesAffichees.has(msg.id)) {
    const l = registre.reclamerLigneDuBas(msg.id, n, MOI);
    if (l) lignesAffichees.set(msg.id, l);
  }
  const ligne = lignesAffichees.get(msg.id);
  if (!ligne) return null;

  // Une fois tous les passages répondus, la ligne n'a plus rien à dire.
  const reste = compterRestants(msg, n);
  if (reste === 0) return null;

  return h('div', { class: 'reste' }, [
    `${reste} passage${reste > 1 ? 's' : ''} attendent encore`,
    h('button', {
      texte: 'Y aller',
      'on:click': () => {
        const r = premierSansReponse(msg, n);
        if (r < 0) return;
        composeur.toucherPassage(msg.id, r);
        rendre();
        // Le passage s'allume **une fois**, puis s'éteint.
        const cible = $fil.querySelectorAll('.msg')[[...messages.keys()].indexOf(msg.id)];
        const bulle = cible?.querySelectorAll('.bulle')[r];
        if (bulle) {
          bulle.scrollIntoView({ block: 'center', behavior: moteur.calme ? 'auto' : 'smooth' });
          moteur.jouer(bulle, 'anneauUneFois');
        }
        dire(`${nommerRang(r)} : sans réponse.`);
      },
    }),
  ]);
}

function compterRestants(msg, n) {
  let k = 0;
  for (let r = 0; r < n; r++) {
    if (registre.estRange(msg.id, r)) continue;
    if (registre.etat(msg.id, r, MOI) !== Etat.REPONDU) k++;
  }
  return k;
}

function premierSansReponse(msg, n) {
  for (let r = 0; r < n; r++) {
    if (registre.estRange(msg.id, r)) continue;
    if (registre.etat(msg.id, r, MOI) !== Etat.REPONDU) return r;
  }
  return -1;
}

// ── La barre du bas ────────────────────────────────────────────────────────

const ouvertsDeuxMots = new Set();

function texteAnnonce() {
  const a = composeur.annonce({ compacte: reglages.annonceCompacte });
  return a ? a.texte : null;
}

function rendreBarre() {
  const enfants = [];

  // La ligne de frappe des autres (idée 1).
  const frappe = lireLesFrappes(frappesDesAutres, {
    maintenant: Date.now(),
    nomDe: () => 'Testeur',
    message: (id) => messages.get(id) ?? null,
  });
  enfants.push(h('div', { class: 'frappe', texte: frappe ? frappe.texte : '' }));

  // L'annonce : toujours, quand l'adresse n'est pas le fil.
  if (micro.actif) {
    enfants.push(
      h('div', { class: 'annonce enregistre' }, [
        h('span', { class: 'battement' }),
        h('span', { texte: `${micro.voix === 'filme' ? 'je te filme' : 'je t’écoute'}${texteAnnonce() ? ` · ${abreger(texteAnnonce())}` : ''}` }),
        (refs.chrono = h('span', { class: 'chrono', texte: micro.chrono })),
      ]),
    );
  } else {
    const texte = texteAnnonce();
    if (texte) {
      const annonce = h('button', {
        class: 'annonce',
        'aria-label': `${texte}. Toucher pour revenir au fil.`,
        'on:click': () => {
          composeur.toucherAnnonce();
          rendre();
          dire('Retour au fil.');
        },
      }, [h('span', { texte }), h('span', { class: 'sortie', texte: 'au fil, plutôt' })]);
      enfants.push(annonce);
    }
  }

  enfants.push(rendreComposeur());
  remplir($barre, ...enfants);
  animerAnnonce();
}

/** Les nœuds qu'on met à jour au lieu de les reconstruire. */
const refs = { chrono: /** @type {Element|null} */ (null), champ: /** @type {HTMLInputElement|null} */ (null) };

/**
 * Le champ de saisie, créé une seule fois pour toute la vie de l'écran.
 *
 * `remplir()` le déplace d'un rendu à l'autre plutôt que de le recréer :
 * `appendChild` sur un nœud déjà présent le déménage sans le détruire, donc la
 * saisie en cours, la position du curseur et le focus survivent à un changement
 * d'adresse. C'est indispensable ici, puisque l'adresse change **pendant** que
 * la personne écrit — c'est tout le principe de l'idée 3.
 */
function champPersistant() {
  if (refs.champ) return refs.champ;
  const champ = /** @type {HTMLInputElement} */ (h('input', {
    class: 'champ',
    type: 'text',
    'on:input': (ev) => {
      if (ev.target.value) {
        composeur.commencerACompose('ecrit');
        annonceur.composer({ voix: 'ecrit', adresse: composeur.adresse });
      } else {
        composeur.renoncer();
        annonceur.retirer();
      }
    },
    'on:keydown': (ev) => {
      if (ev.key !== 'Enter' || !ev.target.value.trim()) return;
      if (!laPorte(ev).ouvre) return;
      const t = ev.target.value.trim();
      ev.target.value = '';
      annonceur.retirer();
      deposerReponse('texte', t);
    },
  }));
  refs.champ = champ;
  return champ;
}

function rendreComposeur() {
  const c = h('div', { class: 'composeur' });
  const inline = composeur.estInline;

  // Le même nœud d'un rendu à l'autre : sinon, changer de passage pendant qu'on
  // tape effacerait le texte déjà saisi et ferait tomber le clavier. Le
  // composeur est unique — son champ aussi.
  const champ = champPersistant();
  champ.placeholder = inline ? 'Ta réponse…' : 'Message…';
  champ.setAttribute('aria-label', inline ? String(texteAnnonce()) : 'Message au fil');

  const boutons = [
    { id: 'parler', nom: 'micro', voix: 'enregistre', libelle: 'Répondre par un vocal' },
    { id: 'filmer', nom: 'camera', voix: 'filme', libelle: 'Répondre par une vidéo' },
    { id: 'joindre', nom: 'trombone', voix: 'ecrit', libelle: 'Joindre un fichier' },
  ];

  if (micro.actif) {
    c.appendChild(h('span', { class: 'voix' }, ['+']));
    c.appendChild(h('div', { class: 'champ', texte: '…' }));
    c.appendChild(
      h('button', {
        class: 'voix enregistre',
        'aria-label': 'Arrêter et poser la réponse',
        'on:click': (ev) => {
          if (!laPorte(ev).ouvre) return;
          micro.poser();
        },
      }, [icone('arreter')]),
    );
    return c;
  }

  c.appendChild(champ);
  for (const b of boutons) {
    const mis = reglages.voixParDefaut === b.id;
    c.appendChild(
      h('button', {
        class: `voix${mis ? ' mise-en-avant' : ''}`,
        'aria-label': b.libelle,
        'on:click': (ev) => {
          if (!laPorte(ev).ouvre) return;
          if (b.id === 'joindre') {
            deposerReponse('texte', '📎 pièce jointe');
            return;
          }
          micro.demarrer(b.voix);
        },
      }, [icone(b.nom)]),
    );
  }
  return c;
}

function abreger(t) {
  return t.replace('ta réponse ira au ', 'réponse au ').replace('ta réponse ira à ce message', 'au message');
}

// ── Les animations, au bon moment ──────────────────────────────────────────

function animerAnnonce() {
  const el = $barre.querySelector('.annonce');
  const texte = el ? el.textContent : '';
  if (texte === vus.annonce) return;
  const sensPrecedent = vus.sens ?? 1;
  vus.annonce = texte;
  if (el) moteur.jouer(el, 'adresseEntre', { sens: sensPrecedent });
}

function animerLesNouveautes() {
  // Les réponses qui viennent d'arriver s'accrochent sous leur passage.
  for (const bloc of $fil.querySelectorAll('.reponse-accrochee')) {
    if (bloc.dataset.vu === '1') continue;
    bloc.dataset.vu = '1';
    moteur.jouer(bloc, 'reponseSaccroche');
    const trait = bloc.querySelector('.connecteur');
    if (trait) moteur.jouer(trait, 'connecteurSetend');
  }
  // Les ronds qui viennent de se remplir.
  for (const [cle, { el, etat }] of vus.ronds) {
    const avant = vus.ronds.get(cle)?.precedent;
    if (etat === Etat.REPONDU && avant !== Etat.REPONDU) {
      const disque = el.querySelector('.disque');
      if (disque) moteur.jouer(disque, 'rondSeRemplit');
    }
    if (etat === Etat.PROMIS) {
      moteur.jouer(el, 'promesseRespire');
    }
    vus.ronds.set(cle, { el, etat, precedent: etat });
  }
  // Le halo du passage visé.
  const vise = $fil.querySelector('.bulle.vise');
  if (vise && vise !== vus.vise) {
    vus.vise = vise;
    moteur.jouer(vise, 'anneau');
  }
}

// ── Écouter le composeur ───────────────────────────────────────────────────

composeur.ecouter((adresse, { sens }) => {
  vus.sens = sens;
  const el = $barre.querySelector('.annonce');
  if (el && !moteur.calme) {
    const sortie = moteur.jouer(el, 'adresseSort', { sens });
    if (sortie) {
      sortie.addEventListener('finish', () => rendreBarre(), { once: true });
      rendreFil();
      return;
    }
  }
  rendre();
});

// ── Les réglages ───────────────────────────────────────────────────────────

function charger() {
  try {
    return valider(JSON.parse(localStorage.getItem('didascalie.reglages') || '{}'));
  } catch {
    return valider({});
  }
}

function enregistrer() {
  try {
    localStorage.setItem('didascalie.reglages', JSON.stringify(reglages));
  } catch {
    /* navigation privée, ou stockage refusé : les réglages tiennent la session. */
  }
}

function majReglage(cle, valeur) {
  reglages = valider({ ...reglages, [cle]: valeur });
  enregistrer();
  rendre();
  ouvrirReglages(true);
}

function ouvrirReglages(rafraichir = false) {
  let voile = document.querySelector('.voile');
  let tiroir = document.querySelector('.tiroir');
  if (!voile) {
    voile = h('div', { class: 'voile', 'on:click': fermerReglages });
    document.body.appendChild(voile);
  }
  if (tiroir) tiroir.remove();

  tiroir = h('div', { class: 'tiroir', role: 'dialog', 'aria-label': 'Réglages des réponses' }, [
    h('button', { class: 'fermer', 'aria-label': 'Fermer', 'on:click': fermerReglages }, [icone('croix')]),
    h('h2', { texte: 'Réponses' }),
    h('p', { class: 'note', texte: 'Comment vous répondez, et ce que vous voyez bouger.' }),
  ]);

  for (const groupe of FORMULAIRE) {
    const g = h('div', { class: 'groupe' }, [
      h('h3', { texte: groupe.titre }),
      h('p', { class: 'note', texte: groupe.note }),
    ]);
    for (const champ of groupe.champs) g.appendChild(rendreChampReglage(champ));
    if (groupe.titre === 'Animation') g.appendChild(rendreEssai());
    tiroir.appendChild(g);
  }
  document.body.appendChild(tiroir);
  if (!rafraichir) tiroir.querySelector('.fermer')?.focus();
}

function rendreChampReglage(champ) {
  const bloc = h('div', { class: 'champ-reglage' });

  if (champ.bascule) {
    const on = reglages[champ.cle] === true;
    bloc.appendChild(
      h('button', {
        class: `bascule${on ? ' on' : ''}`,
        role: 'switch',
        'aria-checked': on ? 'true' : 'false',
        'on:click': () => majReglage(champ.cle, !on),
      }, [
        h('span', { class: 'cx' }, [
          h('div', { class: 'lib', texte: champ.libelle }),
          champ.note ? h('div', { class: 'note', texte: champ.note }) : null,
        ]),
        h('span', { class: 'piste' }, [h('i')]),
      ]),
    );
    return bloc;
  }

  bloc.appendChild(h('div', { class: 'lib', texte: champ.libelle }));
  if (champ.note) bloc.appendChild(h('p', { class: 'note', texte: champ.note }));

  if (champ.curseur) {
    const val = reglages[champ.cle];
    const sortie = h('span', { class: 'valeur', texte: `${Math.round(val * 100)} %` });
    const curseur = h('input', {
      class: 'curseur',
      type: 'range',
      'aria-label': champ.libelle,
      'on:input': (ev) => {
        sortie.textContent = `${Math.round(Number(ev.target.value) * 100)} %`;
      },
      'on:change': (ev) => majReglage(champ.cle, Number(ev.target.value)),
    });
    curseur.min = String(champ.curseur.min);
    curseur.max = String(champ.curseur.max);
    curseur.step = String(champ.curseur.pas);
    curseur.value = String(val);
    bloc.appendChild(curseur);
    bloc.appendChild(sortie);
    return bloc;
  }

  const court = champ.options.every((o) => !o.note);
  const liste = h('div', { class: `options${court ? ' rangee' : ''}` });
  for (const o of champ.options) {
    const choisie = reglages[champ.cle] === o.valeur;
    liste.appendChild(
      h('button', {
        class: `option${choisie ? ' choisie' : ''}`,
        role: 'radio',
        'aria-checked': choisie ? 'true' : 'false',
        'on:click': () => majReglage(champ.cle, o.valeur),
      }, [
        h('span', { class: 'puce' }),
        h('span', { class: 'cx' }, [
          h('span', { class: 'nm', texte: o.nom }),
          o.note ? h('span', { class: 'nt', texte: o.note }) : null,
        ]),
      ]),
    );
  }
  bloc.appendChild(liste);
  return bloc;
}

/** De quoi sentir l'allure choisie sans fermer les réglages. */
function rendreEssai() {
  const cible = h('span', { class: 'cible' });
  return h('div', { class: 'essai' }, [
    cible,
    h('button', {
      texte: 'Voir ce que ça donne',
      'on:click': () => {
        moteur.jouer(cible, 'reponseSaccroche');
        if (moteur.calme) dire('Allure « Aucune » : rien ne bouge.');
      },
    }),
  ]);
}

function fermerReglages() {
  document.querySelector('.voile')?.remove();
  document.querySelector('.tiroir')?.remove();
  document.getElementById('bouton-reglages')?.focus();
}

// ── Mise en route ──────────────────────────────────────────────────────────

function horloge(s) {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Une onde stable pour un passage donné : elle ne doit pas frémir à chaque rendu. */
function ondes(graine, n) {
  const barres = [];
  let x = (graine + 1) * 9781;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const hauteur = 5 + ((x >> 8) % 14);
    const barre = h('i');
    barre.style.height = `${hauteur}px`;
    barres.push(barre);
  }
  return barres;
}

document.getElementById('bouton-reglages').addEventListener('click', () => ouvrirReglages());
document.getElementById('bouton-peau').addEventListener('click', () => {
  const nuit = document.documentElement.dataset.peau === 'nuit';
  document.documentElement.dataset.peau = nuit ? 'jour' : 'nuit';
});

construireLeFil();
rendre();

// Un message de Testeur arrive, et se découpe selon le réglage.
const MESSAGES_A_VENIR = [
  ['Pour dimanche, on part vers dix heures.', 'J’ai réservé la table du fond.', 'Tu peux prévenir ta sœur ?'],
  ['Le plombier passe mardi matin.', 'Il faut quelqu’un à la maison.', 'Tu es là, ou je m’arrange ?', 'Et on lui laisse la clé où ?'],
  ['J’ai trouvé le cadeau.', 'On partage à trois ?'],
];
let indexMessage = 0;

async function arriveeDunMessage() {
  const passages = MESSAGES_A_VENIR[indexMessage % MESSAGES_A_VENIR.length];
  indexMessage++;
  const id = `arrive${indexMessage}`;
  const maintenant = new Date();
  messages.set(id, {
    id,
    voix: 'texte',
    auteurId: LUI,
    heure: `${maintenant.getHours()}:${String(maintenant.getMinutes()).padStart(2, '0')}`,
    passages: passages.map((texte) => ({ debut: 0, fin: 0, texte })),
  });
  rendre();

  const position = [...messages.keys()].indexOf(id);
  const bloc = $fil.querySelectorAll('.msg')[position];
  if (!bloc) return;
  bloc.scrollIntoView({ block: 'end', behavior: moteur.calme ? 'auto' : 'smooth' });

  if (reglages.decoupe === 'goutte') {
    // L'animation de l'app, non reproduite ici : le message apparaît, c'est tout.
    dire(`Message de Testeur, ${passages.length} passages. La goutte est l’animation de l’app ; elle n’est pas reproduite dans cette démonstration.`);
    return;
  }
  dire(`Message de Testeur, ${passages.length} passages.`);
  await jouerDecoupe(moteur, bloc, reglages.decoupe);
}

document.getElementById('bouton-message')?.addEventListener('click', () => {
  arriveeDunMessage();
});

// Une frappe de Testeur, pour montrer la ligne de l'idée 1.
document.getElementById('bouton-frappe').addEventListener('click', () => {
  frappesDesAutres = [
    { id: 'f1', personneId: LUI, voix: 'enregistre', messageId: 'texte1', rang: 2, perimeA: Date.now() + 4000 },
  ];
  rendreBarre();
  const bulle = $fil.querySelectorAll('.msg')[0]?.querySelectorAll('.bulle')[2];
  if (bulle) {
    bulle.classList.add('vise-ambre', 'vise');
    moteur.jouer(bulle, 'anneau');
  }
  setTimeout(() => {
    frappesDesAutres = [];
    bulle?.classList.remove('vise-ambre', 'vise');
    rendreBarre();
  }, 4000);
});

console.info(
  '%cDidascalie — réponses inline',
  'font:600 13px system-ui;color:#5A7A5E',
  '\nLe moteur est dans src/, l’interface dans ui/. Les réglages changent tout à chaud.',
);
