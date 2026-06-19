# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page WebGL driving simulation ("Genesis Magma"): a Three.js scene where a car auto-drives a closed-curve track with traffic, scenery, scoring, lives (diamonds), countdown, pause, an engine-sound synth, and a cockpit/chase view toggle. It is **not** a build-based project — no bundler, no transpile, no `node_modules`. Three.js is loaded from a CDN via an import map in `index.html`, and the entire app runs from one module, `src/main.js`.

## Commands

```bash
npm start        # = node server.js → serves on http://localhost:5173
npm run dev      # identical to start
PORT=8080 npm start   # override port
```

A local server is **required** — GLB models cannot be loaded over `file://` (CORS). `server.js` is a dependency-free static file server using only Node's standard library; there is nothing to install. There are no tests, linters, or build steps.

### Asset (re)compression

Source `.glb` models are large (13–17 MB each). The app loads pre-compressed `*.opt.glb` variants (Draco geometry + WebP textures, ~0.5–1.5 MB). The original uncompressed `.glb` files are not checked in. To regenerate an optimized variant:

```bash
npx @gltf-transform/cli optimize meshes/<Name>.glb meshes/<Name>.opt.glb \
  --compress draco --texture-compress webp --texture-size 1024
```

(Raceway uses `--texture-size 2048`.) The Draco decoder is loaded from a CDN at runtime (see `DRACOLoader` setup in `src/main.js`).

## Architecture

Three files matter:

- **`index.html`** — entry point. Holds all HUD/DOM (loading bar, speedometer + needle gauge, score/BEST, diamond lives, countdown, pause button, on-screen left/right steer buttons, minimap frame, GAME OVER overlay), all CSS, the `<audio id="bgm">` element (`TUGameSong.mp3`), and the **import map** pinning `three@0.169.0` from jsdelivr. `src/main.js` is loaded as a `<script type="module">`.
- **`src/main.js`** (~2200 lines) — the whole simulation. Organized top-to-bottom into clearly commented `// ---` sections.
- **`server.js`** — static file server with directory-traversal guard and a MIME table (note `.glb` → `model/gltf-binary`, plus audio types).

### `src/main.js` structure (in file order)

1. **Tunable constants** (top of file) — counts/scales for raceway, trees, traffic, people, clouds, plus `SPEED_MAX_KMH`, exposure, `MAX_DIAMONDS`, `IS_MOBILE`. Most scene tuning happens here.
2. **Renderer / scene / camera** — `OrbitControls` enabled; camera is clamped so it never moves ahead of the cockpit.
3. **Environment** — procedural `Sky` shader, procedurally drawn cloud textures hung on a fixed dome (world-fixed, does not follow camera), a cyan sky-tint sphere, and a procedurally textured ground plane that receives the sun's shadow.
4. **Car rig + `drive` state object** — the car model is wrapped in a parent `THREE.Group` ("rig") so the loaded model can be centered/grounded/aligned (+X = forward) independently of driving transforms. `drive` holds the track curve, speed limits, lateral offset, and the spin/recover sub-state. `traffic[]` holds the Toyota cars, each `{ rig, u, lateral }`.
5. **Input** — keyboard (arrows = lateral steering, with boost), on-screen hold-buttons (`bindHoldButton`), pointer/drag steering, and mobile double-tap. `steerActive()` gates input to active gameplay only.
6. **Audio** — `AudioContext`-synthesized engine sound (speed-proportional sawtooth+sine) and crash/impact sounds. `syncAudio()` reconciles audio with game state (pause/countdown mute it). Audio is resumed on first user gesture.
7. **Driving model** — `cornerSpeedLimit(u)` does curvature-based slow-in/fast-out; pursuit steering with a grip limit causes drift on sharp corners.
8. **Collision → spin → recover state machine** (`startSpin` / `stepSpin` / `enterRecover` / `stepRecover` / `resumeHero` / `resumeTraffic` / `checkCollisions`). This is shared by the hero car and traffic. `rec` is a state-bearing object; the same functions drive both. On collision the car loses control, spins in place, then crawls back onto the racing line and re-accelerates. Other cars yield only while a car is recovering.
9. **World builders** — `buildTrack` (`CatmullRomCurve3`, closed) sets `drive.curve` and the asphalt ribbon; `loadRaceway`, `loadTrees`, `loadPeople`, `loadToyota` each load one `.opt.glb` and clone it N times (shared geometry/material) scattered along/around the curve with per-instance jitter. People use `SkeletonUtils.clone` for animation.
10. **Cockpit marker + sparks** — highlight markers (border + ▼ triangle) shown only in cockpit view via a dedicated render layer (`MINIMAP_LAYER`); `Points`-based collision spark particles.
11. **Model loading** (`gltfLoader.load`, ~line 1409) — the **main initialization sequence**: loads the hero model, computes its bounding box to derive `maxDim`, sets `drive.maxSpeed`/`minSpeed`, calls `buildTrack`, then kicks off all the world builders and creates the `miniCam` (cockpit forward camera).
12. **Resize + render loop** — `animate()` (bottom of file, called once at the end). It advances driving, collisions, people, sparks, camera, HUD/speedometer, then renders the main pass and, when ready, a **second viewport pass** (`setScissor`/`setViewport`) for the minimap/cockpit. The double-click toggle (`toggleCockpitMain`) swaps which camera owns the full screen vs. the small inset window.
13. **Game/HUD state** — the `game` object (`score`, `sec`, `diamonds`, `best`, `over`, `paused`, `started`, `countdown`, `pendingOver`, …) is the source of truth for HUD and gating. Score accrues `floor(km/h)` per second; **BEST is persisted in `localStorage`**. Losing the last diamond sets `pendingOver` so GAME OVER waits for the spin to settle. Start and pause-resume both run a 3-2-1 countdown during which the world is frozen and engine audio is off.

### Conventions / gotchas

- Comments and README are in **Korean**; match that when editing existing prose.
- There is **no module system beyond the import map** — adding a new third-party library means adding it to the import map in `index.html`, not `npm install`.
- Speed is internal world-units; the displayed `km/h` is `drive.maxSpeed ↔ SPEED_MAX_KMH` (345). Most physical scales derive from the loaded model's `maxDim`, so changing the model rescales the world.
- The hero car and every traffic car share the same spin/recover machine — fixes to collision behavior should be made once in those shared functions, not duplicated.
