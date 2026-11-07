/* A 3D iPhone for a scroll story: a rounded titanium slab, and a screen drawn by a shader so its
   corners are exact at any zoom and a soft reflection can slide across the glass as it turns.
   Any texture can be the screen: a real screenshot (texture()) or live UI drawn on a canvas
   (canvasTexture(), redrawn as the story moves). Units: the phone is about 2 tall. */
import * as THREE from 'three';

/* a rounded rectangle outline, centred on the origin */
function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/* a slab with softly bevelled edges: the phone's body */
function slab(w, h, d, r, bevel) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w - bevel * 2, h - bevel * 2, Math.max(0.001, r - bevel)), {
    depth: d - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 20,
  });
  g.translate(0, 0, -(d - bevel * 2) / 2);
  return g;
}

const VERT = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/* the screen: the texture inside exact rounded corners, a dim for screen changes,
   and a reflection band whose position follows the phone's turn */
const FRAG = `uniform sampler2D map; uniform vec2 uSize; uniform float uRadius, uDim, uSheen, uSheenAt;
varying vec2 vUv;
void main() {
  vec2 q = abs((vUv - 0.5) * uSize) - (uSize * 0.5 - uRadius);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  float aa = max(fwidth(d), 1e-4);
  float m = 1.0 - smoothstep(-aa, aa, d);
  if (m <= 0.0) discard;
  vec3 col = texture2D(map, vUv).rgb * uDim;
  float band = dot(vUv - 0.5, normalize(vec2(0.55, 1.0)));
  col += vec3(0.86, 0.92, 1.0) * uSheen * smoothstep(0.34, 0.0, abs(band - uSheenAt));
  gl_FragColor = vec4(col, m);
  #include <colorspace_fragment>
}`;

/** Build the phone. `aspect` is the screen's width / height (a 1005 x 2185 capture: 0.46). */
export function makePhone({ screen, aspect = 1005 / 2185, color = 0x3b3b40 } = {}) {
  const sw = 0.9, sh = sw / aspect;                 // the screen
  const bw = sw + 0.07, bh = sh + 0.07, depth = 0.085; // the body around it
  const rig = new THREE.Group();

  const body = new THREE.Mesh(slab(bw, bh, depth, 0.145, 0.018), new THREE.MeshPhysicalMaterial({
    color, metalness: 0.85, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25,
  }));
  rig.add(body);

  // the black glass around the screen, a hair proud of the body
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(bw - 0.012, bh - 0.012, 0.138), 24),
    new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.08, clearcoat: 1 }));
  glass.position.z = depth / 2 + 0.0008;
  rig.add(glass);

  const u = {
    map: { value: screen || null }, uSize: { value: new THREE.Vector2(sw, sh) }, uRadius: { value: 0.118 },
    uDim: { value: 1 }, uSheen: { value: 0.05 }, uSheenAt: { value: 0 },
  };
  const display = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh),
    new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, transparent: true }));
  display.position.z = depth / 2 + 0.0016;
  rig.add(display);

  return {
    rig, u, size: { w: bw, h: bh, screenW: sw, screenH: sh },
    setScreen(tex) { if (u.map.value !== tex) u.map.value = tex; },
  };
}
