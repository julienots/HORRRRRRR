# Tests réellement exécutés

Toutes les suites lancent **le vrai jeu** dans Chromium (Playwright, WebGL 2 en rendu logiciel SwiftShader) et
pilotent ses systèmes réels via `window.__SE` (déplacements avec les vraies entrées, vraies interactions,
vraie IA). Commande : `npm test` (compile le build de production puis exécute les 4 suites).

Dernière exécution complète : **96 vérifications, 96 réussies, 0 échec, aucune erreur JavaScript.**

## `tests/t-world.mjs` — monde (24/24)
- nouvelle partie : Acte I, personnage blessé (jambe, bras, saignement) dans la chambre d'amis ;
- Acte I joué : viser la table de nuit → tiroir focalisé → ouvert → lampe torche visible → ramassée → objectif suivant ;
- collisions : murs, meubles (lit), porte fermée qui bloque, porte ouverte qui laisse passer ;
- grand escalier montée/descente, garde-corps de la galerie (impossible de tomber), escaliers de la cave et du grenier ;
- connectivité : les 25 pièces ont des cellules marchables et sont toutes reliées (portes déverrouillées) ;
  une porte verrouillée bloque bien la navigation ;
- interrupteurs, robinet, fenêtre (châssis qui coulisse), porte de placard, objet dans un placard ouvert ;
- bouteille lancée → bruit fort à l'impact ; canette renversée en courant → bruit.

## `tests/t-ai.mjs` — intelligence artificielle (22/22)
- vue bloquée par un mur / une porte fermée même lampe allumée ; repérage rapide en ligne de vue avec la lampe ;
- accroupi dans le noir derrière le canapé : visibilité faible, pas de poursuite ;
- planchers : elle ne voit pas à travers (joueur juste au-dessus d'elle) ;
- ouïe : atténuation mesurée à travers 5 murs (perçu 0,01 contre 0,36 en champ libre) ;
- bruit fort → investigation → recherche → abandon → reprise de la patrouille ;
- poursuite → perte de vue → recherche à la dernière position connue (« cible perdue ») ;
- attaque au contact (−40 PV en Normal), provocation, reprise de la poursuite ;
- armoire : visibilité nulle ; sans t'avoir vu entrer elle ne connaît pas ta cachette ; si elle t'a vu, elle ouvre
  l'armoire et te fait sortir ;
- 8 fouilles d'une pièce où le joueur est caché : trouvé 4 fois, pas trouvé 4 fois (jamais sûr, jamais perdu d'avance) ;
- elle ouvre les portes fermées sur son chemin ; porte verrouillée de l'intérieur : coups puis porte forcée (~10 s) ;
- faisceau de la lampe dans les yeux → recul ;
- goutte de sang dans son champ de vision → elle suit la piste ;
- embuscade près d'un passage très fréquenté par le joueur ;
- patrouille libre de 240 s : 19 pièces visitées sur les 4 niveaux, jamais bloquée, toujours sur une cellule marchable.

## `tests/t-story.mjs` — progression, survie, sauvegardes (32/32)
- Acte I → II : la poupée assise tourne la tête quand on la regarde, puis disparaît quand on détourne les yeux ;
- partie complète avec les vraies interactions : lettre, porte d'entrée (courant + clé), clé du garage (Acte III),
  garage, pied-de-biche, planches du bureau (Acte IV), clé du grenier, magnétophone, grenier (fusible, clé rouillée,
  journal), clé de remontage, boîte à musique (bruit fort) → armoire qui glisse → passage secret praticable →
  atelier (clé de la cave), cave (Acte V), pièce scellée, cœur + clé d'entrée, fusible → courant (Acte VI),
  briquet, cœur brûlé → poupée détruite → porte d'entrée → **fin Libération** + écran de fin ;
- fins **Survivant** (≥ 4 documents) et **Elle te suit** (< 4 documents) ;
- sauvegarde puis rechargement de la page : acte, difficulté, inventaire, santé, piles, position, portes, objets
  déjà ramassés retirés du monde ; reprise après clic ;
- mort : jumpscare puis écran de mort ;
- saignement (perte de PV + gouttes), bandage, boiterie (vitesse 1,06 contre 1,60 m/s), endurance, analgésiques,
  piles, souffle retenu puis souffle coupé (bruit) ;
- metteur en scène : 14 événements exécutés sans erreur, 13 déclenchés dans leur contexte ;
- performances : nombre d'appels de rendu par image.

## `tests/t-ui-build.mjs` — build de production, vrais clics et vraies touches (18/18)
- menu et logo, bouton « Continuer » désactivé sans sauvegarde, options persistées, remappage d'une touche ;
- nouvelle partie via les boutons (difficulté) ;
- touches réelles : déplacement, lampe, accroupi, inventaire (ouvrir/fermer), journal, Échap (ferme le journal,
  puis pause) ; sauvegarde depuis le menu pause ; reprise ; rendu d'images.

## Mesures de performance (à interpréter avec prudence)
Les tests tournent en **rendu logiciel** (pas de GPU) : les temps par image (centaines de ms) ne reflètent pas un
vrai PC. Seules les mesures indépendantes du GPU sont exploitables :
- appels de rendu par image (ombres et post-traitement inclus), qualité Moyenne : ~600 dans le hall et la galerie
  (2 niveaux visibles), ~120 au sous-sol ; ~280 000 triangles ;
- avant optimisation : ~2 450 appels pour la maison seule.

## Vérifications visuelles
`tests/shots-game.mjs`, `tests/shot-house.mjs` et `tests/shot-doll.mjs` produisent des captures (dans `tests/out/`)
relues manuellement pendant le développement : réveil, couloir à la lampe, poupée assise dans la galerie, poursuite,
apparition au bout du couloir, vues depuis une armoire et sous un lit, sous-sol, pièce rituelle, chambre d'enfant,
salle de bain avec miroir, salon, inventaire, document, pause, options, jumpscare, écran de mort.

## Non testé automatiquement
- le verrouillage du pointeur souris (impossible sans affichage) et donc la visée à la souris en conditions réelles ;
- le rendu audio (le moteur s'exécute, mais l'écoute n'est pas vérifiable automatiquement) ;
- les performances sur une vraie carte graphique.
