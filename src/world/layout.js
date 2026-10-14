// Architectural plan of the house. Units are meters. x = east, z = south, y = up.
// Walls are generated automatically from room rectangles; openings cut doors, arches and windows into them.

export const LEVELS = { B: -3, G: 0, U: 3, A: 6 };
export const LEVEL_ORDER = ['B', 'G', 'U', 'A'];

// floor: material name or null (no floor, e.g. a stairwell over a ramp)
export const ROOMS = [
  // ---------------- Sous-sol
  { id: 'cellar', name: 'Cave', level: 'B', rect: [8, -3, 24, 3], floor: 'concreteWet', wall: 'brickCellar', ceil: 'plasterDirty', h: 3, fog: 1.0, sound: 'cellar' },
  { id: 'boiler', name: 'Chaufferie', level: 'B', rect: [18, -9, 24, -3], floor: 'concrete', wall: 'plasterDirty', ceil: 'plasterDirty', h: 3, fog: 0.8, sound: 'boiler' },
  { id: 'ritual', name: 'Pièce scellée', level: 'B', rect: [8, -9, 18, -3], floor: 'concreteWet', wall: 'brickCellar', ceil: 'soot', h: 3, fog: 1.2, sound: 'ritual' },
  { id: 'stairB', name: 'Escalier de la cave', level: 'B', rect: [15, 3, 17, 7], floor: null, ceilNone: true, wall: 'brickCellar', ceil: 'plasterDirty', h: 3, fog: 0.8 },
  // ---------------- Rez-de-chaussée
  { id: 'living', name: 'Salon', level: 'G', rect: [0, 10, 9, 18], floor: 'floorOak', wall: 'wpLiving', ceil: 'ceiling', h: 3 },
  { id: 'dining', name: 'Salle à manger', level: 'G', rect: [0, 3, 7, 10], floor: 'floorDark', wall: 'wpDining', ceil: 'ceiling', h: 3 },
  { id: 'kitchen', name: 'Cuisine', level: 'G', rect: [7, 3, 15, 10], floor: 'tileKitchen', wall: 'tileWall', ceil: 'ceiling', h: 3 },
  { id: 'hall', name: "Hall d'entrée", level: 'G', rect: [9, 10, 15, 18], floor: 'floorDark', wall: 'wpHall', ceil: 'ceiling', h: 3, ceilHoles: [[13.5, 11, 15, 17]] },
  { id: 'corridorG', name: 'Couloir de service', level: 'G', rect: [15, 7, 17, 18], floor: 'floorDark', wall: 'plaster', ceil: 'ceiling', h: 3 },
  { id: 'stairG', name: 'Porte de la cave', level: 'G', rect: [15, 3, 17, 7], floor: null, wall: 'plasterDirty', ceil: 'ceiling', h: 3 },
  { id: 'wc', name: 'Toilettes', level: 'G', rect: [17, 14, 20, 18], floor: 'tileBath', wall: 'tileWall', ceil: 'ceiling', h: 3 },
  { id: 'laundry', name: 'Buanderie', level: 'G', rect: [20, 14, 24, 18], floor: 'tileBath', wall: 'plasterDirty', ceil: 'ceiling', h: 3 },
  { id: 'garage', name: 'Garage', level: 'G', rect: [17, 3, 24, 14], floor: 'concrete', wall: 'plasterDirty', ceil: 'plasterDirty', h: 3, fog: 0.5 },
  // ---------------- Étage
  { id: 'master', name: 'Chambre parentale', level: 'U', rect: [0, 10, 9, 18], floor: 'floorOak', wall: 'wpBedroom', ceil: 'ceiling', h: 3 },
  { id: 'child', name: "Chambre d'enfant", level: 'U', rect: [0, 3, 9, 10], floor: 'floorNursery', wall: 'wpChild', ceil: 'ceiling', h: 3 },
  { id: 'corridorU', name: "Couloir de l'étage", level: 'U', rect: [9, 7, 17, 11], floor: 'floorDark', wall: 'wpHall', ceil: 'ceiling', h: 3 },
  { id: 'gallery', name: 'Galerie', level: 'U', rect: [9, 11, 17, 18], floor: 'floorDark', wall: 'wpHall', ceil: 'ceiling', h: 3, floorHoles: [[13.5, 11, 15, 17]] },
  { id: 'bath', name: 'Salle de bain', level: 'U', rect: [9, 3, 15, 7], floor: 'tileBath', wall: 'tileWall', ceil: 'ceiling', h: 3 },
  { id: 'stairU', name: 'Escalier du grenier', level: 'U', rect: [15, 3, 17, 7], floor: null, ceilNone: true, wall: 'plasterDirty', ceil: 'ceiling', h: 3 },
  { id: 'guest', name: "Chambre d'amis", level: 'U', rect: [17, 11, 24, 18], floor: 'floorOak', wall: 'wpGuest', ceil: 'ceiling', h: 3 },
  { id: 'office', name: 'Bureau condamné', level: 'U', rect: [17, 3, 24, 11], floor: 'floorDark', wall: 'wpOffice', ceil: 'ceiling', h: 3 },
  { id: 'atelier', name: 'Atelier secret', level: 'U', rect: [0, 0, 9, 3], floor: 'floorDark', wall: 'plasterDirty', ceil: 'plasterDirty', h: 3, fog: 0.8, sound: 'ritual' },
  // ---------------- Grenier
  { id: 'attic', name: 'Grenier', level: 'A', rect: [8, -2, 24, 11], floor: 'floorAttic', wall: 'plasterDirty', ceil: 'floorAttic', h: 2.6, fog: 1.0, floorHoles: [[15, 3, 17, 7]], sound: 'attic' },
];

// Sloped walkable surfaces (stairs). The height varies linearly along `axis` between two edges.
export const RAMPS = [
  { id: 'stairMain', rect: [13.5, 11, 15, 17], axis: 'z', a: { at: 17, y: 0 }, b: { at: 11, y: 3 }, room: 'hall', look: 'grand' },
  { id: 'stairCellar', rect: [15, 3, 17, 7], axis: 'z', a: { at: 7, y: 0 }, b: { at: 3, y: -3 }, room: 'stairG', look: 'rough' },
  { id: 'stairAttic', rect: [15, 3, 17, 7], axis: 'z', a: { at: 7, y: 3 }, b: { at: 3, y: 6 }, room: 'stairU', look: 'narrow' },
];

// Openings in walls.
// axis 'x': wall line x = at, opening centered at z = c. axis 'z': wall line z = at, centered at x = c.
// type: door | arch | open | window. y0/y1 relative to the level floor (wall exists below y0 and above y1).
// door: { id, locked: itemId|'special'|false, lockable: player can lock from inside, swing: 1|-1, style }
export const OPENINGS = [
  // Basement
  { level: 'B', axis: 'z', at: 3, c: 16, w: 2, type: 'open' },
  { level: 'B', axis: 'z', at: -3, c: 21, w: 1, type: 'door', door: { id: 'boilerDoor', swing: -1, style: 'metal' } },
  { level: 'B', axis: 'z', at: -3, c: 12, w: 1, type: 'door', door: { id: 'ritualDoor', locked: 'rustyKey', swing: -1, style: 'old' } },
  { level: 'B', axis: 'x', at: 24, c: 0, w: 1.2, type: 'window', y0: 2.2, y1: 2.8 },
  // Ground floor
  { level: 'G', axis: 'x', at: 9, c: 14, w: 2.4, type: 'arch', y1: 2.5 },
  { level: 'G', axis: 'z', at: 10, c: 3.5, w: 1, type: 'door', door: { id: 'diningDoor', swing: 1 } },
  { level: 'G', axis: 'x', at: 7, c: 6.5, w: 1, type: 'door', door: { id: 'kitchenDoor', swing: 1 } },
  { level: 'G', axis: 'z', at: 10, c: 11.5, w: 1, type: 'door', door: { id: 'hallKitchenDoor', swing: -1 } },
  { level: 'G', axis: 'x', at: 15, c: 8.5, w: 1, type: 'arch', y1: 2.2 },
  { level: 'G', axis: 'x', at: 15, c: 17.5, w: 0.9, type: 'door', door: { id: 'serviceDoor', swing: 1 } },
  { level: 'G', axis: 'z', at: 7, c: 16, w: 1, type: 'door', door: { id: 'cellarDoor', locked: 'cellarKey', swing: 1, style: 'old' } },
  { level: 'G', axis: 'x', at: 17, c: 16, w: 0.9, type: 'door', door: { id: 'wcDoor', swing: 1, lockable: true } },
  { level: 'G', axis: 'x', at: 17, c: 10, w: 1, type: 'door', door: { id: 'garageDoor', locked: 'garageKey', swing: 1, style: 'metal' } },
  { level: 'G', axis: 'z', at: 14, c: 22, w: 1, type: 'door', door: { id: 'laundryDoor', swing: 1 } },
  { level: 'G', axis: 'z', at: 18, c: 11, w: 1.3, type: 'door', door: { id: 'frontDoor', locked: 'special', swing: -1, style: 'front' } },
  { level: 'G', axis: 'x', at: 24, c: 8.5, w: 4, type: 'window', y0: 0, y1: 2.6, rollerDoor: true },
  // windows
  { level: 'G', axis: 'z', at: 18, c: 3, w: 1.4, type: 'window', interactive: 'livingWindow' },
  { level: 'G', axis: 'x', at: 0, c: 14, w: 1.4, type: 'window' },
  { level: 'G', axis: 'x', at: 0, c: 6.5, w: 1.4, type: 'window', interactive: 'diningWindow' },
  { level: 'G', axis: 'z', at: 3, c: 11, w: 1.6, type: 'window', interactive: 'kitchenWindow' },
  { level: 'G', axis: 'z', at: 3, c: 20.5, w: 1.2, type: 'window', y0: 1.6, y1: 2.4 },
  { level: 'G', axis: 'x', at: 24, c: 16, w: 1, type: 'window', y0: 1.3, y1: 2.2 },
  { level: 'G', axis: 'z', at: 18, c: 18.5, w: 0.6, type: 'window', y0: 1.5, y1: 2.2 },
  // Upper floor
  { level: 'U', axis: 'x', at: 9, c: 14.5, w: 1, type: 'door', door: { id: 'masterDoor', swing: -1 } },
  { level: 'U', axis: 'x', at: 9, c: 8.5, w: 1, type: 'door', door: { id: 'childDoor', swing: -1 } },
  { level: 'U', axis: 'z', at: 11, c: 13, w: 8, type: 'open' },
  { level: 'U', axis: 'z', at: 7, c: 12, w: 0.9, type: 'door', door: { id: 'bathDoor', swing: 1, lockable: true } },
  { level: 'U', axis: 'z', at: 7, c: 16, w: 1, type: 'door', door: { id: 'atticDoor', locked: 'atticKey', swing: -1, style: 'old' } },
  { level: 'U', axis: 'x', at: 17, c: 14.5, w: 1, type: 'door', door: { id: 'guestDoor', swing: 1 } },
  { level: 'U', axis: 'x', at: 17, c: 9, w: 1, type: 'door', door: { id: 'officeDoor', locked: 'crowbar', swing: 1, boarded: true } },
  { level: 'U', axis: 'z', at: 3, c: 4.5, w: 1, type: 'door', door: { id: 'secretDoor', locked: 'special', swing: -1, style: 'hidden' } },
  { level: 'U', axis: 'z', at: 3, c: 16, w: 2, type: 'open', y0: 2.4 },
  // windows
  { level: 'U', axis: 'z', at: 18, c: 4.5, w: 1.4, type: 'window' },
  { level: 'U', axis: 'x', at: 0, c: 14, w: 1.4, type: 'window', interactive: 'masterWindow' },
  { level: 'U', axis: 'x', at: 0, c: 6.5, w: 1.2, type: 'window' },
  { level: 'U', axis: 'z', at: 3, c: 12, w: 0.8, type: 'window', y0: 1.4, y1: 2.3 },
  { level: 'U', axis: 'z', at: 18, c: 20.5, w: 1.4, type: 'window', interactive: 'guestWindow' },
  { level: 'U', axis: 'x', at: 24, c: 14.5, w: 1.2, type: 'window' },
  { level: 'U', axis: 'x', at: 24, c: 7, w: 1.4, type: 'window' },
  { level: 'U', axis: 'z', at: 18, c: 12, w: 1.6, type: 'window' },
  // Attic
  { level: 'A', axis: 'x', at: 24, c: 4.5, w: 0.9, type: 'window', y0: 0.8, y1: 1.6 },
  { level: 'A', axis: 'x', at: 8, c: 4.5, w: 0.9, type: 'window', y0: 0.8, y1: 1.6 },
];

// Railings around floor holes (stair openings). [level, x0, z0, x1, z1]
export const RAILINGS = [
  ['U', 13.5, 11.6, 13.5, 17],
  ['U', 15, 11.6, 15, 17],
  ['U', 13.5, 17, 15, 17],
  ['A', 15, 3.6, 15, 7],
  ['A', 17, 3.6, 17, 7],
  ['A', 15, 7, 17, 7],
];

export const roomById = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

export function levelOfY(y) {
  let best = 'G', bd = Infinity;
  for (const k of LEVEL_ORDER) {
    const d = y - LEVELS[k];
    if (d >= -0.6 && d < bd) { bd = d; best = k; }
  }
  return best;
}

// Room containing a world point (uses the level whose floor is just below y).
export function roomAt(x, y, z) {
  const lv = levelOfY(y);
  for (const r of ROOMS) {
    if (r.level !== lv) continue;
    const [x0, z0, x1, z1] = r.rect;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return r;
  }
  return null;
}
