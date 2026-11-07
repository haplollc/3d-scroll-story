/* Shared helpers for the 3D scroll stories (story.js).
   A story is a tall section whose stage stays pinned while its steps scroll over it:

     <section class="story" data-story>
       <div class="story__stage"> <canvas class="story__gl"> ...overlays </div>
       <div class="story__hero"> ... </div>
       <div class="story__steps"> <article class="story__step" data-step> ... </div>
     </section>

   storyProgress() turns the steps into one number: 0 while the hero is up, then
   1, 2, 3 ... as each step reaches the middle of the screen, fractional in between,
   so a scene can key its poses to whole numbers and blend between them. */
import * as THREE from 'three';

export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
export const phone = () => innerWidth < 861;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
/** 0 before a, 1 after b, linear in between */
export const span = (v, a, b) => clamp((v - a) / (b - a));
/** frame-rate independent easing towards a target */
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

/** A renderer drawing into `canvas`. Opaque stages pass alpha: false and their colour. */
export function makeRenderer(canvas, { alpha = true, clear = 0x0e0e11, toneMapping = THREE.NeutralToneMapping } = {}) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = toneMapping;
  if (!alpha) r.setClearColor(clear, 1);
  return r;
}

/** Keep the drawing buffer and the camera's aspect matched to the canvas's CSS size. */
export function fit(renderer, camera, canvas, onResize) {
  const go = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    if (camera && camera.isPerspectiveCamera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if (onResize) onResize(w, h);
  };
  new ResizeObserver(go).observe(canvas);
  go();
  return go;
}

/** Call frame(t, dt) every animation frame while `el` is near the viewport.
    With reduced motion it draws once per scroll or resize instead (dt = 0). */
export function loop(el, frame) {
  let visible = false, running = false, last = 0;
  const tick = (now) => {
    if (!visible) { running = false; return; }
    const t = now / 1000, dt = last ? Math.min(0.05, t - last) : 1 / 60;
    last = t;
    frame(t, dt);
    requestAnimationFrame(tick);
  };
  let queued = false;
  const once = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame((now) => { queued = false; frame(now / 1000, 0); });
  };
  const start = () => { if (running) return; running = true; last = 0; requestAnimationFrame(tick); };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) reduce ? once() : start();
  }, { rootMargin: '160px 0px' }).observe(el);
  if (reduce) { addEventListener('scroll', once, { passive: true }); addEventListener('resize', once); }
  return once;
}

/** 0 to 1 across the scroll for which a tall section's sticky stage stays pinned. */
export function pinProgress(section) {
  const r = section.getBoundingClientRect();
  return clamp(-r.top / Math.max(1, r.height - innerHeight));
}

/** 0 while the hero is up, k when step k's top reaches `anchor` of the screen height,
    fractional in between; n + 1 once the last step has scrolled away. */
export function storyProgress(steps, anchor = 0.6) {
  const y = innerHeight * anchor;
  let p = 0;
  for (let i = 0; i < steps.length; i++) {
    const r = steps[i].getBoundingClientRect();
    if (r.top > y) break;
    p = i + 1 + clamp((y - r.top) / Math.max(1, r.height));
  }
  return p;
}

/** Weight of whole-number pose k at story progress p: 1 at k, falling to 0 at k plus or minus 1. */
export const near = (p, k) => clamp(1 - Math.abs(p - k));

/** Load a texture in sRGB, ready for a material's map. */
export function texture(url, { flipY = true } = {}) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = flipY;
    t.anisotropy = 4;
    res(t);
  }, undefined, rej));
}

/** Draw into a 2D canvas and use it as a texture: draw(ctx, w, h) can be called again
    with tex.redraw() whenever the content changes. */
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.redraw = (...args) => { ctx.clearRect(0, 0, w, h); draw(ctx, w, h, ...args); tex.needsUpdate = true; };
  tex.redraw();
  return tex;
}

/** Mark the story ready (fades the canvas in) or fall back to its still image. */
export function ready(root) { root.classList.add('is-ready'); }
export function fail(root, err, name) {
  console.warn(name || 'story', err);
  root.classList.add('no-gl');
}
