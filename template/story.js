/* The scene for one scroll story: a phone that turns, zooms and changes screen as each step of
   copy scrolls over the pinned stage. Copy this file for a new page and change three things:
   SCREENS (what the phone shows at each step), POSES (where the phone and camera are for each
   beat, separately for wide and tall screens) and KEYS (when each beat plays). */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { reduce, fine, phone, clamp, lerp, smooth, span, damp, makeRenderer, fit, loop, storyProgress, texture, ready, fail } from './kit.js';
import { makePhone } from './phone.js';

const root = document.querySelector('[data-story]');
const canvas = root && root.querySelector('.story__gl');
const stage = root && root.querySelector('.story__stage');
const steps = root ? [...root.querySelectorAll('[data-step]')] : [];
const hud = root && root.querySelector('[data-hud]');

/* the screen at each step (step 1 is the first [data-step]) */
const SCREENS = ['screens/editor.webp', 'screens/recording.webp', 'screens/review.webp'];

/* each pose: phone x y z, yaw pitch roll, camera distance, camera aim x y z */
const POSES = {
  wide: {
    hero: [0, -0.04, 0, -0.5, 0.08, 0.06, 4.8, 0, 0, 0],
    write: [0, 0, 0, -0.18, 0.03, 0, 3.5, 0, 0.05, 0],
    record: [0, 0, 0, 0.2, 0.02, -0.02, 2.6, 0, 0.35, 0],    // close on the teleprompter at the top
    review: [0.1, 0, -0.2, 0.42, 0.05, -0.03, 3.9, 0, 0, 0],
    out: [0, 0.4, -0.3, 0.8, 0.14, -0.05, 5.2, 0, 0, 0],
  },
  tall: {   // phones: the phone sits higher and further away, so the copy can scroll under it
    hero: [0, 0.02, 0, -0.4, 0.06, 0.04, 6.2, 0, 0.06, 0],
    write: [0, 0, 0, -0.1, 0.02, 0, 3.4, 0, 0.2, 0],
    record: [0, 0, 0, 0.12, 0.02, 0, 3.1, 0, 0.3, 0],
    review: [0, 0, 0, 0.3, 0.04, -0.02, 4.4, 0, 0.1, 0],
    out: [0, 0.4, -0.2, 0.7, 0.1, -0.05, 6.4, 0, 0, 0],
  },
};

/* where the story is, as one number (kit.js storyProgress): 0 while the hero is up, then 1, 2, 3
   as each step's top reaches 60% of the screen. A beat listed twice holds still while it is read;
   the gaps between holds are the flights. */
const KEYS = [[0, 'hero'], [0.15, 'hero'], [1.0, 'write'], [1.75, 'write'], [2.05, 'record'], [2.75, 'record'],
  [3.05, 'review'], [3.8, 'review'], [4.3, 'out']];
const HOLD = ['hero', 'write', 'record', 'review'];   // reduced motion: snap between these, no flights

async function start() {
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 3, 4);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

  const shots = await Promise.all(SCREENS.map((url) => texture(url)));
  const ph = makePhone({ screen: shots[0] });
  scene.add(ph.rig);

  /* framing: on wide screens the phone sits right of centre beside the copy; on tall ones it
     sits high so the copy scrolls up under it. setViewOffset moves the picture, not the camera. */
  let tall = false;
  fit(renderer, camera, canvas, (w, h) => {
    tall = phone() || w / h < 1;
    camera.setViewOffset(w, h, tall ? 0 : -w * 0.2, tall ? h * 0.2 : 0, w, h);
  });

  const want = new Float32Array(10), cur = new Float32Array(10);
  const poseAt = (P, set) => {
    if (reduce) { want.set(set[HOLD[Math.min(HOLD.length - 1, Math.round(P))]]); return; }
    let i = 0;
    while (i < KEYS.length - 2 && P > KEYS[i + 1][0]) i++;
    const [a, ka] = KEYS[i], [b, kb] = KEYS[i + 1];
    const t = smooth(span(P, a, b)), A = set[ka], B = set[kb];
    for (let j = 0; j < 10; j++) want[j] = lerp(A[j], B[j], t);
  };

  /* pointer parallax, fine pointers only */
  let px = 0, py = 0, tx = 0, ty = 0;
  if (fine && !reduce) addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });

  let Ps = 0, first = true, born = 0;
  function frame(t, dt) {
    const P0 = storyProgress(steps);
    Ps = reduce || first ? P0 : damp(Ps, P0, 9, dt);      // the story eases after the scroll
    const P = Ps;
    if (!born) born = t;
    const age = t - born;

    poseAt(P, tall ? POSES.tall : POSES.wide);
    if (reduce || first) cur.set(want); else for (let j = 0; j < 10; j++) cur[j] = damp(cur[j], want[j], 6, dt);
    px = reduce ? 0 : damp(px, tx, 3, dt); py = reduce ? 0 : damp(py, ty, 3, dt);
    const intro = reduce ? 1 : 1 - Math.pow(1 - clamp(age / 1.1), 3);   // the phone swings in on load
    const bob = reduce ? 0 : Math.sin(t * 0.9) * 0.012;
    ph.rig.position.set(cur[0], cur[1] + bob - (1 - intro) * 0.12, cur[2]);
    ph.rig.rotation.set(cur[4] + py * 0.08, cur[3] + px * 0.16 - (1 - intro) * 0.5, cur[5]);
    camera.position.set(cur[7], cur[8], cur[9] + cur[6]);
    camera.lookAt(cur[7], cur[8], cur[9]);

    /* the screen: change at each step's arrival, dimming for a beat like an app changing view */
    const k = clamp(Math.floor(P + 0.1) - 1, 0, SCREENS.length - 1);
    ph.setScreen(shots[k]);
    const swap = Math.max(0, ...SCREENS.slice(1).map((_, i) => 1 - Math.abs(P - (i + 1.9)) / 0.08));
    ph.u.uDim.value = 1 - 0.9 * smooth(clamp(swap));
    ph.u.uSheenAt.value = -0.15 + ph.rig.rotation.y * 0.55 + ph.rig.rotation.x * 0.4;
    ph.u.uSheen.value = 0.03 + 0.06 * (1 - smooth(span(P, 0.15, 0.85)));   // glassier in the hero

    /* the giant word steps aside as the first step arrives */
    const r = steps[0].getBoundingClientRect();
    stage.style.setProperty('--out', clamp((innerHeight - r.top) / (innerHeight * 0.7)).toFixed(3));
    if (hud) hud.textContent = Math.min(steps.length, Math.floor(P));

    renderer.render(scene, camera);
    if (first) { first = false; ready(root); }
  }
  loop(root, frame)();
}

if (root && canvas) {
  start().catch((err) => {
    fail(root, err, 'story');   // the still image stands in; the word still steps aside
    const out = () => stage.style.setProperty('--out', clamp((innerHeight - steps[0].getBoundingClientRect().top) / (innerHeight * 0.7)).toFixed(3));
    addEventListener('scroll', out, { passive: true });
    out();
  });
}
