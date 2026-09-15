# Brancher le moteur sur l'app réelle

Ce dossier a été écrit **sans le dépôt de Didascalie sous les yeux** — comme les
trois tours précédents, l'accès n'a pas pu être rétabli (voir la fin de ce
document). La différence avec les tours précédents : cette fois, ce n'est pas du
dessin. Le moteur tourne, il est vérifié, et il est conçu pour se brancher sur
un code qu'il ne connaît pas.

Concrètement : le moteur ne suppose **rien** de votre base de données, de votre
lecteur audio, ni de votre couche réseau. Il demande quatre choses, et il rend
des décisions.

---

## 1. Les quatre questions de la passation, et ce qu'elles changent

La passation demandait de poser ces questions au code en premier, parce
qu'elles décident de la taille du chantier. Le moteur est écrit pour que la
réponse **ne change pas l'architecture** — seulement la quantité de câblage.

### 1 · Une réponse porte-t-elle déjà son rang de passage ?

*Supposé depuis le 27 août. C'est la question la plus rentable.*

- **Si oui** → `RegistreDesRonds` se remplit en rejouant vos réponses existantes,
  et « répondu » n'est qu'un affichage. Comptez une journée.
  ```js
  for (const r of reponsesDuFil) {
    if (r.rangDePassage != null) {
      registre.observer(r.messageId, r.rangDePassage, r.auteurId, Etat.REPONDU);
    }
  }
  ```
- **Si non** → il faut ajouter le champ à l'envoi. Le reste du moteur est
  inchangé : `observer()` ne demande rien d'autre.

`rangDeConfiance()` protège les deux cas : un rang absent, vieux ou hostile
retombe sur le message entier plutôt que de casser l'affichage.

### 2 · L'auteur voit-il sa découpe avant d'envoyer ?

Elle décide l'idée 5, qui n'est **pas** dans ce dossier (la passation la met en
dernier, et pour de bonnes raisons). Rien ici n'en dépend.

### 3 · Une réponse peut-elle viser une autre réponse ?

Elle décide l'idée 4, également hors de ce dossier. `Composeur` ne vise
aujourd'hui qu'un passage ou le fil — exactement le repli que la passation
recommandait.

### 4 · La lecture d'un vocal expose-t-elle sa position en continu ?

*`playSlice`. C'est la seule question dont dépend ce qui est livré ici.*

C'est le seul point de contact obligatoire, et il est minuscule : il faut
pouvoir appeler `composeur.lecture(messageId, positionEnSecondes)` pendant la
lecture. Si `playSlice` existe déjà (la passation dit que oui, depuis
« Revoir en continu »), il n'y a rien à écrire de neuf en base ni sur le
réseau — c'est un état de lecture à relier au composeur.

```js
// Avec un élément <audio> ordinaire :
audio.addEventListener('timeupdate', () => {
  composeur.lecture(messageId, audio.currentTime);
});
audio.addEventListener('ended', () => composeur.finDeLecture(messageId));

// Ou, pour une position plus fine que `timeupdate` (qui ne tire que 4 fois
// par seconde, trop peu pour l'indulgence de 1,5 s) :
import { metronome } from './src/kernel/ticker.js';
const arreter = metronome.abonner(() => composeur.lecture(messageId, audio.currentTime));
```

**Un piège à connaître.** Quand vous positionnez vous-même la tête de lecture
(reprise au passage suivant, curseur déplacé), passez `{ saut: true }` :

```js
composeur.lecture(messageId, debutDuPassage, { saut: true });
```

Sans ça, l'indulgence de la règle 5 vise le passage *précédent* pendant une
seconde et demie — et la reprise après une réponse pointerait sur le passage
auquel on vient justement de répondre. C'est un bogue qui ne se voit qu'en le
jouant ; il est couvert par un essai nommé.

---

## 2. Le câblage minimal

```js
import {
  Composeur, RegistreDesRonds, Moteur, Annonceur,
  Etat, valider, laPorte,
} from './didascalie/src/index.js';

// a. Les réglages — persistez-les où vous voulez ; `valider` ne lève jamais.
let reglages = valider(JSON.parse(localStorage.getItem('didascalie.reglages') || '{}'));

// b. L'adresse. UNE seule pour tout le fil (c'est le point important).
const composeur = new Composeur({
  message: (id) => votreCacheDeMessages.get(id),  // doit exposer `.passages`
  reglages: () => reglages,                        // relu à chaque événement
});

// c. Les ronds.
const registre = new RegistreDesRonds();

// d. Les animations.
const moteur = new Moteur(() => reglages);

// e. La ligne de frappe — le seul champ neuf sur le réseau.
const annonceur = new Annonceur({
  publier: (charge) => charge
    ? firebase.database().ref(`typing/${filId}/${moi}`).set(charge)
    : firebase.database().ref(`typing/${filId}/${moi}`).remove(),
});
```

Puis, à l'envoi d'une réponse :

```js
function envoyer(ev, contenu) {
  if (!laPorte(ev).ouvre) return;              // aucun message ne part sans un geste
  const a = composeur.adresse;
  votreEnvoi({
    contenu,
    messageId: a.kind === 'fil' ? null : a.messageId,
    rangDePassage: a.kind === 'passage' ? a.rang : null,
  });
  if (a.kind === 'passage') registre.observer(a.messageId, a.rang, moi, Etat.REPONDU);
  annonceur.retirer();
  const suite = composeur.apresAvoirPose();     // → { rangSuivant } pour reprendre
}
```

### La forme d'un message

La seule chose que le moteur exige de vos données :

```js
{
  id: 'abc',
  passages: [ { debut: 0, fin: 14 }, { debut: 14, fin: 28 } ],  // secondes
  duree: 41,                                                     // médias seulement
}
```

Pour du texte, `debut === fin === 0` et un champ `texte`. Un message d'avant la
découpe a `passages: []` — et alors **rien ne change**, ce qui est ce qui rend
ce chantier sûr à déployer.

---

## 3. L'ordre de pose recommandé

Celui de la passation, et il tient toujours :

1. **Les vignettes sous une vidéo reçue** — la dette du 9 septembre. Le rendu est
   dans `demo/app.js` (`rendreVignettes`) ; il ne demande qu'une image par
   passage. Trois idées la supposent : on ne marque pas un passage qu'on ne voit pas.
2. **Idée 1** — la ligne de frappe. `transport/presence.js` est complet ;
   branchez `publier` sur votre `typing.{uid}` et lisez avec `lireLesFrappes`.
   Aucun bouton nouveau, aucune silhouette changée.
3. **Idée 2** — le rond. `model/ring.js` + `Moteur.jouer(el, 'rondSeRemplit')`.
4. **Idée 3** — l'adresse. C'est `address/composer.js`, déjà écrit ; le travail
   restant est de rendre votre composeur conditionnel — **le même**, pas une copie.
5. **Idées 4 et 5** — à mesurer d'abord (questions 2 et 3 ci-dessus).

---

## 4. Ce qu'il reste à faire, honnêtement

Ce dossier livre le moteur et une interface de démonstration. Ce qu'il ne
livre pas, et qu'il faudra écrire contre votre code :

- **L'enregistrement réel.** `micro` dans `demo/app.js` simule ; il faut
  `MediaRecorder` et votre pipeline d'envoi. Le contrat est minuscule : un
  toucher démarre, un toucher pose, et on appelle `apresAvoirPose()`.
- **Les vignettes vidéo réelles.** La démonstration dessine trois dégradés.
  En vrai : une image extraite au début de chaque passage, côté envoi de
  préférence (extraire à la lecture coûte cher sur mobile).
- **La notification et l'aperçu de la liste.** `enQuelquesMots()` fait la
  redaction ; reste à la brancher là où le corps de la notification se
  construit. La passation prévient : vérifiez que c'est bien **côté envoi**,
  là où le passage visé est connu — sinon il faut le remonter, et le chantier
  double.
- **La lecture à voix haute** (idée 1, acte IV, plan 3).
- **Le tri sur appareil ancien.** Les allures sont conçues pour tenir 60 i/s,
  mais ça se mesure, ça ne se décrète pas.

---

## 5. L'accès au dépôt

Il n'a toujours pas été possible de pousser quoi que ce soit : GitHub refuse
l'écriture sur `AlexGanay-wq/Ruth-Van-Coiffure` (403), et aucun dépôt
Didascalie n'est visible depuis cette session. C'est le même mur que le
14 septembre.

Pour le lever, au choix :

- un administrateur installe l'app Claude sur l'organisation —
  <https://github.com/apps/claude/installations/select_target> ;
- ou reconnecter GitHub depuis les réglages de claude.ai —
  <https://claude.ai/customize/connectors?auth_start=github&auth_start_force=1>.

Et surtout : **attacher le dépôt de Didascalie à la session**. Tant qu'il ne
l'est pas, chaque tour repart de zéro — ce dossier est conçu pour que celui-ci
soit le dernier à avoir ce problème, puisque le code existe désormais
indépendamment de lui.
