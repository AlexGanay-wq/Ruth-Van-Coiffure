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

## 5. L'accès au dépôt — levé le 15 septembre, et ce qui est passé dans l'app

Le mur du 14 septembre est tombé le 15 : l'app Claude a été installée sur les
dépôts (« All repositories »), et **`AlexGanay-wq/messagerie-app`** — le vrai
code de Didascalie — a été attaché à la session. Ce qui suit a donc été
**branché dans l'app**, pas seulement décrit, et mis en ligne le soir même sur
la ligne d'Alexandre (« Déploie ce qui peut l'être ») : branche
`claude/goutte-fluidite`, fusionnée en avance rapide dans `main` (= Vercel).

### Ce qui est dans l'app maintenant (main, 15/09 au soir)

| Ici (prototype) | Là-bas (`messagerie-app`) |
|---|---|
| `settings/schema.js` → `decoupe` : goutte · point · respiration | `src/decoupeAnim.js` (plans WAAPI purs) + réglage « Comment un message se découpe » (Réglages › Ce que je vois), `localStorage dida_decoupe`, **la goutte par défaut et intacte** |
| `ui/decoupe.js` → le point qui devient le rond, la respiration | les mêmes causes, traduites : l'app n'a **pas de rond**, le point tombe donc **dans la couture** et s'y dissout ; la lueur et le souffle sont identiques |
| `rondDaccord` / `rondPromesse` / `rondRepondre` (les trois portes du rond) | `src/portes.js` : « d'accord » et « je te réponds bientôt » **sous la place ouverte**, un interrupteur chacun ; « Répondre » **est la place** (elle s'ouvre déjà en touchant la phrase) et ne se règle pas |
| la règle « rien ne remet en page » (`motion/engine.js`, `verifier`) | la goutte réécrite en translations et échelles : 82 remises en page → 2, positions identiques au centième ; `test-decoupeAnim.mjs` refuse toute propriété de mise en page |

Le détail, les mesures et les leçons sont dans `NOTES-CLAUDE.md` de
`messagerie-app` (les deux sections du 15/09, et la passation en tête).

### Ce qui reste ici, et n'est pas encore dans l'app

- **Le rond à trois états** (idée 2) et tout ce qui en dépend : le registre
  (`model/ring.js`), la ligne du bas, le bilan par auteur.
- **L'adresse de la ligne de frappe** (idée 1) : `address/composer.js`,
  `transport/presence.js`, l'annonce compacte.
- **La pause est la réponse** (idée 3) : `rangVise` avec la grâce d'une seconde
  et demie, le plancher, la fenêtre de correction.
- **Les vignettes vidéo** à la place de « 3 passages · touchez pour répondre ».
- Les quatre questions de la section 1 restent à poser au code de l'app avant
  de brancher le rond ; la réponse à la première (« une réponse porte-t-elle
  son rang ? ») est **oui** — `onInlineCutReply(m.id, segTexts, drafts, media)`
  envoie les textes par rang de passage — ce qui rend le registre
  branchable en une journée, comme prévu.

### Pour reprendre sur une autre machine

```
git clone https://github.com/AlexGanay-wq/Ruth-Van-Coiffure   # branche claude/practical-maxwell-oe36sh (le 16/09 ; la veille : claude/dazzling-archimedes-dnls5a)
cd Ruth-Van-Coiffure/didascalie && npm test && npm run typecheck && npm run demo
```

La démo publiée reste à <https://claude.ai/artifact/SKL4FHJxtjwwXGHMtG6SjS>.
Ce dossier a vocation à être déposé **dans** `messagerie-app` (dossier
`didascalie/` ou fusion module par module) quand le rond sera branché ; d'ici
là il vit ici, et rien de l'app ne dépend de lui.

---

## 6. Le 16 septembre — les trois matières, une seule silhouette

Sa ligne : « reprend note et dépôt et continue l'amélioration de didascalie au
niveau de l'interface des échanges inline sms, vocaux et vidéo ». Session
distante, dépôt de l'app attaché en lecture (`messagerie-app`, `main` à
`0ebd607`, la passation du 15/09 au soir) pour garder la maquette fidèle à ce
qui est en ligne. **Rien n'a été poussé dans l'app** : tout ce qui suit est dans
le prototype, éprouvé dans Chromium (Playwright, pause-et-cherche), et attend sa
ligne — maquette toujours avant de déployer.

### Ce qui a été fait, et où

| Quoi | Où | Ce que ça change |
|---|---|---|
| Le rond et les trois portes sur un **vocal** | `demo/app.js` (`rendreRail`, `rangeeDePassage`) | chaque bande a son rond à gauche ; « d'accord », « je te réponds bientôt », « Répondre » s'ouvrent dessous ; la réponse s'accroche **sous sa bande**, pas après le lecteur |
| … et sur une **vidéo** | `rendreVignettes`, `rendreSuiteVideo` | une rangée de trois images **67 × 50**, son moment dessous, **son rond sous chaque image** ; les mots et les réponses d'un passage viennent sous la rangée, présentés par l'image du passage (`cadreMini`) et son rang |
| La même phrase des deux côtés | `phrasePassages` (une seule copie, comme `ChatView`) | « 3 passages · touche celui auquel répondre » au-dessus des bandes et de la rangée ; le titre ne compte plus les passages une seconde fois |
| L'annonce **cite** ce qu'elle vise | `src/address/composer.js` → `annonce()` rend `extrait` (cinq mots, `enQuelquesMots`) et `voix` | la ligne verte montre « Pain, vin, fromage. », ou l'image du passage filmé, ou les bornes du passage entendu — sur sa propre ligne, coupée avant de pousser « au fil, plutôt » |
| « Le silence s'écarte » | `src/settings/schema.js` (`DECOUPES`), `ui/decoupe.js` (`silence`) | les temps de l'app (PAS 380 · OUVERTURE 360 · FIN 260 · MESURE 700 à l'allure de la maison) ; l'écart dit sa durée |
| Le point devient le silence sur un média | `dialecte(nom, matiere)` dans `schema.js` | le même contrat que `decoupeAnim.js` : goutte, respiration et silence ne sont jamais traduits |
| La pause mesurée, par passage | `passages.js` : `silence` sur le passage qui commence là ; `direLeSilence(s, {court})` | « 0,9 s de silence » dans une pile, « 0,9 s » entre deux images |
| La découpe dans l'axe de la matière | `ui/decoupe.js` (`MATIERES`, `axe`) | les phrases et les bandes s'écartent vers le bas, les images vers la droite ; la lueur est blanche sur une image |
| La démo fait arriver les trois matières | `MESSAGES_A_VENIR` | texte, vocal (0,9 s et 1,4 s de silence), vidéo (1,1 s et 0,7 s), à tour de rôle ; une découpe traduite **se dit** au lecteur d'écran |

### Les deux défauts trouvés en jouant, et corrigés

1. **L'appareil grandissait avec le fil.** `.app` avait `min-height: 100dvh` :
   mesuré à 826 px avant tout geste, 993 après un message, sur un écran de 780.
   Le document défilait à la place du fil, et la barre du bas dérivait sous le
   pouce. ⇒ `height: 100dvh` (repli `100vh`) et `overflow: hidden` ; vérifié :
   780 / 780, le fil défile seul (`ui/styles.css`).
2. **Toucher une phrase pendant qu'un vocal joue ne tenait que seize
   millisecondes.** L'image suivante de la lecture reposait l'adresse sur le
   passage du vocal (règle 1 appliquée trop largement). ⇒ `Composeur._choisi` :
   la lecture d'un **autre** message ne déplace plus une adresse désignée par
   un doigt, jusqu'à ce qu'on touche le message qui joue, l'annonce, ou que sa
   lecture finisse. Deux essais nommés (« R6 · toucher un passage d'un autre
   message pendant une lecture… »).

### La leçon retrouvée : la courbe vit dans l'image

En pause-et-cherche sur la découpe « silence » d'un texte, le troisième rond,
censé naître à 560 ms, était **déjà plein à 560 ms**. Cause : `easing` posé sur
l'animation entière (un ressort en `linear()`), qui courbe le temps de toutes
les images-clés — exactement le défaut que l'app avait mesuré le 15/09 sur la
goutte (« la couture 0 s'ouvrait à 209 ms au lieu de 400 »). Toutes les
animations de `ui/decoupe.js` sont désormais **linéaires**, la courbe posée sur
l'image de départ de chaque segment. Relevé après correction (texte, silence) :
à 100 ms un seul rond ; à 560 ms le troisième à opacité 0 ; à 900 ms les trois.

### Mesures (Chromium 400 × 780, densité 2)

- Zones de toucher des ronds, par `elementFromPoint` : texte **44 × 44**, vocal
  **47 × 44**, vidéo **42 × 41** (l'image au-dessus reste sa propre cible ; avec
  une réponse dessous, 42 × 33). Le dessin reste à 21 px.
- Cadre d'une image de vidéo : **67 × 50**, comme l'app.
- Zéro élément transitoire après une découpe (`.dsc-*` retirés), zéro erreur
  console hors le certificat des polices de la session distante.
- 76 essais, typecheck propre.

### Ce qui attend sa ligne

1. **Le rond sous une image de vidéo**, tel quel ou dans le coin de l'image —
   ici il est sous l'image, à côté du moment, pour que l'image reste une cible
   entière (deux cibles voisines qui s'étendent se volent l'une l'autre).
2. **Le silence entre deux images** en bref (« 1,1 s ») plutôt qu'en toutes
   lettres : six pixels d'écart ne logent pas une phrase.
3. **La citation dans l'annonce** : cinq mots (la règle de la notification), ou
   plus, puisqu'ici c'est le sien d'écran ?
4. Puis, inchangé : brancher le rond, l'adresse et la pause-réponse dans
   `messagerie-app` — les quatre questions de la section 1, la première ayant
   sa réponse (oui, une réponse porte son rang).
