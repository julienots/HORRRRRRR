// Material library: physically based (MeshStandard / MeshPhysical) materials built on procedural textures.
import * as THREE from 'three';
import * as T from './textures.js';

const lib = new Map();

function std(set, params = {}) {
  return new THREE.MeshStandardMaterial({
    map: set?.map,
    normalMap: set?.normalMap,
    roughnessMap: set?.roughnessMap,
    roughness: 1,
    metalness: 0,
    ...params,
  });
}

const defs = {
  // floors
  floorOak: () => std(T.woodFloor(3, 0x5c3c25), { normalScale: new THREE.Vector2(0.8, 0.8) }),
  floorDark: () => std(T.woodFloor(7, 0x3b2617)),
  floorNursery: () => std(T.woodFloor(12, 0x7a5a3c)),
  floorAttic: () => std(T.woodFloor(21, 0x4b3a2a), { roughness: 1.2 }),
  tileKitchen: () => std(T.tiles(4, 0xd8d0c0, 8, { checker: true })),
  tileBath: () => std(T.tiles(5, 0xc9d3d1, 10)),
  tileWall: () => std(T.tiles(6, 0xe2ddd0, 12)),
  concreteWet: () => std(T.concrete(8, 0x5f5b55, 1)),
  concrete: () => std(T.concrete(9, 0x77726a, 0)),
  // walls
  wpHall: () => std(T.wallpaper(10, 0x4c1f22, 0x6d3a32)),
  wpLiving: () => std(T.wallpaper(11, 0x2f3b2c, 0x4e5a3d)),
  wpDining: () => std(T.wallpaper(13, 0x3a2a3e, 0x5a4660, { stripes: true })),
  wpBedroom: () => std(T.wallpaper(14, 0x5c5a49, 0x7a7660)),
  wpGuest: () => std(T.wallpaper(15, 0x3e4b55, 0x58687a, { stripes: true })),
  wpChild: () => std(T.wallpaper(16, 0x9b7c86, 0xc3a7ad)),
  wpOffice: () => std(T.wallpaper(17, 0x2a2420, 0x463a2e, { stripes: true })),
  plaster: () => std(T.plaster(18, 0xb7ae9e)),
  plasterDirty: () => std(T.plaster(19, 0x8f877a)),
  ceiling: () => std(T.plaster(20, 0xcfc8ba)),
  brick: () => std(T.brick(22)),
  brickCellar: () => std(T.brick(23, 0x4f3328)),
  exterior: () => std(T.exterior(24)),
  // furniture
  wood: () => std(T.furnitureWood(30, 0x3d2617)),
  woodLight: () => std(T.furnitureWood(31, 0x7a5636)),
  woodBlack: () => std(T.furnitureWood(32, 0x1c1410)),
  paintWhite: () => std(T.paintedWood(33, 0xd9d2c2)),
  paintDoor: () => std(T.paintedWood(34, 0xb9ae98)),
  paintGreen: () => std(T.paintedWood(35, 0x52664f)),
  paintRed: () => std(T.paintedWood(36, 0x7a2c27)),
  fabricSofa: () => std(T.fabric(40, 0x4a1e1c)),
  fabricBed: () => std(T.fabric(41, 0xc8c0ae, { pattern: 'floral' })),
  fabricBlue: () => std(T.fabric(42, 0x3a4a63, { pattern: 'plaid' })),
  fabricPink: () => std(T.fabric(43, 0xc49aa2)),
  fabricGrey: () => std(T.fabric(44, 0x6b6966)),
  curtain: () => std(T.fabric(45, 0x3b1214, { weave: 64 }), { side: THREE.DoubleSide }),
  carpetRed: () => std(T.carpet(46, 0x5a1a1a, 0x2c1a12)),
  carpetBlue: () => std(T.carpet(47, 0x22304a, 0x8a7a50)),
  metal: () => std(T.rustMetal(50, 0x7a7d82), { metalness: 0.8 }),
  metalClean: () => new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 1, roughness: 0.25 }),
  chrome: () => new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 1, roughness: 0.08 }),
  brass: () => new THREE.MeshStandardMaterial({ color: 0xb08a3e, metalness: 1, roughness: 0.3 }),
  ceramic: () => new THREE.MeshPhysicalMaterial({ color: 0xeae6dc, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0x9fb4c0, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.25, depthWrite: false }),
  windowNight: () => new THREE.MeshStandardMaterial({ color: 0x0a1018, emissive: 0x0d1a2a, emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.2 }),
  blackPlastic: () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }),
  screen: () => new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.1, metalness: 0.3 }),
  paper: () => new THREE.MeshStandardMaterial({ color: 0xd8cfb8, roughness: 0.95 }),
  cardboard: () => std(T.fabric(48, 0x8a6a44, { weave: 30 })),
  books: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
  soot: () => new THREE.MeshStandardMaterial({ color: 0x0a0807, roughness: 1 }),
  blood: () => new THREE.MeshPhysicalMaterial({ color: 0x3a0404, roughness: 0.15, clearcoat: 1, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
  rubber: () => new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 }),
  carPaint: () => new THREE.MeshPhysicalMaterial({ color: 0x2b3a2f, metalness: 0.6, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1 }),
  candle: () => new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6, emissive: 0x221100, emissiveIntensity: 0.2 }),
  porcelainToy: () => new THREE.MeshPhysicalMaterial({ color: 0xefe3d6, roughness: 0.25, clearcoat: 0.8 }),
  bulbOff: () => new THREE.MeshStandardMaterial({ color: 0x777066, roughness: 0.3, emissive: 0x000000 }),
};

export function mat(name) {
  if (!lib.has(name)) {
    const f = defs[name];
    if (!f) throw new Error('Unknown material ' + name);
    const m = f();
    m.name = name;
    lib.set(name, m);
  }
  return lib.get(name);
}

// Box geometry whose UVs are in world meters / tile, so textures keep a constant density whatever the size.
export function boxGeo(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile);
    }
  }
  return g;
}

export function planeGeo(w, h, tile = 2) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile);
  return g;
}
