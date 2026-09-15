/**
 * La découpe d'un message qui arrive — les alternatives.
 *
 * Un message arrive d'un bloc, et devient des passages. **La goutte**, qui est
 * l'animation de l'app, n'est pas ici : elle vit dans le code de Didascalie et
 * reste la valeur par défaut du réglage. Ce module ne joue que les quatre
 * alternatives, quand quelqu'un en a choisi une dans les réglages.
 *
 * Toutes ont une **cause** — la chose qui coupe, rendue visible — et toutes
 * respectent la règle du moteur : rien ne remet en page. Les passages sont
 * déjà posés à leur place ; l'animation part d'un décalage et le rejoint.
 * Les éléments transitoires (l'indication de scène, le point qui vole, la
 * lueur, le rang) sont ajoutés le temps du geste, puis retirés.
 *
 * @module ui/decoupe
 */

import { verifier } from '../src/motion/engine.js';
import { h } from './dom.js';

/** L'espace entre deux passages au repos — celui de `.msg` dans la feuille de style. */
const ECART = 6;

/**
 * Joue la découpe choisie sur un message fraîchement rendu.
 *
 * @param {import('../src/motion/engine.js').Moteur} moteur
 * @param {Element} msgEl le bloc `.msg`, avec ses `.passage`
 * @param {string} nom `didascalie` | `point` | `respiration` | `adresse` — tout autre nom ne joue rien
 * @returns {Promise<void>} résolue quand tout est fini et nettoyé
 */
export async function jouerDecoupe(moteur, msgEl, nom) {
  const fabrique = FABRIQUES[nom];
  if (!fabrique || !msgEl) return;
  const a = moteur.allureEffective();
  if (a.id === 'aucune') return;

  const rangs = Array.from(msgEl.querySelectorAll(':scope > .passage'));
  if (rangs.length < 2) return;

  // L'unité de temps suit l'allure et l'intensité : « Sobre » coupe plus vite.
  const u = Math.max(120, a.durees.ample);
  const ressort = a.courbes.ressort;
  const entree = a.courbes.entree;
  await fabrique({ msgEl, rangs, u, ressort, entree });
}

// ── Outils ────────────────────────────────────────────────────────────────

/** Lance une animation vérifiée, et renvoie sa promesse de fin. */
function anim(el, nom, images, options) {
  verifier(nom, images);
  const a = el.animate(images, { fill: 'both', ...options });
  return a.finished.catch(() => {});
}

/** La position fermée d'un passage : collé au précédent. */
const ferme = (i) => `translateY(${-ECART * i}px)`;

const rond = (rang) => rang.querySelector('.rond');
const bulle = (rang) => rang.querySelector('.bulle');

/** « 1ᵉʳ », « 2ᵉ » — le rang, en court. */
const rangCourt = (i) => (i === 0 ? '1ᵉʳ' : `${i + 1}ᵉ`);

/** Un rond qui naît : de rien à sa taille, à l'instant `debut` du geste. */
function rondNait(el, D, debut, ressort) {
  if (!el) return Promise.resolve();
  return anim(el, 'rond-nait', [
    { opacity: 0, transform: 'scale(.4)', offset: 0 },
    { opacity: 0, transform: 'scale(.4)', offset: debut },
    { opacity: 1, transform: 'scale(1.06)', offset: Math.min(1, debut + 0.16) },
    { opacity: 1, transform: 'scale(1)', offset: 1 },
  ], { duration: D, easing: ressort });
}

// ── Les quatre causes ─────────────────────────────────────────────────────

const FABRIQUES = {
  /**
   * La didascalie — une indication de scène s'écrit entre les phrases.
   *
   * Au théâtre, la didascalie est ce qui s'écrit entre deux répliques :
   * *(un temps)*. Ici elle apparaît entre deux passages, écarte le bloc pour se
   * faire une place, puis s'efface. La coupe reste ; l'indication a fait son
   * travail. C'est le nom de l'app, rendu visible une fois par message.
   */
  async didascalie({ msgEl, rangs, u, ressort }) {
    const D = Math.round(u * 4.4);
    const positionAvant = msgEl.style.position;
    msgEl.style.position = 'relative';

    const didas = rangs.slice(1).map((suivant, k) => {
      const el = /** @type {HTMLElement} */ (h('i', { class: 'dsc-dida', 'aria-hidden': 'true', texte: '(un temps)' }));
      el.style.top = `${/** @type {HTMLElement} */ (suivant).offsetTop - 2}px`;
      el.style.transform = `translateY(${12 * k}px)`;
      msgEl.appendChild(el);
      return el;
    });

    const travaux = [];
    rangs.forEach((rang, i) => {
      travaux.push(anim(rang, 'dida-passage', [
        { transform: ferme(i), offset: 0 },
        { transform: ferme(i), offset: 0.3 },
        { transform: `translateY(${12 * i}px)`, offset: 0.52 },
        { transform: 'translateY(0)', offset: 1 },
      ], { duration: D, easing: 'cubic-bezier(.2,.8,.2,1)' }));
      travaux.push(rondNait(rond(rang), D, 0.6, ressort));
    });
    didas.forEach((d, k) => {
      travaux.push(anim(d, 'dida-mot', [
        { opacity: 0, transform: `translateY(${12 * k}px)`, offset: 0 },
        { opacity: 0, transform: `translateY(${12 * k}px)`, offset: 0.3 },
        { opacity: 1, transform: `translateY(${12 * k}px)`, offset: 0.42 },
        { opacity: 1, transform: `translateY(${12 * k}px)`, offset: 0.64 },
        { opacity: 0, transform: `translateY(${12 * k}px)`, offset: 0.84 },
        { opacity: 0, transform: `translateY(${12 * k}px)`, offset: 1 },
      ], { duration: D, easing: 'ease-out' }));
    });

    await Promise.all(travaux);
    didas.forEach((d) => d.remove());
    msgEl.style.position = positionAvant;
  },

  /**
   * Le point devient le rond — la ponctuation qui finit la phrase quitte sa place.
   *
   * Le point final de chaque phrase se soulève, traverse la ligne vers la
   * marge, et s'ouvre en rond. La phrase n'a plus de fin : elle a une question.
   * C'est la thèse de l'idée 2 — « quatre passages : quatre questions, même
   * celles qui n'ont pas de point d'interrogation » — sans un mot de légende.
   */
  async point({ rangs, u, ressort }) {
    const D = Math.round(u * 3.8);
    const pas = Math.round(u * 0.68);
    const vols = [];
    const travaux = [];

    rangs.forEach((rang, i) => {
      const r = rond(rang);
      const b = bulle(rang);
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
        { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(1)`, offset: 0 },
        { opacity: 1, transform: `translate(${dx}px,${dy - 4}px) scale(1.5)`, offset: 0.1 },
        { opacity: 1, transform: 'translate(0,0) scale(1.5)', offset: 0.58 },
        { opacity: 1, transform: 'translate(0,0) scale(3.6)', offset: 0.72 },
        { opacity: 0, transform: 'translate(0,0) scale(4)', offset: 0.86 },
        { opacity: 0, transform: 'translate(0,0) scale(4)', offset: 1 },
      ], { duration: D, delay, easing: 'cubic-bezier(.3,.9,.3,1)' }));

      travaux.push(anim(r, 'point-rond', [
        { opacity: 0, transform: 'scale(.3)', offset: 0 },
        { opacity: 0, transform: 'scale(.3)', offset: 0.62 },
        { opacity: 1, transform: 'scale(1.08)', offset: 0.78 },
        { opacity: 1, transform: 'scale(1)', offset: 1 },
      ], { duration: D, delay, easing: ressort }));

      travaux.push(anim(rang, 'point-passage', [
        { transform: ferme(i), offset: 0 },
        { transform: ferme(i), offset: 0.4 },
        { transform: 'translateY(0)', offset: 1 },
      ], { duration: D, delay, easing: 'cubic-bezier(.2,.8,.2,1)' }));
    });

    await Promise.all(travaux);
    vols.forEach((v) => v.remove());
  },

  /**
   * La respiration — une voix lit, et reprend son souffle.
   *
   * Une lueur parcourt le texte à la vitesse d'une voix. Au bout de la phrase
   * elle s'arrête : un petit rond bat une fois — le souffle — et c'est là que
   * le bloc se coupe. Les vocaux sont déjà découpés aux pauses ; ici le texte
   * se découpe *comme s'il était lu* : la même règle pour les trois voix.
   */
  async respiration({ rangs, u, entree }) {
    const n = rangs.length;
    const D = Math.round(u * 2.1 * n);
    const part = 1 / n;
    const transitoires = [];
    const travaux = [];

    rangs.forEach((rang, i) => {
      const b = bulle(rang);
      if (!b) return;
      const debut = i * part;
      const fin = debut + part * 0.85;

      // La lueur, dans la bulle, coupée à ses coins.
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

      // Le souffle, au bout de chaque phrase sauf la dernière.
      if (i < n - 1) {
        const souffle = h('i', { class: 'dsc-souffle', 'aria-hidden': 'true' });
        b.appendChild(souffle);
        transitoires.push(souffle);
        travaux.push(anim(souffle, 'resp-souffle', [
          { opacity: 0, transform: 'scale(.4)', offset: 0 },
          { opacity: 0, transform: 'scale(.4)', offset: Math.max(0, fin - 0.01) },
          { opacity: 1, transform: 'scale(1.2)', offset: Math.min(1, fin + 0.03) },
          { opacity: 0, transform: 'scale(1.6)', offset: Math.min(1, fin + 0.08) },
          { opacity: 0, transform: 'scale(1.6)', offset: 1 },
        ], { duration: D, easing: 'ease-out' }));
      }

      // La coupe tombe sur le souffle : le passage i descend d'un cran à la
      // fin de chaque phrase qui le précède.
      const images = [{ transform: ferme(i), offset: 0 }];
      for (let k = 0; k < i; k++) {
        const finK = k * part + part * 0.85;
        images.push({ transform: `translateY(${-ECART * (i - k)}px)`, offset: finK });
        images.push({ transform: `translateY(${-ECART * (i - k - 1)}px)`, offset: Math.min(1, finK + part * 0.14) });
      }
      images.push({ transform: 'translateY(0)', offset: 1 });
      travaux.push(anim(rang, 'resp-passage', images, { duration: D, easing: entree }));

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
   * L'adresse — chaque passage est nommé au moment où il naît.
   *
   * Dans la marge, un rang s'écrit en italique — 1ᵉʳ, 2ᵉ, 3ᵉ — et le passage se
   * détache sous lui. Puis le rang se replie dans le rond, qui le garde sans le
   * montrer. L'idée 1 dit qu'une réponse annonce son adresse ; cette découpe
   * fait la même chose en sens inverse : le message distribue ses adresses.
   */
  async adresse({ rangs, u, ressort }) {
    const D = Math.round(u * 3.5);
    const pas = Math.round(u * 0.76);
    const adrs = [];
    const travaux = [];

    rangs.forEach((rang, i) => {
      const adr = h('i', { class: 'dsc-adr', 'aria-hidden': 'true', texte: rangCourt(i) });
      rang.appendChild(adr);
      adrs.push(adr);
      const delay = i * pas;

      travaux.push(anim(adr, 'adr-mot', [
        { opacity: 0, transform: 'translateX(-10px) scale(1.7)', offset: 0 },
        { opacity: 1, transform: 'translateX(0) scale(1.15)', offset: 0.22 },
        { opacity: 1, transform: 'translateX(0) scale(1)', offset: 0.5 },
        { opacity: 0, transform: 'translateX(0) scale(.35)', offset: 0.78 },
        { opacity: 0, transform: 'translateX(0) scale(.35)', offset: 1 },
      ], { duration: D, delay, easing: 'cubic-bezier(.2,.8,.2,1)' }));

      travaux.push(anim(rond(rang), 'adr-rond', [
        { opacity: 0, transform: 'scale(.4)', offset: 0 },
        { opacity: 0, transform: 'scale(.4)', offset: 0.52 },
        { opacity: 1, transform: 'scale(1.06)', offset: 0.74 },
        { opacity: 1, transform: 'scale(1)', offset: 1 },
      ], { duration: D, delay, easing: ressort }));

      travaux.push(anim(rang, 'adr-passage', [
        { transform: ferme(i), offset: 0 },
        { transform: ferme(i), offset: 0.4 },
        { transform: 'translateY(0)', offset: 1 },
      ], { duration: D, delay, easing: 'cubic-bezier(.2,.8,.2,1)' }));
    });

    await Promise.all(travaux);
    adrs.forEach((x) => x.remove());
  },
};
