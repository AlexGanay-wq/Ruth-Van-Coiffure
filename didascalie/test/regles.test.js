/**
 * Les trente règles, au banc d'essai.
 *
 * Chaque test porte le numéro de sa règle et la planche dont elle vient. Ce
 * n'est pas de la décoration : quand un de ces tests tombera dans six mois,
 * celui qui le lira saura s'il vient de casser une décision de conception ou
 * un détail d'implémentation — et pourra retrouver la planche qui l'explique.
 *
 *   node --test test/
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Etat, join, estTerminal } from '../src/kernel/lattice.js';
import { RegistreDesRonds } from '../src/model/ring.js';
import { rangVise, rangBrut, nommerRang, rangSuivant, porteDesRonds } from '../src/model/passages.js';
import { Composeur, ModeDeReponse, memeAdresse } from '../src/address/composer.js';
import { nettoyer, contenaitDuCache, enQuelquesMots } from '../src/security/text.js';
import { rangDeConfiance, laPorte, identifiant } from '../src/security/gate.js';
import { Annonceur, lireLesFrappes } from '../src/transport/presence.js';
import { valider } from '../src/settings/schema.js';
import { verifier } from '../src/motion/engine.js';
import * as CHORE from '../src/motion/choreography.js';
import { allure, doser, ALLURES, ressort } from '../src/motion/presets.js';

// ── Décors ────────────────────────────────────────────────────────────────

const VOCAL = Object.freeze({
  id: 'v1', voix: 'vocal', auteurId: 'testeur', duree: 41,
  passages: [{ debut: 0, fin: 14 }, { debut: 14, fin: 28 }, { debut: 28, fin: 41 }],
});
const SEUL = Object.freeze({
  id: 's1', voix: 'texte', auteurId: 'testeur',
  passages: [{ debut: 0, fin: 0, texte: 'Je pars dans dix minutes.' }],
});
const SANS_DECOUPE = Object.freeze({ id: 'a1', voix: 'texte', auteurId: 'testeur', passages: [] });

function composeur(reglages = {}) {
  let r = { modeDeReponse: ModeDeReponse.PAUSE_REPOND, graceFrontiereMs: 1500, ...reglages };
  const c = new Composeur({
    message: (id) => ({ v1: VOCAL, s1: SEUL, a1: SANS_DECOUPE }[id] ?? null),
    reglages: () => r,
  });
  return { c, regler: (x) => { r = { ...r, ...x }; } };
}
const cible = (c) => {
  const a = c.adresse;
  return a.kind === 'passage' ? a.rang : a.kind === 'message' ? 'message' : 'fil';
};

// ══════════════════════════════════════════════════════════════════════════
describe('Idée 2 — « Il reste deux passages » : le rond', () => {
// ══════════════════════════════════════════════════════════════════════════

  test('R2 · trois états, et pas de quatrième', () => {
    assert.deepEqual(Object.values(Etat), [0, 1, 2]);
  });

  test('R3 · toute réponse remplit le rond, quelle que soit la voix', () => {
    for (const voix of ['texte', 'vocal', 'video', 'fichier']) {
      const r = new RegistreDesRonds();
      r.observer('m', 0, 'moi', Etat.REPONDU);
      assert.equal(r.etat('m', 0, 'moi'), Etat.REPONDU, `voix ${voix}`);
    }
  });

  test('R6 · un rond plein ne se vide jamais — structurellement', () => {
    const r = new RegistreDesRonds();
    r.observer('m', 0, 'moi', Etat.REPONDU);
    r.observer('m', 0, 'moi', Etat.VIDE);
    r.observer('m', 0, 'moi', Etat.PROMIS);
    assert.equal(r.etat('m', 0, 'moi'), Etat.REPONDU);
    assert.ok(estTerminal(Etat.REPONDU));
  });

  test('R6 · le treillis est commutatif, associatif et idempotent', () => {
    for (const a of [0, 1, 2]) for (const b of [0, 1, 2]) for (const c of [0, 1, 2]) {
      assert.equal(join(a, b), join(b, a));
      assert.equal(join(join(a, b), c), join(a, join(b, c)));
      assert.equal(join(a, a), a);
    }
  });

  test('R6 · un fait corrompu venu du réseau vaut l’élément neutre', () => {
    const r = new RegistreDesRonds();
    r.observer('m', 0, 'moi', Etat.PROMIS);
    for (const pirate of [null, undefined, 'REPONDU', 99, -1, {}, NaN]) {
      r.observer('m', 0, 'moi', pirate);
    }
    assert.equal(r.etat('m', 0, 'moi'), Etat.PROMIS);
  });

  test('R7 · un message d’un seul passage n’a pas de rond', () => {
    assert.equal(porteDesRonds(SEUL), false);
    assert.equal(porteDesRonds(SANS_DECOUPE), false);
    assert.equal(porteDesRonds(VOCAL), true);
  });

  test('R8 · la ligne du bas ne paraît qu’après la première réponse', () => {
    const r = new RegistreDesRonds();
    assert.equal(r.reclamerLigneDuBas('m', 4, 'moi'), null, 'rien à l’arrivée');
    r.observer('m', 0, 'moi', Etat.REPONDU);
    assert.deepEqual(r.reclamerLigneDuBas('m', 4, 'moi'), { restants: 3, premierSansReponse: 1 });
  });

  test('R8 · elle ne paraît qu’une fois, et ne relance jamais', () => {
    const r = new RegistreDesRonds();
    r.observer('m', 0, 'moi', Etat.REPONDU);
    assert.ok(r.reclamerLigneDuBas('m', 4, 'moi'));
    assert.equal(r.reclamerLigneDuBas('m', 4, 'moi'), null);
    r.observer('m', 1, 'moi', Etat.REPONDU);
    assert.equal(r.reclamerLigneDuBas('m', 4, 'moi'), null, 'même après une nouvelle réponse');
  });

  test('R8 · un message d’un seul passage n’a pas de ligne du bas', () => {
    const r = new RegistreDesRonds();
    r.observer('s1', 0, 'moi', Etat.REPONDU);
    assert.equal(r.reclamerLigneDuBas('s1', 1, 'moi'), null);
  });

  test('R9 · l’auteur voit un bilan, jamais un reproche', () => {
    const r = new RegistreDesRonds();
    r.observer('m', 0, 'elle', Etat.REPONDU);
    r.observer('m', 1, 'elle', Etat.REPONDU);
    r.observer('m', 2, 'elle', Etat.PROMIS);
    assert.deepEqual(r.bilanAuteur('m', 4, ['elle']), { repondus: 2, promis: 1, total: 4 });
  });

  test('R10 · rien ne s’accumule : aucune horodatation n’est conservée', () => {
    const r = new RegistreDesRonds();
    r.observer('m', 0, 'moi', Etat.REPONDU);
    r.observer('m', 1, 'moi', Etat.PROMIS);
    const tout = JSON.stringify([...r._etats.entries()]);
    assert.equal(/\d{10,}/.test(tout), false, 'un horodatage se serait glissé dans le registre');
  });

  test('groupe · le décompte donne des nombres, jamais la liste des absents', () => {
    const r = new RegistreDesRonds();
    r.observer('m', 0, 'camille', Etat.REPONDU);
    r.observer('m', 0, 'ami', Etat.REPONDU);
    const d = r.decompte('m', 0, ['camille', 'ami', 'lou', 'zoe', 'moi'], 'moi');
    assert.deepEqual(d, { repondu: 2, promis: 0, total: 5, moiAussi: false });
    assert.equal('quiNaPasRepondu' in d, false);
  });

  test('« rangé » est local et réversible, contrairement à l’état partagé', () => {
    const r = new RegistreDesRonds();
    assert.equal(r.basculerRange('m', 0), true);
    assert.equal(r.estRange('m', 0), true);
    assert.equal(r.basculerRange('m', 0), false, 'seul « rangé » se défait');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('Idée 3 — « Le doigt sur la pause » : l’adresse', () => {
// ══════════════════════════════════════════════════════════════════════════

  test('R1 · le composeur suit le passage en cours', () => {
    const { c } = composeur();
    c.lecture('v1', 5);
    assert.equal(cible(c), 0);
    c.lecture('v1', 20);
    assert.equal(cible(c), 1);
  });

  test('R2 · l’adresse n’est jamais silencieuse', () => {
    const { c } = composeur();
    c.lecture('v1', 20);
    assert.match(c.annonce().texte, /2ᵉ passage/);
    assert.match(c.annonce({ compacte: true }).texte, /2ᵉ passage/);
  });

  test('R4 · après une réponse, la lecture reprend au passage suivant', () => {
    const { c } = composeur();
    c.lecture('v1', 5);
    assert.deepEqual(c.apresAvoirPose(), { messageId: 'v1', rangSuivant: 1 });
    assert.equal(cible(c), 1);
  });

  test('R4 · sur le dernier passage, il n’y a rien après', () => {
    const { c } = composeur();
    c.lecture('v1', 35);
    assert.deepEqual(c.apresAvoirPose(), { messageId: 'v1', rangSuivant: -1 });
  });

  test('R5 · la seconde et demie d’indulgence, aux trois instants de la planche', () => {
    const p = VOCAL.passages;
    assert.equal(rangVise(p, 22, 1500), 1, 'à 0:22 → 2ᵉ');
    assert.equal(rangVise(p, 28.9, 1500), 1, 'à 0:28,9 → encore le 2ᵉ');
    assert.equal(rangVise(p, 30.5, 1500), 2, 'à 0:30,5 → le 3ᵉ');
    assert.equal(rangVise(p, 33, 1500), 2, 'à 0:33 → le 3ᵉ');
  });

  test('R5 · l’indulgence ne fabrique jamais un passage -1', () => {
    assert.equal(rangVise(VOCAL.passages, 0.2, 1500), 0);
  });

  test('R5 · l’indulgence ne ramène pas en deçà d’un passage choisi exprès', () => {
    const { c } = composeur();
    c.lecture('v1', 0, { saut: true });
    c.apresAvoirPose();
    c.lecture('v1', 14, { saut: true });
    assert.equal(cible(c), 1, 'la reprise vise le 2ᵉ');
    c.lecture('v1', 14.4);
    assert.equal(cible(c), 1, 'et l’indulgence ne le renvoie pas au 1ᵉʳ');
  });

  test('R5 · réglée à zéro, l’indulgence disparaît', () => {
    const { c, regler } = composeur();
    regler({ graceFrontiereMs: 0 });
    c.lecture('v1', 28.9);
    assert.equal(cible(c), 2);
  });

  test('R6 · toucher un passage le vise, dans les trois modes', () => {
    for (const mode of Object.values(ModeDeReponse)) {
      const { c } = composeur({ modeDeReponse: mode });
      c.toucherPassage('v1', 2);
      assert.equal(cible(c), 2, `mode ${mode}`);
    }
  });

  test('R7 · toucher l’annonce rend le composeur au fil, et ça tient', () => {
    const { c } = composeur();
    c.lecture('v1', 20);
    c.toucherAnnonce();
    assert.equal(cible(c), 'fil');
    c.lecture('v1', 20.5);
    c.lecture('v1', 21);
    assert.equal(cible(c), 'fil', 'la lecture ne repose pas l’adresse par-dessus');
    assert.equal(c.annonce(), null);
  });

  test('R7 · retoucher un passage lève le loquet', () => {
    const { c } = composeur();
    c.lecture('v1', 20);
    c.toucherAnnonce();
    c.toucherPassage('v1', 2);
    assert.equal(cible(c), 2);
    c.lecture('v1', 30);
    assert.equal(cible(c), 2);
  });

  test('R8 · à la fin, l’adresse reste sur le dernier passage entendu', () => {
    const { c } = composeur();
    c.lecture('v1', 35);
    c.finDeLecture('v1');
    assert.equal(cible(c), 2);
    assert.match(c.annonce().texte, /le dernier entendu/);
  });

  test('R8 · elle s’efface en quittant le message', () => {
    const { c } = composeur();
    c.lecture('v1', 35);
    c.finDeLecture('v1');
    c.quitterMessage('v1');
    assert.equal(cible(c), 'fil');
  });

  test('R9 · un message d’un seul passage vise le message entier', () => {
    const { c } = composeur();
    c.toucherPassage('s1', 0);
    assert.equal(cible(c), 'message');
    assert.match(c.annonce().texte, /ce message/);
  });

  test('R9 · un message sans découpe ne vise rien du tout', () => {
    const { c } = composeur();
    c.toucherPassage('a1', 0);
    assert.equal(cible(c), 'fil');
  });

  test('mode « toucher d’abord » : la lecture n’adresse rien', () => {
    const { c } = composeur({ modeDeReponse: ModeDeReponse.TOUCHER_DABORD });
    c.lecture('v1', 20);
    assert.equal(cible(c), 'fil');
    c.toucherPassage('v1', 1);
    assert.equal(cible(c), 1);
  });

  test('un rang hors bornes ne déplace pas l’adresse', () => {
    const { c } = composeur();
    c.toucherPassage('v1', 1);
    c.toucherPassage('v1', 99);
    c.toucherPassage('v1', -3);
    assert.equal(cible(c), 1);
  });

  test('changer de réglage prend effet sans recâblage', () => {
    const { c, regler } = composeur();
    c.lecture('v1', 28.9);
    assert.equal(cible(c), 1);
    regler({ graceFrontiereMs: 0 });
    c.lecture('v1', 28.95);
    assert.equal(cible(c), 2);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('Idée 1 — « Elle répond au 2ᵉ passage » : la ligne de frappe', () => {
// ══════════════════════════════════════════════════════════════════════════

  const ctx = (n = 1) => ({
    maintenant: 1000,
    nomDe: (id) => ({ c: 'Camille', a: 'Ami', l: 'Lou' }[id] ?? id),
    message: () => VOCAL,
  });
  const F = (p, voix, rang, perimeA = 9999) => ({ personneId: p, voix, messageId: 'v1', rang, perimeA });

  test('R1+R3 · la ligne nomme le passage **et** la voix', () => {
    assert.equal(lireLesFrappes([F('c', 'ecrit', 2)], ctx()).texte, 'Camille répond au 3ᵉ passage');
    assert.equal(lireLesFrappes([F('c', 'enregistre', 1)], ctx()).texte, 'Camille enregistre un vocal pour le 2ᵉ passage');
    assert.equal(lireLesFrappes([F('c', 'filme', 0)], ctx()).texte, 'Camille filme une réponse pour le 1ᵉʳ passage');
  });

  test('R2 · ouvrir une rangée pour lire ne s’annonce pas', () => {
    const { c } = composeur();
    c.toucherPassage('v1', 1);
    assert.equal(c.voix, null, 'viser n’est pas composer');
    c.commencerACompose('ecrit');
    assert.equal(c.voix, 'ecrit');
  });

  test('R4 · renoncer ne laisse aucune trace', () => {
    const envois = [];
    const a = new Annonceur({ publier: (x) => envois.push(x), maintenant: () => 0 });
    a.composer({ voix: 'ecrit', adresse: { kind: 'passage', messageId: 'v1', rang: 1 } });
    a.retirer();
    assert.equal(envois.at(-1), null, 'on efface, on ne pose pas une pierre tombale');
    assert.equal(envois.filter((x) => x && x.renonce).length, 0);
  });

  test('R9 · une personne on la nomme, deux aussi, trois on compte', () => {
    assert.match(lireLesFrappes([F('c', 'ecrit', 0)], ctx()).texte, /^Camille répond/);
    assert.equal(lireLesFrappes([F('c', 'ecrit', 0), F('a', 'ecrit', 2)], ctx()).texte, 'Camille et Ami répondent');
    assert.equal(
      lireLesFrappes([F('c', 'ecrit', 0), F('a', 'ecrit', 1), F('l', 'ecrit', 2)], ctx()).texte,
      '3 personnes répondent',
    );
  });

  test('R7 · la notification cite cinq mots au plus', () => {
    assert.equal(enQuelquesMots('Il faudrait aussi qu’on pense à la nappe'), 'Il faudrait aussi qu’on pense…');
    assert.equal(enQuelquesMots('Pain, vin, fromage.'), 'Pain, vin, fromage.');
  });

  test('une frappe périmée est ignorée, sans nettoyage', () => {
    assert.equal(lireLesFrappes([F('c', 'ecrit', 1, 500)], ctx()), null);
  });

  test('le rythme de frappe ne part pas sur le réseau', async () => {
    let t = 0;
    const envois = [];
    const a = new Annonceur({ publier: (x) => envois.push(x), maintenant: () => t });
    a.composer({ voix: 'ecrit', adresse: { kind: 'passage', messageId: 'v1', rang: 0 } });
    for (let i = 0; i < 40; i++) {
      a.composer({ voix: 'ecrit', adresse: { kind: 'passage', messageId: 'v1', rang: 0 } });
    }
    assert.equal(envois.length, 1, '41 frappes → un seul envoi');
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('Sécurité', () => {
// ══════════════════════════════════════════════════════════════════════════

  test('le retournement bidirectionnel est retiré', () => {
    assert.equal(nettoyer('tu peux ‮annuler‬ ?'), 'tu peux annuler ?');
    assert.equal(nettoyer('⁦a⁩'), 'a');
  });

  test('les marques LRM/RLM, elles, sont conservées', () => {
    assert.equal(nettoyer('‏שלום'), '‏שלום');
  });

  test('les caractères de largeur nulle sont retirés, les emoji composés non', () => {
    assert.equal(nettoyer('mar​que﻿'), 'marque');
    assert.equal(nettoyer('👨‍👩‍👧'), '👨‍👩‍👧');
  });

  test('le détecteur de caché ne clignote pas d’un appel à l’autre', () => {
    const p = 'a‮b';
    assert.deepEqual([contenaitDuCache(p), contenaitDuCache(p), contenaitDuCache(p)], [true, true, true]);
  });

  test('un rang venu du réseau est validé, jamais cru sur parole', () => {
    assert.deepEqual(rangDeConfiance(1, VOCAL), { rang: 1, retombe: false });
    for (const pirate of [99, -1, '2', 1.5, null, undefined, NaN, Infinity]) {
      assert.deepEqual(rangDeConfiance(pirate, VOCAL), { rang: -1, retombe: true }, `rang ${String(pirate)}`);
    }
  });

  test('sans découpe, un rang invalide ne casse rien', () => {
    assert.deepEqual(rangDeConfiance(0, SANS_DECOUPE), { rang: -1, retombe: false });
  });

  test('la Porte : aucun message ne part sans un vrai geste', () => {
    assert.equal(laPorte({ isTrusted: false, timeStamp: 0 }, { maintenant: 0 }).ouvre, false);
    assert.equal(laPorte(null).ouvre, false);
    assert.equal(laPorte({ isTrusted: true, timeStamp: 100 }, { maintenant: 200, focus: true }).ouvre, true);
  });

  test('la Porte refuse un geste rejoué, ou une fenêtre sans focus', () => {
    assert.equal(laPorte({ isTrusted: true, timeStamp: 0 }, { maintenant: 99999, focus: true }).motif, 'geste-rejoue');
    assert.equal(laPorte({ isTrusted: true, timeStamp: 100 }, { maintenant: 200, focus: false }).motif, 'fenetre-sans-focus');
  });

  test('les identifiants viennent du générateur cryptographique', () => {
    const vus = new Set();
    for (let i = 0; i < 20000; i++) vus.add(identifiant(16));
    assert.equal(vus.size, 20000);
  });

  test('un texte démesuré est tronqué', () => {
    assert.equal(nettoyer('a'.repeat(50000)).length, 8192);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('Réglages et animation', () => {
// ══════════════════════════════════════════════════════════════════════════

  test('des réglages abîmés retombent champ par champ, sans tout perdre', () => {
    const r = valider({ modeDeReponse: 'pirate', allure: 'papier', intensiteAnimation: 42 });
    assert.equal(r.modeDeReponse, ModeDeReponse.PAUSE_REPOND);
    assert.equal(r.allure, 'papier', 'le champ valide survit');
    assert.equal(r.intensiteAnimation, 1);
  });

  test('aucun réglage ne permet de taire l’adresse', () => {
    const r = valider({ annonceCompacte: true });
    assert.equal('annonceMuette' in r, false);
    const { c } = composeur();
    c.lecture('v1', 20);
    assert.ok(c.annonce({ compacte: true }).texte.length > 0);
  });

  test('l’appui long pour parler n’est pas réintroduit par un réglage', () => {
    assert.equal(Object.values(ModeDeReponse).some((m) => /appui|long|talkie/i.test(m)), false);
  });

  test('intensité à zéro équivaut à l’allure « Aucune »', () => {
    assert.equal(doser(allure('ample'), 0).id, 'aucune');
    assert.equal(doser(allure('didascalie'), 0.5).durees.base, Math.round(ALLURES.didascalie.durees.base * 0.5));
  });

  test('le ressort part de zéro, finit à un, et dépasse en chemin', () => {
    const { easing } = ressort({ raideur: 190, amortissement: 22 });
    const pts = easing.slice(7, -1).split(',').map(Number);
    assert.equal(pts[0], 0);
    assert.equal(pts.at(-1), 1);
    assert.ok(Math.max(...pts) > 1, 'sans dépassement, ce n’est pas un ressort');
  });

  test('aucune chorégraphie ne remet en page — rien ne bouge sous le pouce', () => {
    for (const nom of Object.keys(CHORE)) {
      const plan = CHORE[nom](allure('didascalie'), { longueur: 24, dureeMs: 5000, sens: 1, index: 0 });
      assert.doesNotThrow(() => verifier(nom, plan.images), `chorégraphie ${nom}`);
    }
  });

  test('le garde-fou attrape bien ce qui remettrait en page', () => {
    for (const prop of ['height', 'width', 'marginTop', 'top', 'padding', 'fontSize']) {
      assert.throws(() => verifier('essai', [{ [prop]: '1px' }]), /remet en page|non autorisée/, prop);
    }
  });

  test('les cinq allures sont proposées, « Aucune » comprise', () => {
    assert.deepEqual(Object.keys(ALLURES), ['didascalie', 'sobre', 'ample', 'papier', 'aucune']);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe('Détails qui mordent', () => {
// ══════════════════════════════════════════════════════════════════════════

  test('les rangs se disent en français, comme on parle', () => {
    assert.equal(nommerRang(0), '1ᵉʳ passage');
    assert.equal(nommerRang(1), '2ᵉ passage');
  });

  test('la recherche du rang est dichotomique et exacte aux bornes', () => {
    const p = VOCAL.passages;
    assert.equal(rangBrut(p, 0), 0);
    assert.equal(rangBrut(p, 13.999), 0);
    assert.equal(rangBrut(p, 14), 1, 'la borne appartient au passage qui commence');
    assert.equal(rangBrut(p, 41), -1, 'la fin est exclusive');
    assert.equal(rangBrut(p, -1), -1);
    assert.equal(rangBrut(p, NaN), -1);
  });

  test('rangSuivant s’arrête au bout', () => {
    assert.equal(rangSuivant(VOCAL.passages, 1), 2);
    assert.equal(rangSuivant(VOCAL.passages, 2), -1);
  });

  test('memeAdresse compare la cible, pas la raison', () => {
    const a = { kind: 'passage', messageId: 'v1', rang: 1, raison: 'lecture' };
    const b = { kind: 'passage', messageId: 'v1', rang: 1, raison: 'fin' };
    assert.equal(memeAdresse(a, b), true);
    assert.equal(memeAdresse(a, { kind: 'fil' }), false);
  });

  test('passer de « en cours » à « le dernier entendu » est bien émis', () => {
    const { c } = composeur();
    const vus = [];
    c.ecouter((a) => vus.push(a.raison));
    c.lecture('v1', 35);
    c.finDeLecture('v1');
    assert.deepEqual(vus, ['lecture', 'fin']);
  });
});
