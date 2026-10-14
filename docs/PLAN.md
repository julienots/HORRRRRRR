# SUPERESSENCE — THE DOLL · Plan de développement

## 0. Audit initial (fait avant toute modification)

- Dépôt `julienots/HORRRRRRR`, branche `ccr-687809fb-2wa9rr` : **aucun commit, aucun fichier**.
  Il n'existe donc aucun moteur, scène, modèle, texture, son ou musique à préserver.
- Environnement disponible : Node 22, Chromium (Playwright) avec WebGL 2 logiciel (SwiftShader),
  pas d'Unity / Unreal / Godot, pas de banque d'assets.

## 1. Choix techniques

| Sujet | Choix | Raison |
|---|---|---|
| Moteur | **Three.js r186 + Vite** (JavaScript, ES modules) | Seul moteur 3D exécutable *et testable* ici (Chromium headless). Rendu PBR physique, ombres, post-traitement. |
| Plateforme | PC, navigateur moderne (Chrome / Edge / Firefox), clavier + souris | Cible principale. Le mobile n'est pas couvert (voir « reste à faire »). |
| Assets | **Procéduraux** : textures PBR (albedo / normal / roughness) générées sur canvas, modèles construits en code, sons synthétisés en Web Audio | Aucun asset fourni ; pas de téléchargement d'assets tiers non licenciés. Tout est original. |
| Physique / collisions | AABB statiques + portes dynamiques, joueur = cylindre, sols = régions avec fonction de hauteur (rampes d'escalier) | Déterministe, rapide, testable. |
| Navigation IA | Grille de navigation 0,5 m multi-niveaux générée depuis la géométrie (murs, meubles, portes, escaliers), A* | Fonctionne automatiquement si la maison change. |
| Perception IA | Lancers de rayons contre les occludeurs (murs, portes fermées, planchers, gros meubles), audition avec atténuation par murs | Le joueur peut comprendre pourquoi il est repéré. |
| Audio | Web Audio API, `PannerNode` HRTF, filtre passe-bas d'occlusion | Spatialisation réelle. |
| Sauvegarde | `localStorage` (slot manuel + autosave) | Pas de serveur nécessaire. |

## 2. Architecture

```
index.html            menu, HUD, overlays (HTML/CSS)
src/main.js           démarrage, boucle de jeu
src/core/             config, utilitaires, entrées, réglages, sauvegardes
src/render/           renderer, post-traitement, textures procédurales, particules
src/world/            plan de la maison, génération murs/sols/portes/fenêtres, mobilier, collisions, navigation
src/actors/           joueur (blessures, peur, endurance), poupée (modèle, squelette, animations, IA)
src/game/             interactions, inventaire, objectifs/actes, événements de mise en scène, fins
src/audio/            moteur audio et synthèse de tous les sons
tests/                tests Playwright automatisés (jeu réellement lancé dans Chromium)
```

## 3. La maison (4 niveaux, ~25 pièces)

- **Sous-sol (-3 m)** : cave (sol humide), chaufferie (tableau électrique), pièce scellée (atelier rituel), cage d'escalier.
- **Rez-de-chaussée (0 m)** : hall + grand escalier, salon (canapé, TV, cheminée), salle à manger, cuisine,
  couloir de service, WC, buanderie, garage, porte de la cave.
- **Étage (3 m)** : galerie au-dessus du hall, couloir, chambre parentale, chambre d'amis (réveil), chambre d'enfant,
  salle de bain (miroir, baignoire, douche), bureau condamné (planches), atelier secret (passage derrière l'armoire),
  porte du grenier.
- **Grenier (6 m)** : combles sombres, malles, poupées.

## 4. Étapes (dans l'ordre demandé)

1. Audit + plan (ce document).
2. Maison explorable : génération murs / ouvertures / sols / plafonds / escaliers, collisions.
3. Joueur : contrôleur FPS, caméra, accroupi, se pencher, lampe torche + batterie.
4. Poupée v1 : squelette (os `THREE.Bone`), modèle porcelaine, robe, cheveux, yeux, animations procédurales.
5. Navigation + IA de chasse (patrouille, suspicion, investigation, recherche, poursuite, embuscade, perte, reprise).
6. Cachettes (armoires, placards, sous les lits) + bruits (pas, portes, objets, respiration).
7. Blessures, endurance, peur, soins.
8. Éclairage dynamique, courant électrique, brume, poussière, son 3D, musique dynamique.
9. Énigmes, objets, 6 actes, 3 fins.
10. Menus, options, sous-titres, inventaire, journal, sauvegardes.
11. Tests automatisés + corrections.
12. Finitions (animations, effets).

## 5. Limites assumées dès le départ

- Le « photoréalisme AAA » demande des scans, des artistes et des semaines de production.
  Ici tout est procédural : matériaux PBR crédibles, éclairage dynamique et post-traitement,
  mais pas de qualité de scan photogrammétrique. Le pipeline est prêt à recevoir des modèles GLTF.
- Les performances mesurées en CI sont en rendu logiciel (SwiftShader) et ne représentent pas un vrai GPU.

## 6. Statut (fin de cette itération)

Toutes les étapes 1 à 12 ont été réalisées dans une première version jouable, de bout en bout (6 actes, 3 fins).
Résultats des tests : voir `docs/TESTS.md` (96 vérifications automatisées, toutes réussies).

Reste à faire / pistes :
- remplacer les modèles procéduraux par des assets scannés / sculptés (GLTF) pour viser un vrai photoréalisme ;
- voix enregistrées et bruitages réels à la place de la synthèse ;
- contrôles tactiles (mobile) ;
- profilage sur de vraies cartes graphiques (les tests tournent en rendu logiciel) ;
- physique des tissus (robe) et des cheveux plus poussée, animations faciales plus riches.
