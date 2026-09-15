/**
 * Le moteur d'animation.
 *
 * Trois exigences, dans cet ordre :
 *
 * 1. **Ne jamais déplacer ce qu'un pouce vise.** L'idée 1, règle 5 :
 *    « Le passage visé s'allume d'un anneau, **jamais d'un déplacement** :
 *    rien ne bouge sous le pouce. » Le moteur refuse donc toute image-clé qui
 *    toucherait à la mise en page (`width`, `top`, `margin`, `padding`…). Ce
 *    n'est pas une convention : c'est vérifié, et ça lève.
 *
 * 2. **Tenir 60 images par seconde sur un téléphone d'entrée de gamme.** Les
 *    propriétés autorisées sont celles que le compositeur sait animer sans
 *    repasser par la mise en page : `transform`, `opacity`, et une poignée de
 *    propriétés de peinture sur de très petites surfaces.
 *
 * 3. **Disparaître quand on le lui demande.** « Animations réduites » du
 *    système, allure « Aucune », ou intensité à zéro : le moteur renvoie `null`
 *    et l'appelant n'a rien de spécial à faire — l'état final est posé
 *    immédiatement dans tous les cas.
 *
 * @module motion/engine
 */

import { allure, doser } from './presets.js';
import * as CHORE from './choreography.js';

/**
 * Ce que le compositeur sait faire seul. `box-shadow`, `outline-color` et
 * `background-color` repeignent sans remettre en page : tolérés, mais réservés
 * à de petites surfaces (un rond de 20 px, une ligne de 1 px).
 */
const PROPRIETES_SURES = new Set([
  'transform', 'opacity', 'filter', 'backdropFilter',
  'backgroundColor', 'color', 'borderColor', 'outlineColor', 'boxShadow',
  'clipPath', 'strokeDashoffset', 'strokeOpacity', 'offset', 'easing', 'composite',
]);

/** Tout ce qui, animé, forcerait une remise en page — donc ferait bouger un passage. */
const INTERDITES = /^(width|height|top|left|right|bottom|margin|padding|inset|font|line|flex|grid|gap|border[A-Z]?[a-z]*Width|translate|rotate|scale)/;

/**
 * Vérifie une chorégraphie. Actif en permanence : le coût est d'une boucle sur
 * trois objets, et le bénéfice est qu'une règle de la maison ne peut pas être
 * enfreinte par inadvertance six mois plus tard.
 *
 * Exporté afin qu'une nouvelle chorégraphie puisse être passée au banc d'essai
 * sans navigateur — c'est le genre de règle qu'on veut voir échouer dans
 * l'intégration continue, pas sur le téléphone de quelqu'un.
 *
 * @param {string} nom
 * @param {Keyframe[]} images
 */
export function verifier(nom, images) {
  for (const image of images) {
    for (const prop of Object.keys(image)) {
      if (PROPRIETES_SURES.has(prop)) continue;
      if (INTERDITES.test(prop)) {
        throw new Error(
          `didascalie/motion: la chorégraphie « ${nom} » anime « ${prop} », qui remet en page. ` +
          `Rien ne doit bouger sous le pouce (idée 1, règle 5). Utilisez transform.`,
        );
      }
      throw new Error(`didascalie/motion: propriété non autorisée « ${prop} » dans « ${nom} ».`);
    }
  }
}

/** Le système demande-t-il moins d'animation ? */
export function systemeDemandeCalme() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export class Moteur {
  /**
   * @param {() => {allure:string, intensiteAnimation:number, suivreLeSysteme:boolean}} reglages
   */
  constructor(reglages) {
    this._reglages = reglages;
    /** @type {WeakMap<Element, Map<string, Animation>>} une animation par (élément, nom) */
    this._enCours = new WeakMap();
  }

  /**
   * L'allure effective, après arbitrage entre le système et les réglages.
   *
   * « Suivre le système » est le défaut. Quelqu'un qui a activé « animations
   * réduites » pour des raisons vestibulaires ne devrait pas avoir à le
   * redire ici. Mais le réglage permet de passer outre dans les deux sens :
   * c'est son appareil.
   */
  allureEffective() {
    const r = this._reglages();
    if (r.suivreLeSysteme !== false && systemeDemandeCalme()) return allure('aucune');
    return doser(allure(r.allure), r.intensiteAnimation ?? 1);
  }

  get calme() {
    return this.allureEffective().id === 'aucune';
  }

  /**
   * Joue une chorégraphie nommée sur un élément.
   *
   * @param {Element|null|undefined} el
   * @param {keyof typeof CHORE} nom
   * @param {object} [params]
   * @returns {Animation|null} null quand l'allure est « Aucune »
   */
  jouer(el, nom, params = {}) {
    if (!el || typeof el.animate !== 'function') return null;
    const a = this.allureEffective();
    if (a.id === 'aucune') return null;

    const brute = CHORE[nom];
    if (typeof brute !== 'function') {
      throw new Error(`didascalie/motion: chorégraphie inconnue « ${String(nom)} ».`);
    }
    // Toutes les chorégraphies ont la même forme ; certaines ignorent simplement
    // leur second argument.
    const fabrique = /** @type {(a: import('./presets.js').Allure, p?: object) => import('./choreography.js').Plan} */ (brute);
    const plan = fabrique(a, params);
    if (!plan || !plan.images.length || !plan.options.duration) return null;
    verifier(String(nom), plan.images);

    // Une animation par (élément, nom) : rejouer remplace au lieu d'empiler.
    // Sans ça, une tête de lecture qui traverse trois frontières en une seconde
    // laisserait trois halos superposés qui s'éteignent à contretemps.
    this.arreter(el, String(nom));

    const anim = el.animate(plan.images, /** @type {KeyframeAnimationOptions} */ (plan.options));
    let parNom = this._enCours.get(el);
    if (!parNom) {
      parNom = new Map();
      this._enCours.set(el, parNom);
    }
    parNom.set(String(nom), anim);
    const oublier = () => {
      if (parNom.get(String(nom)) === anim) parNom.delete(String(nom));
    };
    anim.addEventListener('finish', oublier, { once: true });
    anim.addEventListener('cancel', oublier, { once: true });
    return anim;
  }

  /** Arrête une chorégraphie en cours sur cet élément (toutes, si `nom` est omis). */
  arreter(el, nom) {
    const parNom = this._enCours.get(el);
    if (!parNom) return;
    if (nom === undefined) {
      for (const anim of parNom.values()) anim.cancel();
      parNom.clear();
      return;
    }
    const anim = parNom.get(nom);
    if (anim) {
      anim.cancel();
      parNom.delete(nom);
    }
  }
}
