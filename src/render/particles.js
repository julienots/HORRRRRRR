// Dust motes floating around the player; they only catch the light inside the flashlight cone.
import * as THREE from 'three';

export class DustParticles {
  constructor(scene, count) {
    this.count = count;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        center: { value: new THREE.Vector3() },
        time: { value: 0 },
        spotPos: { value: new THREE.Vector3() },
        spotDir: { value: new THREE.Vector3(0, 0, -1) },
        spotOn: { value: 0 },
        spotCos: { value: Math.cos(0.45) },
      },
      vertexShader: /* glsl */`
        attribute float seed;
        uniform vec3 center; uniform float time;
        uniform vec3 spotPos, spotDir; uniform float spotOn, spotCos;
        varying float vA;
        void main() {
          vec3 p = position;
          p += vec3(sin(time * 0.13 + seed * 40.0), sin(time * 0.07 + seed * 17.0) * 0.6, cos(time * 0.11 + seed * 29.0)) * 0.35;
          // wrap around the camera
          vec3 rel = mod(p - center + vec3(4.0, 1.5, 4.0), vec3(8.0, 3.0, 8.0)) - vec3(4.0, 1.5, 4.0);
          vec3 wp = center + rel;
          vec3 toP = wp - spotPos;
          float d = length(toP);
          float c = dot(toP / max(d, 0.001), spotDir);
          float inCone = smoothstep(spotCos, spotCos + 0.05, c) * spotOn * smoothstep(7.0, 0.5, d);
          vA = inCone * (0.35 + 0.65 * fract(seed * 7.13));
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.2 + seed * 2.2) * (6.0 / max(-mv.z, 0.3));
        }
      `,
      fragmentShader: /* glsl */`
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(c)) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a * 0.9, a);
        }
      `,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt, center, spot, on) {
    const u = this.material.uniforms;
    u.time.value += dt;
    u.center.value.copy(center);
    u.spotPos.value.copy(spot.position);
    u.spotDir.value.copy(spot.target.position).sub(spot.position).normalize();
    u.spotOn.value = on ? 1 : 0;
  }
}
