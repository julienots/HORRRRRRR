// Renderer + post-processing stack (bloom, optional ambient occlusion, horror grade: grain, vignette,
// chromatic aberration on shocks, desaturation with fear, blood vignette when wounded).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const HorrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    grain: { value: 0.06 },
    vignette: { value: 1.0 },
    damage: { value: 0 },
    shock: { value: 0 },
    fear: { value: 0 },
    chroma: { value: 1 },
    fade: { value: 0 },
    exposure: { value: 1 },
    hidden: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time, grain, vignette, damage, shock, fear, chroma, fade, exposure, hidden;
    uniform vec2 resolution;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r = length(c);
      // shock: wobble + chromatic split
      float wob = shock * 0.006 * sin(time * 9.0 + uv.y * 20.0);
      uv.x += wob;
      float ca = (0.0015 + shock * 0.012 + fear * 0.002) * chroma * r;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      // shock blur (cheap 4 taps)
      if (shock > 0.05) {
        vec2 o = vec2(shock * 0.004);
        vec3 b = texture2D(tDiffuse, uv + o).rgb + texture2D(tDiffuse, uv - o).rgb + texture2D(tDiffuse, uv + vec2(o.x, -o.y)).rgb + texture2D(tDiffuse, uv - vec2(o.x, -o.y)).rgb;
        col = mix(col, b * 0.25, clamp(shock, 0.0, 0.8));
      }
      col *= exposure;
      // fear: desaturate + slight green-cyan cast
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l) * vec3(0.95, 1.0, 1.02), clamp(fear * 0.55 + damage * 0.3, 0.0, 0.8));
      // vignette, stronger with fear, heart-beat pulse
      float pulse = fear * 0.08 * (0.5 + 0.5 * sin(time * (6.0 + fear * 6.0)));
      float vig = smoothstep(0.85, 0.25 - pulse - fear * 0.1, r * (vignette + fear * 0.25));
      col *= mix(0.6, 1.0, vig);
      // blood vignette when wounded
      float blood = smoothstep(0.35, 0.75, r) * damage;
      col = mix(col, vec3(0.25, 0.0, 0.0) * (0.6 + 0.4 * sin(time * 3.0)), blood * 0.7);
      // hiding: dark slats view
      if (hidden > 0.0) {
        float slat = 0.35 + 0.65 * smoothstep(0.32, 0.5, abs(fract(vUv.y * 11.0) - 0.5));
        float side = smoothstep(0.48, 0.3, abs(c.x));
        col *= mix(1.0, slat * mix(0.25, 1.0, side), hidden);
      }
      // film grain
      float g = hash(vUv * resolution + fract(time * 13.7)) - 0.5;
      col += g * grain * (0.6 + fear * 0.6);
      col *= 1.0 - fade;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export function createRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.pixelRatio >= 1, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function createComposer(renderer, scene, camera, quality) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  let ao = null;
  if (quality.ao) {
    ao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ao.output = GTAOPass.OUTPUT.Default;
    ao.blendIntensity = 0.8;
    composer.addPass(ao);
  }
  let bloom = null;
  if (quality.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.32, 0.5, 0.92);
    composer.addPass(bloom);
  }
  const horror = new ShaderPass(HorrorShader);
  composer.addPass(horror);
  composer.addPass(new OutputPass());
  const resize = () => {
    composer.setSize(window.innerWidth, window.innerHeight);
    horror.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
  };
  resize();
  return { composer, horror, bloom, ao, resize };
}
