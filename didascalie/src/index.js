/**
 * Didascalie — les réponses inline.
 *
 * Le point d'entrée unique du moteur. Rien ici ne touche au DOM : cette moitié
 * décide, l'autre (`ui/`) dessine. C'est ce qui permet de passer les trente
 * règles au banc d'essai sans navigateur, et de porter le tout sur une autre
 * interface sans réécrire une seule décision.
 *
 * @module didascalie/inline
 */

export { Etat, join, estTerminal, avance, estEtat } from './kernel/lattice.js';
export { Metronome, metronome } from './kernel/ticker.js';

export { RegistreDesRonds } from './model/ring.js';
export {
  rangBrut, rangVise, rangSuivant, nommerRang, bornes,
  porteDesRonds, nombreDePassages,
} from './model/passages.js';

export { Composeur, ModeDeReponse, memeAdresse } from './address/composer.js';

export { Moteur, verifier, systemeDemandeCalme } from './motion/engine.js';
export { ALLURES, allure, doser, ressort, courbeDisponible } from './motion/presets.js';
export * as chorégraphies from './motion/choreography.js';

export { nettoyer, contenaitDuCache, enQuelquesMots } from './security/text.js';
export { rangDeConfiance, laPorte, identifiant } from './security/gate.js';

export { Annonceur, lireLesFrappes, PEREMPTION_MS } from './transport/presence.js';

export { DEFAUTS, valider, FORMULAIRE } from './settings/schema.js';
