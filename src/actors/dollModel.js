// The killer doll — procedural model on a real bone hierarchy (THREE.Bone).
// ~1 m tall antique porcelain doll: cracked face revealing a dark interior lit by the golden "Essence",
// realistic glass eyes that track the player, asymmetric smile with an articulated jaw, tangled half-torn hair,
// stained torn dress, visible ball joints and overly long fingers.
import * as THREE from 'three';
import { canvasTexture } from '../render/textures.js';
import { rng, makeFbm } from '../core/math.js';
import { collapseChildren } from '../render/optimize.js';

const R = rng(666);

function porcelainMaterial(map, extra = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff, map, roughness: 0.32, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.18,
    sheen: 0.2, sheenColor: new THREE.Color(0xffe8d8), ...extra,
  });
}

// ---------------------------------------------------------------- textures
function faceTextures() {
  const W = 1024, H = 512; // equirectangular around the head sphere (u = longitude, v = latitude)
  const fbm = makeFbm(5, 6, 5);
  const crackPaths = [];
  const r = rng(13);
  // main crack: forehead -> left eye socket -> cheek, plus branches. Coordinates in texture space.
  const main = [[0.47, 0.12], [0.455, 0.22], [0.445, 0.3], [0.43, 0.38], [0.435, 0.46], [0.425, 0.55], [0.41, 0.62]];
  crackPaths.push(main);
  for (let i = 0; i < 9; i++) {
    const s = main[1 + Math.floor(r() * (main.length - 2))];
    const path = [s];
    let [x, y] = s;
    const dir = r() < 0.5 ? -1 : 1;
    for (let k = 0; k < 4; k++) { x += dir * (0.008 + r() * 0.02); y += (r() - 0.3) * 0.05; path.push([x, y]); }
    crackPaths.push(path);
  }
  // hairline cracks elsewhere (back / side of the head)
  for (let i = 0; i < 14; i++) {
    let x = r(), y = 0.1 + r() * 0.5;
    const path = [[x, y]];
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 0.04; y += r() * 0.04; path.push([x, y]); }
    crackPaths.push(path);
  }
  const drawCracks = (c, color, width, glow = false) => {
    c.strokeStyle = color;
    c.lineCap = 'round';
    for (const [pi, p] of crackPaths.entries()) {
      c.lineWidth = (pi === 0 ? width * 2.2 : pi < 10 ? width * 1.2 : width * 0.6) * (glow ? 2.5 : 1);
      c.beginPath();
      p.forEach(([x, y], i) => (i ? c.lineTo(x * W, y * H) : c.moveTo(x * W, y * H)));
      c.stroke();
    }
  };
  // u = 0.5 is the face (looking +z after the sphere's default mapping is rotated, see buildHead)
  const map = canvasTexture(W, H, (c) => {
    const img = c.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = fbm(x / W, y / H);
      const i = (y * W + x) * 4;
      // ivory porcelain, slightly grey-yellow with grime in the pores
      const k = 0.86 + n * 0.12;
      img.data[i] = 236 * k; img.data[i + 1] = 226 * k; img.data[i + 2] = 212 * k; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    // cheeks blush (faded, uneven)
    const blush = (cx, cy, a) => {
      const g = c.createRadialGradient(cx * W, cy * H, 2, cx * W, cy * H, 46);
      g.addColorStop(0, `rgba(190,80,80,${a})`); g.addColorStop(1, 'rgba(190,80,80,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    };
    blush(0.43, 0.6, 0.35); blush(0.57, 0.6, 0.22);
    // dark eye sockets (subtle)
    for (const ex of [0.462, 0.538]) {
      const g = c.createRadialGradient(ex * W, 0.49 * H, 4, ex * W, 0.49 * H, 34);
      g.addColorStop(0, 'rgba(60,40,40,0.55)'); g.addColorStop(1, 'rgba(60,40,40,0)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    // painted eyebrows: thin, too high, one raised (unsettling)
    c.strokeStyle = 'rgba(60,35,25,0.85)'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(0.44 * W, 0.4 * H); c.quadraticCurveTo(0.462 * W, 0.37 * H, 0.484 * W, 0.395 * H); c.stroke();
    c.beginPath(); c.moveTo(0.516 * W, 0.385 * H); c.quadraticCurveTo(0.54 * W, 0.345 * H, 0.562 * W, 0.375 * H); c.stroke();
    // painted eyelashes under the eyes
    c.lineWidth = 1;
    for (const ex of [0.462, 0.538]) for (let k = -3; k <= 3; k++) {
      c.beginPath(); c.moveTo((ex + k * 0.004) * W, 0.52 * H); c.lineTo((ex + k * 0.0055) * W, 0.535 * H); c.stroke();
    }
    // lips: small, cupid bow, asymmetric smile (right corner pulled up)
    c.fillStyle = 'rgba(140,30,35,0.9)';
    c.beginPath();
    c.moveTo(0.478 * W, 0.668 * H);
    c.quadraticCurveTo(0.49 * W, 0.652 * H, 0.5 * W, 0.66 * H);
    c.quadraticCurveTo(0.51 * W, 0.65 * H, 0.528 * W, 0.652 * H);
    c.quadraticCurveTo(0.512 * W, 0.69 * H, 0.495 * W, 0.688 * H);
    c.quadraticCurveTo(0.484 * W, 0.684 * H, 0.478 * W, 0.668 * H);
    c.fill();
    // tiny painted teeth line
    c.strokeStyle = 'rgba(25,8,8,0.9)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0.482 * W, 0.67 * H); c.quadraticCurveTo(0.5 * W, 0.675 * H, 0.525 * W, 0.656 * H); c.stroke();
    // grime and old stains (tear-like streaks from the eyes)
    for (const ex of [0.462, 0.538]) {
      const g = c.createLinearGradient(0, 0.52 * H, 0, 0.75 * H);
      g.addColorStop(0, 'rgba(70,45,30,0.45)'); g.addColorStop(1, 'rgba(70,45,30,0)');
      c.fillStyle = g; c.fillRect((ex - 0.004) * W, 0.52 * H, 0.008 * W, 0.23 * H);
    }
    drawCracks(c, 'rgba(25,15,10,0.95)', 1.6);
  });
  // emissive: the golden Essence leaking through cracks
  const emissive = canvasTexture(W, H, (c) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.filter = 'blur(2px)';
    drawCracks(c, 'rgba(255,170,30,0.9)', 1.2, true);
    c.filter = 'none';
    drawCracks(c, 'rgba(255,210,90,1)', 0.8);
  });
  // alpha: a missing chunk of porcelain on the left temple
  const alpha = canvasTexture(W, H, (c) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#000';
    c.beginPath();
    const pts = [[0.405, 0.25], [0.425, 0.24], [0.44, 0.27], [0.435, 0.31], [0.42, 0.335], [0.405, 0.32], [0.398, 0.29]];
    pts.forEach(([x, y], i) => (i ? c.lineTo(x * W, y * H) : c.moveTo(x * W, y * H)));
    c.closePath(); c.fill();
  }, false);
  return { map, emissive, alpha };
}

function irisTexture() {
  return canvasTexture(256, 256, (c, W, H) => {
    c.fillStyle = '#f2ece0'; c.fillRect(0, 0, W, H);
    // red veins on the sclera
    c.strokeStyle = 'rgba(160,30,30,0.5)'; c.lineWidth = 1;
    const r = rng(4);
    for (let i = 0; i < 24; i++) {
      let a = r() * Math.PI * 2, d = W * 0.5;
      c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d);
      for (let k = 0; k < 6; k++) { d -= W * 0.045; a += (r() - 0.5) * 0.3; c.lineTo(W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d); }
      c.stroke();
    }
    // iris: pale grey-blue, fibrous
    const ir = W * 0.2;
    const g = c.createRadialGradient(W / 2, H / 2, ir * 0.2, W / 2, H / 2, ir);
    g.addColorStop(0, '#6f7f80'); g.addColorStop(0.6, '#9fb3b8'); g.addColorStop(0.95, '#4a5558'); g.addColorStop(1, '#1d2224');
    c.fillStyle = g; c.beginPath(); c.arc(W / 2, H / 2, ir, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(40,50,52,0.6)';
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2 + r() * 0.05;
      c.beginPath(); c.moveTo(W / 2 + Math.cos(a) * ir * 0.3, H / 2 + Math.sin(a) * ir * 0.3);
      c.lineTo(W / 2 + Math.cos(a) * ir * (0.8 + r() * 0.2), H / 2 + Math.sin(a) * ir * (0.8 + r() * 0.2)); c.stroke();
    }
    // limbal ring
    c.strokeStyle = '#111'; c.lineWidth = 3; c.beginPath(); c.arc(W / 2, H / 2, ir, 0, Math.PI * 2); c.stroke();
  });
}

function dressTextures() {
  const W = 512, H = 512;
  const fbm = makeFbm(21, 8, 5);
  const stains = makeFbm(22, 3, 4);
  const map = canvasTexture(W, H, (c) => {
    const img = c.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const n = fbm(x / W, y / H);
      // lace weave
      const lace = (Math.sin(x * 0.9) * Math.sin(y * 0.9) > 0.6) ? 0.85 : 1;
      const st = Math.max(0, stains(x / W, y / H) - 0.55) * 3;
      const hem = Math.max(0, (y / H - 0.6) * 2.2); // dirt rising from the hem
      const k = (0.8 + n * 0.2) * lace;
      img.data[i] = Math.max(0, 222 * k - st * 120 - hem * 90);
      img.data[i + 1] = Math.max(0, 210 * k - st * 150 - hem * 100);
      img.data[i + 2] = Math.max(0, 188 * k - st * 150 - hem * 110);
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    // old blood spatter on the chest / skirt
    c.fillStyle = 'rgba(80,10,10,0.75)';
    const r = rng(9);
    for (let i = 0; i < 60; i++) { c.beginPath(); c.arc(W * (0.3 + r() * 0.35), H * (0.08 + r() * 0.3), 1 + r() * 6, 0, Math.PI * 2); c.fill(); }
    // vertical pleats
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < W; x += 16) { c.lineWidth = 3; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 4, H); c.stroke(); }
  });
  // alpha with torn holes and a ragged hem (bottom of the texture)
  const alpha = canvasTexture(W, H, (c) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#000';
    const r = rng(31);
    // ragged hem
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) c.lineTo(x, H - 6 - r() * 40 - (r() < 0.1 ? 60 : 0));
    c.lineTo(W, H); c.fill();
    // tears
    for (let i = 0; i < 6; i++) {
      const cx = r() * W, cy = H * (0.45 + r() * 0.4);
      c.beginPath(); c.moveTo(cx, cy);
      for (let k = 0; k < 7; k++) c.lineTo(cx + (r() - 0.5) * 50, cy + (r() - 0.3) * 60);
      c.fill();
    }
  }, false);
  return { map, alpha };
}

// ---------------------------------------------------------------- geometry helpers
function headGeometry() {
  const g = new THREE.SphereGeometry(0.105, 72, 48);
  // SphereGeometry puts u=0.5 (painted face center) on +x: rotate so the face looks +z, then sculpt
  g.rotateY(-Math.PI / 2);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const y = v.y / 0.105, z = v.z / 0.105, x = v.x / 0.105;
    // elongate vertically, narrow the jaw/chin, flatten the back, plump cheeks
    let sx = 1, sy = 1.12, sz = 1;
    if (y < 0) { const t = -y; sx = 1 - t * t * 0.32; sz = 1 - t * t * 0.18; }
    if (z < 0) sz *= 0.93;
    // cheeks
    const cheek = Math.exp(-((y + 0.25) ** 2) * 25) * Math.exp(-((Math.abs(x) - 0.55) ** 2) * 20) * Math.max(0, z);
    v.x *= sx; v.y *= sy; v.z *= sz;
    v.addScaledVector(new THREE.Vector3(x, 0, z).normalize(), cheek * 0.006);
    // eye sockets (slight depression)
    for (const ex of [-0.38, 0.38]) {
      const d = Math.hypot(x - ex, y - 0.02);
      if (z > 0.6 && d < 0.25) v.z -= (0.25 - d) * 0.03;
    }
    // tiny nose
    const nose = Math.exp(-(x * x) * 60) * Math.exp(-((y + 0.15) ** 2) * 40) * Math.max(0, z - 0.8);
    v.z += nose * 0.025;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function hairGeometry() {
  const geos = [];
  const r = rng(77);
  const n = 900;
  for (let i = 0; i < n; i++) {
    // root on the upper/back scalp, skip a torn patch on the left side
    const theta = r() * Math.PI * 2;
    const phi = Math.acos(1 - r() * 1.25);
    const rootDir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    if (rootDir.z > 0.45 && rootDir.y < 0.8) continue; // keep the face clear (fringe added below)
    if (rootDir.x < -0.45 && rootDir.y < 0.75 && rootDir.y > 0.1 && rootDir.z > -0.3) continue; // torn bald patch
    const root = rootDir.clone().multiply(new THREE.Vector3(0.108, 0.12, 0.103));
    const len = 0.18 + r() * 0.34 * (rootDir.z < 0 ? 1 : 0.7);
    const pts = [root.clone()];
    const p = root.clone();
    const out = rootDir.clone(); out.y = 0; out.normalize();
    const clump = Math.floor(theta * 4) / 4; // strands clump together (greasy, tangled)
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      // hug the skull first, then fall
      if (p.y > -0.02) p.addScaledVector(out, 0.006 * (1 - t));
      else p.addScaledVector(out, 0.002);
      p.y -= len / 8;
      p.x += Math.sin(clump * 7 + k) * 0.004 + (r() - 0.5) * 0.007;
      p.z += (r() - 0.5) * 0.006 - 0.002;
      pts.push(p.clone());
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    geos.push(new THREE.TubeGeometry(curve, 8, 0.0011 + r() * 0.0012, 3, false));
  }
  // uneven fringe over the forehead
  for (let i = 0; i < 70; i++) {
    const x = -0.075 + r() * 0.15;
    const pts = [new THREE.Vector3(x * 0.5, 0.118, 0.02), new THREE.Vector3(x * 0.95, 0.1, 0.085), new THREE.Vector3(x * 1.05, 0.055 - r() * 0.05, 0.106)];
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, 0.0011, 3, false));
  }
  let total = 0;
  for (const g of geos) total += g.index.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  let o = 0;
  for (const g0 of geos) {
    const g = g0.toNonIndexed();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return m;
}

function bodiceGeometry() {
  // fitted bodice: waist -> chest -> shoulders
  const pts = [[0.068, -0.02], [0.062, 0.03], [0.064, 0.08], [0.078, 0.14], [0.08, 0.19], [0.07, 0.235], [0.045, 0.26], [0.02, 0.27]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 32);
  g.scale(1, 1, 0.78);
  return g;
}

function skirtGeometry(len = 0.36, flare = 0.2, top = 0.07) {
  const pts = [];
  for (let i = 16; i >= 0; i--) { // bottom -> top so faces point outward and v=0 is the hem
    const t = i / 16;
    pts.push(new THREE.Vector2(top + Math.pow(Math.sin(t * Math.PI / 2), 1.5) * flare, -t * len));
  }
  const g = new THREE.LatheGeometry(pts, 64);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const t = -p.getY(i) / len;
    const f = 1 + (Math.sin(a * 16) * 0.03 + Math.sin(a * 5 + 1) * 0.02) * t;
    p.setX(i, p.getX(i) * f);
    p.setZ(i, p.getZ(i) * f * 0.92);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- model
export function buildDoll() {
  const root = new THREE.Group();
  root.name = 'Doll';
  const face = faceTextures();
  const dress = dressTextures();
  const porcelain = porcelainMaterial(null, { color: 0xece2d4 });
  const headMat = porcelainMaterial(face.map, {
    emissive: new THREE.Color(0xffa020), emissiveMap: face.emissive, emissiveIntensity: 0.6,
    alphaMap: face.alpha, alphaTest: 0.5, side: THREE.DoubleSide,
  });
  const dressMat = new THREE.MeshStandardMaterial({ map: dress.map, alphaMap: dress.alpha, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92 });
  const stockingMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c2, roughness: 0.95 });
  const shoeMat = new THREE.MeshPhysicalMaterial({ color: 0x0d0b0a, roughness: 0.25, clearcoat: 1 });
  const hairMat = new THREE.MeshPhysicalMaterial({ color: 0x1c130d, roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color(0x6a5040), side: THREE.DoubleSide });
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x050302, emissive: 0xff9a10, emissiveIntensity: 0.25, roughness: 1, side: THREE.BackSide });
  const jointMat = porcelainMaterial(null, { color: 0xd8ccbc, roughness: 0.4 });

  const bones = {};
  const bone = (name, parent, x, y, z) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    (parent ? bones[parent] : root).add(b);
    bones[name] = b;
    return b;
  };
  const attach = (b, geo, m, x = 0, y = 0, z = 0, rx = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bones[b].add(mesh);
    return mesh;
  };

  // --- skeleton (bind pose: standing, arms down)
  bone('hips', null, 0, 0.5, 0);
  bone('spine', 'hips', 0, 0.08, 0);
  bone('chest', 'spine', 0, 0.12, 0);
  bone('neck', 'chest', 0, 0.13, 0);
  bone('head', 'neck', 0, 0.05, 0);
  bone('jaw', 'head', 0, -0.035, 0.03);
  for (const s of [-1, 1]) {
    const L = s < 0 ? 'L' : 'R';
    bone('shoulder' + L, 'chest', s * 0.085, 0.1, 0);
    bone('upperArm' + L, 'shoulder' + L, s * 0.03, 0, 0);
    bone('foreArm' + L, 'upperArm' + L, 0, -0.17, 0);
    bone('hand' + L, 'foreArm' + L, 0, -0.16, 0);
    for (let f = 0; f < 4; f++) {
      bone(`finger${L}${f}a`, 'hand' + L, s * (-0.015 + f * 0.011), -0.055, 0.005);
      bone(`finger${L}${f}b`, `finger${L}${f}a`, 0, -0.05, 0);
    }
    bone('thumb' + L, 'hand' + L, s * -0.02, -0.02, 0.018);
    bone('thigh' + L, 'hips', s * 0.055, -0.04, 0);
    bone('shin' + L, 'thigh' + L, 0, -0.22, 0);
    bone('foot' + L, 'shin' + L, 0, -0.2, 0);
  }

  // --- body parts
  attach('spine', bodiceGeometry(), dressMat, 0, -0.04, 0);
  // lace collar (ruffled) + sash bow at the back
  const collar = attach('chest', new THREE.TorusGeometry(0.04, 0.012, 8, 40), dressMat, 0, 0.115, 0, Math.PI / 2);
  collar.scale.set(1.1, 0.85, 1);
  const sashM = new THREE.MeshStandardMaterial({ color: 0x5a1218, roughness: 0.6 });
  const sash = attach('spine', new THREE.TorusGeometry(0.066, 0.012, 6, 32), sashM, 0, -0.005, 0, Math.PI / 2);
  sash.scale.set(1, 0.78, 1);
  for (const s of [-1, 1]) {
    const loop = attach('spine', new THREE.TorusGeometry(0.025, 0.008, 6, 16), sashM, s * 0.022, 0.0, -0.06);
    loop.rotation.y = Math.PI / 2 * 0; loop.scale.set(1, 0.6, 0.5);
    const tail = attach('spine', new THREE.BoxGeometry(0.02, 0.12, 0.004), sashM, s * 0.014, -0.065, -0.058);
    tail.rotation.z = s * 0.15;
  }
  // skirt (outer, torn) + petticoat ruffles
  const skirt = attach('hips', skirtGeometry(0.36, 0.2, 0.07), dressMat, 0, 0.05, 0);
  const pettiM = new THREE.MeshStandardMaterial({ color: 0xa8a090, side: THREE.DoubleSide, roughness: 1, alphaMap: dress.alpha, alphaTest: 0.5 });
  attach('hips', skirtGeometry(0.38, 0.17, 0.068), pettiM, 0, 0.045, 0);
  // neck + head
  attach('neck', new THREE.CylinderGeometry(0.028, 0.032, 0.07, 14), porcelain, 0, 0.02, 0);
  attach('neck', new THREE.SphereGeometry(0.032, 14, 10), jointMat, 0, -0.01, 0);
  const head = attach('head', headGeometry(), headMat, 0, 0.09, 0);
  const inner = attach('head', new THREE.SphereGeometry(0.098, 32, 24), innerMat, 0, 0.09, 0);
  inner.scale.set(0.97, 1.08, 0.95);
  // hair hangs from a pivot at the crown so it can follow gravity when the head tilts (see DollAnimator)
  const hairPivot = new THREE.Group();
  hairPivot.position.set(0, 0.19, 0);
  bones.head.add(hairPivot);
  const hair = new THREE.Mesh(hairGeometry(), hairMat);
  hair.position.set(0, -0.1, 0);
  hair.castShadow = true;
  hairPivot.add(hair);
  // mouth: a dark opening that stretches when the jaw opens (the painted lips stay on the porcelain)
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.0078, 20), new THREE.MeshBasicMaterial({ color: 0x030101 }));
  mouth.position.set(0.001, 0.0285, 0.1078);
  mouth.rotation.x = -0.35;
  mouth.scale.set(1.2, 0.12, 1);
  bones.head.add(mouth);

  // eyes
  const irisTex = irisTexture();
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(s * 0.033, 0.095, 0.0855);
    bones.head.add(eye);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0155, 32, 24), new THREE.MeshPhysicalMaterial({ map: irisTex, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.02 }));
    ball.geometry.rotateY(-Math.PI / 2); // iris painted at u=0.5 -> facing +z
    eye.add(ball);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.0028, 20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    pupil.position.z = 0.0156;
    eye.add(pupil);
    const cornea = new THREE.Mesh(new THREE.SphereGeometry(0.016, 24, 16, 0, Math.PI * 2, 0, 0.9), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0, roughness: 0, transparent: true, opacity: 0.15, clearcoat: 1 }));
    cornea.rotation.x = Math.PI / 2;
    eye.add(cornea);
    // upper eyelid (porcelain cap), can droop for the "empty" look
    const lidM = porcelainMaterial(null, { color: 0xdccfbe });
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0168, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), lidM);
    const lash = new THREE.Mesh(new THREE.TorusGeometry(0.0166, 0.0012, 4, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0x120a08 }));
    lash.rotation.x = Math.PI / 2; lash.rotation.z = Math.PI;
    lash.position.y = 0.0168 * Math.cos(Math.PI / 2.2);
    lid.add(lash);
    const lower = new THREE.Mesh(new THREE.SphereGeometry(0.0167, 16, 8, 0, Math.PI * 2, Math.PI * 0.68, Math.PI * 0.32), lidM);
    lower.rotation.x = 0.5;
    eye.add(lower);
    const lidPivot = new THREE.Group();
    lidPivot.add(lid);
    lidPivot.rotation.x = -0.9;
    eye.add(lidPivot);
    eyes.push({ group: eye, pupil, lid: lidPivot, side: s });
  }

  // arms
  for (const s of [-1, 1]) {
    const L = s < 0 ? 'L' : 'R';
    attach('shoulder' + L, new THREE.SphereGeometry(0.04, 16, 12), dressMat, s * 0.02, 0, 0); // puffed sleeve
    attach('upperArm' + L, new THREE.CylinderGeometry(0.024, 0.02, 0.15, 12), dressMat, 0, -0.08, 0);
    attach('foreArm' + L, new THREE.SphereGeometry(0.022, 14, 10), jointMat); // elbow ball joint
    const fa = attach('foreArm' + L, new THREE.CylinderGeometry(0.019, 0.015, 0.14, 14), porcelain, 0, -0.08, 0);
    if (s > 0) {
      // chipped forearm reveals the dark inside
      fa.material = porcelainMaterial(null, { color: 0xece2d4, emissive: 0xff9a10, emissiveIntensity: 0 });
      attach('foreArm' + L, new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshStandardMaterial({ color: 0x0a0503, emissive: 0xffa020, emissiveIntensity: 0.5 }), 0.012, -0.09, 0.008);
    }
    attach('hand' + L, new THREE.SphereGeometry(0.016, 12, 8), jointMat); // wrist joint
    const palm = attach('hand' + L, new THREE.BoxGeometry(0.045, 0.06, 0.015), porcelain, 0, -0.03, 0);
    void palm;
    for (let f = 0; f < 4; f++) {
      const len = 0.05 + (f === 1 || f === 2 ? 0.012 : 0);
      attach(`finger${L}${f}a`, new THREE.CylinderGeometry(0.0055, 0.005, len, 6), porcelain, 0, -len / 2, 0);
      attach(`finger${L}${f}b`, new THREE.CylinderGeometry(0.005, 0.0025, len * 0.95, 6), porcelain, 0, -len / 2, 0);
      attach(`finger${L}${f}b`, new THREE.SphereGeometry(0.0058, 6, 4), jointMat, 0, 0, 0);
    }
    attach('thumb' + L, new THREE.CylinderGeometry(0.006, 0.004, 0.045, 6), porcelain, 0, -0.022, 0);
    // legs: stockings, torn, porcelain knees
    attach('thigh' + L, new THREE.CylinderGeometry(0.031, 0.025, 0.2, 14), stockingMat, 0, -0.1, 0);
    attach('shin' + L, new THREE.SphereGeometry(0.027, 14, 10), jointMat); // knee
    attach('shin' + L, new THREE.CylinderGeometry(0.024, 0.017, 0.18, 14), s < 0 ? stockingMat : porcelain, 0, -0.1, 0);
    attach('foot' + L, new THREE.SphereGeometry(0.018, 10, 8), jointMat);
    const shoe = attach('foot' + L, new THREE.BoxGeometry(0.045, 0.03, 0.085), shoeMat, 0, -0.012, 0.02);
    shoe.geometry.translate(0, 0, 0);
    attach('foot' + L, new THREE.BoxGeometry(0.05, 0.004, 0.012), shoeMat, 0, 0.004, 0.0); // strap
  }

  // fewer draw calls: rigid parts of each bone are merged per material (eyes / mouth stay separate)
  mouth.userData.noMerge = true;
  for (const b of Object.values(bones)) collapseChildren(b);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  // a skeleton object for the record (bones are what drives everything)
  const skeleton = new THREE.Skeleton(Object.values(bones));
  // rest pose snapshot
  const rest = {};
  for (const [k, b] of Object.entries(bones)) rest[k] = b.quaternion.clone();
  return {
    root, bones, skeleton, rest, eyes, materials: { headMat, innerMat, porcelain, dressMat },
    skirt, head, jaw: bones.jaw, mouth, hairPivot,
  };
}
