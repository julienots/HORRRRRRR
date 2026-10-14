// Furniture library. Every piece is modeled at real scale, origin at floor center, front facing +z.
// Pieces return a THREE.Group with optional `userData.parts` (drawers, doors, hide spots, lights...).
import * as THREE from 'three';
import { mat, boxGeo } from '../render/materials.js';
import { canvasTexture } from '../render/textures.js';
import { rng } from '../core/math.js';

const R = rng(1234);

export function B(g, w, h, d, m, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(boxGeo(w, h, d, opts.tile || 1), typeof m === 'string' ? mat(m) : m);
  mesh.position.set(x, y, z);
  mesh.castShadow = opts.cast !== false;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
export function C(g, rt, rb, h, m, x, y, z, seg = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof m === 'string' ? mat(m) : m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
export function S(g, r, m, x, y, z, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), typeof m === 'string' ? mat(m) : m);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

function parts(g) { return (g.userData.parts ||= { drawers: [], doors: [], hide: null, slots: [] }); }

// A drawer: group that slides along +z (local). Items can be parented to `drawer.inner`.
function drawer(g, w, h, d, m, x, y, z) {
  const dg = new THREE.Group();
  dg.userData.moving = true;
  dg.position.set(x, y, z);
  B(dg, w - 0.01, h - 0.01, 0.02, m, 0, 0, d / 2 - 0.01);
  B(dg, w - 0.04, 0.012, d - 0.04, 'woodLight', 0, -h / 2 + 0.02, 0, { cast: false });
  B(dg, 0.012, h * 0.6, d - 0.04, 'woodLight', -w / 2 + 0.03, -h / 2 + h * 0.3, 0, { cast: false });
  B(dg, 0.012, h * 0.6, d - 0.04, 'woodLight', w / 2 - 0.03, -h / 2 + h * 0.3, 0, { cast: false });
  B(dg, w - 0.04, h * 0.6, 0.012, 'woodLight', 0, -h / 2 + h * 0.3, -d / 2 + 0.03, { cast: false });
  const knob = S(dg, 0.018, 'brass', 0, 0, d / 2 + 0.012);
  void knob;
  const inner = new THREE.Group();
  inner.position.set(0, -h / 2 + 0.03, 0);
  dg.add(inner);
  g.add(dg);
  const dr = { kind: 'drawer', group: dg, inner, closedZ: z, openZ: z + d * 0.75, open: 0, target: 0, items: [] };
  dg.traverse((o) => { if (o.isMesh) o.userData.drawer = dr; });
  parts(g).drawers.push(dr);
  return dr;
}

// A hinged cabinet / wardrobe door. hingeSide: -1 left, 1 right (local x)
function cabDoor(g, w, h, m, x, y, z, hingeSide, opts = {}) {
  const pivot = new THREE.Group();
  pivot.userData.moving = true;
  pivot.position.set(x + hingeSide * w / 2, y, z);
  const panel = B(pivot, w - 0.01, h - 0.01, 0.022, m, -hingeSide * w / 2, 0, 0);
  if (opts.slats) {
    // louvres you can peek through
    for (let i = 0; i < Math.floor(h / 0.09); i++) {
      B(pivot, w * 0.7, 0.015, 0.03, m, -hingeSide * w / 2, -h / 2 + 0.25 + i * 0.07, 0.008, { cast: false });
    }
  } else if (!opts.flat) {
    B(pivot, w * 0.7, h * 0.4, 0.01, m, -hingeSide * w / 2, h * 0.2, 0.014, { cast: false });
    B(pivot, w * 0.7, h * 0.3, 0.01, m, -hingeSide * w / 2, -h * 0.25, 0.014, { cast: false });
  }
  S(pivot, 0.015, 'brass', -hingeSide * (w - 0.06), 0, 0.03);
  g.add(pivot);
  const cd = { kind: 'cabdoor', pivot, hingeSide, open: 0, target: 0, max: opts.max || 1.9 };
  pivot.traverse((o) => { if (o.isMesh) o.userData.cabdoor = cd; });
  parts(g).doors.push(cd);
  void panel;
  return cd;
}

// ------------------------------------------------------------------- bedroom
export function bed(w = 1.6, l = 2.1, bedMat = 'fabricBed', frameMat = 'wood') {
  const g = new THREE.Group();
  const legH = 0.4;
  for (const [x, z] of [[-w / 2 + 0.05, -l / 2 + 0.05], [w / 2 - 0.05, -l / 2 + 0.05], [-w / 2 + 0.05, l / 2 - 0.05], [w / 2 - 0.05, l / 2 - 0.05]]) {
    B(g, 0.08, legH, 0.08, frameMat, x, legH / 2, z);
  }
  B(g, w, 0.12, l, frameMat, 0, legH + 0.06, 0);
  // side rails hanging (skirt) leave a dark gap under the bed
  B(g, w + 0.04, 1.1, 0.08, frameMat, 0, 0.55, -l / 2 - 0.02); // headboard
  B(g, w + 0.04, 0.12, 0.1, frameMat, 0, 1.1, -l / 2 - 0.02);
  B(g, w + 0.04, 0.55, 0.06, frameMat, 0, 0.42, l / 2 + 0.01); // footboard
  const mattress = B(g, w - 0.06, 0.22, l - 0.1, 'fabricGrey', 0, legH + 0.23, 0);
  void mattress;
  // blanket: wrinkled displaced plane draped over
  const geo = new THREE.PlaneGeometry(w + 0.1, l * 0.72, 24, 24);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    let z = Math.sin(x * 9 + y * 3) * 0.012 + Math.sin(y * 13) * 0.01 + R() * 0.004;
    const edge = Math.abs(x) - (w / 2 - 0.02);
    if (edge > 0) z -= edge * 4; // drape over the sides
    pos.setZ(i, z);
  }
  geo.computeVertexNormals();
  const blanket = new THREE.Mesh(geo, mat(bedMat));
  blanket.rotation.x = -Math.PI / 2;
  blanket.position.set(0, legH + 0.35, l * 0.13);
  blanket.castShadow = blanket.receiveShadow = true;
  g.add(blanket);
  S(g, 0.3, 'fabricBed', -w / 4, legH + 0.42, -l / 2 + 0.25, 1, 0.3, 0.6);
  if (w > 1.2) S(g, 0.3, 'fabricBed', w / 4, legH + 0.42, -l / 2 + 0.25, 1, 0.3, 0.6);
  g.userData.size = [w, 0.6, l];
  return g;
}

export function wardrobe(w = 1.2, h = 2.1, d = 0.62, m = 'wood', opts = {}) {
  const g = new THREE.Group();
  const t = 0.03;
  B(g, w, t, d, m, 0, t / 2, 0);
  B(g, w, t, d, m, 0, h - t / 2, 0);
  B(g, w + 0.06, 0.08, d + 0.04, m, 0, h + 0.04, 0);
  B(g, t, h, d, m, -w / 2 + t / 2, h / 2, 0);
  B(g, t, h, d, m, w / 2 - t / 2, h / 2, 0);
  B(g, w, h, t, m, 0, h / 2, -d / 2 + t / 2);
  C(g, 0.012, 0.012, w - 0.08, 'metalClean', 0, h - 0.25, 0).rotation.z = Math.PI / 2;
  // hanging clothes
  for (let i = 0; i < 5; i++) {
    const c = B(g, 0.03 + R() * 0.02, 0.8 + R() * 0.3, 0.42, R() < 0.5 ? 'fabricGrey' : 'fabricBlue', -w / 2 + 0.2 + i * (w - 0.35) / 4, h - 0.7, 0, { cast: false });
    c.rotation.y = (R() - 0.5) * 0.3;
  }
  cabDoor(g, w / 2, h - 0.06, m, -w / 4, h / 2, d / 2 - 0.011, -1, { slats: opts.slats });
  cabDoor(g, w / 2, h - 0.06, m, w / 4, h / 2, d / 2 - 0.011, 1, { slats: opts.slats });
  parts(g).hide = { kind: 'wardrobe', local: new THREE.Vector3(0, 0, 0), exit: new THREE.Vector3(0, 0, d / 2 + 0.55), eye: 1.55 };
  g.userData.size = [w, h, d];
  return g;
}

export function nightstand(m = 'wood') {
  const g = new THREE.Group();
  B(g, 0.5, 0.03, 0.4, m, 0, 0.6, 0);
  B(g, 0.03, 0.58, 0.38, m, -0.235, 0.29, 0);
  B(g, 0.03, 0.58, 0.38, m, 0.235, 0.29, 0);
  B(g, 0.47, 0.58, 0.02, m, 0, 0.29, -0.18);
  B(g, 0.47, 0.02, 0.38, m, 0, 0.1, 0);
  drawer(g, 0.44, 0.16, 0.36, m, 0, 0.49, 0);
  g.userData.size = [0.5, 0.62, 0.4];
  return g;
}

export function dresser(w = 1.2, m = 'wood') {
  const g = new THREE.Group();
  const h = 0.9, d = 0.5;
  B(g, w + 0.04, 0.03, d + 0.03, m, 0, h, 0);
  B(g, 0.03, h, d, m, -w / 2, h / 2, 0);
  B(g, 0.03, h, d, m, w / 2, h / 2, 0);
  B(g, w, h, 0.02, m, 0, h / 2, -d / 2);
  B(g, w, 0.08, d, m, 0, 0.04, 0);
  for (let i = 0; i < 3; i++) drawer(g, w - 0.06, 0.24, d - 0.04, m, 0, 0.2 + i * 0.26, 0.01);
  g.userData.size = [w, h, d];
  return g;
}

// ------------------------------------------------------------------- living / dining
export function table(w = 1.8, d = 0.9, m = 'wood', h = 0.76) {
  const g = new THREE.Group();
  B(g, w, 0.04, d, m, 0, h - 0.02, 0);
  B(g, w - 0.12, 0.08, d - 0.12, m, 0, h - 0.08, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    C(g, 0.03, 0.022, h - 0.04, m, x * (w / 2 - 0.08), (h - 0.04) / 2, z * (d / 2 - 0.08), 10);
  }
  g.userData.size = [w, h, d];
  return g;
}

export function chair(m = 'wood', seat = 'fabricSofa') {
  const g = new THREE.Group();
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(g, 0.035, 0.45, 0.035, m, x * 0.19, 0.225, z * 0.19);
  B(g, 0.44, 0.05, 0.44, seat, 0, 0.47, 0);
  B(g, 0.035, 0.55, 0.035, m, -0.19, 0.75, -0.2);
  B(g, 0.035, 0.55, 0.035, m, 0.19, 0.75, -0.2);
  B(g, 0.4, 0.12, 0.025, m, 0, 0.95, -0.2);
  B(g, 0.06, 0.4, 0.02, m, 0, 0.72, -0.2);
  g.userData.size = [0.45, 0.5, 0.45];
  return g;
}

export function sofa(w = 2.2, m = 'fabricSofa') {
  const g = new THREE.Group();
  B(g, w, 0.42, 0.9, m, 0, 0.21, 0);
  B(g, w, 0.55, 0.2, m, 0, 0.67, -0.35);
  B(g, 0.2, 0.3, 0.9, m, -w / 2 + 0.1, 0.55, 0);
  B(g, 0.2, 0.3, 0.9, m, w / 2 - 0.1, 0.55, 0);
  for (let i = 0; i < 3; i++) {
    const cw = (w - 0.4) / 3;
    const c = S(g, 0.5, m, -w / 2 + 0.2 + cw * (i + 0.5), 0.5, 0.05, cw - 0.02, 0.14, 0.75);
    c.scale.set(cw / 1.02, 0.14 / 0.5 * 0.5, 0.75);
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) B(g, 0.05, 0.06, 0.05, 'woodBlack', x * (w / 2 - 0.08), 0.03, z * 0.38);
  // torn cushion
  S(g, 0.12, 'fabricGrey', w / 2 - 0.5, 0.62, 0.12, 1.4, 0.4, 0.9);
  g.userData.size = [w, 0.8, 0.9];
  return g;
}

export function armchair(m = 'fabricSofa') {
  const g = sofa(0.95, m);
  g.userData.size = [0.95, 0.8, 0.9];
  return g;
}

export function bookshelf(w = 1.0, h = 2.0, d = 0.32, m = 'wood', seed = 1) {
  const g = new THREE.Group();
  const r = rng(seed);
  B(g, w, 0.03, d, m, 0, h, 0);
  B(g, 0.03, h, d, m, -w / 2, h / 2, 0);
  B(g, 0.03, h, d, m, w / 2, h / 2, 0);
  B(g, w, h, 0.02, m, 0, h / 2, -d / 2);
  const shelves = 5;
  const colors = [0x3b1d14, 0x1e2b22, 0x4a3a20, 0x23233a, 0x5a2222, 0x2e2a26, 0x6b5a3a];
  const geos = [];
  for (let s = 0; s < shelves; s++) {
    const y = 0.05 + s * (h / shelves);
    B(g, w - 0.03, 0.025, d - 0.02, m, 0, y, 0, { cast: false });
    let x = -w / 2 + 0.04;
    while (x < w / 2 - 0.08) {
      const bw = 0.025 + r() * 0.035;
      const bh = h / shelves * (0.55 + r() * 0.3);
      const bd = d * (0.6 + r() * 0.25);
      if (r() < 0.12) { x += bw * 2; continue; }
      const geo = new THREE.BoxGeometry(bw, bh, bd);
      const lean = r() < 0.1 ? 0.2 : 0;
      geo.rotateZ(lean);
      geo.translate(x + bw / 2, y + 0.012 + bh / 2, 0);
      const col = new THREE.Color(colors[Math.floor(r() * colors.length)]).multiplyScalar(0.6 + r() * 0.6);
      const cols = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < cols.length; i += 3) { cols[i] = col.r; cols[i + 1] = col.g; cols[i + 2] = col.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geos.push(geo);
      x += bw + 0.002;
    }
  }
  const merged = mergeGeos(geos);
  const books = new THREE.Mesh(merged, mat('books'));
  books.castShadow = books.receiveShadow = true;
  g.add(books);
  g.userData.size = [w, h, d];
  return g;
}

export function mergeGeos(geos) {
  let total = 0;
  for (const g of geos) total += g.toNonIndexed ? (g.index ? g.index.count : g.attributes.position.count) : 0;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (let g of geos) {
    if (g.index) g = g.toNonIndexed();
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += n;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return m;
}

export function fireplace() {
  const g = new THREE.Group();
  B(g, 1.8, 1.2, 0.5, 'brick', 0, 0.6, 0, { tile: 1.4 });
  B(g, 2.0, 0.08, 0.6, 'woodBlack', 0, 1.24, 0.04);
  B(g, 0.9, 0.75, 0.42, 'soot', 0, 0.38, 0.06, { cast: false });
  B(g, 1.2, 1.7, 0.4, 'brick', 0, 2.1, -0.05, { tile: 1.4 });
  // logs
  for (let i = 0; i < 3; i++) {
    const log = C(g, 0.05, 0.05, 0.6, 'woodBlack', -0.15 + i * 0.15, 0.08 + (i === 1 ? 0.07 : 0), 0.2, 8);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i - 1) * 0.3;
  }
  // grate
  B(g, 0.7, 0.03, 0.3, 'metal', 0, 0.03, 0.2);
  g.userData.size = [1.8, 1.25, 0.5];
  g.userData.parts = { firePos: new THREE.Vector3(0, 0.25, 0.2) };
  return g;
}

export function tvSet() {
  const g = new THREE.Group();
  B(g, 1.2, 0.5, 0.45, 'woodBlack', 0, 0.25, 0);
  B(g, 0.7, 0.55, 0.5, 'wood', 0, 0.78, 0);
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.12, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.38), screenMat);
  screen.position.set(-0.05, 0.79, 0.252);
  g.add(screen);
  C(g, 0.025, 0.025, 0.02, 'brass', 0.27, 0.86, 0.25).rotation.x = Math.PI / 2;
  C(g, 0.025, 0.025, 0.02, 'brass', 0.27, 0.74, 0.25).rotation.x = Math.PI / 2;
  // antenna
  const a1 = C(g, 0.005, 0.005, 0.5, 'metalClean', -0.1, 1.25, 0); a1.rotation.z = 0.5;
  const a2 = C(g, 0.005, 0.005, 0.5, 'metalClean', 0.1, 1.25, 0); a2.rotation.z = -0.5;
  g.userData.size = [1.2, 1.05, 0.5];
  g.userData.parts = { screen };
  return g;
}

export function radio() {
  const g = new THREE.Group();
  B(g, 0.4, 0.26, 0.18, 'wood', 0, 0.13, 0);
  const grill = B(g, 0.22, 0.16, 0.01, 'fabricGrey', -0.06, 0.14, 0.09, { cast: false });
  void grill;
  C(g, 0.022, 0.022, 0.02, 'brass', 0.12, 0.16, 0.095).rotation.x = Math.PI / 2;
  C(g, 0.022, 0.022, 0.02, 'brass', 0.12, 0.08, 0.095).rotation.x = Math.PI / 2;
  g.userData.size = [0.4, 0.26, 0.18];
  return g;
}

export function clock() {
  const g = new THREE.Group();
  B(g, 0.5, 2.0, 0.3, 'wood', 0, 1.0, 0);
  B(g, 0.56, 0.1, 0.34, 'wood', 0, 2.05, 0);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), mat('paper'));
  face.position.set(0, 1.65, 0.152);
  g.add(face);
  const hand = B(g, 0.01, 0.12, 0.005, 'soot', 0, 1.7, 0.156, { cast: false });
  hand.rotation.z = 0.8;
  const pend = new THREE.Group();
  pend.position.set(0, 1.35, 0.13);
  C(pend, 0.004, 0.004, 0.6, 'brass', 0, -0.3, 0, 6);
  C(pend, 0.07, 0.07, 0.01, 'brass', 0, -0.6, 0, 18).rotation.x = Math.PI / 2;
  g.add(pend);
  g.userData.size = [0.5, 2.1, 0.3];
  g.userData.parts = { pendulum: pend };
  return g;
}

export function piano() {
  const g = new THREE.Group();
  B(g, 1.5, 1.25, 0.55, 'woodBlack', 0, 0.625, 0);
  B(g, 1.4, 0.04, 0.25, 'paper', 0, 0.75, 0.38, { cast: false });
  for (let i = 0; i < 20; i++) B(g, 0.025, 0.02, 0.12, 'soot', -0.66 + i * 0.07, 0.775, 0.33, { cast: false });
  B(g, 1.5, 0.05, 0.3, 'woodBlack', 0, 0.71, 0.35);
  g.userData.size = [1.5, 1.25, 0.6];
  return g;
}

// ------------------------------------------------------------------- kitchen
export function counter(len = 2.4, withSink = false, withStove = false) {
  const g = new THREE.Group();
  const d = 0.62, h = 0.9;
  B(g, len, 0.04, d + 0.02, 'ceramic', 0, h + 0.02, 0);
  B(g, len, h - 0.1, d - 0.05, 'paintGreen', 0, (h - 0.1) / 2 + 0.1, -0.03);
  B(g, len, 0.1, d - 0.12, 'woodBlack', 0, 0.05, -0.05);
  const units = Math.floor(len / 0.6);
  const uw = len / units;
  for (let i = 0; i < units; i++) {
    const x = -len / 2 + uw * (i + 0.5);
    const isSink = withSink && i === 1;
    const isStove = withStove && i === units - 2;
    if (isStove) {
      B(g, uw - 0.02, 0.62, 0.02, 'metalClean', x, 0.42, d / 2 - 0.02);
      B(g, uw * 0.7, 0.3, 0.01, 'glass', x, 0.42, d / 2 - 0.005, { cast: false });
      for (const [bx, bz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) {
        C(g, 0.08, 0.08, 0.01, 'soot', x + bx, h + 0.045, bz - 0.02, 16);
      }
      continue;
    }
    drawer(g, uw - 0.03, 0.15, d - 0.1, 'paintGreen', x, h - 0.1, 0.0);
    cabDoor(g, uw - 0.03, 0.55, 'paintGreen', x, 0.42, d / 2 - 0.02, i % 2 ? 1 : -1, { max: 1.6 });
    if (isSink) {
      const sink = B(g, uw - 0.12, 0.02, 0.4, 'chrome', x, h + 0.01, 0, { cast: false });
      void sink;
      B(g, uw - 0.14, 0.18, 0.02, 'chrome', x, h - 0.07, 0.19, { cast: false });
      B(g, uw - 0.14, 0.18, 0.02, 'chrome', x, h - 0.07, -0.19, { cast: false });
      B(g, uw - 0.14, 0.01, 0.38, 'metal', x, h - 0.16, 0, { cast: false });
      const tap = new THREE.Group();
      tap.position.set(x, h + 0.04, -0.25);
      C(tap, 0.015, 0.015, 0.25, 'chrome', 0, 0.12, 0, 8);
      const spout = C(tap, 0.012, 0.012, 0.18, 'chrome', 0, 0.24, 0.08, 8);
      spout.rotation.x = Math.PI / 2;
      C(tap, 0.025, 0.02, 0.03, 'chrome', 0.06, 0.05, 0, 8);
      g.add(tap);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 0.3, 8), new THREE.MeshPhysicalMaterial({ color: 0xaabbcc, roughness: 0, transparent: true, opacity: 0.5 }));
      water.position.set(x, h + 0.13, -0.08);
      water.visible = false;
      water.userData.moving = true;
      g.add(water);
      parts(g).faucet = { tap, water, on: false };
    }
  }
  g.userData.size = [len, h, d];
  return g;
}

export function upperCabinets(len = 2.4) {
  const g = new THREE.Group();
  const d = 0.35, h = 0.7;
  B(g, len, h, 0.02, 'paintGreen', 0, 0, -d / 2);
  B(g, len, 0.02, d, 'paintGreen', 0, -h / 2, 0);
  B(g, len, 0.02, d, 'paintGreen', 0, h / 2, 0);
  const units = Math.floor(len / 0.6);
  const uw = len / units;
  for (let i = 0; i < units; i++) {
    const x = -len / 2 + uw * (i + 0.5);
    // a few plates / jars inside
    for (let k = 0; k < 3; k++) C(g, 0.04, 0.04, 0.12, k % 2 ? 'glass' : 'ceramic', x - 0.12 + k * 0.12, -h / 2 + 0.08, 0, 10);
    cabDoor(g, uw - 0.03, h - 0.04, 'paintGreen', x, 0, d / 2 - 0.01, i % 2 ? 1 : -1, { max: 1.7 });
  }
  g.userData.size = [len, h, d];
  return g;
}

export function fridge() {
  const g = new THREE.Group();
  const w = 0.75, h = 1.8, d = 0.7;
  B(g, w, h, d - 0.04, 'ceramic', 0, h / 2, -0.02);
  B(g, w - 0.06, 0.02, d - 0.15, 'glass', 0, 0.7, 0, { cast: false });
  B(g, w - 0.06, 0.02, d - 0.15, 'glass', 0, 1.1, 0, { cast: false });
  // inside: bottles, a jar with something you'd rather not look at
  C(g, 0.035, 0.035, 0.25, 'glass', -0.2, 0.84, 0, 10);
  C(g, 0.06, 0.06, 0.12, 'blood', 0.1, 1.17, 0, 14);
  const pivot = new THREE.Group();
  pivot.userData.moving = true;
  pivot.position.set(w / 2, h / 2, d / 2 - 0.02);
  B(pivot, w, h - 0.02, 0.05, 'ceramic', -w / 2, 0, 0);
  C(pivot, 0.012, 0.012, 0.5, 'chrome', -w + 0.07, 0.2, 0.05, 8);
  g.add(pivot);
  const cd = { kind: 'cabdoor', pivot, hingeSide: 1, open: 0, target: 0, max: 1.6 };
  pivot.traverse((o) => { if (o.isMesh) o.userData.cabdoor = cd; });
  parts(g).doors.push(cd);
  parts(g).fridgeLight = new THREE.Vector3(0, 1.4, 0);
  g.userData.size = [w, h, d];
  return g;
}

// ------------------------------------------------------------------- bathroom
export function bathtub() {
  const g = new THREE.Group();
  const shape = new THREE.Group();
  B(shape, 1.7, 0.55, 0.06, 'ceramic', 0, 0.3, 0.35);
  B(shape, 1.7, 0.55, 0.06, 'ceramic', 0, 0.3, -0.35);
  B(shape, 0.06, 0.55, 0.76, 'ceramic', 0.82, 0.3, 0);
  B(shape, 0.06, 0.55, 0.76, 'ceramic', -0.82, 0.3, 0);
  B(shape, 1.6, 0.05, 0.66, 'ceramic', 0, 0.1, 0);
  g.add(shape);
  // stagnant dark water
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.64), new THREE.MeshPhysicalMaterial({ color: 0x1a120c, roughness: 0.02, metalness: 0.1, clearcoat: 1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.42;
  g.add(water);
  for (const [x, z] of [[-0.75, -0.3], [0.75, -0.3], [-0.75, 0.3], [0.75, 0.3]]) S(g, 0.05, 'brass', x, 0.03, z, 1, 0.8, 1);
  const tap = C(g, 0.015, 0.015, 0.2, 'chrome', -0.8, 0.65, 0, 8);
  void tap;
  g.userData.size = [1.7, 0.6, 0.76];
  return g;
}

export function shower() {
  const g = new THREE.Group();
  B(g, 0.9, 0.08, 0.9, 'tileBath', 0, 0.04, 0, { tile: 0.6 });
  const glass = B(g, 0.02, 2.0, 0.9, 'glass', 0.45, 1.04, 0, { cast: false });
  void glass;
  const glass2 = B(g, 0.9, 2.0, 0.02, 'glass', 0, 1.04, 0.45, { cast: false });
  void glass2;
  C(g, 0.012, 0.012, 1.2, 'chrome', -0.4, 1.4, -0.4, 8);
  const head = C(g, 0.08, 0.05, 0.03, 'chrome', -0.3, 2.0, -0.35, 16);
  head.rotation.z = 0.3;
  g.userData.size = [0.9, 2.1, 0.9];
  return g;
}

export function toilet() {
  const g = new THREE.Group();
  C(g, 0.17, 0.13, 0.4, 'ceramic', 0, 0.2, 0.05, 20);
  const bowl = C(g, 0.2, 0.17, 0.08, 'ceramic', 0, 0.42, 0.08, 20);
  bowl.scale.z = 1.25;
  B(g, 0.42, 0.38, 0.18, 'ceramic', 0, 0.62, -0.2);
  B(g, 0.44, 0.03, 0.2, 'ceramic', 0, 0.82, -0.2);
  const seat = C(g, 0.21, 0.21, 0.02, 'woodLight', 0, 0.47, 0.09, 20);
  seat.scale.z = 1.25;
  g.userData.size = [0.45, 0.8, 0.65];
  return g;
}

export function washbasin() {
  const g = new THREE.Group();
  C(g, 0.08, 0.1, 0.8, 'ceramic', 0, 0.4, 0, 16);
  const basin = C(g, 0.28, 0.2, 0.15, 'ceramic', 0, 0.85, 0.05, 24);
  basin.scale.z = 0.75;
  C(g, 0.012, 0.012, 0.15, 'chrome', 0, 0.98, -0.12, 8);
  g.userData.size = [0.56, 0.92, 0.45];
  return g;
}

export function washingMachine() {
  const g = new THREE.Group();
  const body = B(g, 0.6, 0.85, 0.6, 'ceramic', 0, 0.425, 0);
  void body;
  const drum = new THREE.Group();
  drum.position.set(0, 0.42, 0.3);
  C(drum, 0.2, 0.2, 0.02, 'chrome', 0, 0, 0.01, 24).rotation.x = Math.PI / 2;
  const glass = C(drum, 0.16, 0.16, 0.02, 'glass', 0, 0, 0.025, 24);
  glass.rotation.x = Math.PI / 2;
  B(drum, 0.25, 0.02, 0.01, 'fabricPink', 0, 0, 0.005, { cast: false });
  g.add(drum);
  B(g, 0.55, 0.08, 0.02, 'metalClean', 0, 0.78, 0.3);
  g.userData.size = [0.6, 0.85, 0.6];
  g.userData.parts = { drum };
  return g;
}

export function mirror(w = 0.6, h = 0.8) {
  const g = new THREE.Group();
  B(g, w + 0.08, h + 0.08, 0.03, 'brass', 0, 0, -0.02);
  g.userData.size = [w + 0.08, h + 0.08, 0.04];
  g.userData.parts = { mirror: { w, h } };
  return g;
}

// ------------------------------------------------------------------- storage / garage / cellar
export function shelfUnit(w = 1.2, h = 1.9, d = 0.45, m = 'metal', seed = 5) {
  const g = new THREE.Group();
  const r = rng(seed);
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) B(g, 0.03, h, 0.03, m, x, h / 2, z);
  for (let i = 0; i < 4; i++) {
    const y = 0.15 + i * (h - 0.2) / 3;
    B(g, w, 0.02, d, m, 0, y, 0, { cast: false });
    let x = -w / 2 + 0.1;
    while (x < w / 2 - 0.15) {
      const k = r();
      if (k < 0.4) { const s = 0.15 + r() * 0.2; B(g, s, s * 0.8, s, 'cardboard', x + s / 2, y + s * 0.4 + 0.01, (r() - 0.5) * 0.1); x += s + 0.05; }
      else if (k < 0.7) { C(g, 0.04, 0.04, 0.2, r() < 0.5 ? 'glass' : 'metal', x + 0.05, y + 0.11, 0, 10); x += 0.12; }
      else x += 0.15;
    }
  }
  g.userData.size = [w, h, d];
  return g;
}

export function boxes(n = 3, seed = 9) {
  const g = new THREE.Group();
  const r = rng(seed);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const s = 0.35 + r() * 0.25;
    const b = B(g, s, s * 0.75, s, 'cardboard', (r() - 0.5) * 0.1, y + s * 0.375, (r() - 0.5) * 0.1);
    b.rotation.y = (r() - 0.5) * 0.5;
    y += s * 0.75;
  }
  g.userData.size = [0.6, y, 0.6];
  return g;
}

export function trunk(m = 'wood') {
  const g = new THREE.Group();
  B(g, 0.9, 0.45, 0.5, m, 0, 0.225, 0);
  const lid = C(g, 0.25, 0.25, 0.9, m, 0, 0.45, 0, 16);
  lid.rotation.z = Math.PI / 2;
  lid.scale.set(1, 1, 0.4);
  for (const x of [-0.3, 0.3]) B(g, 0.04, 0.5, 0.52, 'brass', x, 0.25, 0);
  B(g, 0.08, 0.1, 0.02, 'brass', 0, 0.42, 0.26);
  g.userData.size = [0.9, 0.6, 0.5];
  return g;
}

export function workbench(len = 2) {
  const g = new THREE.Group();
  B(g, len, 0.06, 0.7, 'woodLight', 0, 0.9, 0);
  for (const x of [-1, 1]) for (const z of [-1, 1]) B(g, 0.07, 0.9, 0.07, 'woodLight', x * (len / 2 - 0.06), 0.45, z * 0.3);
  B(g, len - 0.1, 0.03, 0.6, 'woodLight', 0, 0.2, 0, { cast: false });
  // pegboard with tools
  B(g, len, 1.0, 0.02, 'cardboard', 0, 1.6, -0.34);
  for (let i = 0; i < 6; i++) {
    const t = B(g, 0.03, 0.25 + (i % 3) * 0.05, 0.02, i % 2 ? 'metal' : 'woodBlack', -len / 2 + 0.25 + i * (len - 0.5) / 5, 1.6, -0.32);
    t.rotation.z = (i % 2 ? 0.2 : -0.1);
  }
  // vice
  B(g, 0.15, 0.12, 0.2, 'metal', len / 2 - 0.2, 0.99, 0.25);
  g.userData.size = [len, 0.95, 0.7];
  return g;
}

export function car() {
  const g = new THREE.Group();
  const paint = 'carPaint';
  B(g, 1.75, 0.6, 4.3, paint, 0, 0.6, 0);
  B(g, 1.55, 0.5, 2.1, paint, 0, 1.15, -0.2);
  B(g, 1.5, 0.42, 0.02, 'glass', 0, 1.15, 0.86, { cast: false }).rotation.x = -0.4;
  B(g, 0.02, 0.38, 1.9, 'glass', 0.78, 1.15, -0.2, { cast: false });
  B(g, 0.02, 0.38, 1.9, 'glass', -0.78, 1.15, -0.2, { cast: false });
  for (const [x, z] of [[-0.8, 1.35], [0.8, 1.35], [-0.8, -1.35], [0.8, -1.35]]) {
    const w = C(g, 0.33, 0.33, 0.22, 'rubber', x, 0.33, z, 18);
    w.rotation.z = Math.PI / 2;
  }
  B(g, 0.3, 0.12, 0.02, 'chrome', -0.55, 0.7, 2.16);
  B(g, 0.3, 0.12, 0.02, 'chrome', 0.55, 0.7, 2.16);
  // dust sheet half pulled off
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.2, 10, 10), mat('fabricGrey'));
  const p = sheet.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 4) * 0.05 + Math.cos(p.getY(i) * 5) * 0.04);
  sheet.geometry.computeVertexNormals();
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.set(0, 1.42, -1.0);
  sheet.castShadow = true;
  g.add(sheet);
  g.userData.size = [1.8, 1.45, 4.3];
  return g;
}

export function boiler() {
  const g = new THREE.Group();
  C(g, 0.45, 0.45, 1.8, 'metal', 0, 0.9, 0, 24);
  for (let i = 0; i < 4; i++) {
    const p = C(g, 0.05, 0.05, 2.5, 'metal', -0.2 + i * 0.13, 2.1, -0.3, 10);
    p.rotation.x = i % 2 ? 0.4 : 0;
  }
  const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), mat('paper'));
  gauge.position.set(0, 1.3, 0.455);
  g.add(gauge);
  g.userData.size = [0.9, 1.8, 0.9];
  return g;
}

export function fuseBox() {
  const g = new THREE.Group();
  B(g, 0.6, 0.8, 0.15, 'metal', 0, 0, 0);
  const slots = [];
  for (let i = 0; i < 4; i++) {
    const s = B(g, 0.08, 0.16, 0.04, i === 2 ? 'soot' : 'ceramic', -0.18 + i * 0.12, 0.05, 0.08, { cast: false });
    if (i === 2) slots.push(s);
  }
  const lever = new THREE.Group();
  lever.userData.moving = true;
  lever.position.set(0.2, -0.25, 0.08);
  B(lever, 0.04, 0.16, 0.04, 'paintRed', 0, 0.08, 0);
  g.add(lever);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2200, emissiveIntensity: 0.2 }));
  lamp.position.set(-0.2, 0.32, 0.08);
  g.add(lamp);
  g.userData.size = [0.6, 0.8, 0.15];
  g.userData.parts = { lever, lamp, fuseSlot: slots[0] };
  return g;
}

// ------------------------------------------------------------------- child room / toys
export function rockingHorse() {
  const g = new THREE.Group();
  const rock = new THREE.Group();
  for (const x of [-0.15, 0.15]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.025, 6, 24, 1.1), mat('woodLight'));
    r.rotation.set(0, Math.PI / 2, -Math.PI / 2 - 0.55);
    r.position.set(x, 0.72, 0);
    rock.add(r);
  }
  B(rock, 0.18, 0.25, 0.7, 'paintWhite', 0, 0.5, 0);
  B(rock, 0.15, 0.4, 0.15, 'paintWhite', 0, 0.75, 0.3).rotation.x = -0.4;
  B(rock, 0.13, 0.15, 0.3, 'paintWhite', 0, 0.92, 0.45);
  S(rock, 0.02, 'soot', 0.07, 0.95, 0.5);
  S(rock, 0.02, 'soot', -0.07, 0.95, 0.5);
  B(rock, 0.04, 0.3, 0.3, 'fabricSofa', 0, 0.85, 0.22, { cast: false });
  g.add(rock);
  g.userData.size = [0.4, 1.0, 1.2];
  g.userData.parts = { rock };
  return g;
}

export function crib() {
  const g = new THREE.Group();
  B(g, 1.3, 0.05, 0.7, 'paintWhite', 0, 0.4, 0);
  for (const x of [-0.63, 0.63]) for (const z of [-0.33, 0.33]) B(g, 0.05, 1.0, 0.05, 'paintWhite', x, 0.5, z);
  for (let i = 0; i < 14; i++) {
    C(g, 0.01, 0.01, 0.55, 'paintWhite', -0.6 + i * 0.092, 0.7, 0.33, 6);
    C(g, 0.01, 0.01, 0.55, 'paintWhite', -0.6 + i * 0.092, 0.7, -0.33, 6);
  }
  B(g, 1.3, 0.04, 0.04, 'paintWhite', 0, 0.98, 0.33);
  B(g, 1.3, 0.04, 0.04, 'paintWhite', 0, 0.98, -0.33);
  B(g, 1.2, 0.08, 0.62, 'fabricPink', 0, 0.47, 0);
  g.userData.size = [1.3, 1.0, 0.7];
  return g;
}

export function toyBlocks(seed = 3) {
  const g = new THREE.Group();
  const r = rng(seed);
  const cols = ['paintRed', 'paintGreen', 'paintWhite', 'woodLight'];
  for (let i = 0; i < 9; i++) {
    const b = B(g, 0.07, 0.07, 0.07, cols[i % 4], (r() - 0.5) * 0.6, 0.035 + (i > 6 ? 0.07 : 0), (r() - 0.5) * 0.6);
    b.rotation.y = r() * 3;
  }
  g.userData.size = [0.6, 0.15, 0.6];
  return g;
}

// A decorative (lifeless) small doll or teddy, sitting
export function sittingToy(kind = 'teddy') {
  const g = new THREE.Group();
  if (kind === 'teddy') {
    S(g, 0.11, 'cardboard', 0, 0.11, 0, 1, 1.1, 0.9);
    S(g, 0.08, 'cardboard', 0, 0.28, 0.02);
    S(g, 0.03, 'cardboard', -0.06, 0.35, 0.0);
    S(g, 0.03, 'cardboard', 0.06, 0.35, 0.0);
    S(g, 0.01, 'soot', -0.03, 0.3, 0.09);
    S(g, 0.01, 'soot', 0.03, 0.3, 0.09);
  } else {
    S(g, 0.08, 'fabricPink', 0, 0.1, 0, 1, 1.2, 0.8);
    S(g, 0.065, 'porcelainToy', 0, 0.25, 0);
    S(g, 0.012, 'soot', -0.022, 0.26, 0.055);
    S(g, 0.012, 'soot', 0.022, 0.26, 0.055);
    S(g, 0.07, 'woodBlack', 0, 0.28, -0.02, 1, 0.8, 1);
  }
  g.userData.size = [0.25, 0.35, 0.25];
  return g;
}

export function musicBox() {
  const g = new THREE.Group();
  B(g, 0.22, 0.12, 0.16, 'woodLight', 0, 0.06, 0);
  const lid = new THREE.Group();
  lid.userData.moving = true;
  lid.position.set(0, 0.12, -0.08);
  B(lid, 0.22, 0.02, 0.16, 'woodLight', 0, 0.01, 0.08);
  g.add(lid);
  const dancer = new THREE.Group();
  dancer.userData.moving = true;
  dancer.position.set(0, 0.12, 0);
  C(dancer, 0.004, 0.004, 0.06, 'brass', 0, 0.03, 0, 6);
  S(dancer, 0.015, 'porcelainToy', 0, 0.075, 0);
  C(dancer, 0.002, 0.03, 0.04, 'fabricPink', 0, 0.05, 0, 10);
  dancer.visible = false;
  g.add(dancer);
  C(g, 0.006, 0.006, 0.05, 'brass', 0.12, 0.06, 0, 6).rotation.z = Math.PI / 2;
  g.userData.size = [0.22, 0.14, 0.16];
  g.userData.parts = { lid, dancer };
  return g;
}

// ------------------------------------------------------------------- lights & decor
export function ceilingLamp(kind = 'pendant') {
  const g = new THREE.Group();
  const bulbM = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffd8a0, emissiveIntensity: 0 });
  if (kind === 'bare') {
    C(g, 0.003, 0.003, 0.5, 'blackPlastic', 0, -0.25, 0, 4);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), bulbM);
    bulb.position.y = -0.55;
    g.add(bulb);
    g.userData.parts = { bulb, bulbM, lightOffset: new THREE.Vector3(0, -0.6, 0) };
    return g;
  }
  C(g, 0.004, 0.004, 0.6, 'brass', 0, -0.3, 0, 4);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.28, 0.22, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a6a40, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x000000 }));
  shade.position.y = -0.7;
  g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), bulbM);
  bulb.position.y = -0.75;
  g.add(bulb);
  g.userData.parts = { bulb, bulbM, lightOffset: new THREE.Vector3(0, -0.85, 0), shade };
  return g;
}

export function lightSwitch() {
  const g = new THREE.Group();
  B(g, 0.08, 0.12, 0.012, 'ceramic', 0, 0, 0, { cast: false });
  const toggle = B(g, 0.02, 0.035, 0.02, 'ceramic', 0, 0, 0.012, { cast: false });
  g.userData.parts = { toggle };
  return g;
}

export function candle(h = 0.2) {
  const g = new THREE.Group();
  C(g, 0.025, 0.028, h, 'candle', 0, h / 2, 0, 10);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb050 }));
  flame.scale.y = 2.2;
  flame.position.y = h + 0.02;
  g.add(flame);
  g.userData.parts = { flame };
  return g;
}

export function rug(w, d, m = 'carpetRed') {
  const g = new THREE.Group();
  const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(m));
  r.rotation.x = -Math.PI / 2;
  r.position.y = 0.006;
  r.receiveShadow = true;
  g.add(r);
  g.userData.size = [w, 0.01, d];
  g.userData.noCollide = true;
  return g;
}

const portraitCache = {};
export function painting(w = 0.6, h = 0.8, kind = 'portrait', seed = 1) {
  const key = kind + seed + w + h;
  if (!portraitCache[key]) {
    portraitCache[key] = canvasTexture(256, Math.round(256 * h / w), (c, W, H) => {
      const r = rng(seed);
      const bg = c.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H / 2, W);
      bg.addColorStop(0, kind === 'landscape' ? '#3c4a3a' : '#3a2e24');
      bg.addColorStop(1, '#0d0a08');
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      if (kind === 'portrait' || kind === 'girl') {
        c.fillStyle = kind === 'girl' ? '#2a1712' : '#120d0b';
        c.beginPath(); c.ellipse(W / 2, H * 0.95, W * 0.38, H * 0.35, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#c9b39a';
        c.beginPath(); c.ellipse(W / 2, H * 0.42, W * 0.16, H * 0.15, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = kind === 'girl' ? '#5a3a1e' : '#1a1410';
        c.beginPath(); c.ellipse(W / 2, H * 0.34, W * 0.19, H * 0.12, 0, Math.PI, Math.PI * 2); c.fill();
        if (kind === 'girl') { c.fillRect(W * 0.31, H * 0.34, W * 0.06, H * 0.25); c.fillRect(W * 0.63, H * 0.34, W * 0.06, H * 0.25); }
        // eyes scratched out
        c.strokeStyle = '#060404'; c.lineWidth = 4;
        for (const ex of [0.44, 0.56]) {
          for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(W * ex - 8 + r() * 4, H * 0.41 - 6 + r() * 4); c.lineTo(W * ex + 8 - r() * 4, H * 0.43 + 6 - r() * 4); c.stroke(); }
        }
      } else {
        c.fillStyle = '#0a0d0a';
        c.beginPath(); c.moveTo(0, H * 0.7);
        for (let x = 0; x <= W; x += 16) c.lineTo(x, H * (0.6 + r() * 0.12));
        c.lineTo(W, H); c.lineTo(0, H); c.fill();
        c.fillStyle = '#d8d0b0'; c.beginPath(); c.arc(W * 0.7, H * 0.25, 12, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#050505'; c.fillRect(W * 0.3, H * 0.45, W * 0.12, H * 0.2);
      }
      // craquelure
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1;
      for (let i = 0; i < 60; i++) { c.beginPath(); const x = r() * W, y = r() * H; c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30); c.stroke(); }
    });
  }
  const g = new THREE.Group();
  B(g, w + 0.1, h + 0.1, 0.04, 'brass', 0, 0, -0.01);
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: portraitCache[key], roughness: 0.6 }));
  canvas.position.z = 0.012;
  g.add(canvas);
  g.userData.size = [w, h, 0.05];
  g.userData.noCollide = true;
  return g;
}

export function coatRack() {
  const g = new THREE.Group();
  C(g, 0.02, 0.02, 1.8, 'woodBlack', 0, 0.9, 0, 8);
  C(g, 0.2, 0.22, 0.03, 'woodBlack', 0, 0.015, 0, 16);
  const coat = C(g, 0.12, 0.25, 0.9, 'fabricGrey', 0.05, 1.25, 0.05, 12);
  coat.rotation.z = 0.06;
  g.userData.size = [0.45, 1.8, 0.45];
  return g;
}

export function sewingTable() {
  const g = table(1.6, 0.8, 'woodBlack', 0.8);
  // doll parts: heads, arms, glass eyes in a jar
  for (let i = 0; i < 4; i++) {
    const h = S(g, 0.06, 'porcelainToy', -0.55 + i * 0.25, 0.86, -0.1 + (i % 2) * 0.15);
    h.rotation.z = i;
    S(g, 0.012, 'soot', -0.55 + i * 0.25 - 0.02, 0.88, -0.1 + (i % 2) * 0.15 + 0.055);
  }
  for (let i = 0; i < 3; i++) {
    const a = C(g, 0.015, 0.012, 0.25, 'porcelainToy', 0.25 + i * 0.07, 0.82, 0.2, 8);
    a.rotation.z = Math.PI / 2;
    a.rotation.y = i * 0.4;
  }
  C(g, 0.05, 0.05, 0.12, 'glass', 0.6, 0.86, -0.2, 12);
  for (let i = 0; i < 6; i++) S(g, 0.012, 'ceramic', 0.6 + (Math.random() - 0.5) * 0.04, 0.82 + i * 0.015, -0.2 + (Math.random() - 0.5) * 0.04);
  B(g, 0.4, 0.25, 0.25, 'metal', -0.2, 0.92, 0.15);
  return g;
}
