// Narrative: acts, objectives, documents, audio logs and endings.

export const ACTS = [
  { id: 1, title: 'Acte I — Le réveil', sub: 'Tu ne sais plus comment tu es arrivé ici. Ta jambe saigne.' },
  { id: 2, title: 'Acte II — La présence', sub: 'La maison est fermée. Et tu n\'es pas seul.' },
  { id: 3, title: 'Acte III — La chasse', sub: 'Elle sait que tu es là. Elle te cherche.' },
  { id: 4, title: 'Acte IV — Les secrets', sub: 'Ce que la maison cache depuis 1931.' },
  { id: 5, title: 'Acte V — Le sous-sol', sub: 'Là où tout a commencé.' },
  { id: 6, title: "Acte VI — L'évasion", sub: 'Le courant est revenu. Elle aussi.' },
];

// Objectives are computed from game flags (see Game.currentObjective)
export const OBJECTIVES = {
  wake: 'Trouver de la lumière.',
  leaveRoom: 'Sortir de la chambre.',
  findExit: "Trouver un moyen de sortir de la maison.",
  frontDoor: "La porte d'entrée : il faut le courant (verrou magnétique) et sa clé.",
  garage: 'Trouver la clé du garage (la cuisine ?).',
  openGarage: 'Fouiller le garage.',
  office: 'Arracher les planches du bureau condamné, à l\'étage.',
  attic: 'Monter au grenier.',
  secret: 'La chambre d\'enfant cache quelque chose. Une boîte à musique ?',
  cellar: 'Descendre à la cave.',
  power: 'Remettre le courant : installer le fusible dans la chaufferie.',
  ritual: 'Ouvrir la pièce scellée du sous-sol.',
  escape: "Fuir par la porte d'entrée.",
  burn: "(Facultatif) Brûler le cœur de porcelaine dans la cheminée du salon.",
};

export const DOCUMENTS = {
  letter: {
    title: 'Lettre de mission',
    room: 'hall',
    text: `Maître Hervé Dancourt, notaire — Le 3 novembre

Madame, Monsieur,
Comme convenu, vous procéderez à l'inventaire de la propriété Morel avant la vente aux enchères.
Les héritiers n'ont jamais voulu y remettre les pieds.

Attention : le défunt avait fait installer un verrou magnétique sur la porte d'entrée. Sans électricité, elle ne s'ouvre pas.
Le tableau électrique se trouve à la chaufferie, au sous-sol. La clé de la porte, elle, n'a jamais été retrouvée.
Monsieur Morel la gardait « là où il travaillait ».

Ne vous attardez pas après la tombée de la nuit.`,
  },
  marthe1: {
    title: 'Journal de Marthe (gouvernante) — p. 12',
    room: 'dining',
    text: `14 mars 1931.
Monsieur ne mange plus. Il passe ses nuits dans l'atelier, depuis l'enterrement de la petite Élise.
Ce matin, la poupée qu'il a fabriquée était assise à la place d'Élise, à table.
Je ne l'avais pas posée là. Personne ne l'avait posée là.

J'ai rangé la clé de la boîte à musique dans le buffet. Monsieur ne veut plus l'entendre.
Elle jouait toute seule, la nuit, dans la chambre de l'enfant.`,
  },
  augustin: {
    title: "Journal d'Augustin Morel",
    room: 'office',
    text: `J'ai réussi. L'Essence — la quintessence d'une âme, distillée, dorée comme le miel.
J'ai recueilli ce qu'il restait d'Élise et je l'ai scellé dans un cœur de porcelaine.
Elle bouge. Elle me reconnaît. Elle sourit.

Mais l'Essence s'épuise. Elle me demande sans cesse « un cœur neuf ».
Elle tourne la tête vers le moindre bruit. Elle déteste la lumière dans les yeux.
J'ai caché la clé du grenier ici. Ce qui est là-haut ne doit plus jamais redescendre.`,
  },
  newspaper: {
    title: 'Le Petit Courrier — 2 octobre 1931',
    room: 'attic',
    text: `TROISIÈME DISPARITION À SAINT-AUBIN
Le jeune Paul Lemaire, 9 ans, n'a pas été revu depuis mardi soir. Comme les deux autres enfants,
il aurait été aperçu pour la dernière fois près de la propriété du poupetier Morel.
Un témoin affirme avoir vu « une petite fille en robe blanche » le guider vers le portail.
La gendarmerie n'a rien trouvé lors de sa visite. M. Morel n'a pas souhaité répondre.`,
  },
  workshop: {
    title: "Carnet d'atelier",
    room: 'atelier',
    text: `Le cœur ne doit jamais être brisé : l'Essence se répandrait et la chercherait ailleurs.
Seul le feu peut la rendre au néant. Un vrai feu, dans un vrai foyer.
J'aurais dû le faire. Je n'ai jamais pu.

La pièce du bas est fermée. La clé rouillée est restée au grenier, accrochée près de la lucarne.
La clé de la cave est ici, avec moi. Avec elle.`,
  },
  last: {
    title: 'Dernière page',
    room: 'ritual',
    text: `Elle a pris Marthe. Puis les enfants du village.
Chaque cœur ne lui suffit que quelques semaines.

Si quelqu'un lit ceci : la clé de l'entrée est sur l'autel, avec son cœur.
Quand le courant reviendra, elle l'entendra. Toute la maison l'entendra.
Cours. Et si tu en as la force, brûle-le.

— A. M.`,
  },
  tape: {
    title: 'Enregistrement (magnétophone)',
    room: 'office',
    text: `[grésillements] … elle est dans les murs … Non. Elle passe par les portes, comme nous.
Elle ne voit pas dans le noir complet, mais elle entend tout. Ta respiration. Tes pas.
Quand elle te cherche, elle ouvre les armoires… pas toutes. Celles près d'où elle t'a entendu.
[un rire d'enfant, très proche du micro] … Élise ? … [fin de la bande]`,
  },
};

export const SUBTITLES = {
  wake: 'Ma jambe… je saigne. Où est-ce que je suis ?',
  doorLocked: "C'est fermé à clé.",
  boarded: 'Des planches clouées. Il me faudrait un outil.',
  frontNoPower: "Un verrou magnétique… sans courant, rien à faire. Et il manque la clé.",
  frontNoKey: "Le verrou est déverrouillé… mais la serrure demande encore une clé.",
  firstSighting: "… La poupée. Elle n'était pas tournée vers moi, tout à l'heure.",
  powerOn: 'Le courant est revenu… Toute la maison s\'éveille.',
  heartTaken: 'Il bat. Ce truc bat dans ma main.',
  heartBurned: 'Elle hurle… quelque part dans la maison. Puis plus rien.',
  secret: "L'armoire a bougé… il y a un passage derrière.",
  hideFound: 'Elle m\'a trouvé.',
};

export const ENDINGS = {
  liberation: {
    title: 'FIN — LIBÉRATION',
    text: `Le cœur de porcelaine a fondu dans les flammes, et l'Essence s'est éteinte avec un dernier soupir doré.
Quand tu franchis la porte, la pluie lave ton visage. Derrière toi, la maison Morel n'est plus qu'une maison.
Pour la première fois depuis 1931, personne ne t'y attend.`,
  },
  survivor: {
    title: 'FIN — SURVIVANT',
    text: `Tu cours sous la pluie jusqu'à la route, sans te retourner. Tu sais ce qu'elle est. Tu sais ce qu'elle veut.
Tu raconteras tout à la gendarmerie, preuves en main. Ils fermeront la propriété.
Mais au fond de toi, tu sais qu'elle attend le prochain visiteur. Elle a toute l'éternité.`,
  },
  follows: {
    title: 'FIN — ELLE TE SUIT',
    text: `La porte s'ouvre. L'air froid. Ta voiture, au bout de l'allée. Tu démarres en tremblant.
Sur la route, dans le rétroviseur, la banquette arrière est vide.
Puis tu entends le petit cliquetis d'une articulation de porcelaine. Juste derrière ton siège.`,
  },
};
