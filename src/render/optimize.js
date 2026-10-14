// Draw-call reduction.
// - Static meshes of a level are merged per material (thousands of furniture parts -> ~80 meshes per level).
// - Moving nodes (doors, drawers, cabinet doors, pickups, props... flagged userData.moving / keep) are kept,
//   but their own sub-meshes are collapsed per material in the node's local space.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const isRoot = (o) => o.userData.moving || o.userData.keep;

function ownerRoot(mesh, stop) {
  let o = mesh.parent;
  while (o && o !== stop) {
    if (isRoot(o)) return o;
    o = o.parent;
  }
  return null;
}

function bucketMerge(meshes, space) {
  // space: Object3D whose local frame receives the merged geometry
  const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
  const buckets = new Map();
  for (const m of meshes) {
    const g = m.geometry;
    const attrs = Object.keys(g.attributes).filter((n) => ['position', 'normal', 'uv', 'color'].includes(n)).sort().join(',');
    const key = m.material.uuid + '|' + attrs + '|' + m.castShadow + '|' + m.receiveShadow;
    if (!buckets.has(key)) buckets.set(key, { material: m.material, cast: m.castShadow, receive: m.receiveShadow, geos: [], names: attrs.split(',') });
    const geo = g.index ? g.toNonIndexed() : g.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    for (const name of Object.keys(geo.attributes)) if (!buckets.get(key).names.includes(name)) geo.deleteAttribute(name);
    geo.morphAttributes = {};
    buckets.get(key).geos.push(geo);
  }
  const out = [];
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.userData.merged = true;
    out.push(mesh);
  }
  return out;
}

// Collapse the direct mesh children of `node` per material (used for the doll's bones).
export function collapseChildren(node) {
  node.updateMatrixWorld(true);
  const meshes = node.children.filter((m) => m.isMesh && !m.userData.noMerge && !Array.isArray(m.material));
  if (meshes.length < 2) return 0;
  const merged = bucketMerge(meshes, node);
  for (const m of meshes) node.remove(m);
  for (const mm of merged) { mm.frustumCulled = false; node.add(mm); }
  return meshes.length - merged.length;
}

export function mergeStatic(levelGroup) {
  levelGroup.updateMatrixWorld(true);
  const groups = new Map(); // root (or levelGroup) -> meshes
  levelGroup.traverse((m) => {
    if (!m.isMesh || m.isSkinnedMesh || m.isReflector || !m.visible || Array.isArray(m.material)) return;
    if (m.userData.noMerge || isRoot(m)) return;
    // tiny parts (knobs, nails, books...) do not need to cast shadows
    if (m.castShadow) {
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const s = m.geometry.boundingSphere.radius * Math.max(m.scale.x, m.scale.y, m.scale.z);
      if (s < 0.06) m.castShadow = false;
    }
    const root = ownerRoot(m, levelGroup) || levelGroup;
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(m);
  });
  let removed = 0, added = 0;
  for (const [root, meshes] of groups) {
    if (root !== levelGroup && meshes.length < 2) continue;
    const merged = bucketMerge(meshes, root);
    if (!merged.length) continue;
    for (const m of meshes) { m.parent.remove(m); removed++; }
    for (const mm of merged) {
      if (root === levelGroup) { mm.matrixAutoUpdate = false; mm.updateMatrix(); }
      root.add(mm);
      added++;
    }
  }
  return { removed, added };
}
