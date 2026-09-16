# Didascalie — les réponses inline

Le cœur de l'app, en état de marche : **répondre à un passage précis d'un
message**, qu'il soit écrit, parlé ou filmé.

Ce dossier contient un moteur autonome (zéro dépendance), une interface qui
s'en sert, et une démonstration jouable. Il implémente les trois planches du
14 septembre — les trente règles, sans en négocier une seule.

```
npm test          # 76 essais, les règles nommées une par une
npm run typecheck # tsc --checkJs, sans étape de compilation
npm run demo      # ouvre la démonstration
```

## Ce qui est là

| | |
|---|---|
| **Idée 1** — l'adresse d'une réponse | la ligne de frappe nomme le passage **et** la voix ; jusqu'à deux personnes on les nomme, au-delà on compte |
| **Idée 2** — le rond | trois états (vide, ambre, plein), terminal, jamais de retour en arrière ; la ligne du bas, une seule fois |
| **Idée 3** — le doigt sur la pause | le composeur du fil devient la rangée du passage en cours ; la pause et la réponse sont le même geste |
| **La dette du 9 septembre** | la vidéo reçue montre **une rangée de trois images** (67 × 50, son moment dessous — comme l'app depuis le 15/09), et la même phrase qu'un vocal : « 3 passages · touche celui auquel répondre » |
| **Les trois matières, une silhouette** (16/09) | le rond, ses trois portes et la réponse accrochée existent sous une phrase, à côté d'une bande de vocal, sous une image de vidéo ; l'annonce **cite** ce qu'elle vise ; la découpe joue dans les trois matières, et le point y devient le silence |

Et les deux familles de réglages demandées : **manières de répondre** (trois
modes, la voix mise en avant, l'indulgence de frontière, le temps pour se
raviser) et **animation** (cinq allures, une intensité, le respect du système).

## L'architecture, en une phrase

`src/` décide et ne connaît pas le DOM ; `ui/` dessine et ne décide de rien.

C'est ce qui permet de passer les trente règles au banc d'essai sans
navigateur — et de porter l'ensemble sur React, Svelte ou une vue native sans
réécrire une seule décision.

```
src/
  kernel/lattice.js     le treillis : « un rond plein ne se vide jamais »,
                        rendu inexprimable plutôt qu'interdit
  kernel/ticker.js      un seul rAF pour tout le fil, qui s'arrête au repos
  model/passages.js     la découpe, et l'indulgence de 1,5 s
  model/ring.js         le registre des ronds — sans aucune horodatation
  address/composer.js   ❤ l'adresse : une seule pour tout le fil
  motion/presets.js     cinq allures, ressorts générés en linear() CSS
  motion/engine.js      refuse toute image-clé qui remettrait en page
  motion/choreography.js les treize gestes de l'app
  security/text.js      retournement bidi, caractères invisibles, cinq mots
  security/gate.js      la Porte, le rang de confiance, les identifiants
  transport/presence.js typing.{uid} + rang — éphémère, groupé, périssable
  settings/schema.js    les réglages, et ce qui n'est pas réglable
ui/
  dom.js                aucun chemin vers innerHTML. Pas de fonction, pas de risque
  styles.css            jour / nuit
demo/                   le fil de la planche, jouable
```

## Trois décisions qui méritent un mot

**Le rond est un demi-treillis, pas une machine à états.** La règle 6 dit qu'un
rond plein ne se vide jamais. Écrite en `if`, elle se contourne un jour par un
chemin de code oublié. Écrite comme une borne supérieure, reculer est
*inexprimable*. Effet de bord : l'état converge quel que soit l'ordre d'arrivée
sur le réseau, donc deux appareils qui se resynchronisent tombent d'accord sans
arbitre — là où un « dernier écrivain gagne » aurait pu vider un rond plein.

**Il n'y a qu'une adresse pour tout le fil.** La planche prévient : « le risque
est de dupliquer la rangée — il faut que ce soit la même, sinon les deux copies
dériveront. » Il n'y a donc pas de seconde rangée à synchroniser, parce qu'il
n'y a pas de seconde rangée. Le champ de saisie lui-même est **le même nœud**
d'un rendu à l'autre : l'adresse change pendant qu'on écrit, et la saisie ne
doit pas disparaître avec elle.

**Le moteur d'animation refuse de remettre en page.** La règle 5 de l'idée 1 —
« jamais un déplacement : rien ne bouge sous le pouce » — est vérifiée à
l'exécution : une chorégraphie qui animerait `height`, `top` ou `margin` lève.
C'est aussi ce qui garantit les 60 images par seconde sur un téléphone d'entrée
de gamme, les deux exigences tombant au même endroit.

## Sécurité

| | |
|---|---|
| Retournement bidirectionnel | `U+202A–202E`, `U+2066–2069` retirés ; LRM/RLM conservées pour l'arabe et l'hébreu |
| Caractères invisibles | largeur nulle retirés ; ZWJ conservé pour les emoji composés |
| Injection | `ui/dom.js` n'a aucun chemin vers `innerHTML` ; attributs sur liste blanche ; pas de `style` brut, pas de `href`, pas de `on*` |
| Rang reçu du réseau | validé contre la découpe réelle ; un rang hostile retombe sur « répond à ton message » au lieu de jeter le message |
| Envoi | la Porte : `isTrusted`, geste récent, fenêtre au focus — un `click()` scripté n'envoie rien |
| Rythme de frappe | groupé à un envoi par seconde avec du hasard : le rythme de frappe est une donnée biométrique |
| Écran verrouillé | cinq mots au plus, et ce sont **vos** mots — jamais le contenu neuf de l'autre |
| Identifiants | `crypto.getRandomValues`, sans biais modulo |
| Surveillance | aucune horodatation dans le registre : un chronomètre demanderait une donnée qui n'existe nulle part |

## Ce qui n'est pas là, exprès

L'appui long pour parler (tranché le 2 septembre), l'accusé de lecture par
passage, l'historique des hésitations, le chronomètre, le tableau
d'attributions, la notification « il te reste deux passages », le second niveau
d'indentation. Les planches les interdisent ; un réglage n'est pas une porte
dérobée pour ce qui est sorti par la porte.

Voir [`INTEGRATION.md`](./INTEGRATION.md) pour brancher tout ça sur l'app
réelle, et pour les quatre questions que la passation demandait de poser au
code.

## 16 septembre — l'interface des échanges inline, sur les trois matières

Sa ligne : « reprend note et dépôt et continue l'amélioration de didascalie au
niveau de l'interface des échanges inline sms, vocaux et vidéo ».

Ce qui a changé, du plus grand au plus petit — tout est joué dans la démo et
mesuré dans Chromium (voir [`INTEGRATION.md`, section 6](./INTEGRATION.md#6-le-16-septembre--les-trois-matières-une-seule-silhouette)) :

- **Le rond sur le vocal et la vidéo.** Un passage parlé ou filmé avait sa
  bande ou sa vignette, mais pas son rond : « la même promesse, deux langues ».
  Chaque bande de vocal a désormais son rond à gauche, chaque image de vidéo le
  sien dessous ; les trois portes s'ouvrent au même endroit, et la réponse
  s'accroche **sous sa bande** (vocal) ou sous la rangée, présentée par
  l'image du passage (vidéo).
- **L'annonce cite ce qu'elle vise.** « 2ᵉ passage » est un rang ; « Pain, vin,
  fromage. » est une phrase. La ligne verte porte maintenant les cinq premiers
  mots d'un passage écrit, l'image d'un passage filmé, les bornes d'un passage
  entendu — sur une seconde ligne, qui se coupe avant de pousser « au fil, plutôt ».
- **La découpe dans les trois matières.** « Le silence s'écarte » rejoint les
  réglages (le quatrième mouvement de l'app), avec la durée du silence dite
  dans l'écart — en toutes lettres dans une pile, en bref (« 1,1 s ») entre deux
  images. Et le point, qui n'a rien à dire dans un son, y **devient** le
  silence (`dialecte`, comme dans l'app). Le bouton de la démo fait arriver un
  texte, un vocal, une vidéo, à tour de rôle.
- **Deux défauts trouvés en jouant, pas en relisant.** L'appareil grandissait
  avec le fil (le document défilait à la place du fil, la barre du bas
  dérivait) ; et toucher une phrase d'un texte pendant qu'un vocal joue ne
  tenait que seize millisecondes, la lecture reposant aussitôt son adresse.
  Les deux sont corrigés, le second avec ses essais nommés.
- **La courbe vit dans l'image, jamais sur l'animation** — la leçon de l'app du
  15/09, retrouvée ici en pause-et-cherche : un rond censé naître à 560 ms était
  déjà plein à 560 ms. Toutes les découpes sont désormais linéaires, la courbe
  posée segment par segment.

## Passation du 15 septembre au soir

L'accès au vrai dépôt (`AlexGanay-wq/messagerie-app`) est rétabli. **Deux
choses d'ici sont déjà dans l'app, en ligne** : la découpe en réglage (la
goutte par défaut, « Le point tombe », « La respiration ») et les deux mots sous
un passage (« d'accord », « je te réponds bientôt », un interrupteur chacun ;
« Répondre » y est la place elle-même). Le rond, l'adresse de la ligne de
frappe et la pause-réponse restent ici, prêts. L'état exact, ce qui
correspond à quoi et ce qui reste : [`INTEGRATION.md`, section 5](./INTEGRATION.md#5-laccès-au-dépôt--levé-le-15-septembre-et-ce-qui-est-passé-dans-lapp).
