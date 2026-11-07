---
name: 3d-scroll-story
description: Build a scroll-driven 3D product story for a web page, the way haploapp.com does for Cinder, Haplo AI and ScriptCam. A pinned stage holds a Three.js scene (usually a 3D iPhone running the app's real screens) while steps of copy scroll over it; the scroll becomes one progress number, each step is a pose, and the scene flies, holds and changes screens between them. Use when asked for a "3D scroll effect", "Apple-style product page", "scroll story", "pinned 3D section", "phone that turns as you scroll", "make the landing page feel alive with 3D", or to add a story to an app page.
---

# 3D scroll story

A story is one tall section. Its **stage** is `position: sticky` for the whole section, so it stays pinned
while the **steps** (blocks of copy, about 118vh each) scroll over it, and lets go when the section ends. A
Three.js canvas on the stage draws the object. The scroll is turned into one number, and the scene is a
function of that number. That's the whole trick: no scroll-jacking, no timeline library, native scrolling.

Working template: `template/` (open `index.html` through any static server). Helpers: `template/kit.js`.
The phone: `template/phone.js`. The scene to copy: `template/story.js`.

## 1. Markup

```html
<section class="story" data-story>
  <div class="story__stage">                     <!-- sticky, 100svh, pointer-events: none -->
    <div class="story__glow"></div>               <!-- accent radial glow behind the object -->
    <h1 class="story__word">ScriptCam</h1>         <!-- the giant word: the page's h1 -->
    <canvas class="story__gl"></canvas>           <!-- fades in when the scene is ready -->
    <img class="story__fallback" src="still.webp"> <!-- shown only without WebGL -->
    <p class="story__hud">Step <b data-hud>0</b></p>
  </div>
  <div class="story__hero"> ... </div>           <!-- margin-top: -100svh: sits over the stage -->
  <div class="story__steps">
    <article class="story__step" data-step> <div class="story__step-in"> kicker, h2, copy </div> </article>
    ...
  </div>
</section>
```

CSS that makes it work (`template/story.css`): the sticky stage with its own height (`100vh; 100svh`); the
hero pulled up with `margin-top: -100svh` so the first screen is word + object + hero copy; steps with
`min-height: 118svh` so each holds the screen long enough to read; `pointer-events: none` on the stage
and the step rows, `auto` on the copy inside. No ancestor of the section may have `overflow: hidden`
(it breaks sticky); clip page overflow with `overflow-x: clip` on body instead.

## 2. The progress number

`storyProgress(steps)` (kit.js) returns **0 while the hero is up, then k when step k's top reaches 60% of
the screen**, fractional in between, n + 1 when the last step has gone. Everything keys off whole numbers:

- `KEYS`: a timeline of `[progress, pose]`. List a pose twice to **hold** it while its step is read; the gap
  between holds is the **flight**: `[[0,'hero'],[0.15,'hero'],[1.0,'write'],[1.75,'write'],[2.05,'record'],...]`
- Between two keys: `t = smooth(span(P, a, b))`, then `lerp` every number of the pose.
- One-off beats (typing a prompt, streaming tokens, a sampler's steps, words lighting up) use `span(P, a, b)`
  over their own window inside a hold, e.g. `tokens = N * span(P, 1.02, 1.8)`.
- `near(P, k)` gives a pose's weight (1 at k, 0 at k plus or minus 1) when blending more than two things.

## 3. Poses

A pose is ten numbers: **object x y z, yaw pitch roll, camera distance, camera aim x y z**. Keep two sets,
`wide` and `tall` (phones, or any aspect under 1), because a phone screen needs the object smaller and
higher with the copy under it. Typical wide values for a 2-unit-tall phone at fov 30: hero distance 4.8,
a reading pose 3.5, a close-up 2.4 to 2.6 with the aim raised to the part of the screen that matters,
an exit pose turned away (yaw 0.8) and further back. Tall: about 1.4 to 1.8 times the distances.

## 4. Motion

Per frame (`loop()` runs only while the section is near the viewport):

1. `Ps = damp(Ps, storyProgress(steps), 9, dt)`: the story eases after the scroll instead of being glued to it.
2. Interpolate the wanted pose from `KEYS`, then `cur = damp(cur, want, 6, dt)` per number.
3. Add life, all skipped under reduced motion: an intro swing on load (`1 - (1 - age/1.1)^3`), a slow bob
   (`sin(t*0.9)*0.012`), and pointer parallax on fine pointers only (`yaw += px*0.16, pitch += py*0.08`).
4. Place the rig and the camera: `camera.position = aim + (0, 0, distance)`, `camera.lookAt(aim)`.
5. **First frame snaps** (`cur.set(want)`) so a page opened mid-scroll doesn't fly in from the hero.

## 5. Framing

Don't move the camera to put the object beside the copy; offset the picture:
`camera.setViewOffset(w, h, -w * 0.2, 0, w, h)` on wide screens (object right of centre),
`camera.setViewOffset(w, h, 0, h * 0.2, w, h)` on tall ones (object high). `fit()` reruns it on resize.

## 6. The object

The phone (`phone.js`): an `ExtrudeGeometry` rounded rectangle with bevels (titanium `MeshPhysicalMaterial`,
metalness 0.85, roughness 0.32, clearcoat), a black glass face, and the **screen as a plane with a
ShaderMaterial**: an SDF rounded-rect mask (exact corners at any zoom, antialiased with `fwidth`), a dim
uniform for screen changes, and a reflection band whose position follows the rig's rotation
(`uSheenAt = -0.15 + yaw*0.55 + pitch*0.4`). End the fragment shader with `#include <colorspace_fragment>`.
Light it with `RoomEnvironment` through a PMREM plus one directional key light; renderer with
`NeutralToneMapping`, sRGB output, pixel ratio capped at 2.

Screen content, in order of preference:
- **Real screenshots** of the app (`texture(url)`), swapped at each step's arrival with a 0.08-wide dim.
- **Live UI drawn on a canvas** (`canvasTexture(w, h, draw)`, then `tex.redraw(state)` when the state changes):
  for things that should move with the scroll, like a prompt typing, a reply streaming, a teleprompter
  lighting the current word. Draw it in the app's real fonts, colours and layout (read the SwiftUI source).
- Something other than a phone works the same way: Cinder's story is the app's own body mesh, coloured
  per vertex by muscle group, with embers rising off worked muscles and drag to spin.

## 7. The stage around it

- The giant word slides up and fades as step 1 arrives: set `--out` on the stage from
  `(innerHeight - firstStep.top) / (innerHeight * 0.7)`; CSS does `opacity: calc(1 - var(--out))`.
- A HUD in the corner can read live values from the story (step number, words read, tokens per second).
- Accent colour per app on `--accent`: the glow, kickers and highlights.

## 8. Fallbacks and checks

- `start().catch(err => fail(root, err))` adds `.no-gl`: the still image shows, and keep the `--out`
  scroll listener so the word still steps aside.
- `ready(root)` on the first rendered frame adds `.is-ready`, which fades the canvas in.
- Reduced motion: no damping, no flights (snap between hold poses), draw once per scroll or resize.
- Check it like a visitor would: `node tools/capture.mjs <url> <dir> --frames 24` at 1280x800 and with
  `--phone` (390x844), and look at the frames. The output reports `story: ready` and `sidewaysScroll: false`.
  Make GIFs with `tools/gif.sh <dir> out.gif`.

## Pitfalls

- Sticky silently fails under an ancestor with `overflow: hidden` or a transform.
- Use `svh` with a `vh` line before it; iOS address bars resize `vh` mid-scroll.
- Don't drive poses from raw scroll position; drive them from `storyProgress` so copy length can change.
- Texture colour: `colorSpace = SRGBColorSpace` on textures and on the canvas texture, or screens look washed out.
- Cap `devicePixelRatio` at 2, and stop the loop when the section is off screen (`loop()` does both).
- Label anything illustrative (a simulated read, AI-generated presenters) on the page.
