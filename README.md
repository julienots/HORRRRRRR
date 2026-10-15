# SUPERESSENCE — THE DOLL

Jeu d'horreur et de survie 3D à la première personne. Tu te réveilles blessé dans la maison Morel, verrouillée,
pendant qu'une poupée de porcelaine animée par « l'Essence » te traque de pièce en pièce.

- Moteur : **Three.js r186** (WebGL 2) + **Vite**, JavaScript (modules ES).
- Plateforme : **PC, navigateur récent** (Chrome / Edge / Firefox), clavier + souris. Casque recommandé.
  Tablettes et téléphones (en paysage) : commandes tactiles automatiques (voir plus bas).
- Tout le contenu (textures PBR, modèles, animations, sons, musique) est **généré procéduralement** dans le code :
  le dépôt était vide au départ, aucun asset tiers n'est utilisé. Seul fichier image : `public/logo.jpg` (logo fourni).

## Lancer le jeu

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

Compiler une version distribuable (site statique dans `dist/`) :

```bash
npm run build
npm run preview      # sert dist/ sur http://127.0.0.1:4173
```

`dist/` peut être déposé sur n'importe quel hébergement statique. Il doit être servi en HTTP (pas en `file://`).

## Application Android (APK)

```bash
npm run apk          # = scripts/build-apk.sh -> release/SuperEssence-TheDoll.apk
```

Prérequis : Node, JDK 17+, SDK Android (plateforme 34, build-tools 34) via `ANDROID_HOME` ou
`android/local.properties`. Le projet `android/` est une application Java minimale, sans dépendance externe :
une WebView plein écran en paysage qui sert le jeu compilé depuis les assets de l'APK
(`https://appassets.androidplatform.net/assets/www/`), avec l'écran maintenu allumé, la pause automatique quand
l'application passe en arrière-plan et le bouton Retour qui agit comme Échap. Android 8.0 minimum, cible Android 14.
Sur téléphone, le jeu démarre en qualité Basse avec les commandes tactiles (modifiable dans Options).

Signature : au premier build, le script crée `android/keystore/release.jks` (hors git, mot de passe par défaut
`superessence` ou `SE_KEYSTORE_PASSWORD`). **Garde ce fichier** : les mises à jour de l'application doivent être
signées avec la même clé. Pour installer l'APK, autorise l'installation d'applications de sources inconnues.

## Commandes (modifiables dans Options → Commandes)

| Action | Touche |
|---|---|
| Se déplacer | W A S D en QWERTY = Z Q S D en AZERTY (touches par position physique ; le jeu affiche les lettres de ton clavier) |
| Regarder | Souris |
| Courir | Maj gauche |
| S'accroupir | C |
| Interagir / se cacher / sortir | E |
| Lampe torche | F |
| Se pencher | Q (gauche, = A en AZERTY) / R (droite) |
| Retenir son souffle (accroupi ou caché) | Espace |
| Lancer une bouteille (diversion) | G |
| Se soigner (bandage) | H |
| Verrouiller une porte (WC, salle de bain) | X |
| Inventaire / Journal / Objectif | Tab / J / O |
| Pause | Échap |
| Infos de débogage (état de l'IA, FPS) | F3 |

Sortir d'une cachette en maintenant **C** est plus discret.

Si le navigateur refuse de capturer la souris (page intégrée dans un cadre, politique du navigateur), on regarde
autour de soi en **maintenant le clic gauche et en faisant glisser**.

**Écran tactile** (détecté automatiquement, ou forcé avec `?touch=1` dans l'adresse) : joystick virtuel à gauche
pour se déplacer (poussé à fond vers l'avant = courir), glisser sur la moitié droite de l'écran pour regarder,
boutons Agir, Lampe, Accroupi, Souffle (maintenu), Courir (maintenu), Lancer, Verrou, et en haut Sac, Journal, Pause.

## Ce qui est dans le jeu

**La maison** : 4 niveaux, 25 pièces (sous-sol, rez-de-chaussée, étage, grenier) : hall et grand escalier, salon
(canapé, TV, cheminée, piano), salle à manger, cuisine, couloir de service, WC, buanderie, garage, cave humide,
chaufferie, pièce scellée, galerie, chambres (parentale, d'amis, d'enfant), salle de bain (miroir réel, baignoire,
douche), bureau condamné par des planches, atelier secret derrière une armoire, grenier. Les murs, ouvertures,
sols, plafonds et escaliers sont générés à partir d'un plan (`src/world/layout.js`), avec collisions.
Portes (pivot réel, sens d'ouverture, verrous, planches), tiroirs, placards, interrupteurs, robinet, fenêtres
(qui s'ouvrent, mais avec des barreaux) sont fonctionnels. Objets renversables (bruit) et bouteilles à lancer.

**La poupée** : modèle 3D sur un vrai squelette (`THREE.Bone`, ~45 os : colonne, cou, mâchoire, bras, doigts,
jambes) : porcelaine fissurée dont les fêlures laissent filtrer une lueur dorée, éclat manquant à la tempe,
yeux de verre (iris, pupilles qui se dilatent, paupières) qui suivent le joueur, sourire asymétrique, ~900 mèches
de cheveux avec une zone arrachée, robe victorienne tachée et déchirée, articulations à rotule, doigts trop
longs. Animations procédurales : marche (cadence liée à la distance parcourue, sans glissement), marche furtive,
course, recherche accroupie, regard sous les lits, ouverture des portes, coups contre une porte verrouillée,
attaque, jumpscare, recul face à la lumière, écoute, regard fixe, position assise, saccades « image par image »,
tête qui pivote au-delà des limites humaines.

**L'IA** (`src/actors/doll.js`) : états patrouille, suspicion, investigation, recherche, poursuite, attaque,
provocation, embuscade, apparition, retraite, porte forcée, recul. Elle utilise :
- la **vue** : cône de vision, occlusion par murs / portes / planchers / gros meubles, niveau de lumière autour
  du joueur, lampe allumée, accroupi derrière un meuble bas, distance ;
- l'**ouïe** : chaque bruit a une intensité ; il est atténué par la distance et par chaque mur ou plancher
  traversé, et sa localisation est imprécise s'il est faible (pas, course, portes, tiroirs, respiration, souffle
  coupé, objets, bouteille lancée, boîte à musique, radio…) ;
- la **mémoire** : dernière position connue, portes qu'elle a vues ouvertes ou fermées, lumières allumées,
  traces de sang (option), cachettes vérifiées, passages que tu empruntes souvent (embuscades) ;
- une **navigation** sur grille générée depuis la géométrie (A*, portes, escaliers, 4 niveaux).
Elle ne sait pas où tu te caches si elle ne t'a pas vu entrer : elle fouille les cachettes proches de l'endroit où
elle t'a perçu. Son agressivité monte d'acte en acte et selon la difficulté. Quand personne ne la regarde et qu'elle
est loin, elle se déplace plus vite (« elle disparaît dès que tu détournes le regard »), mais toujours par un vrai
chemin, sans téléportation. Un sous-titre indique ce qu'elle a remarqué, pour que tu comprennes pourquoi tu as été
repéré.

**Survie** : jambe et bras blessés au départ, saignement (perte de santé, gouttes de sang), boiterie qui ralentit
et rend la caméra asymétrique, mains et faisceau qui tremblent, endurance, peur (rythme cardiaque, respiration
audible par la poupée, vignettage, mouvements moins précis en panique), souffle retenu limité, choc visuel après
un coup. Ressources : bandages (soins de 3 s, immobile), analgésiques, piles (batterie de lampe limitée), clés.

**Cachettes** : 12 (armoires, placards à lamelles, sous les lits). En armoire on regarde entre les lamelles ;
sous un lit on reste visible de près. Une cachette n'est jamais sûre à 100 %.

**Histoire** : 6 actes (réveil, présence, chasse, secrets, sous-sol, évasion), 7 documents et un enregistrement,
objectifs intégrés au monde (clés, planches, boîte à musique et passage secret, fusible et courant, verrou
magnétique), **3 fins** (Libération / Survivant / Elle te suit) selon le cœur de porcelaine et les documents trouvés.

**Mise en scène** : 14 événements rares et variés (porte qui claque, pas à l'étage, jouet, ampoule qui éclate,
radio, objet déplacé, silhouette dans le miroir, coups dans le mur, machine à laver / TV / horloge, traces de pas,
apparition au bout d'un couloir, silhouette derrière une fenêtre (hallucination), tuyaux, chuchotement), avec de
longues pauses entre eux.

**Son** : Web Audio, spatialisation HRTF, occlusion par les murs (filtre + atténuation), réverbération ; tous les
sons sont synthétisés (aucun fichier audio n'existait dans le projet). Musique : drone discret + couche de
poursuite dynamique.

**Interface** : menu principal, nouvelle partie (3 difficultés), continuer, options (qualité graphique, champ de
vision, sensibilité, inversion Y, mouvements de caméra, luminosité, grain, aberration chromatique, volumes,
sous-titres, traces de sang), remappage des touches, inventaire, journal (objectifs, documents, indices), HUD
minimal, sauvegarde manuelle + automatique à chaque acte, écran de mort, écrans de fin.

**Graphismes / performances** : matériaux PBR avec textures procédurales (albédo, normal, rugosité), lampe torche
avec masque de lentille et ombres, gestionnaire de lumières (pool fixe de lumières réelles affectées aux sources
les plus pertinentes parmi ~70), brouillard par pièce, poussière visible dans le faisceau, reflets, bloom, grain,
vignettage, adaptation de l'œil à l'obscurité, 4 niveaux de qualité, fusion de la géométrie statique (des milliers
de pièces → ~80 maillages par niveau), rendu des niveaux voisins uniquement quand ils sont visibles.

## Tests

```bash
npm test     # build + 4 suites Playwright (≈ 15 min en rendu logiciel)
```

Le jeu réel est lancé dans Chromium ; les tests pilotent les vrais systèmes (pas de simulation à part).
Détail et résultats : [`docs/TESTS.md`](docs/TESTS.md). Chemin de Chromium modifiable avec `CHROME_PATH`.

## Structure

```
index.html, src/style.css      interface
src/main.js                    démarrage, boucle, API de test (window.__SE)
src/core/                      maths, réglages, entrées, sauvegardes
src/render/                    textures et matériaux procéduraux, renderer + post-traitement, lumières, fusion, particules
src/world/                     plan, génération de la maison, mobilier, aménagement des pièces, collisions, navigation
src/actors/                    joueur, modèle/animation/IA de la poupée
src/game/                      orchestrateur, objets, histoire, metteur en scène
src/audio/                     moteur audio et synthèse
tests/                         suites de tests + pages de rendu isolé (maison, poupée)
docs/                          plan de développement, rapport de tests
```
