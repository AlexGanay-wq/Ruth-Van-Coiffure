/**
 * La découpe d'un message qui arrive — les alternatives, sur les trois matières.
 *
 * Un message arrive d'un bloc, et devient des passages. **La goutte**, qui est
 * l'animation de l'app, n'est pas ici : elle vit dans le code de Didascalie et
 * reste la valeur par défaut du réglage. Ce module joue les trois alternatives
 * quand quelqu'un en a choisi une dans les réglages : le point qui devient le
 * rond, la respiration, et le silence qui s'écarte.
 *
 * Chacune a une **cause** — la chose qui coupe, rendue visible — et une
 * découpe qui n'a rien à dire dans une matière n'y est pas jouée de force :
 * elle est traduite (`dialecte`, dans les réglages). Il n'y a pas de
 * ponctuation dans un son ; sur un vocal ou une vidéo, le point devient le
 * silence, parce que c'est le silence qui a coupé.
 *
 * Les trois matières partagent le même geste, chacune dans son axe : les
 * phrases d'un texte et les passages d'un vocal s'empilent (l'écart s'ouvre
 * vers le bas), les images d'une vidéo se suivent en rangée (l'écart s'ouvre
 * vers la droite). Tout respecte la règle du moteur : rien ne remet en page.
 * Les passages sont déjà posés à leur place ; l'animation part d'un décalage
 * et le rejoint. Les éléments transitoires (le point qui vole, la lueur, le
 * souffle, l'étiquette de l'écart) sont ajoutés le temps du geste, puis retirés.
 *
 * @module ui/decoupe
 */

import { verifier } from '../src/motion/engine.js';
import { dialecte } from '../src/settings/schema.js';
import { direLeSilence } from '../src/model/passages.js';
import { h } from './dom.js';

/** L'espace entre deux passages au repos — le même dans les trois matières. */
const ECART = 6;

/**
 * Où trouver les passages et leur surface, par matière. La *surface* est ce
 * que la lueur parcourt et où le souffle bat : la bulle d'une phrase, la bande
 * d'un passage parlé, le cadre d'une image.
 */
const MATIERES = {
  texte: { rangs: ':scope > .passage', surface: '.bulle', axe: 'y' },
  vocal: { rangs: '.rail > .passage', surface: '.segment', axe: 'y' },
  video: { rangs: '.vignettes > .vignette', surface: '.cadre', axe: 'x' },
};

/**
 * Joue la découpe choisie sur un message fraîchement rendu.
 *
 * @param {import('../src/motion/engine.js').Moteur} moteur
 * @param {Element} msgEl le bloc `.msg`
 * @param {string} nom la découpe **choisie** ; la découpe **jouée** en découle par la matière
 * @param {{matiere?:'texte'|'vocal'|'video', pauses?:(number|null|undefined)[]}} [opts]
 *   `pauses[k]` : la pause, en secondes, qui a coupé entre les passages k et
 *   k+1 — ou rien quand elle n'a pas été mesurée. L'écart la dit en toutes
 *   lettres dans une pile (« 0,9 s de silence »), en bref dans une rangée
 *   d'images (« 0,9 s »), où six pixels d'écart ne logent pas une phrase.
 * @returns {Promise<string|null>} la découpe jouée, ou null si rien n'a joué
 */
export async function jouerDecoupe(moteur, msgEl, nom, opts = {}) {
  const matiere = opts.matiere ?? 'texte';
  const forme = MATIERES[matiere] ?? MATIERES.texte;
  const joue = dialecte(nom, matiere);
  const fabrique = FABRIQUES[joue];
  if (!fabrique || !msgEl) return null;
  const a = moteur.allureEffective();
  if (a.id === 'aucune') return null;

  const rangs = Array.from(msgEl.querySelectorAll(forme.rangs));
  if (rangs.length < 2) return null;

  // L'unité de temps suit l'allure et l'intensité : « Sobre » coupe plus vite.
  const u = Math.max(120, a.durees.ample);
  const court = forme.axe === 'x';
  await fabrique({
    rangs,
    u,
    axe: forme.axe,
    surface: (rang) => rang.querySelector(forme.surface),
    pauses: (opts.pauses ?? []).map((s) => direLeSilence(typeof s === 'number' ? s : undefined, { court })),
    ressort: a.courbes.ressort,
    entree: a.courbes.entree,
  });
  return joue;
}

// ── Outils ────────────────────────────────────────────────────────────────

/** Lance une animation vérifiée, et renvoie sa promesse de fin. */
function anim(el, nom, images, options) {
  verifier(nom, images);
  const a = el.animate(images, { fill: 'both', ...options });
  return a.finished.catch(() => {});
}

/** La position fermée d'un passage : collé au précédent, dans l'axe de la matière. */
const ferme = (axe, i) => (axe === 'x' ? `translateX(${-ECART * i}px)` : `translateY(${-ECART * i}px)`);

const rond = (rang) => rang.querySelector('.rond');

/**
 * 🔴 LA COURBE VIT DANS L'IMAGE, JAMAIS SUR L'ANIMATION.
 *
 * Mesuré ici le 16 septembre en pause-et-cherche, et dans l'app le 15 : avec
 * `easing` posé sur l'animation entière, WAAPI courbe le TEMPS de toute
 * l'itération, et les décalages des images sont lus dans ce temps courbé. Un
 * rond qui devait naître à 560 ms était déjà plein à 560 ms ; une coupe
 * s'ouvrait avant que la lueur ait fini de lire la phrase. Toutes les
 * animations de ce fichier sont donc linéaires, et chaque segment qui bouge
 * porte sa courbe sur son image de DÉPART.
 */

/** Un rond qui naît : de rien à sa taille, à l'instant `debut` du geste. */
function rondNait(el, D, debut, ressort) {
  if (!el) return Promise.resolve();
  const d = Math.min(1, debut);
  return anim(el, 'rond-nait', [
    { opacity: 0, transform: 'scale(.4)', offset: 0 },
    { opacity: 0, transform: 'scale(.4)', offset: d, easing: ressort },
    { opacity: 1, transform: 'scale(1.06)', offset: Math.min(1, d + 0.16), easing: 'ease-out' },
    { opacity: 1, transform: 'scale(1)', offset: 1 },
  ], { duration: D, easing: 'linear' });
}

/** Un décalage [0,1] sur la durée D, arrondi pour que deux images égales le restent. */
const off = (t, D) => Math.min(1, Math.max(0, Math.round((t / D) * 10000) / 10000));

// ── Les trois causes ──────────────────────────────────────────────────────

const FABRIQUES = {
  /**
   * Le point devient le rond — la ponctuation qui finit la phrase quitte sa place.
   *
   * Le point final de chaque phrase se soulève, traverse la ligne vers la
   * marge, et s'ouvre en rond. La phrase n'a plus de fin : elle a une question.
   * C'est la thèse de l'idée 2 — « quatre passages : quatre questions, même
   * celles qui n'ont pas de point d'interrogation » — sans un mot de légende.
   *
   * Texte seulement : sur un média, `dialecte` l'a déjà traduit en silence.
   */
  async point({ rangs, u, axe, surface, ressort }) {
    const D = Math.round(u * 3.8);
    const pas = Math.round(u * 0.68);
    const vols = [];
    const travaux = [];

    rangs.forEach((rang, i) => {
      const r = rond(rang);
      const b = surface(rang);
      if (!r || !b) return;
      const rb = r.getBoundingClientRect();
      const bb = b.getBoundingClientRect();
      // D'où part le point : le bout de la phrase, juste avant le bord droit.
      const dx = bb.right - 12 - (rb.left + rb.width / 2);
      const dy = bb.top + bb.height / 2 - (rb.top + rb.height / 2);

      const vol = h('span', { class: 'dsc-vol', 'aria-hidden': 'true' }, [h('i')]);
      rang.appendChild(vol);
      vols.push(vol);
      const delay = i * pas;

      travaux.push(anim(vol, 'point-vol', [
        { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(1)`, offset: 0, easing: 'ease-out' },
        { opacity: 1, transform: `translate(${dx}px,${dy - 4}px) scale(1.5)`, offset: 0.1, easing: 'cubic-bezier(.3,.9,.3,1)' },
        { opacity: 1, transform: 'translate(0,0) scale(1.5)', offset: 0.58, easing: 'ease-out' },
        { opacity: 1, transform: 'translate(0,0) scale(3.6)', offset: 0.72, easing: 'linear' },
        { opacity: 0, transform: 'translate(0,0) scale(4)', offset: 0.86 },
        { opacity: 0, transform: 'translate(0,0) scale(4)', offset: 1 },
      ], { duration: D, delay, easing: 'linear' }));

      travaux.push(anim(r, 'point-rond', [
        { opacity: 0, transform: 'scale(.3)', offset: 0 },
        { opacity: 0, transform: 'scale(.3)', offset: 0.62, easing: ressort },
        { opacity: 1, transform: 'scale(1.08)', offset: 0.78, easing: 'ease-out' },
        { opacity: 1, transform: 'scale(1)', offset: 1 },
      ], { duration: D, delay, easing: 'linear' }));

      travaux.push(anim(rang, 'point-passage', [
        { transform: ferme(axe, i), offset: 0 },
        { transform: ferme(axe, i), offset: 0.4, easing: 'cubic-bezier(.2,.8,.2,1)' },
        { transform: 'translate(0,0)', offset: 1 },
      ], { duration: D, delay, easing: 'linear' }));
    });

    await Promise.all(travaux);
    vols.forEach((v) => v.remove());
  },

  /**
   * La respiration — une voix lit, et reprend son souffle.
   *
   * Une lueur parcourt le passage à la vitesse d'une voix. Au bout, elle
   * s'arrête : un petit rond bat une fois — le souffle — et c'est là que le
   * bloc se coupe. Les vocaux sont déjà découpés aux pauses ; le texte se
   * découpe *comme s'il était lu*, et une image comme si on la regardait :
   * la même règle pour les trois matières. Une lueur qui lit « à la vitesse
   * d'une voix » est encore plus juste quand c'est vraiment une voix.
   */
  async respiration({ rangs, u, axe, surface, entree }) {
    const n = rangs.length;
    const D = Math.round(u * 2.1 * n);
    const part = 1 / n;
    const transitoires = [];
    const travaux = [];

    rangs.forEach((rang, i) => {
      const b = surface(rang);
      if (!b) return;
      const debut = i * part;
      const fin = debut + part * 0.85;

      // La lueur, dans la surface, coupée à ses coins.
      const guide = h('span', { class: 'dsc-guide', 'aria-hidden': 'true' }, [h('i')]);
      b.appendChild(guide);
      transitoires.push(guide);
      travaux.push(anim(guide.firstElementChild, 'resp-lueur', [
        { opacity: 0, transform: 'translateX(-100%)', offset: 0 },
        { opacity: 0, transform: 'translateX(-100%)', offset: Math.max(0, debut - 0.001) },
        { opacity: 1, transform: 'translateX(-100%)', offset: debut },
        { opacity: 1, transform: 'translateX(170%)', offset: fin },
        { opacity: 0, transform: 'translateX(170%)', offset: Math.min(1, fin + 0.01) },
        { opacity: 0, transform: 'translateX(170%)', offset: 1 },
      ], { duration: D, easing: 'linear' }));

      // Le souffle, au bout de chaque passage sauf le dernier — là où la coupe
      // va tomber : à droite d'une phrase, sous une image.
      if (i < n - 1) {
        const souffle = h('i', { class: `dsc-souffle ${axe}`, 'aria-hidden': 'true' });
        b.appendChild(souffle);
        transitoires.push(souffle);
        travaux.push(anim(souffle, 'resp-souffle', [
          { opacity: 0, transform: 'scale(.4)', offset: 0 },
          { opacity: 0, transform: 'scale(.4)', offset: Math.max(0, fin - 0.01), easing: 'ease-out' },
          { opacity: 1, transform: 'scale(1.2)', offset: Math.min(1, fin + 0.03), easing: 'ease-out' },
          { opacity: 0, transform: 'scale(1.6)', offset: Math.min(1, fin + 0.08) },
          { opacity: 0, transform: 'scale(1.6)', offset: 1 },
        ], { duration: D, easing: 'linear' }));
      }

      // La coupe tombe sur le souffle : le passage i s'écarte d'un cran à la
      // fin de chaque passage qui le précède.
      const images = [{ transform: ferme(axe, i), offset: 0 }];
      for (let k = 0; k < i; k++) {
        const finK = k * part + part * 0.85;
        images.push({ transform: ferme(axe, i - k), offset: finK, easing: entree });
        images.push({ transform: ferme(axe, i - k - 1), offset: Math.min(1, finK + part * 0.14) });
      }
      images.push({ transform: 'translate(0,0)', offset: 1 });
      travaux.push(anim(rang, 'resp-passage', images, { duration: D, easing: 'linear' }));

      // Le rond du premier passage est là dès le début ; les autres naissent au souffle.
      const r = rond(rang);
      if (r) {
        const naissance = i === 0 ? 0 : (i - 1) * part + part * 0.85;
        travaux.push(rondNait(r, D, naissance, entree));
      }
    });

    await Promise.all(travaux);
    transitoires.forEach((t) => t.remove());
  },

  /**
   * Le silence s'écarte — rien ne casse, quelque chose s'écarte.
   *
   * Née d'un défaut mesuré dans l'app le 15 septembre : sur un vocal, le point
   * tombait de nulle part. Ce qui coupe un vocal, c'est la pause — alors c'est
   * elle qu'on montre. L'écart s'ouvre là où la voix s'est tue, sans rupture,
   * sans rebond ; et pendant qu'il s'ouvre, il **dit sa durée** (« 0,9 s de
   * silence ») : la cause de la coupe, nommée à l'endroit exact où elle a coupé.
   * Sur un texte, rien n'a été mesuré : l'écart s'ouvre sans étiquette. C'est
   * aussi la plus calme des découpes, pour qui la goutte donne le mal de mer.
   *
   * Les temps sont ceux de l'app (PAS 380, OUVERTURE 360, FIN 260, MESURE 700
   * à l'allure de la maison), et PAS ≥ OUVERTURE : deux écarts ne s'ouvrent
   * jamais en même temps sur le même passage, les images restent monotones.
   */
  async silence({ rangs, u, axe, pauses, entree }) {
    const n = rangs.length;
    const f = u / 340;
    const PAS = Math.round(380 * f);
    const OUVERTURE = Math.round(360 * f);
    const FIN = Math.round(260 * f);
    const MESURE = Math.round(700 * f);
    const ouvre = (k) => k * PAS;
    const D = ouvre(n - 2) + OUVERTURE + FIN;
    const transitoires = [];
    const travaux = [];
    const courbe = 'cubic-bezier(.25,.1,.25,1)';

    rangs.forEach((rang, r) => {
      // La courbe vit dans l'image, jamais sur l'animation : avec `easing` sur
      // l'animation entière, le temps de toute l'itération serait courbé, et
      // l'écart 0 s'ouvrirait avant son heure pendant que l'étiquette, linéaire,
      // serait encore en attente.
      const images = [{ transform: ferme(axe, r), offset: 0 }];
      for (let k = 0; k < r; k++) {
        images.push({ transform: ferme(axe, r - k), offset: off(ouvre(k), D), easing: courbe });
        images.push({ transform: ferme(axe, r - k - 1), offset: off(ouvre(k) + OUVERTURE, D) });
      }
      images.push({ transform: 'translate(0,0)', offset: 1 });
      travaux.push(anim(rang, 'silence-passage', images, { duration: D, easing: 'linear' }));

      // Le rond du premier passage est là ; les autres naissent quand leur écart s'ouvre.
      const ro = rond(rang);
      if (ro) {
        const naissance = r === 0 ? 0 : off(ouvre(r - 1) + OUVERTURE * 0.5, D);
        travaux.push(rondNait(ro, D, naissance, entree));
      }

      // L'étiquette de l'écart qui précède ce passage : elle apparaît quand
      // l'écart est à moitié ouvert, tient le temps qu'on la lise, et s'efface.
      // Posée en absolu dans le passage du dessous, elle ne pousse rien.
      const dit = r > 0 ? pauses[r - 1] : null;
      if (dit) {
        const t0 = ouvre(r - 1);
        const etiquette = h('span', { class: `dsc-mesure ${axe}`, 'aria-hidden': 'true', texte: dit });
        rang.appendChild(etiquette);
        transitoires.push(etiquette);
        const pose = 'translate(-50%,-50%)';
        travaux.push(anim(etiquette, 'silence-mesure', [
          { opacity: 0, transform: `${pose} scale(.8)`, offset: 0 },
          { opacity: 0, transform: `${pose} scale(.8)`, offset: off(t0 + OUVERTURE * 0.2, D), easing: 'cubic-bezier(.2,.8,.2,1)' },
          { opacity: 1, transform: `${pose} scale(1)`, offset: off(t0 + OUVERTURE * 0.7, D), easing: 'linear' },
          { opacity: 1, transform: `${pose} scale(1)`, offset: off(Math.min(t0 + OUVERTURE * 0.7 + MESURE, D - 120), D), easing: 'linear' },
          { opacity: 0, transform: `${pose} scale(1)`, offset: 1 },
        ], { duration: D, easing: 'linear' }));
      }
    });

    await Promise.all(travaux);
    transitoires.forEach((t) => t.remove());
  },
};
