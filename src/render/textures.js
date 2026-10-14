// Procedural PBR texture generator.
// Every surface of the house is painted here on a canvas: albedo, height (-> normal map) and roughness.
// All textures are tileable and deterministic (seeded), so the house looks identical every run.
import * as THREE from 'three';
import { makeFbm, rng, clamp, lerp, smooth } from '../core/math.js';

let SIZE = 512;
let ANISO = 4;
const cache = new Map();

export function configureTextures(size, aniso) {
  SIZE = size;
  ANISO = aniso;
}

function toTexture(canvas, srgb, repeat) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}

// paint(u, v, out, x, y) fills out = [r,g,b (0..1), height (0..1), roughness (0..1)]
function generate(key, paint, { normalStrength = 2, size = SIZE } = {}) {
  if (cache.has(key)) return cache.get(key);
  const n = size;
  const albedo = document.createElement('canvas');
  albedo.width = albedo.height = n;
  const rough = document.createElement('canvas');
  rough.width = rough.height = n;
  const norm = document.createElement('canvas');
  norm.width = norm.height = n;
  const a = albedo.getContext('2d').createImageData(n, n);
  const r = rough.getContext('2d').createImageData(n, n);
  const nm = norm.getContext('2d').createImageData(n, n);
  const height = new Float32Array(n * n);
  const out = new Float32Array(5);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      out[0] = out[1] = out[2] = 0.5; out[3] = 0.5; out[4] = 0.8;
      paint(x / n, y / n, out, x, y);
      const i = (y * n + x) * 4;
      a.data[i] = clamp(out[0], 0, 1) * 255;
      a.data[i + 1] = clamp(out[1], 0, 1) * 255;
      a.data[i + 2] = clamp(out[2], 0, 1) * 255;
      a.data[i + 3] = 255;
      // three.js reads roughness from G channel (and metalness from B)
      const ro = clamp(out[4], 0.02, 1) * 255;
      r.data[i] = ro; r.data[i + 1] = ro; r.data[i + 2] = 0; r.data[i + 3] = 255;
      height[y * n + x] = out[3];
    }
  }
  // Sobel normal map (tileable wrap)
  const h = (x, y) => height[(((y + n) % n) * n) + ((x + n) % n)];
  const s = normalStrength * (n / 512);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
      const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1));
      let nx = -dx * s, ny = dy * s, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * n + x) * 4;
      nm.data[i] = (nx / l * 0.5 + 0.5) * 255;
      nm.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      nm.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      nm.data[i + 3] = 255;
    }
  }
  albedo.getContext('2d').putImageData(a, 0, 0);
  rough.getContext('2d').putImageData(r, 0, 0);
  norm.getContext('2d').putImageData(nm, 0, 0);
  const set = {
    map: toTexture(albedo, true),
    roughnessMap: toTexture(rough, false),
    normalMap: toTexture(norm, false),
    canvas: albedo,
  };
  cache.set(key, set);
  return set;
}

const hex = (c) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
function mix3(out, c1, c2, t) {
  out[0] = lerp(c1[0], c2[0], t); out[1] = lerp(c1[1], c2[1], t); out[2] = lerp(c1[2], c2[2], t);
}

// ------------------------------------------------------------------ painters

export function woodFloor(seed = 3, tint = 0x5a3b24) {
  const base = hex(tint);
  const grain = makeFbm(seed, 4, 5);
  const fine = makeFbm(seed + 9, 16, 3);
  const dirt = makeFbm(seed + 20, 3, 4);
  const R = rng(seed);
  const planks = 6;
  const offsets = Array.from({ length: planks }, () => R());
  const tints = Array.from({ length: planks * 4 }, () => R.range(0.75, 1.15));
  return generate('woodFloor' + seed + tint, (u, v, o) => {
    const p = Math.floor(u * planks);
    const pu = u * planks - p;
    const vv = (v + offsets[p]) % 1;
    const seg = Math.floor(vv * 2);
    const sv = vv * 2 - seg;
    const k = tints[p * 4 + seg];
    const g = grain(u * 0.3 + p * 0.17, vv * 0.25) * 0.6 + fine(pu * 0.2 + p, vv) * 0.4;
    const ring = Math.sin((g * 18 + pu * 2) * Math.PI) * 0.5 + 0.5;
    let c = (0.65 + ring * 0.35) * k;
    const gap = pu < 0.02 || pu > 0.98 || sv < 0.006 || sv > 0.994;
    const d = smooth(clamp((dirt(u, v) - 0.45) * 3, 0, 1));
    o[0] = base[0] * c * (1 - d * 0.45);
    o[1] = base[1] * c * (1 - d * 0.5);
    o[2] = base[2] * c * (1 - d * 0.5);
    if (gap) { o[0] *= 0.25; o[1] *= 0.25; o[2] *= 0.25; }
    o[3] = gap ? 0.2 : 0.55 + ring * 0.02 + fine(u, v) * 0.015;
    o[4] = 0.45 + d * 0.35 + (1 - ring) * 0.1;
  }, { normalStrength: 1.6 });
}

export function wallpaper(seed, c1, c2, opts = {}) {
  const A = hex(c1), B = hex(c2);
  const stain = makeFbm(seed, 3, 5);
  const fine = makeFbm(seed + 5, 32, 2);
  const mold = makeFbm(seed + 11, 6, 4);
  const stripes = opts.stripes || false;
  return generate('wallpaper' + seed + c1 + c2 + stripes, (u, v, o) => {
    let t;
    if (stripes) {
      t = Math.sin(u * Math.PI * 2 * 12) > 0.3 ? 1 : 0;
      t = t * 0.7 + (Math.sin(u * Math.PI * 2 * 48) > 0.7 ? 0.3 : 0);
    } else {
      // damask-like motif
      const cu = (u * 4) % 1 - 0.5, cv = (v * 3) % 1 - 0.5;
      const r = Math.hypot(cu * 1.3, cv);
      const ang = Math.atan2(cv, cu);
      const petal = Math.abs(Math.sin(ang * 3)) * 0.22 + 0.12;
      t = r < petal ? 1 : 0;
      const ou = ((u * 4 + 0.5) % 1) - 0.5, ov = ((v * 3 + 0.5) % 1) - 0.5;
      if (Math.hypot(ou * 1.4, ov * 0.9) < 0.1) t = 1;
      if (Math.abs(Math.abs(cu) - 0.5) < 0.01) t = 0.5;
    }
    mix3(o, A, B, t * 0.55);
    const s = stain(u, v);
    const st = smooth(clamp((s - 0.52) * 4, 0, 1));
    const m = smooth(clamp((mold(u, v) - 0.6) * 4, 0, 1)) * smooth(clamp((v - 0.55) * 2, 0, 1));
    const f = fine(u, v) * 0.1 + 0.95;
    o[0] = o[0] * f * (1 - st * 0.35) * (1 - m * 0.6) + st * 0.05;
    o[1] = o[1] * f * (1 - st * 0.4) * (1 - m * 0.5) + st * 0.035;
    o[2] = o[2] * f * (1 - st * 0.55) * (1 - m * 0.6);
    // peeling seams every 1/2 of the tile
    const seam = Math.abs(((u * 2) % 1) - 0.5) > 0.495;
    o[3] = 0.5 + t * 0.03 + (seam ? 0.06 : 0) - st * 0.03;
    o[4] = 0.75 + st * 0.1 - t * 0.1;
  }, { normalStrength: 1.4 });
}

export function plaster(seed, color = 0xbdb5a6) {
  const C = hex(color);
  const n = makeFbm(seed, 4, 6);
  const crack = makeFbm(seed + 3, 8, 4);
  const mask = makeFbm(seed + 5, 3, 3);
  const stain = makeFbm(seed + 7, 2, 4);
  return generate('plaster' + seed + color, (u, v, o) => {
    const b = n(u, v);
    const cr = Math.abs(crack(u, v) - 0.5) < 0.004 && mask(u, v) > 0.62 ? 1 : 0;
    const st = smooth(clamp((stain(u, v) - 0.5) * 3, 0, 1));
    const k = 0.85 + b * 0.25;
    o[0] = C[0] * k * (1 - st * 0.4) * (1 - cr * 0.6);
    o[1] = C[1] * k * (1 - st * 0.42) * (1 - cr * 0.6);
    o[2] = C[2] * k * (1 - st * 0.5) * (1 - cr * 0.6);
    o[3] = 0.5 + b * 0.06 - cr * 0.12;
    o[4] = 0.85 + b * 0.1;
  }, { normalStrength: 1.5 });
}

export function tiles(seed, color = 0xd8d4c8, count = 8, opts = {}) {
  const C = hex(color);
  const n = makeFbm(seed, 8, 4);
  const dirt = makeFbm(seed + 2, 3, 5);
  const R = rng(seed);
  const tint = Array.from({ length: count * count }, () => R.range(0.9, 1.05));
  const checker = opts.checker;
  return generate('tiles' + seed + color + count + !!checker, (u, v, o) => {
    const tu = u * count, tv = v * count;
    const iu = Math.floor(tu), iv = Math.floor(tv);
    const fu = tu - iu, fv = tv - iv;
    const g = 0.04;
    const grout = fu < g || fv < g;
    const d = smooth(clamp((dirt(u, v) - 0.45) * 2.5, 0, 1));
    let k = tint[(iv % count) * count + (iu % count)];
    if (checker && (iu + iv) % 2) k *= 0.18;
    if (grout) {
      o[0] = 0.32 - d * 0.15; o[1] = 0.3 - d * 0.15; o[2] = 0.27 - d * 0.14;
      o[3] = 0.2; o[4] = 0.95;
    } else {
      const e = Math.min(fu - g, fv - g, 1 - fu, 1 - fv);
      o[0] = C[0] * k * (1 - d * 0.35); o[1] = C[1] * k * (1 - d * 0.35); o[2] = C[2] * k * (1 - d * 0.4);
      o[3] = 0.6 + Math.min(e * 6, 0.1) + n(u, v) * 0.02;
      o[4] = 0.12 + d * 0.5;
    }
  }, { normalStrength: 3 });
}

export function concrete(seed, color = 0x6e6a64, wet = 0) {
  const C = hex(color);
  const n = makeFbm(seed, 4, 6);
  const puddle = makeFbm(seed + 13, 2, 4);
  const spots = makeFbm(seed + 17, 24, 2);
  return generate('concrete' + seed + color + wet, (u, v, o) => {
    const b = n(u, v);
    const p = wet ? smooth(clamp((puddle(u, v) - 0.55) * 6, 0, 1)) * wet : 0;
    const k = 0.75 + b * 0.4 + (spots(u, v) > 0.7 ? -0.1 : 0);
    o[0] = C[0] * k * (1 - p * 0.35); o[1] = C[1] * k * (1 - p * 0.33); o[2] = C[2] * k * (1 - p * 0.3);
    o[3] = 0.5 + b * 0.25 - p * 0.15;
    o[4] = lerp(0.88, 0.05, p);
  }, { normalStrength: 2 });
}

export function brick(seed, color = 0x6b3a2a) {
  const C = hex(color);
  const n = makeFbm(seed, 8, 5);
  const soot = makeFbm(seed + 4, 2, 4);
  const R = rng(seed);
  const rows = 8, cols = 4;
  const tint = Array.from({ length: rows * cols * 2 }, () => R.range(0.75, 1.15));
  return generate('brick' + seed + color, (u, v, o) => {
    const rv = v * rows;
    const row = Math.floor(rv);
    const ru = u * cols + (row % 2) * 0.5;
    const col = Math.floor(ru);
    const fu = ru - col, fv = rv - row;
    const mortar = fu < 0.05 || fv < 0.1;
    const s = smooth(clamp((soot(u, v) - 0.4) * 2, 0, 1));
    if (mortar) {
      o[0] = o[1] = o[2] = 0.35 * (1 - s * 0.7); o[3] = 0.2; o[4] = 0.95;
    } else {
      const k = tint[(row * cols + (col % cols)) % tint.length] * (0.85 + n(u, v) * 0.3);
      o[0] = C[0] * k * (1 - s * 0.8); o[1] = C[1] * k * (1 - s * 0.8); o[2] = C[2] * k * (1 - s * 0.8);
      o[3] = 0.6 + n(u, v) * 0.15; o[4] = 0.9;
    }
  }, { normalStrength: 3 });
}

export function fabric(seed, color, opts = {}) {
  const C = hex(color);
  const n = makeFbm(seed, 6, 4);
  const stain = makeFbm(seed + 1, 3, 4);
  const weave = opts.weave || 96;
  const pattern = opts.pattern || null;
  return generate('fabric' + seed + color + weave + pattern, (u, v, o) => {
    const wu = Math.sin(u * Math.PI * 2 * weave), wv = Math.sin(v * Math.PI * 2 * weave);
    const w = (wu * wv) * 0.5 + 0.5;
    let k = 0.82 + w * 0.12 + n(u, v) * 0.15;
    if (pattern === 'plaid') {
      const a = Math.abs(Math.sin(u * Math.PI * 8)) > 0.85 ? 0.7 : 1;
      const b = Math.abs(Math.sin(v * Math.PI * 8)) > 0.85 ? 0.7 : 1;
      k *= a * b;
    } else if (pattern === 'floral') {
      const cu = (u * 6) % 1 - 0.5, cv = (v * 6) % 1 - 0.5;
      if (Math.hypot(cu, cv) < 0.18) k *= 1.25;
    }
    const st = smooth(clamp((stain(u, v) - 0.58) * 4, 0, 1));
    o[0] = C[0] * k * (1 - st * 0.3); o[1] = C[1] * k * (1 - st * 0.4); o[2] = C[2] * k * (1 - st * 0.45);
    o[3] = 0.5 + w * 0.1;
    o[4] = 0.92;
  }, { normalStrength: 1.2 });
}

export function furnitureWood(seed, color = 0x3d2617) {
  const C = hex(color);
  const g = makeFbm(seed, 3, 5);
  const fine = makeFbm(seed + 2, 24, 2);
  const wear = makeFbm(seed + 5, 4, 4);
  return generate('fwood' + seed + color, (u, v, o) => {
    const x = g(u * 0.4, v * 3);
    const ring = Math.sin((x * 22 + u * 3) * Math.PI) * 0.5 + 0.5;
    const w = smooth(clamp((wear(u, v) - 0.6) * 4, 0, 1));
    const k = 0.7 + ring * 0.3 + fine(u, v) * 0.1;
    o[0] = C[0] * k + w * 0.08; o[1] = C[1] * k + w * 0.05; o[2] = C[2] * k + w * 0.03;
    o[3] = 0.5 + ring * 0.05;
    o[4] = 0.35 + w * 0.4 + ring * 0.1;
  }, { normalStrength: 1.2 });
}

export function paintedWood(seed, color = 0xd9d2c2) {
  const C = hex(color);
  const chip = makeFbm(seed, 12, 4);
  const grime = makeFbm(seed + 3, 2, 4);
  const wood = hex(0x4a3020);
  return generate('pwood' + seed + color, (u, v, o) => {
    const c = chip(u, v);
    const chipped = c > 0.74;
    const gr = smooth(clamp((grime(u, v) - 0.45) * 2, 0, 1));
    if (chipped) { o[0] = lerp(wood[0], C[0], 0.35); o[1] = lerp(wood[1], C[1], 0.35); o[2] = lerp(wood[2], C[2], 0.35); o[3] = 0.47; o[4] = 0.8; }
    else {
      const k = 0.92 + c * 0.1;
      o[0] = C[0] * k * (1 - gr * 0.45); o[1] = C[1] * k * (1 - gr * 0.45); o[2] = C[2] * k * (1 - gr * 0.5);
      o[3] = 0.55; o[4] = 0.45 + gr * 0.35;
    }
  }, { normalStrength: 2 });
}

export function rustMetal(seed, color = 0x777b80) {
  const C = hex(color);
  const r = makeFbm(seed, 4, 6);
  const rust = hex(0x6a3418);
  return generate('rust' + seed + color, (u, v, o) => {
    const x = r(u, v);
    const t = smooth(clamp((x - 0.5) * 4, 0, 1));
    mix3(o, C, rust, t);
    const k = 0.85 + x * 0.3;
    o[0] *= k; o[1] *= k; o[2] *= k;
    o[3] = 0.5 + t * 0.1;
    o[4] = lerp(0.35, 0.95, t);
  }, { normalStrength: 1.5 });
}

export function carpet(seed, c1, c2) {
  const A = hex(c1), B = hex(c2);
  const n = makeFbm(seed, 32, 3);
  const wear = makeFbm(seed + 4, 3, 4);
  return generate('carpet' + seed + c1 + c2, (u, v, o) => {
    const bu = Math.min(u, 1 - u), bv = Math.min(v, 1 - v);
    const border = Math.min(bu, bv) < 0.08 ? 1 : 0;
    const cu = u - 0.5, cv = v - 0.5;
    const med = Math.abs(Math.abs(cu) + Math.abs(cv) - 0.25) < 0.03 ? 1 : 0;
    mix3(o, A, B, Math.max(border, med));
    const w = smooth(clamp((wear(u, v) - 0.5) * 3, 0, 1));
    const k = 0.8 + n(u, v) * 0.35;
    o[0] *= k * (1 - w * 0.3); o[1] *= k * (1 - w * 0.3); o[2] *= k * (1 - w * 0.3);
    o[3] = 0.5 + n(u, v) * 0.2;
    o[4] = 0.97;
  }, { normalStrength: 2 });
}

export function exterior(seed) {
  const n = makeFbm(seed, 4, 5);
  return generate('ext' + seed, (u, v, o) => {
    const b = n(u, v);
    const board = Math.abs(((v * 10) % 1) - 0.5) > 0.47;
    const k = 0.25 + b * 0.15;
    o[0] = k * 0.9; o[1] = k * 0.92; o[2] = k; o[3] = board ? 0.3 : 0.5; o[4] = 0.9;
  });
}

// A canvas "sprite" texture (no tiling), used for decals: blood drops, footprints, paintings, labels...
export function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}
