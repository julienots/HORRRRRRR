// Room-by-room dressing: furniture, interactive objects, items, documents, lights, hiding spots and story decals.
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { ROOMS, OPENINGS, LEVELS, roomById } from './layout.js';
import * as F from './furniture.js';
import { mat } from '../render/materials.js';
import { canvasTexture } from '../render/textures.js';
import { itemModel } from '../game/items.js';
import { rng } from '../core/math.js';

const PI = Math.PI;

export function furnish(levels, world) {
  const content = {
    interactables: [], hides: [], pickups: [], lights: [], props: [], fixtures: {}, decals: [], animated: [],
  };
  const R = rng(77);
  let uid = 0;

  // ------------------------------------------------------------ helpers
  function register(kind, obj, data = {}) {
    const e = { id: data.id || kind + '_' + (uid++), kind, obj, enabled: true, ...data };
    obj.traverse((m) => { if (m.isMesh) m.userData.interact = e; });
    content.interactables.push(e);
    return e;
  }

  function put(roomId, obj, x, z, rot = 0, opts = {}) {
    const room = roomById[roomId];
    const lv = room.level;
    const y = LEVELS[lv] + (opts.y || 0);
    obj.position.set(x, y, z);
    obj.rotation.y = rot;
    levels[lv].add(obj);
    obj.updateMatrixWorld(true);
    obj.userData.room = roomId;
    obj.userData.level = lv;
    const size = obj.userData.size;
    if (size && !obj.userData.noCollide && opts.collide !== false) {
      const [w, h, d] = size;
      const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
      const hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2;
      obj.userData.box = world.addBox(x - hx, y, z - hz, x + hx, y + h, z + hz, {
        kind: 'furniture', occ: opts.occ ?? h > 1.3, ref: obj, low: h < 0.5,
      });
    }
    const p = obj.userData.parts;
    if (p) {
      for (const dr of p.drawers || []) register('drawer', dr.group, { part: dr, room: roomId, level: lv });
      for (const cd of p.doors || []) if (!opts.noDoors) register('cabdoor', cd.pivot, { part: cd, room: roomId, level: lv, owner: obj });
      if (p.hide && opts.hide !== false) {
        const local = p.hide.local.clone();
        const exit = p.hide.exit.clone();
        obj.localToWorld(local);
        obj.localToWorld(exit);
        const front = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
        const spot = {
          id: opts.hideId || 'hide_' + roomId + '_' + content.hides.length, kind: p.hide.kind, room: roomId, level: lv,
          pos: local, exit, front, eye: p.hide.eye, obj, doors: p.doors || [], rot,
          checkPos: exit.clone().addScaledVector(front, 0.1),
        };
        content.hides.push(spot);
        register('hide', obj, { spot, room: roomId, level: lv, hideOnly: true });
        // wardrobe doors open/close + hide are both offered through the hide interactable
        for (const cd of p.doors || []) cd.pivot.traverse((m) => { if (m.isMesh) m.userData.interact = content.interactables[content.interactables.length - 1]; });
      }
    }
    return obj;
  }

  function atWall(roomId, side, along, obj, opts = {}) {
    const [x0, z0, x1, z1] = roomById[roomId].rect;
    const d = obj.userData.size ? obj.userData.size[2] : 0.05;
    const m = 0.1 + (opts.gap ?? 0.015);
    if (side === 'N') return put(roomId, obj, along, z0 + m + d / 2, 0, opts);
    if (side === 'S') return put(roomId, obj, along, z1 - m - d / 2, PI, opts);
    if (side === 'W') return put(roomId, obj, x0 + m + d / 2, along, PI / 2, opts);
    return put(roomId, obj, x1 - m - d / 2, along, -PI / 2, opts);
  }

  function underBed(roomId, bedObj, idx = 0) {
    const [w, , l] = bedObj.userData.size;
    const rot = bedObj.rotation.y;
    const side = new THREE.Vector3(Math.cos(rot), 0, -Math.sin(rot)); // local +x
    const pos = bedObj.position.clone();
    pos.y += 0.12;
    const exit = bedObj.position.clone().addScaledVector(side, w / 2 + 0.55);
    const spot = {
      id: 'hide_bed_' + roomId + idx, kind: 'bed', room: roomId, level: bedObj.userData.level, pos, exit,
      front: side.clone(), eye: 0.18, obj: bedObj, doors: [], rot, checkPos: bedObj.position.clone().addScaledVector(side, w / 2 + 0.45), length: l,
    };
    content.hides.push(spot);
    register('hide', bedObj, { spot, room: roomId, level: spot.level });
    return spot;
  }

  // item can be put in the world or inside a drawer (`parent` = drawer part)
  function pickup(itemId, roomId, x, y, z, parent = null, extra = {}) {
    const model = itemModel(extra.doc ? 'document' : itemId);
    model.userData.moving = true;
    model.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    const lv = roomById[roomId].level;
    if (parent) {
      parent.inner.add(model);
      model.position.set(x, 0, z);
    } else {
      model.position.set(x, LEVELS[lv] + y, z);
      model.rotation.y = R() * PI * 2;
      levels[lv].add(model);
    }
    const e = register(extra.doc ? 'doc' : 'pickup', model, { item: itemId, doc: extra.doc, room: roomId, level: lv, model, drawer: parent, ...extra });
    content.pickups.push(e);
    return e;
  }

  function light(roomId, x, y, z, opts = {}) {
    const lv = roomById[roomId].level;
    const L = {
      id: opts.id || 'light_' + content.lights.length, room: roomId, level: lv,
      pos: new THREE.Vector3(x, LEVELS[lv] + y, z),
      color: new THREE.Color(opts.color ?? 0xffd2a0), intensity: opts.intensity ?? 6, range: opts.range ?? 8,
      kind: opts.kind || 'ceiling', needsPower: opts.needsPower ?? true, on: opts.on ?? true,
      flicker: opts.flicker ?? 0, bulbM: opts.bulbM || null, flame: opts.flame || null, broken: false, base: opts.intensity ?? 6,
    };
    content.lights.push(L);
    return L;
  }

  function ceilingLamp(roomId, x, z, kind = 'pendant', opts = {}) {
    const room = roomById[roomId];
    const lamp = F.ceilingLamp(kind);
    lamp.position.set(x, LEVELS[room.level] + room.h, z);
    levels[room.level].add(lamp);
    const p = lamp.userData.parts;
    return light(roomId, x, room.h + p.lightOffset.y, z, { bulbM: p.bulbM, ...opts });
  }

  function candleAt(roomId, x, y, z, h = 0.2) {
    const c = F.candle(h);
    put(roomId, c, x, z, 0, { y, collide: false });
    const L = light(roomId, x, y + h + 0.05, z, { kind: 'candle', needsPower: false, color: 0xff9a40, intensity: 0.9, range: 4, flicker: 0.35, flame: c.userData.parts.flame });
    c.userData.parts.flame.userData.keep = true;
    content.animated.push({ type: 'flame', mesh: c.userData.parts.flame, light: L });
    return c;
  }

  function prop(kind, roomId, x, z, opts = {}) {
    let m;
    if (kind === 'bottle') m = itemModel('bottle');
    else if (kind === 'can') { m = new THREE.Group(); F.C(m, 0.033, 0.033, 0.12, 'metal', 0, 0.06, 0, 12); }
    else { m = new THREE.Group(); F.B(m, 0.07, 0.07, 0.07, R() < 0.5 ? 'paintRed' : 'paintGreen', 0, 0.035, 0); }
    const lv = roomById[roomId].level;
    m.userData.moving = true;
    m.position.set(x, LEVELS[lv] + (opts.y || 0), z);
    m.rotation.y = R() * PI * 2;
    if (opts.lying) m.rotation.z = PI / 2;
    levels[lv].add(m);
    const pr = { kind, mesh: m, level: lv, room: roomId, vel: new THREE.Vector3(), radius: 0.12, onShelf: !!opts.y, baseY: LEVELS[lv], fallen: !!opts.lying, cooldown: 0 };
    content.props.push(pr);
    if (kind === 'bottle') {
      const e = register('pickup', m, { item: 'bottle', room: roomId, level: lv, model: m, prop: pr, repeatable: false });
      pr.pickup = e;
      content.pickups.push(e);
    }
    return pr;
  }

  function decal(roomId, kind, x, z, size = 1, opts = {}) {
    const lv = roomById[roomId].level;
    const tex = decalTexture(kind, opts.text);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size * (opts.aspect || 1), size), new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthWrite: false, roughness: kind === 'blood' ? 0.15 : 0.9, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    if (opts.wall) {
      m.position.set(x, LEVELS[lv] + (opts.y || 1.5), z);
      m.rotation.y = opts.rot || 0;
    } else {
      m.rotation.x = -PI / 2;
      m.rotation.z = opts.rot ?? R() * PI * 2;
      m.position.set(x, LEVELS[lv] + 0.008 + (opts.y || 0), z);
    }
    m.receiveShadow = true;
    levels[lv].add(m);
    content.decals.push(m);
    return m;
  }

  function movable(obj) {
    obj.userData.keep = true;
    (content.movables ||= []).push(obj);
    return obj;
  }

  function examine(obj, text, roomId) {
    return register('examine', obj, { text, room: roomId, level: roomById[roomId].level });
  }

  // ============================================================ ÉTAGE
  // ---- Chambre d'amis (départ)
  {
    const r = 'guest';
    const b = put(r, F.bed(1.4, 2.1, 'fabricBlue'), 21, 12.27, 0);
    underBed(r, b);
    const ns = atWall(r, 'N', 19.6, F.nightstand());
    pickup('flashlight', r, 0, 0, 0.02, ns.userData.parts.drawers[0], { first: true });
    const ns2 = atWall(r, 'N', 22.4, F.nightstand());
    void ns2;
    const lanternY = 0.62;
    // battery lantern, dying
    const lan = new THREE.Group();
    F.C(lan, 0.06, 0.07, 0.03, 'metal', 0, 0.015, 0, 12);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12), new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffb060, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }));
    glow.position.y = 0.1;
    lan.add(glow);
    F.C(lan, 0.06, 0.05, 0.03, 'metal', 0, 0.18, 0, 12);
    put(r, lan, 22.4, 11.3, 0, { y: lanternY, collide: false });
    light(r, 22.4, lanternY + 0.25, 11.4, { kind: 'lantern', needsPower: false, intensity: 1.4, range: 5, flicker: 0.5, color: 0xffc080, bulbM: glow.material, id: 'guestLantern' });
    atWall(r, 'E', 16.6, F.wardrobe(1.1, 2.1, 0.6), { hideId: 'hide_guest_wardrobe' });
    const dr = atWall(r, 'S', 18.6, F.dresser(1.1));
    pickup('bandage', r, 18.4, 0.93, 17.6);
    void dr;
    put(r, F.chair('wood'), 23.2, 13.5, -2.4);
    put(r, F.rug(2.2, 1.6, 'carpetBlue'), 20.3, 15.2, 0.1);
    atWall(r, 'W', 12.4, F.painting(0.5, 0.65, 'landscape', 3), { y: 1.6, collide: false });
    atWall(r, 'S', 22.6, F.painting(0.4, 0.55, 'portrait', 9), { y: 1.7, collide: false });
    ceilingLamp(r, 20.5, 14.5);
    decal(r, 'blood', 20.2, 14.2, 0.9);
    decal(r, 'drag', 19.0, 14.4, 1.4, { rot: PI / 2 });
    content.fixtures.spawn = { pos: new THREE.Vector3(20.2, LEVELS.U, 14.2), yaw: -PI / 2 };
  }
  // ---- Galerie
  {
    const r = 'gallery';
    const chair = put(r, F.chair('woodBlack', 'fabricPink'), 10.0, 17.35, PI);
    content.fixtures.dollSeat = { pos: new THREE.Vector3(10.0, LEVELS.U + 0.5, 17.25), yaw: PI, chair };
    chair.userData.keep = true;
    atWall(r, 'W', 12.2, F.table(1.2, 0.4, 'woodBlack', 0.8));
    candleAt(r, 9.5, 0.8, 11.9, 0.15);
    atWall(r, 'S', 12, F.painting(0.9, 1.2, 'girl', 21), { y: 1.7, collide: false });
    atWall(r, 'E', 12.0, F.bookshelf(1.0, 2.0, 0.32, 'wood', 7));
    atWall(r, 'E', 17.2, F.trunk('woodBlack'));
    put(r, F.rug(1.1, 4.5, 'carpetRed'), 11.2, 14.8, 0);
    ceilingLamp(r, 11, 14.5, 'pendant');
    ceilingLamp(r, 16, 14.5, 'pendant');
    prop('can', r, 16.2, 12.5);
  }
  // ---- Couloir de l'étage
  {
    const r = 'corridorU';
    const clk = atWall(r, 'N', 14.0, F.clock());
    content.fixtures.clock = clk;
    clk.userData.parts.pendulum.userData.keep = true;
    content.animated.push({ type: 'pendulum', mesh: clk.userData.parts.pendulum });
    atWall(r, 'N', 10.2, F.table(0.8, 0.4, 'wood', 0.8));
    movable(put(r, F.sittingToy('doll'), 10.2, 7.35, 0.3, { y: 0.8, collide: false }));
    put(r, F.rug(6.5, 1.1, 'carpetRed'), 13, 9, 0);
    atWall(r, 'N', 11.0, F.painting(0.4, 0.5, 'portrait', 4), { y: 1.6, collide: false });
    ceilingLamp(r, 11, 9, 'pendant');
    ceilingLamp(r, 15, 9, 'bare');
    prop('bottle', r, 16.4, 10.4, { lying: true });
  }
  // ---- Chambre parentale
  {
    const r = 'master';
    const b = put(r, F.bed(1.8, 2.15, 'fabricBed'), 4.5, 11.25, 0);
    underBed(r, b);
    const n1 = atWall(r, 'N', 3.05, F.nightstand());
    const n2 = atWall(r, 'N', 5.95, F.nightstand());
    pickup('bandage', r, 0, 0, 0, n2.userData.parts.drawers[0]);
    void n1;
    atWall(r, 'E', 11.4, F.wardrobe(1.3, 2.15, 0.62), { hideId: 'hide_master_wardrobe' });
    atWall(r, 'W', 16.6, F.wardrobe(1.0, 2.0, 0.6, 'woodBlack', { slats: true }), { hideId: 'hide_master_slats' });
    atWall(r, 'S', 6.8, F.dresser(1.4));
    atWall(r, 'S', 6.8, F.mirror(0.8, 0.9), { y: 1.55, collide: false, gap: 0.0 });
    put(r, F.armchair('fabricBlue'), 7.6, 16.6, -PI * 0.75);
    put(r, F.rug(2.8, 2, 'carpetRed'), 4.5, 14.2, 0);
    atWall(r, 'E', 16.4, F.painting(0.6, 0.8, 'portrait', 12), { y: 1.6, collide: false });
    const toy = F.sittingToy('doll');
    put(r, toy, 5.2, 11.0, 0.4, { y: 0.66, collide: false });
    movable(toy);
    ceilingLamp(r, 4.5, 14);
  }
  // ---- Chambre d'enfant
  {
    const r = 'child';
    const b = put(r, F.bed(1.0, 1.9, 'fabricPink', 'paintWhite'), 2.0, 8.88, PI);
    underBed(r, b);
    // the wardrobe hiding the secret passage (slides when the music box plays)
    const w = atWall(r, 'N', 4.5, F.wardrobe(1.2, 2.0, 0.55, 'paintWhite'), { hide: false, noDoors: true });
    content.fixtures.secretWardrobe = w;
    w.userData.keep = true;
    examine(w, 'Une armoire laquée. Les portes sont bloquées… et elle est étrangement décollée du mur.', r);
    atWall(r, 'N', 7.6, F.crib());
    const horse = put(r, F.rockingHorse(), 6.4, 7.2, -0.6);
    content.fixtures.horse = horse;
    horse.userData.keep = true;
    put(r, F.toyBlocks(4), 4.2, 6.6, 0, { collide: false });
    const shelf = atWall(r, 'E', 5.3, F.bookshelf(1.0, 1.6, 0.3, 'paintWhite', 11));
    for (let i = 0; i < 4; i++) movable(put(r, F.sittingToy(i % 2 ? 'doll' : 'teddy'), 8.75, 4.95 + i * 0.22, -PI / 2, { y: 1.62, collide: false }));
    void shelf;
    const smallTable = put(r, F.table(0.6, 0.6, 'paintWhite', 0.55), 1.0, 4.0, 0);
    void smallTable;
    const mb = F.musicBox();
    put(r, mb, 1.0, 4.0, 0.3, { y: 0.55, collide: false });
    content.fixtures.musicBox = register('musicbox', mb, { room: r, level: 'U', part: mb.userData.parts });
    put(r, F.rug(2, 2, 'carpetBlue'), 4.5, 6.5, 0);
    atWall(r, 'W', 4.4, F.painting(0.45, 0.6, 'girl', 33), { y: 1.5, collide: false });
    ceilingLamp(r, 4.5, 6.5);
    prop('toy', r, 3.5, 7.4);
    prop('toy', r, 5.6, 5.4);
    decal(r, 'text', 0.12, 8.6, 0.8, { wall: true, rot: PI / 2, y: 1.7, aspect: 2.2, text: 'JOUE AVEC MOI' });
  }
  // ---- Salle de bain
  {
    const r = 'bath';
    atWall(r, 'W', 4.2, F.bathtub().rotateY(0));
    atWall(r, 'N', 11.5, F.washbasin());
    const mir = F.mirror(0.6, 0.8);
    atWall(r, 'N', 11.5, mir, { y: 1.55, collide: false, gap: 0 });
    const reflector = new Reflector(new THREE.PlaneGeometry(0.6, 0.8), { textureWidth: 512, textureHeight: 680, color: 0x8a8a8a, clipBias: 0.003 });
    reflector.position.set(11.5, LEVELS.U + 1.55, 3.0 + 0.1 + 0.04);
    levels.U.add(reflector);
    reflector.visible = false;
    content.fixtures.mirror = { reflector, pos: reflector.position.clone(), normal: new THREE.Vector3(0, 0, 1) };
    const cab = F.upperCabinets(0.6);
    atWall(r, 'N', 13.0, cab, { y: 1.6, collide: false });
    pickup('painkillers', r, 12.85, 1.27, 3.3);
    put(r, F.shower(), 14.43, 6.43, 0);
    atWall(r, 'E', 4.4, F.toilet());
    put(r, F.rug(1.0, 0.6, 'carpetBlue'), 11.0, 5.4, 0);
    ceilingLamp(r, 12, 5, 'bare');
    decal(r, 'blood', 9.8, 4.8, 0.4, { y: 0.0 });
    decal(r, 'handprint', 11.5, 3.13, 0.25, { wall: true, rot: 0, y: 1.1 });
  }
  // ---- Bureau condamné
  {
    const r = 'office';
    const desk = put(r, F.table(1.6, 0.8, 'woodBlack', 0.78), 21.5, 6.2, PI);
    void desk;
    const drawers = put(r, F.nightstand('woodBlack'), 22.0, 6.75, PI);
    drawers.userData.box.min[1] = LEVELS.U; // under the desk
    pickup('atticKey', r, 0, 0, 0, drawers.userData.parts.drawers[0]);
    pickup('letter', r, 21.2, 0.79, 6.1, null, { doc: 'augustin' });
    // tape recorder
    const rec = new THREE.Group();
    F.B(rec, 0.3, 0.08, 0.2, 'blackPlastic', 0, 0.04, 0);
    F.C(rec, 0.04, 0.04, 0.01, 'metalClean', -0.07, 0.085, 0, 16);
    F.C(rec, 0.04, 0.04, 0.01, 'metalClean', 0.07, 0.085, 0, 16);
    rec.userData.size = [0.3, 0.1, 0.2];
    put(r, rec, 22.0, 5.95, 0.2, { y: 0.78, collide: false });
    content.fixtures.recorder = register('recorder', rec, { room: r, level: 'U', doc: 'tape' });
    put(r, F.chair('woodBlack', 'fabricSofa'), 21.5, 5.2, 0);
    atWall(r, 'N', 18.2, F.bookshelf(1.2, 2.2, 0.35, 'woodBlack', 13));
    atWall(r, 'N', 19.5, F.bookshelf(1.2, 2.2, 0.35, 'woodBlack', 14));
    atWall(r, 'S', 22.5, F.dresser(1.4, 'woodBlack'));
    put(r, F.armchair('fabricSofa'), 19.4, 10.2, PI * 0.8);
    atWall(r, 'E', 9.8, F.painting(0.7, 0.9, 'portrait', 40), { y: 1.6, collide: false });
    for (let i = 0; i < 6; i++) { const p = itemModel('document'); p.position.set(18.5 + R() * 4, LEVELS.U, 6.5 + R() * 3); p.rotation.y = R() * 6; levels.U.add(p); }
    ceilingLamp(r, 20.5, 7);
    candleAt(r, 20.9, 0.78, 6.4, 0.12);
  }
  // ---- Atelier secret
  {
    const r = 'atelier';
    put(r, F.sewingTable(), 4.5, 1.5, 0);
    atWall(r, 'N', 1.2, F.shelfUnit(1.4, 2.0, 0.4, 'wood', 17));
    for (let i = 0; i < 6; i++) put(r, F.sittingToy('doll'), 0.7 + i * 0.2, 0.35, 0.1 * i, { y: 1.36, collide: false });
    atWall(r, 'N', 7.6, F.workbench(1.8));
    pickup('cellarKey', r, 7.2, 0.93, 0.5);
    pickup('letter', r, 4.0, 0.81, 1.6, null, { doc: 'workshop' });
    candleAt(r, 3.6, 0.8, 1.2);
    candleAt(r, 5.4, 0.8, 1.25, 0.15);
    candleAt(r, 8.2, 0.95, 0.4, 0.25);
    decal(r, 'text', 0.12, 1.5, 0.7, { wall: true, rot: PI / 2, y: 1.6, aspect: 2.6, text: 'UN CŒUR NEUF' });
    decal(r, 'blood', 2.5, 2.2, 0.7);
    examine(F.B(levels.U, 0.4, 1.6, 0.3, 'fabricPink', 1.0, LEVELS.U + 0.8, 2.4), 'Un mannequin de couture habillé d\'une robe d\'enfant. Elle est à sa taille. Exactement à sa taille.', r);
  }
  // ---- Escalier du grenier
  {
    ceilingLamp('stairU', 16, 6.5, 'bare', { intensity: 3, flicker: 0.15 });
  }
  // ============================================================ GRENIER
  {
    const r = 'attic';
    // roof beams
    for (let x = 8.5; x < 24; x += 1.5) {
      const beam = F.B(levels.A, 0.15, 0.2, 13, 'wood', x, LEVELS.A + 2.45, 4.5, { cast: true });
      void beam;
    }
    for (let z = -1.5; z < 11; z += 2.5) F.B(levels.A, 16, 0.18, 0.15, 'wood', 16, LEVELS.A + 2.3, z);
    put(r, F.trunk('wood'), 10.0, -1.3, 0);
    put(r, F.trunk('woodBlack'), 12.0, 10.4, PI);
    put(r, F.boxes(3, 2), 9.0, 2.5, 0.3);
    put(r, F.boxes(2, 6), 22.8, 9.8, 0.1);
    put(r, F.boxes(4, 8), 13.2, 0.8, 0.5);
    atWall(r, 'E', 1.0, F.shelfUnit(1.4, 1.9, 0.45, 'wood', 21));
    pickup('fuse', r, 23.62, 1.30, 1.0);
    atWall(r, 'N', 19.5, F.wardrobe(1.2, 2.0, 0.6, 'woodBlack'), { hideId: 'hide_attic_wardrobe' });
    const ab = put(r, F.bed(1.2, 2.0, 'fabricGrey', 'metal'), 10.4, 7.0, PI / 2);
    underBed(r, ab);
    // a row of dolls all facing the stairs
    for (let i = 0; i < 7; i++) put(r, F.sittingToy('doll'), 18.2 + i * 0.25, 8.0, PI, { y: 0, collide: false });
    put(r, F.rockingHorse(), 20.5, 1.5, 2.2);
    const rc = put(r, F.chair('wood', 'fabricGrey'), 13.5, 4.5, 0.9);
    content.fixtures.atticChair = rc;
    rc.userData.keep = true;
    // rusty key on a nail by the west skylight
    pickup('rustyKey', r, 8.25, 1.35, 3.6);
    pickup('letter', r, 10.0, 0.62, -1.3, null, { doc: 'newspaper' });
    ceilingLamp(r, 12, 2, 'bare', { intensity: 3 });
    ceilingLamp(r, 20, 6, 'bare', { intensity: 3 });
    light(r, 23.8, 1.2, 4.5, { kind: 'moon', needsPower: false, intensity: 0.6, color: 0x7f9cc8, range: 5 });
    prop('bottle', r, 14.2, 9.4, { lying: true });
    prop('can', r, 21.5, 3.5);
    decal(r, 'footprints', 18.5, 2.0, 1.2);
  }
  // ============================================================ REZ-DE-CHAUSSÉE
  // ---- Salon
  {
    const r = 'living';
    const fp = atWall(r, 'W', 12.0, F.fireplace());
    content.fixtures.fireplace = register('fireplace', fp, { room: r, level: 'G' });
    const fl = light(r, 0.6, 0.4, 12.0, { kind: 'fire', needsPower: false, on: false, color: 0xff7a30, intensity: 4, range: 7, flicker: 0.5, id: 'fireLight' });
    content.fixtures.fireplace.light = fl;
    put(r, F.sofa(2.2, 'fabricSofa'), 3.3, 12.0, -PI / 2);
    put(r, F.table(1.1, 0.6, 'woodBlack', 0.42), 2.1, 12.0, PI / 2);
    pickup('bottle', r, 2.2, 0.42, 11.8);
    const tv = atWall(r, 'S', 6.4, F.tvSet());
    content.fixtures.tv = register('tv', tv, { room: r, level: 'G', screen: tv.userData.parts.screen });
    put(r, F.armchair('fabricBlue'), 1.4, 16.6, PI * 0.75);
    const shelf = atWall(r, 'N', 7.0, F.bookshelf(1.4, 2.2, 0.35, 'wood', 23));
    void shelf;
    pickup('battery', r, 6.6, 1.38, 10.4);
    atWall(r, 'E', 16.8, F.piano());
    const sideTable = put(r, F.table(0.5, 0.5, 'wood', 0.6), 0.6, 17.3, 0);
    void sideTable;
    const rad = F.radio();
    put(r, rad, 0.6, 17.3, 0.6, { y: 0.6, collide: false });
    content.fixtures.radio = register('radio', rad, { room: r, level: 'G', pos: new THREE.Vector3(0.6, 0.8, 17.3) });
    put(r, F.rug(3, 2.2, 'carpetRed'), 2.6, 12.0, PI / 2);
    atWall(r, 'N', 1.6, F.painting(0.8, 1.0, 'portrait', 50), { y: 1.7, collide: false });
    atWall(r, 'W', 16.5, F.painting(0.7, 0.5, 'landscape', 51), { y: 1.7, collide: false });
    ceilingLamp(r, 4.5, 14);
    // floor lamp
    const fl2 = new THREE.Group();
    F.C(fl2, 0.012, 0.012, 1.5, 'brass', 0, 0.75, 0, 8);
    F.C(fl2, 0.15, 0.17, 0.02, 'brass', 0, 0.01, 0, 16);
    const shadeM = new THREE.MeshStandardMaterial({ color: 0xa08060, side: THREE.DoubleSide, emissive: 0xffaa60, emissiveIntensity: 0 });
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.3, 16, 1, true), shadeM);
    sh.position.y = 1.55;
    fl2.add(sh);
    fl2.userData.size = [0.4, 1.7, 0.4];
    put(r, fl2, 5.2, 10.6, 0);
    light(r, 5.2, 1.5, 10.6, { bulbM: shadeM, intensity: 2.5, range: 5, kind: 'lamp' });
    prop('can', r, 6.5, 13.8);
  }
  // ---- Salle à manger
  {
    const r = 'dining';
    put(r, F.table(2.4, 1.1, 'wood'), 3.5, 6.5, PI / 2);
    for (let i = 0; i < 3; i++) {
      put(r, F.chair('wood'), 2.65, 5.6 + i * 0.9, PI / 2);
      put(r, F.chair('wood'), 4.35, 5.6 + i * 0.9, -PI / 2);
    }
    // dinner set, still served
    for (let i = 0; i < 3; i++) for (const x of [3.1, 3.9]) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.015, 20), mat('ceramic'));
      plate.position.set(x, LEVELS.G + 0.775, 5.6 + i * 0.9);
      levels.G.add(plate);
    }
    candleAt(r, 3.5, 0.77, 6.5, 0.28);
    const sb = atWall(r, 'N', 3.5, F.dresser(1.8, 'woodBlack'));
    pickup('windingKey', r, 0.1, 0, 0, sb.userData.parts.drawers[2]);
    pickup('letter', r, 3.0, 0.93, 3.35, null, { doc: 'marthe1' });
    atWall(r, 'E', 8.9, F.bookshelf(1.0, 2.1, 0.4, 'woodBlack', 25));
    atWall(r, 'S', 1.5, F.clock().rotateY(0), { collide: true });
    atWall(r, 'W', 9.0, F.painting(0.7, 0.9, 'girl', 60), { y: 1.7, collide: false });
    ceilingLamp(r, 3.5, 6.5);
    prop('bottle', r, 5.8, 9.4);
  }
  // ---- Cuisine
  {
    const r = 'kitchen';
    const c1 = atWall(r, 'N', 11.0, F.counter(3.0, true, false));
    const tap = c1.userData.parts.faucet.tap;
    content.fixtures.faucet = register('faucet', tap, { room: r, level: 'G', part: c1.userData.parts.faucet });
    pickup('garageKey', r, 0.05, 0, 0.05, c1.userData.parts.drawers[3]);
    pickup('lighter', r, -0.1, 0, 0, c1.userData.parts.drawers[0]);
    const c2 = atWall(r, 'N', 13.55, F.counter(1.8, false, true));
    void c2;
    atWall(r, 'N', 13.55, F.upperCabinets(1.8), { y: 1.75, collide: false, gap: 0.1 });
    atWall(r, 'N', 8.15, F.fridge(), { hide: false });
    put(r, F.table(1.4, 0.8, 'woodLight', 0.78), 11.0, 7.0, 0);
    put(r, F.chair('woodLight', 'woodLight'), 10.5, 7.7, PI);
    put(r, F.chair('woodLight', 'woodLight'), 11.6, 6.3, 0.2);
    atWall(r, 'W', 8.8, F.wardrobe(0.9, 2.0, 0.55, 'paintGreen'), { hideId: 'hide_kitchen_pantry' });
    pickup('bottle', r, 12.4, 0.92, 3.4);
    prop('bottle', r, 9.8, 5.0);
    prop('bottle', r, 13.0, 8.8, { lying: true });
    prop('can', r, 8.6, 5.2);
    ceilingLamp(r, 11, 6.5);
    decal(r, 'blood', 12.2, 8.4, 0.6);
    decal(r, 'drag', 13.0, 9.2, 1.2, { rot: 0.5 });
  }
  // ---- Hall d'entrée
  {
    const r = 'hall';
    put(r, F.coatRack(), 9.5, 17.4, 0);
    const console1 = atWall(r, 'W', 11.0, F.table(1.0, 0.4, 'woodBlack', 0.8), { gap: 0.02 });
    void console1;
    pickup('letter', r, 9.35, 0.81, 11.0, null, { doc: 'letter' });
    candleAt(r, 9.35, 0.8, 11.5, 0.2);
    atWall(r, 'W', 11.0, F.painting(0.9, 1.1, 'portrait', 70), { y: 1.75, collide: false });
    put(r, F.rug(1.6, 3.2, 'carpetRed'), 11.4, 15.0, 0);
    atWall(r, 'N', 13.0, F.painting(0.6, 0.8, 'girl', 71), { y: 1.7, collide: false });
    const chand = ceilingLamp(r, 11.5, 14.0, 'pendant', { intensity: 8 });
    void chand;
    content.fixtures.frontDoorPos = new THREE.Vector3(11, 0, 17.6);
  }
  // ---- Couloir de service
  {
    const r = 'corridorG';
    atWall(r, 'E', 12.5, F.shelfUnit(0.9, 1.8, 0.35, 'wood', 30));
    pickup('battery', r, 16.7, 0.70, 12.4);
    ceilingLamp(r, 16, 9.5, 'bare', { flicker: 0.25 });
    ceilingLamp(r, 16, 15, 'bare');
    decal(r, 'handprint', 15.13, 13.5, 0.25, { wall: true, rot: PI / 2, y: 1.3 });
    decal(r, 'blood', 16.0, 11.5, 0.5);
    prop('can', r, 15.6, 14.2);
  }
  // ---- Escalier de la cave (haut)
  ceilingLamp('stairG', 16, 6.6, 'bare', { intensity: 3, flicker: 0.2 });
  // ---- Toilettes
  {
    const r = 'wc';
    atWall(r, 'S', 19.0, F.toilet());
    atWall(r, 'E', 15.2, F.washbasin());
    atWall(r, 'N', 18.5, F.upperCabinets(0.6), { y: 1.6, collide: false, gap: 0.1 });
    pickup('painkillers', r, 18.4, 1.28, 14.3);
    ceilingLamp(r, 18.5, 16, 'bare');
  }
  // ---- Buanderie
  {
    const r = 'laundry';
    const wm = atWall(r, 'E', 15.0, F.washingMachine());
    wm.userData.parts.drum.userData.keep = true;
    content.fixtures.washer = { obj: wm, drum: wm.userData.parts.drum, pos: wm.position.clone() };
    atWall(r, 'E', 15.65, F.washingMachine());
    atWall(r, 'N', 23.0, F.wardrobe(0.9, 2.0, 0.55, 'paintWhite', { slats: true }), { hideId: 'hide_laundry_cupboard' });
    atWall(r, 'S', 21.3, F.shelfUnit(1.4, 1.8, 0.4, 'metal', 31));
    pickup('bandage', r, 21.0, 0.70, 17.66);
    ceilingLamp(r, 22, 16, 'bare');
    prop('bottle', r, 20.6, 15.2);
  }
  // ---- Garage
  {
    const r = 'garage';
    put(r, F.car(), 21.0, 8.5, 0);
    atWall(r, 'N', 19.6, F.workbench(2.2));
    pickup('crowbar', r, 19.4, 0.93, 3.6);
    atWall(r, 'E', 12.7, F.shelfUnit(1.5, 1.9, 0.45, 'metal', 40));
    pickup('battery', r, 23.62, 0.73, 12.4);
    atWall(r, 'W', 5.0, F.wardrobe(0.9, 2.0, 0.55, 'metal', { slats: true }), { hideId: 'hide_garage_locker' });
    put(r, F.boxes(3, 41), 18.0, 12.9, 0.2);
    put(r, F.boxes(2, 42), 23.2, 3.8, 0.4);
    // first aid kit
    const kit = new THREE.Group();
    F.B(kit, 0.35, 0.25, 0.1, 'paintRed', 0, 0, 0);
    F.B(kit, 0.12, 0.03, 0.005, 'paintWhite', 0, 0, 0.052);
    F.B(kit, 0.03, 0.12, 0.005, 'paintWhite', 0, 0, 0.052);
    kit.userData.size = [0.35, 0.25, 0.1];
    atWall(r, 'N', 22.3, kit, { y: 1.4, collide: false });
    pickup('bandage', r, 22.3, 0.0, 3.55, null, { y: 0 });
    ceilingLamp(r, 19, 6, 'bare');
    ceilingLamp(r, 21, 11, 'bare');
    examine(F.B(levels.G, 0.2, 0.2, 0.2, 'metal', 23.75, 1.2, 8.5), 'La porte du garage. Une chaîne et trois cadenas. Et de l\'autre côté, quelque chose a été cloué. Impossible.', r);
    prop('can', r, 18.5, 9.0);
    prop('bottle', r, 23.0, 5.5);
  }
  // ============================================================ SOUS-SOL
  {
    const r = 'cellar';
    for (const [i, x] of [[0, 9.3], [1, 14.2], [2, 15.8]]) atWall(r, 'N', x, F.shelfUnit(1.4, 1.9, 0.45, 'wood', 50 + i));
    atWall(r, 'W', 1.0, F.wardrobe(1.1, 2.0, 0.6, 'wood'), { hideId: 'hide_cellar_wardrobe' });
    put(r, F.boxes(3, 51), 20.0, 1.6, 0.4);
    put(r, F.boxes(2, 52), 23.0, -2.0, 0.1);
    for (let i = 0; i < 4; i++) {
      const barrel = new THREE.Group();
      F.C(barrel, 0.3, 0.3, 0.9, 'wood', 0, 0.45, 0, 16);
      F.C(barrel, 0.31, 0.31, 0.04, 'metal', 0, 0.2, 0, 16);
      F.C(barrel, 0.31, 0.31, 0.04, 'metal', 0, 0.7, 0, 16);
      barrel.userData.size = [0.6, 0.9, 0.6];
      put(r, barrel, 23.2, 1.0 - i * 0.7 + 0.3, 0);
    }
    // pipes along the ceiling
    for (let i = 0; i < 3; i++) {
      const p = F.C(levels.B, 0.05, 0.05, 15, 'metal', 16, LEVELS.B + 2.7 - i * 0.12, -2.6 + i * 0.15, 10);
      p.rotation.z = PI / 2;
    }
    pickup('battery', r, 9.3, 0.73, -2.66);
    pickup('bandage', r, 14.2, 0.73, -2.66);
    ceilingLamp(r, 12, 0, 'bare', { intensity: 3, flicker: 0.1 });
    ceilingLamp(r, 20, 0, 'bare', { intensity: 3 });
    light(r, 23.8, 2.4, 0, { kind: 'moon', needsPower: false, intensity: 0.4, color: 0x7f9cc8, range: 4 });
    decal(r, 'footprints', 14.0, 0.5, 1.2);
    decal(r, 'blood', 11.6, -2.2, 0.8);
    prop('bottle', r, 18.0, -1.5, { lying: true });
    prop('bottle', r, 10.5, 1.8);
    prop('can', r, 21.0, 2.2);
  }
  {
    const r = 'boiler';
    put(r, F.boiler(), 22.6, -7.4, 0);
    const fb = F.fuseBox();
    atWall(r, 'N', 19.6, fb, { y: 1.4, collide: false });
    content.fixtures.fuseBox = register('fusebox', fb, { room: r, level: 'B', part: fb.userData.parts });
    atWall(r, 'W', -5.0, F.shelfUnit(1.2, 1.8, 0.4, 'metal', 60));
    ceilingLamp(r, 21, -6, 'bare', { intensity: 3, flicker: 0.3 });
    light(r, 22.6, 0.4, -6.9, { kind: 'pilot', needsPower: false, intensity: 0.5, range: 2.5, color: 0x4060ff });
  }
  {
    const r = 'ritual';
    // altar
    const altar = F.table(1.4, 0.7, 'woodBlack', 0.9);
    put(r, altar, 13.0, -8.3, 0);
    pickup('heart', r, 13.0, 0.92, -8.35);
    pickup('frontKey', r, 13.45, 0.91, -8.2);
    pickup('letter', r, 12.4, 0.91, -8.2, null, { doc: 'last' });
    const hl = light(r, 13.0, 1.2, -8.2, { kind: 'heart', needsPower: false, intensity: 1.2, range: 4, color: 0xffb020, flicker: 0.2, id: 'heartLight' });
    content.fixtures.heartLight = hl;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2;
      candleAt(r, 13 + Math.cos(a) * 1.6, 0, -5.8 + Math.sin(a) * 1.2, 0.12 + (i % 3) * 0.05);
    }
    put(r, F.chair('woodBlack', 'fabricPink'), 13.0, -5.8, PI);
    for (let s = 0; s < 2; s++) {
      atWall(r, 'W', -7.5 + s * 2.5, F.shelfUnit(1.2, 2.0, 0.4, 'wood', 70 + s));
      for (let i = 0; i < 5; i++) put(r, F.sittingToy('doll'), 8.35, -8.0 + s * 2.5 + i * 0.22, PI / 2, { y: 1.36, collide: false });
    }
    decal(r, 'circle', 13.0, -5.8, 3.4, { rot: 0 });
    decal(r, 'text', 17.88, -6.0, 0.9, { wall: true, rot: -PI / 2, y: 1.6, aspect: 3, text: "ELLE A BESOIN D'UN CŒUR" });
    decal(r, 'blood', 15.5, -4.0, 1.0);
  }
  ceilingLamp('stairB', 16, 4.5, 'bare', { intensity: 2.5, flicker: 0.3 });

  // ------------------------------------------------------------ moonlight from windows (weak, cold, always on)
  for (const o of OPENINGS) {
    if (o.type !== 'window' || o.rollerDoor || o.level === 'A' || o.level === 'B') continue;
    const room = ROOMS.find((r) => r.level === o.level && (o.axis === 'z'
      ? o.c > r.rect[0] && o.c < r.rect[2] && (Math.abs(r.rect[1] - o.at) < 0.01 || Math.abs(r.rect[3] - o.at) < 0.01)
      : o.c > r.rect[1] && o.c < r.rect[3] && (Math.abs(r.rect[0] - o.at) < 0.01 || Math.abs(r.rect[2] - o.at) < 0.01)));
    if (!room) continue;
    const inward = o.axis === 'z' ? (Math.abs(room.rect[1] - o.at) < 0.01 ? 1 : -1) : (Math.abs(room.rect[0] - o.at) < 0.01 ? 1 : -1);
    const x = o.axis === 'z' ? o.c : o.at + inward * 0.6;
    const z = o.axis === 'z' ? o.at + inward * 0.6 : o.c;
    light(room.id, x, 1.6, z, { kind: 'moon', needsPower: false, intensity: 0.5, color: 0x6f8fc0, range: 4.5 });
  }

  // ------------------------------------------------------------ light switches next to each room's first door
  for (const room of ROOMS) {
    const lamps = content.lights.filter((l) => l.room === room.id && l.needsPower);
    if (!lamps.length) continue;
    const op = OPENINGS.find((o) => o.level === room.level && (o.type === 'door' || o.type === 'arch') && touches(o, room));
    if (!op) continue;
    const inward = inwardDir(op, room);
    const sw = F.lightSwitch();
    const along = op.c + op.w / 2 + 0.22;
    let x, z, rot;
    if (op.axis === 'z') { x = along; z = op.at + inward * 0.115; rot = inward > 0 ? 0 : PI; }
    else { x = op.at + inward * 0.115; z = along; rot = inward > 0 ? PI / 2 : -PI / 2; }
    sw.position.set(x, LEVELS[room.level] + 1.3, z);
    sw.rotation.y = rot;
    levels[room.level].add(sw);
    register('switch', sw, { room: room.id, level: room.level, lamps, toggle: sw.userData.parts.toggle });
  }

  return content;
}

function touches(o, room) {
  const [x0, z0, x1, z1] = room.rect;
  if (o.axis === 'z') return (Math.abs(o.at - z0) < 0.01 || Math.abs(o.at - z1) < 0.01) && o.c > x0 && o.c < x1;
  return (Math.abs(o.at - x0) < 0.01 || Math.abs(o.at - x1) < 0.01) && o.c > z0 && o.c < z1;
}
function inwardDir(o, room) {
  const [x0, z0] = room.rect;
  if (o.axis === 'z') return Math.abs(o.at - z0) < 0.01 ? 1 : -1;
  return Math.abs(o.at - x0) < 0.01 ? 1 : -1;
}

// ------------------------------------------------------------ decal textures
const decalCache = {};
function decalTexture(kind, text) {
  const key = kind + (text || '');
  if (decalCache[key]) return decalCache[key];
  const r = rng(kind.length * 31 + (text ? text.length : 0));
  const W = kind === 'text' ? 512 : 256, H = kind === 'text' ? 192 : 256;
  decalCache[key] = canvasTexture(W, H, (c) => {
    c.clearRect(0, 0, W, H);
    if (kind === 'blood') {
      c.fillStyle = 'rgba(60,4,4,0.95)';
      c.beginPath(); c.arc(W / 2, H / 2, W * 0.22, 0, PI * 2); c.fill();
      for (let i = 0; i < 26; i++) {
        const a = r() * PI * 2, d = W * (0.15 + r() * 0.3), s = 3 + r() * 14;
        c.beginPath(); c.arc(W / 2 + Math.cos(a) * d, H / 2 + Math.sin(a) * d, s, 0, PI * 2); c.fill();
      }
      c.fillStyle = 'rgba(30,0,0,0.6)';
      c.beginPath(); c.arc(W / 2 + 10, H / 2 - 6, W * 0.12, 0, PI * 2); c.fill();
    } else if (kind === 'drag') {
      for (let i = 0; i < 4; i++) {
        c.strokeStyle = `rgba(55,4,4,${0.5 + r() * 0.3})`;
        c.lineWidth = 8 + r() * 14;
        c.beginPath(); c.moveTo(0, H / 2 + (r() - 0.5) * 40);
        c.bezierCurveTo(W * 0.3, H / 2 + (r() - 0.5) * 60, W * 0.6, H / 2 + (r() - 0.5) * 60, W, H / 2 + (r() - 0.5) * 30);
        c.stroke();
      }
    } else if (kind === 'handprint') {
      c.fillStyle = 'rgba(70,6,6,0.9)';
      c.beginPath(); c.ellipse(W / 2, H * 0.62, W * 0.2, H * 0.22, 0, 0, PI * 2); c.fill();
      for (let i = 0; i < 5; i++) {
        const a = -PI / 2 + (i - 2) * 0.35;
        c.save(); c.translate(W / 2 + Math.cos(a) * W * 0.22, H * 0.5 + Math.sin(a) * H * 0.22); c.rotate(a + PI / 2);
        c.beginPath(); c.ellipse(0, -H * 0.12, W * 0.05, H * 0.15, 0, 0, PI * 2); c.fill(); c.restore();
      }
      c.strokeStyle = 'rgba(70,6,6,0.7)'; c.lineWidth = 4;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(W * (0.4 + i * 0.1), H * 0.8); c.lineTo(W * (0.4 + i * 0.1), H); c.stroke(); }
    } else if (kind === 'footprints') {
      // tiny bare doll feet walking in a line
      c.fillStyle = 'rgba(25,18,12,0.75)';
      for (let i = 0; i < 6; i++) {
        const y = H - 20 - i * (H - 40) / 5, x = W / 2 + (i % 2 ? 18 : -18);
        c.beginPath(); c.ellipse(x, y, 7, 13, 0, 0, PI * 2); c.fill();
        for (let t = 0; t < 4; t++) { c.beginPath(); c.arc(x - 6 + t * 4, y - 16, 2, 0, PI * 2); c.fill(); }
      }
    } else if (kind === 'circle') {
      c.strokeStyle = 'rgba(80,8,6,0.85)'; c.lineWidth = 6;
      c.beginPath(); c.arc(W / 2, H / 2, W * 0.45, 0, PI * 2); c.stroke();
      c.beginPath(); c.arc(W / 2, H / 2, W * 0.38, 0, PI * 2); c.stroke();
      c.beginPath();
      for (let i = 0; i <= 5; i++) { const a = -PI / 2 + i * (PI * 4 / 5); c.lineTo(W / 2 + Math.cos(a) * W * 0.38, H / 2 + Math.sin(a) * W * 0.38); }
      c.stroke();
      c.fillStyle = 'rgba(80,8,6,0.85)'; c.font = 'bold 18px serif';
      for (let i = 0; i < 12; i++) { const a = i * PI / 6; c.fillText('ᛟᛉᚦᛗ'[i % 4], W / 2 + Math.cos(a) * W * 0.415 - 6, H / 2 + Math.sin(a) * W * 0.415 + 6); }
    } else if (kind === 'text') {
      c.fillStyle = 'rgba(85,8,6,0.92)';
      c.font = 'bold 64px "Times New Roman", serif';
      c.textAlign = 'center';
      c.fillText(text, W / 2, H / 2 + 20);
      for (let i = 0; i < 30; i++) {
        const x = 40 + r() * (W - 80), y = H / 2 + 20;
        c.fillRect(x, y - 4, 3, 10 + r() * 50);
      }
    }
  });
  return decalCache[key];
}
