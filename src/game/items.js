// Item definitions and their small 3D models.
import * as THREE from 'three';
import { mat } from '../render/materials.js';
import { B, C, S } from '../world/furniture.js';

export const ITEMS = {
  flashlight: { name: 'Lampe torche', desc: 'Une vieille lampe en métal. Le faisceau vacille quand les piles faiblissent. [F] pour l\'allumer.', icon: '🔦', unique: true },
  battery: { name: 'Piles', desc: 'Recharge complètement la lampe torche.', icon: '🔋', usable: true },
  bandage: { name: 'Bandage', desc: 'Arrête le saignement et soigne une blessure. Prend quelques secondes : reste immobile.', icon: '🩹', usable: true },
  painkillers: { name: 'Analgésiques', desc: 'Calment la douleur, les tremblements et la boiterie pendant un moment.', icon: '💊', usable: true },
  bottle: { name: 'Bouteille vide', desc: 'À lancer [G] pour faire du bruit ailleurs et attirer la poupée.', icon: '🍾', throwable: true },
  garageKey: { name: 'Clé du garage', desc: 'Une clé avec une étiquette « Garage ».', icon: '🗝', key: true },
  crowbar: { name: 'Pied-de-biche', desc: 'Assez solide pour arracher des planches clouées.', icon: '🔧', unique: true },
  atticKey: { name: 'Clé du grenier', desc: 'Petite clé en laiton, étiquette « Combles ».', icon: '🗝', key: true },
  windingKey: { name: 'Clé de remontage', desc: 'Une clé papillon, trop petite pour une porte. Pour un mécanisme ?', icon: '🦋', key: true },
  cellarKey: { name: 'Clé de la cave', desc: 'Une lourde clé en fer, couverte de poussière.', icon: '🗝', key: true },
  rustyKey: { name: 'Clé rouillée', desc: 'Une clé ancienne, rongée par la rouille. Elle sent la terre humide.', icon: '🗝', key: true },
  fuse: { name: 'Fusible', desc: 'Un fusible en céramique de 30 A. Le tableau électrique de la chaufferie en manque un.', icon: '⚡', key: true },
  lighter: { name: 'Briquet', desc: 'Un briquet à essence. Il fonctionne encore.', icon: '🔥', unique: true },
  frontKey: { name: "Clé de la porte d'entrée", desc: 'La clé de la sortie. Enfin.', icon: '🗝', key: true },
  heart: { name: 'Cœur de porcelaine', desc: 'Il est tiède. Quelque chose de doré pulse à l\'intérieur. Il bat.', icon: '❤', key: true },
};

const keyModel = (color) => {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.35 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 16), m);
  g.add(ring);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.006, 0.004), m);
  shaft.position.x = 0.045;
  g.add(shaft);
  const bit = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.004), m);
  bit.position.set(0.068, -0.009, 0);
  g.add(bit);
  g.rotation.x = -Math.PI / 2;
  const w = new THREE.Group();
  w.add(g);
  w.position.y = 0.005;
  return w;
};

export function itemModel(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'flashlight': {
      const body = C(g, 0.02, 0.02, 0.18, 'metalClean', 0, 0.02, 0, 12); body.rotation.z = Math.PI / 2;
      const head = C(g, 0.032, 0.022, 0.05, 'metalClean', 0.11, 0.02, 0, 14); head.rotation.z = Math.PI / 2;
      break;
    }
    case 'battery':
      for (let i = 0; i < 2; i++) { const b = C(g, 0.014, 0.014, 0.05, 'paintRed', i * 0.03, 0.014, 0, 10); b.rotation.z = Math.PI / 2; }
      break;
    case 'bandage': {
      const r = C(g, 0.035, 0.035, 0.06, 'paper', 0, 0.035, 0, 16); r.rotation.z = Math.PI / 2;
      break;
    }
    case 'painkillers':
      C(g, 0.022, 0.022, 0.07, new THREE.MeshPhysicalMaterial({ color: 0x9a5a20, roughness: 0.1, transparent: true, opacity: 0.85 }), 0, 0.035, 0, 12);
      C(g, 0.024, 0.024, 0.02, 'ceramic', 0, 0.08, 0, 12);
      break;
    case 'bottle':
      C(g, 0.035, 0.035, 0.2, new THREE.MeshPhysicalMaterial({ color: 0x1f4a22, roughness: 0.05, transparent: true, opacity: 0.75 }), 0, 0.1, 0, 12);
      C(g, 0.012, 0.03, 0.08, new THREE.MeshPhysicalMaterial({ color: 0x1f4a22, roughness: 0.05, transparent: true, opacity: 0.75 }), 0, 0.24, 0, 10);
      break;
    case 'crowbar': {
      const b = C(g, 0.012, 0.012, 0.7, 'paintRed', 0, 0.012, 0, 8); b.rotation.z = Math.PI / 2;
      const h = C(g, 0.012, 0.012, 0.08, 'paintRed', 0.37, 0.03, 0, 8); h.rotation.z = 0.6;
      break;
    }
    case 'garageKey': g.add(keyModel(0x9a9a9a)); break;
    case 'atticKey': g.add(keyModel(0xb08a3e)); break;
    case 'cellarKey': g.add(keyModel(0x444444)); break;
    case 'rustyKey': g.add(keyModel(0x6a3418)); break;
    case 'frontKey': g.add(keyModel(0xd0b060)); break;
    case 'windingKey': {
      const m = mat('brass');
      const w1 = new THREE.Mesh(new THREE.CircleGeometry(0.02, 3), m); w1.rotation.x = -Math.PI / 2; w1.position.set(-0.02, 0.004, 0);
      const w2 = w1.clone(); w2.position.x = 0.02; w2.rotation.z = Math.PI;
      g.add(w1, w2);
      const s = C(g, 0.004, 0.004, 0.05, m, 0, 0.004, 0.03, 6); s.rotation.x = Math.PI / 2;
      break;
    }
    case 'fuse': {
      const f = C(g, 0.015, 0.015, 0.07, 'ceramic', 0, 0.015, 0, 10); f.rotation.z = Math.PI / 2;
      for (const x of [-0.04, 0.04]) { const e = C(g, 0.016, 0.016, 0.01, 'brass', x, 0.015, 0, 10); e.rotation.z = Math.PI / 2; }
      break;
    }
    case 'lighter':
      B(g, 0.035, 0.05, 0.012, 'chrome', 0, 0.025, 0);
      break;
    case 'heart': {
      const m = new THREE.MeshPhysicalMaterial({ color: 0xeee2d2, roughness: 0.2, clearcoat: 1, emissive: 0xffb000, emissiveIntensity: 0.15 });
      S(g, 0.045, m, -0.022, 0.07, 0, 1, 1, 0.8);
      S(g, 0.045, m, 0.022, 0.07, 0, 1, 1, 0.8);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.09, 16), m);
      tip.rotation.z = Math.PI; tip.position.y = 0.03; tip.scale.z = 0.7;
      g.add(tip);
      g.userData.glow = m;
      break;
    }
    case 'document':
    default: {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), mat('paper'));
      p.rotation.x = -Math.PI / 2; p.rotation.z = (Math.random() - 0.5) * 0.4; p.position.y = 0.003;
      g.add(p);
      // ink lines
      const ink = new THREE.MeshBasicMaterial({ color: 0x1a1410 });
      for (let i = 0; i < 9; i++) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(0.15 - (i % 3) * 0.02, 0.004), ink);
        l.rotation.x = -Math.PI / 2; l.rotation.z = p.rotation.z;
        const off = -0.11 + i * 0.025;
        l.position.set(-Math.sin(p.rotation.z) * off, 0.004, Math.cos(p.rotation.z) * off);
        g.add(l);
      }
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}
