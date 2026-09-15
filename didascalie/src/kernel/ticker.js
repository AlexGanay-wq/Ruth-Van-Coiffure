/**
 * Le métronome partagé.
 *
 * Un fil peut contenir vingt vocaux et dix vidéos. Si chacun ouvre sa propre
 * boucle `requestAnimationFrame`, le téléphone en tient trente — trente
 * réveils, trente lectures d'horloge, et surtout trente occasions de forcer
 * une remise en page en lisant une position juste après l'avoir écrite.
 *
 * Ici il n'y en a qu'une, et elle ne tourne que **pendant qu'il y a quelque
 * chose à lire**. Zéro abonné, zéro image par seconde : sur un fil au repos,
 * cette horloge ne coûte rien du tout, ce qui est la seule façon honnête de
 * tenir une journée de batterie.
 *
 * L'ordre est garanti : les abonnés sont appelés dans l'ordre d'inscription,
 * tous avec **le même horodatage**. Deux lecteurs ne peuvent donc pas voir deux
 * « maintenant » différents dans la même image.
 *
 * @module kernel/ticker
 */

export class Metronome {
  constructor() {
    /** @type {Set<(tMs:number, dtMs:number)=>void>} */
    this._abonnes = new Set();
    /** @type {number|null} */
    this._image = null;
    this._dernier = 0;
    this._battre = this._battre.bind(this);
  }

  /**
   * @param {(tMs:number, dtMs:number)=>void} f
   * @returns {() => void} pour se désabonner
   */
  abonner(f) {
    this._abonnes.add(f);
    this._demarrer();
    let vivant = true;
    return () => {
      if (!vivant) return;
      vivant = false;
      this._abonnes.delete(f);
      if (this._abonnes.size === 0) this._arreter();
    };
  }

  get actif() {
    return this._image !== null;
  }

  _demarrer() {
    if (this._image !== null || this._abonnes.size === 0) return;
    this._dernier = now();
    this._image = raf(this._battre);
  }

  _arreter() {
    if (this._image === null) return;
    caf(this._image);
    this._image = null;
  }

  _battre(t) {
    this._image = null;
    const dt = t - this._dernier;
    this._dernier = t;

    // Copie : un abonné qui se désabonne pendant son propre appel — ce qui
    // arrive à chaque fin de lecture — ne doit pas faire sauter les suivants.
    for (const f of [...this._abonnes]) {
      try {
        f(t, dt);
      } catch (err) {
        // Un lecteur qui tombe n'emporte pas les autres avec lui : sur un fil,
        // ça se verrait comme un gel général plutôt que comme un bogue local.
        queueMicrotask(() => {
          throw err;
        });
      }
    }
    if (this._abonnes.size > 0) this._image = raf(this._battre);
  }
}

const raf =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (f) => setTimeout(() => f(now()), 16);
const caf = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Le métronome de l'app. Un seul, pour tout le monde. */
export const metronome = new Metronome();
