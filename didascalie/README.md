# Didascalie — les réponses inline

Le cœur de l'app, en état de marche : **répondre à un passage précis d'un
message**, qu'il soit écrit, parlé ou filmé.

Ce dossier contient un moteur autonome (zéro dépendance), une interface qui
s'en sert, et une démonstration jouable. Il implémente les trois planches du
14 septembre — les trente règles, sans en négocier une seule.

```
npm test          # 61 essais, les règles nommées une par une
npm run typecheck # tsc --checkJs, sans étape de compilation
npm run demo      # ouvre la démonstration
```

## Ce qui est là

| | |
|---|---|
| **Idée 1** — l'adresse d'une réponse | la ligne de frappe nomme le passage **et** la voix ; jusqu'à deux personnes on les nomme, au-delà on compte |
| **Idée 2** — le rond | trois états (vide, ambre, plein), terminal, jamais de retour en arrière ; la ligne du bas, une seule fois |
| **Idée 3** — le doigt sur la pause | le composeur du fil devient la rangée du passage en cours ; la pause et la réponse sont le même geste |
| **La dette du 9 septembre** | la vidéo reçue montre **trois vignettes**, plus « 3 passages · touchez pour répondre » |

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
