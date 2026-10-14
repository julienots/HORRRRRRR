// Generates the architecture of the house from layout.js: walls (with door / window cuts), floors, ceilings,
// stairs, railings, doors and windows. Registers collision boxes and walkable regions.
import * as THREE from 'three';
import { ROOMS, RAMPS, OPENINGS, RAILINGS, LEVELS, roomById } from './layout.js';
import { mat, boxGeo, planeGeo } from '../render/materials.js';
import { canvasTexture } from '../render/textures.js';

const WALL_T = 0.1; // half thickness, each side box
const TILE = {
  wpHall: 0.9, wpLiving: 0.9, wpDining: 1.2, wpBedroom: 0.9, wpGuest: 1.2, wpChild: 0.8, wpOffice: 1.2,
  floorOak: 1.2, floorDark: 1.2, floorNursery: 1.2, floorAttic: 1.4, tileKitchen: 2.4, tileBath: 2, tileWall: 1.8,
  concreteWet: 4, concrete: 4, plaster: 3, plasterDirty: 3, ceiling: 3, brick: 1.4, brickCellar: 1.4, soot: 2, exterior: 3,
};
const tileOf = (m) => TILE[m] || 1.6;

function addMesh(group, geo, material, x, y, z, opts = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = true;
  if (opts.static !== false) { m.matrixAutoUpdate = false; m.updateMatrix(); }
  group.add(m);
  return m;
}

// Subtract rectangular holes from a rectangle -> list of rectangles.
export function rectMinus(rect, holes = []) {
  let parts = [rect];
  for (const h of holes) {
    const next = [];
    for (const [x0, z0, x1, z1] of parts) {
      const hx0 = Math.max(x0, h[0]), hz0 = Math.max(z0, h[1]), hx1 = Math.min(x1, h[2]), hz1 = Math.min(z1, h[3]);
      if (hx0 >= hx1 || hz0 >= hz1) { next.push([x0, z0, x1, z1]); continue; }
      if (z0 < hz0) next.push([x0, z0, x1, hz0]);
      if (hz1 < z1) next.push([x0, hz1, x1, z1]);
      if (x0 < hx0) next.push([x0, hz0, hx0, hz1]);
      if (hx1 < x1) next.push([hx1, hz0, x1, hz1]);
    }
    parts = next;
  }
  return parts;
}

export function buildHouse(scene, world) {
  const levels = {};
  for (const k of Object.keys(LEVELS)) {
    const g = new THREE.Group();
    g.name = 'level_' + k;
    scene.add(g);
    levels[k] = g;
  }
  const doors = [];
  const windows = [];
  buildWalls(levels, world, doors, windows);
  buildFloorsAndCeilings(levels, world);
  buildStairs(levels, world);
  buildRailings(levels, world);
  return { levels, doors, windows };
}

// --------------------------------------------------------------------------- walls
function buildWalls(levels, world, doors, windows) {
  const U = 0.5;
  for (const lvKey of Object.keys(LEVELS)) {
    const baseY = LEVELS[lvKey];
    const segs = new Map(); // key -> {axis, at, t, neg, pos}
    const rooms = ROOMS.filter((r) => r.level === lvKey);
    const put = (axis, at, from, to, side, room) => {
      for (let t = from; t < to - 1e-6; t += U) {
        const key = axis + '|' + at + '|' + t;
        if (!segs.has(key)) segs.set(key, { axis, at, t, neg: null, pos: null });
        segs.get(key)[side] = room;
      }
    };
    for (const r of rooms) {
      const [x0, z0, x1, z1] = r.rect;
      put('z', z0, x0, x1, 'pos', r);
      put('z', z1, x0, x1, 'neg', r);
      put('x', x0, z0, z1, 'pos', r);
      put('x', x1, z0, z1, 'neg', r);
    }
    // merge into runs of identical (neg,pos)
    const lines = new Map();
    for (const s of segs.values()) {
      const k = s.axis + '|' + s.at;
      if (!lines.has(k)) lines.set(k, []);
      lines.get(k).push(s);
    }
    const ops = OPENINGS.filter((o) => o.level === lvKey);
    for (const [k, arr] of lines) {
      arr.sort((a, b) => a.t - b.t);
      const runs = [];
      for (const s of arr) {
        const last = runs[runs.length - 1];
        if (last && Math.abs(last.b - s.t) < 1e-6 && last.neg === s.neg && last.pos === s.pos) last.b = s.t + U;
        else runs.push({ axis: s.axis, at: s.at, a: s.t, b: s.t + U, neg: s.neg, pos: s.pos });
      }
      const covered = (t) => arr.some((s) => t >= s.t - 1e-6 && t <= s.t + U + 1e-6);
      for (const run of runs) {
        // wall height: max of the two rooms
        const h = Math.max(run.neg?.h || 0, run.pos?.h || 0);
        const extA = covered(run.a - 0.25) ? 0 : WALL_T;
        const extB = covered(run.b + 0.25) ? 0 : WALL_T;
        // openings intersecting this run
        const mine = ops.filter((o) => o.axis === run.axis && o.at === run.at && o.c + o.w / 2 > run.a && o.c - o.w / 2 < run.b);
        mine.sort((p, q) => p.c - q.c);
        let cursor = run.a - extA;
        const pieces = [];
        for (const o of mine) {
          const oa = o.c - o.w / 2, ob = o.c + o.w / 2;
          if (oa > cursor) pieces.push([cursor, oa, 0, h]);
          let y0 = o.y0 ?? 0;
          let y1 = o.y1 ?? (o.type === 'door' ? 2.15 : o.type === 'window' ? 2.2 : h);
          if (o.type === 'window' && o.y0 === undefined) y0 = 0.9;
          if (y0 > 0) pieces.push([oa, ob, 0, y0]);
          if (y1 < h) pieces.push([oa, ob, y1, h]);
          cursor = ob;
          if (o.type === 'door') doors.push(makeDoor(levels[lvKey], world, o, baseY, run));
          if (o.type === 'window') windows.push(makeWindow(levels[lvKey], world, o, baseY, y0, y1, run));
          if (o.type === 'arch' || o.type === 'door') makeCasing(levels[lvKey], o, baseY, y1, run);
        }
        if (cursor < run.b + extB) pieces.push([cursor, run.b + extB, 0, h]);
        for (const [a, b, y0, y1] of pieces) wallPiece(levels[lvKey], world, run, a, b, baseY + y0, baseY + y1);
        // skirting boards on room sides (only full height parts at floor level)
        for (const [a, b, y0] of pieces) {
          if (y0 > 0.01) continue;
          for (const side of ['neg', 'pos']) {
            const room = run[side];
            if (!room || room.wall === 'brickCellar' || room.wall === 'tileWall') continue;
            const s = side === 'neg' ? -1 : 1;
            const off = s * (WALL_T + 0.012);
            const len = b - a;
            const g = run.axis === 'z' ? boxGeo(len, 0.13, 0.024) : boxGeo(0.024, 0.13, len);
            const cx = run.axis === 'z' ? (a + b) / 2 : run.at + off;
            const cz = run.axis === 'z' ? run.at + off : (a + b) / 2;
            addMesh(levels[lvKey], g, mat('paintWhite'), cx, baseY + 0.065, cz, { cast: false });
          }
        }
      }
    }
  }
}

function wallPiece(group, world, run, a, b, y0, y1) {
  if (b - a < 0.01 || y1 - y0 < 0.01) return;
  const len = b - a, h = y1 - y0, cy = (y0 + y1) / 2;
  for (const side of ['neg', 'pos']) {
    const room = run[side];
    const mname = room ? room.wall : 'exterior';
    const s = side === 'neg' ? -1 : 1;
    const t = tileOf(mname);
    if (run.axis === 'z') {
      addMesh(group, boxGeo(len, h, WALL_T, t), mat(mname), (a + b) / 2, cy, run.at + s * WALL_T / 2);
    } else {
      addMesh(group, boxGeo(WALL_T, h, len, t), mat(mname), run.at + s * WALL_T / 2, cy, (a + b) / 2);
    }
  }
  if (run.axis === 'z') world.addBox(a, y0, run.at - WALL_T, b, y1, run.at + WALL_T, { kind: 'wall' });
  else world.addBox(run.at - WALL_T, y0, a, run.at + WALL_T, y1, b, { kind: 'wall' });
}

function makeCasing(group, o, baseY, top, run) {
  // door / arch trim boards on both sides
  const m = mat(o.door?.style === 'hidden' ? (run.neg?.wall || 'plaster') : 'paintWhite');
  if (o.door?.style === 'hidden') return;
  const w = 0.09, d = 0.03;
  for (const s of [-1, 1]) {
    const off = s * (WALL_T + d / 2);
    const a = o.c - o.w / 2, b = o.c + o.w / 2;
    if (o.axis === 'z') {
      addMesh(group, boxGeo(w, top, d), m, a - w / 2, baseY + top / 2, o.at + off, { cast: false });
      addMesh(group, boxGeo(w, top, d), m, b + w / 2, baseY + top / 2, o.at + off, { cast: false });
      addMesh(group, boxGeo(o.w + 2 * w, w, d), m, o.c, baseY + top + w / 2, o.at + off, { cast: false });
    } else {
      addMesh(group, boxGeo(d, top, w), m, o.at + off, baseY + top / 2, a - w / 2, { cast: false });
      addMesh(group, boxGeo(d, top, w), m, o.at + off, baseY + top / 2, b + w / 2, { cast: false });
      addMesh(group, boxGeo(d, w, o.w + 2 * w), m, o.at + off, baseY + top + w / 2, o.c, { cast: false });
    }
  }
}

// --------------------------------------------------------------------------- doors
function doorPanel(style, w, h, run) {
  const g = new THREE.Group();
  let m = mat('paintDoor');
  if (style === 'metal') m = mat('metal');
  if (style === 'old') m = mat('wood');
  if (style === 'front') m = mat('woodBlack');
  if (style === 'hidden') m = mat(run.pos?.wall || 'plaster');
  const t = 0.045;
  const slab = new THREE.Mesh(boxGeo(w, h, t, 1.2), m);
  slab.position.set(w / 2, h / 2, 0);
  slab.castShadow = slab.receiveShadow = true;
  g.add(slab);
  if (style !== 'hidden' && style !== 'metal') {
    // raised panels on both faces
    for (const s of [-1, 1]) {
      for (const [py, ph] of [[0.25, 0.75], [1.15, 0.75]]) {
        const p = new THREE.Mesh(boxGeo(w * 0.62, ph * h / 2.05, 0.012), m);
        p.position.set(w / 2, (py + ph / 2) * h / 2.05 + 0.08, s * (t / 2 + 0.006));
        p.castShadow = p.receiveShadow = true;
        g.add(p);
      }
    }
  }
  if (style !== 'hidden') {
    const knobM = style === 'metal' ? mat('metalClean') : mat('brass');
    for (const s of [-1, 1]) {
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16), knobM);
      rose.rotation.x = Math.PI / 2;
      rose.position.set(w - 0.08, 1.0, s * (t / 2 + 0.005));
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), knobM);
      knob.position.set(w - 0.08, 1.0, s * (t / 2 + 0.045));
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.04, 8), knobM);
      neck.rotation.x = Math.PI / 2;
      neck.position.set(w - 0.08, 1.0, s * (t / 2 + 0.022));
      g.add(rose, knob, neck);
      // keyhole
      const kh = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.02, 0.004), mat('soot'));
      kh.position.set(w - 0.08, 0.9, s * (t / 2 + 0.003));
      g.add(kh);
    }
  }
  if (style === 'front') {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.4, 0.35), mat('windowNight'));
    win.position.set(w / 2, 1.65, -t / 2 - 0.004);
    win.rotation.y = Math.PI;
    g.add(win);
  }
  return g;
}

function makeDoor(group, world, o, baseY, run) {
  const d = o.door;
  const w = o.w - 0.04, h = 2.1;
  const pivot = new THREE.Group();
  pivot.userData.moving = true;
  const hinge = o.c - o.w / 2 + 0.02;
  let baseRot;
  if (o.axis === 'z') { pivot.position.set(hinge, baseY, o.at); baseRot = 0; }
  else { pivot.position.set(o.at, baseY, hinge); baseRot = -Math.PI / 2; }
  pivot.rotation.y = baseRot;
  const panel = doorPanel(d.style, w, h, run);
  pivot.add(panel);
  group.add(pivot);
  // closed collision box spans the opening fully
  const closed = o.axis === 'z'
    ? { min: [o.c - o.w / 2, baseY, o.at - 0.06], max: [o.c + o.w / 2, baseY + h, o.at + 0.06] }
    : { min: [o.at - 0.06, baseY, o.c - o.w / 2], max: [o.at + 0.06, baseY + h, o.c + o.w / 2] };
  // fully open: panel rotated 90deg towards swing side; compute end point
  const ang = baseRot + d.swing * Math.PI / 2 * 0.97;
  const ex = pivot.position.x + Math.cos(ang) * w, ez = pivot.position.z - Math.sin(ang) * w;
  const open = {
    min: [Math.min(pivot.position.x, ex) - 0.04, baseY, Math.min(pivot.position.z, ez) - 0.04],
    max: [Math.max(pivot.position.x, ex) + 0.04, baseY + h, Math.max(pivot.position.z, ez) + 0.04],
  };
  const box = world.add({ min: [...closed.min], max: [...closed.max], kind: 'door', solid: true, occ: true });
  const door = {
    id: d.id, o, level: o.level, axis: o.axis, baseY, pivot, panel, baseRot, swing: d.swing,
    open: 0, target: 0, speed: 1, locked: d.locked || false, lockable: !!d.lockable, lockedInside: false,
    boarded: !!d.boarded, style: d.style || 'default', box, closed, openBox: open, width: o.w,
    rooms: [run.neg?.id || null, run.pos?.id || null],
    center: new THREE.Vector3(o.axis === 'z' ? o.c : o.at, baseY + 1.1, o.axis === 'z' ? o.at : o.c),
    forced: false,
  };
  box.ref = door;
  panel.traverse((m) => { if (m.isMesh) m.userData.door = door; });
  if (d.boarded) {
    // planks nailed across the frame, on the corridor side (negative x side)
    const planks = new THREE.Group();
    planks.userData.moving = true;
    const s = -1;
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(boxGeo(0.035, 0.14, o.w + 0.35, 1), mat('woodLight'));
      p.position.set(o.at + s * (WALL_T + 0.04), baseY + 0.45 + i * 0.45, o.c);
      p.rotation.x = (i % 2 ? 1 : -1) * (0.18 + i * 0.03);
      p.castShadow = true;
      planks.add(p);
      for (const e of [-1, 1]) {
        const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6), mat('metal'));
        nail.rotation.z = Math.PI / 2;
        nail.position.set(o.at + s * (WALL_T + 0.06), baseY + 0.45 + i * 0.45 + e * Math.sin(p.rotation.x) * (o.w / 2 + 0.1), o.c + e * (o.w / 2 + 0.1) * Math.cos(p.rotation.x));
        planks.add(nail);
      }
    }
    group.add(planks);
    door.planks = planks;
    planks.traverse((m) => { if (m.isMesh) m.userData.door = door; });
  }
  return door;
}

// --------------------------------------------------------------------------- windows
let nightTex = null;
function nightTexture() {
  if (nightTex) return nightTex;
  nightTex = canvasTexture(256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0e1a2b');
    g.addColorStop(0.6, '#08101a');
    g.addColorStop(1, '#020305');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // tree silhouettes / branches
    c.strokeStyle = '#010203';
    for (let i = 0; i < 9; i++) {
      c.lineWidth = 2 + Math.random() * 5;
      c.beginPath();
      let x = Math.random() * w, y = h;
      c.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 70; y -= Math.random() * 60; c.lineTo(x, y); }
      c.stroke();
    }
    // rain streaks
    c.strokeStyle = 'rgba(140,160,190,0.12)';
    c.lineWidth = 1;
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3, y + 14); c.stroke();
    }
  });
  return nightTex;
}

function makeWindow(group, world, o, baseY, y0, y1, run) {
  const h = y1 - y0;
  const out = run.pos ? -1 : 1; // exterior side direction along the wall normal
  const nightM = new THREE.MeshBasicMaterial({ map: nightTexture(), color: 0x8fa6c4 });
  const frameM = mat('paintWhite');
  const g = new THREE.Group();
  const win = { o, level: o.level, open: 0, target: 0, sash: null, interactive: o.interactive || null, group: g, baseY };
  if (o.axis === 'z') g.position.set(o.c, baseY + y0, o.at);
  else { g.position.set(o.at, baseY + y0, o.c); g.rotation.y = Math.PI / 2; }
  // in local space: x along wall, z = wall normal. exterior at local z = out (for axis x rotated, flip)
  const outL = o.axis === 'z' ? out : -out;
  if (o.rollerDoor) {
    const door = new THREE.Mesh(boxGeo(o.w, h, 0.06, 1), mat('metal'));
    door.position.set(0, h / 2, 0);
    door.castShadow = door.receiveShadow = true;
    g.add(door);
    for (let i = 0; i < 14; i++) {
      const rib = new THREE.Mesh(boxGeo(o.w, 0.03, 0.02, 1), mat('metal'));
      rib.position.set(0, 0.1 + i * h / 14, -outL * 0.04);
      g.add(rib);
    }
    group.add(g);
    if (o.axis === 'z') world.addBox(o.c - o.w / 2, baseY, o.at - 0.1, o.c + o.w / 2, baseY + h, o.at + 0.1, { kind: 'wall' });
    else world.addBox(o.at - 0.1, baseY, o.c - o.w / 2, o.at + 0.1, baseY + h, o.c + o.w / 2, { kind: 'wall' });
    win.roller = true;
    return win;
  }
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(o.w + 1.5, h + 1.5), nightM);
  backdrop.position.set(0, h / 2, outL * 1.2);
  backdrop.rotation.y = outL > 0 ? Math.PI : 0;
  g.add(backdrop);
  // reveal (sides of the hole)
  const fw = 0.06;
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(boxGeo(fw, h, 0.2), frameM);
    side.position.set(s * (o.w / 2 - fw / 2), h / 2, 0);
    g.add(side);
  }
  const top = new THREE.Mesh(boxGeo(o.w, fw, 0.2), frameM); top.position.set(0, h - fw / 2, 0); g.add(top);
  const sill = new THREE.Mesh(boxGeo(o.w + 0.1, 0.04, 0.3), frameM); sill.position.set(0, 0.02, -outL * 0.05); g.add(sill);
  // sash with panes (lower half slides up when opened)
  const sash = new THREE.Group();
  sash.userData.moving = true;
  const paneM = mat('glass');
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(o.w - 0.12, h / 2 - 0.06), paneM);
  glass.position.set(0, h / 4, 0);
  sash.add(glass);
  for (const [x, y, sw, sh] of [[0, 0.02, o.w - 0.1, 0.04], [0, h / 2 - 0.02, o.w - 0.1, 0.04], [-(o.w / 2 - 0.07), h / 4, 0.04, h / 2], [o.w / 2 - 0.07, h / 4, 0.04, h / 2], [0, h / 4, 0.025, h / 2]]) {
    const b = new THREE.Mesh(boxGeo(sw, sh, 0.04), frameM);
    b.position.set(x, y, 0);
    sash.add(b);
  }
  sash.position.z = 0.02;
  g.add(sash);
  const upper = sash.clone();
  upper.position.set(0, h / 2, -0.03);
  g.add(upper);
  win.sash = sash;
  win.h = h;
  // iron bars outside: the windows can be opened, but they never let you out
  for (let i = 1; i < Math.max(3, Math.round(o.w / 0.18)); i++) {
    const n = Math.max(3, Math.round(o.w / 0.18));
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h, 6), mat('metal'));
    bar.position.set(-o.w / 2 + i * o.w / n, h / 2, outL * 0.13);
    g.add(bar);
  }
  group.add(g);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = true; m.userData.window = win; } });
  // glass blocks movement but not sight
  if (o.axis === 'z') world.addBox(o.c - o.w / 2, baseY + y0, o.at - 0.1, o.c + o.w / 2, baseY + y1, o.at + 0.1, { kind: 'window', occ: false });
  else world.addBox(o.at - 0.1, baseY + y0, o.c - o.w / 2, o.at + 0.1, baseY + y1, o.c + o.w / 2, { kind: 'window', occ: false });
  return win;
}

// --------------------------------------------------------------------------- floors & ceilings
function buildFloorsAndCeilings(levels, world) {
  for (const r of ROOMS) {
    const y = LEVELS[r.level];
    const g = levels[r.level];
    if (r.floor) {
      for (const [x0, z0, x1, z1] of rectMinus(r.rect, r.floorHoles)) {
        const w = x1 - x0, d = z1 - z0;
        const m = addMesh(g, planeGeo(w, d, tileOf(r.floor)), mat(r.floor), (x0 + x1) / 2, y, (z0 + z1) / 2, { cast: false, static: false });
        m.rotation.x = -Math.PI / 2;
        m.updateMatrix();
        m.matrixAutoUpdate = false;
        m.userData.floor = r.id;
        world.addFloor(x0, z0, x1, z1, y, { room: r.id, level: r.level });
        world.addBox(x0, y - 0.25, z0, x1, y - 0.005, z1, { kind: 'slab', solid: false });
      }
    }
    if (!r.ceilNone) {
      for (const [x0, z0, x1, z1] of rectMinus(r.rect, r.ceilHoles)) {
        const w = x1 - x0, d = z1 - z0;
        const m = addMesh(g, planeGeo(w, d, tileOf(r.ceil)), mat(r.ceil), (x0 + x1) / 2, y + r.h - 0.004, (z0 + z1) / 2, { cast: false, static: false });
        m.rotation.x = Math.PI / 2;
        m.updateMatrix();
        m.matrixAutoUpdate = false;
        // occluder above (also what's above an attic / roof)
        world.addBox(x0, y + r.h + 0.005, z0, x1, y + r.h + 0.2, z1, { kind: 'slab', solid: false });
        // a solid ceiling so nothing can stand inside the slab
      }
    }
  }
}

// --------------------------------------------------------------------------- stairs
function buildStairs(levels, world) {
  for (const ramp of RAMPS) {
    world.addRamp(ramp);
    const [x0, z0, x1, z1] = ramp.rect;
    const rise = ramp.b.y - ramp.a.y;
    const lowY = Math.min(ramp.a.y, ramp.b.y);
    const run = Math.abs(ramp.b.at - ramp.a.at);
    const n = Math.round(Math.abs(rise) / 0.19);
    const stepRun = run / n;
    const dir = Math.sign(ramp.b.at - ramp.a.at); // along z from a towards b
    const group = levels[lowY === -3 ? 'B' : lowY === 0 ? 'G' : 'U'];
    const treadM = ramp.look === 'rough' ? mat('concrete') : mat('floorDark');
    const sideM = ramp.look === 'rough' ? mat('brickCellar') : mat('wood');
    const w = x1 - x0;
    for (let i = 0; i < n; i++) {
      const pA = ramp.a.at + dir * i * stepRun, pB = pA + dir * stepRun;
      const za = Math.min(pA, pB), zb = Math.max(pA, pB);
      // tread passes through the ramp at the step center (feet stay within half a riser)
      const top = ramp.a.y + rise * (i + 0.5) / n;
      const hgt = top - lowY;
      if (hgt <= 0.01) continue;
      addMesh(group, boxGeo(w, hgt, zb - za + 0.01, 1.2), sideM, (x0 + x1) / 2, lowY + hgt / 2, (za + zb) / 2);
      addMesh(group, boxGeo(w + 0.02, 0.035, zb - za + 0.03, 1.2), treadM, (x0 + x1) / 2, top - 0.015, (za + zb) / 2, { cast: false });
      if (ramp.look === 'grand') {
        addMesh(group, boxGeo(w * 0.62, 0.012, zb - za + 0.035, 1), mat('carpetRed'), (x0 + x1) / 2, top + 0.005, (za + zb) / 2, { cast: false });
      }
    }
    if (ramp.look === 'grand') {
      // banister along the open side (x = x0) : stepped collision + visual handrail
      const g = levels.G;
      const len = Math.hypot(run, rise);
      for (let i = 0; i < 9; i++) {
        const z = ramp.b.at + i * (run / 8);
        const y = ramp.b.y + (ramp.a.y - ramp.b.y) * (i / 8);
        const post = addMesh(g, boxGeo(0.07, 1.0, 0.07), mat('wood'), x0 + 0.04, y + 0.5, z);
        post.castShadow = true;
      }
      const rail = new THREE.Mesh(boxGeo(0.08, 0.06, len), mat('wood'));
      rail.position.set(x0 + 0.04, (ramp.a.y + ramp.b.y) / 2 + 1.0, (ramp.a.at + ramp.b.at) / 2);
      rail.rotation.x = Math.atan2(rise, run);
      rail.castShadow = true;
      g.add(rail);
      for (let i = 0; i < 24; i++) {
        const z = ramp.b.at + (i + 0.5) * run / 24;
        const t = (z - ramp.a.at) / (ramp.b.at - ramp.a.at);
        const y = ramp.a.y + rise * t;
        addMesh(g, new THREE.CylinderGeometry(0.015, 0.015, 0.95, 6), mat('wood'), x0 + 0.04, y + 0.5, z);
      }
      for (let i = 0; i < 12; i++) {
        const za = ramp.b.at + i * run / 12, zb = za + run / 12;
        const yTop = ramp.a.y + rise * Math.max(0, Math.min(1, (za - ramp.a.at) / (ramp.b.at - ramp.a.at))) + 1.05;
        world.addBox(x0 - 0.05, -0.1, za, x0 + 0.08, yTop, zb, { kind: 'rail', occ: false });
      }
    }
  }
}

function buildRailings(levels, world) {
  for (const [lv, x0, z0, x1, z1] of RAILINGS) {
    const g = levels[lv];
    const y = LEVELS[lv];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const top = addMesh(g, alongX ? boxGeo(len + 0.08, 0.06, 0.08) : boxGeo(0.08, 0.06, len + 0.08), mat('wood'), cx, y + 1.0, cz);
    void top;
    const n = Math.round(len / 0.13);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      const thick = i % 8 === 0;
      addMesh(g, thick ? boxGeo(0.08, 1.0, 0.08) : new THREE.CylinderGeometry(0.014, 0.014, 0.97, 6), mat('wood'), px, y + 0.5, pz);
    }
    world.addBox(Math.min(x0, x1) - 0.06, y, Math.min(z0, z1) - 0.06, Math.max(x0, x1) + 0.06, y + 1.05, Math.max(z0, z1) + 0.06, { kind: 'rail', occ: false });
  }
}

export { roomById };
