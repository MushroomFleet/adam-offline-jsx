# 12 hour AI gamedev Challenge - Eve Offline

> repo contains all base plans and JSX componenent used in the project some of which are listed below.

MSI installer in releases to see the result after ~12 hours (realtime)

---

## Overview

`Adam-3D-spaceship-controller.jsx` renders an interactive 3D spaceship scene directly inside any React application. It replicates the core flight-feel of Eve Online's dead-space pocket view: the ship sits at the centre of the world, the camera orbits it freely, and the player sets a heading by double-clicking anywhere in space. Newtonian acceleration and deceleration make every speed change feel physical.

The component is designed to be dropped into larger projects as a self-contained flight-view layer — no external state management required.

---

## Features

### 🚀 Flight Model
- **Newtonian physics** — acceleration and deceleration are simulated independently; the ship takes time to reach target speed and bleeds momentum when throttling down
- **Five throttle presets** — STOP / ¼ / ½ / ¾ / FULL, selectable from the HUD
- **Lazy heading system** — double-click anywhere in the 3D scene to set a new forward vector; the ship smoothly turns and flies in that direction
- **Banking** — the hull rolls into turns proportionally to angular velocity

### 📷 Camera
- **Orbit camera** locked to the ship's world position — the ship never leaves the centre of the screen
- **Scroll-to-zoom** (middle mouse wheel), drag to orbit
- **Skybox locked to camera** — procedurally generated star-field cube-map moves with the player so the boundary is never visible

### 🛸 Ship Models
- **Default diamond ship** — built from Three.js primitives (elongated octahedron, wing panels, fore/aft spikes, engine glow point light) — no external assets needed
- **GLB model support** — pass a `glbUrl` prop or use the in-HUD file picker to load any `.glb` spaceship model at runtime

### 🌌 Visual Effects
- **Procedural skybox** — six-face cube-map generated at runtime with stars, colour temperature variation, and nebula wisps
- **Additive particle exhaust** — engine trail scales with current speed; particles drift and fade behind the ship
- **Rotating target reticle** — appears at the double-clicked heading point and dismisses when the ship arrives
- **Inertia indicator** — ▲ ACCELERATING / ▼ DECELERATING HUD flash during speed transitions

### 🖥️ HUD
- **Velocity bar** — live fill with colour shift (blue → cyan → red) at high speed
- **Telemetry readout** — speed, heading vector (XYZ), world position (XYZ)
- **Throttle controls** — five buttons with active-state glow
- **Scanline + vignette overlay** — retro CRT atmosphere
- **Eve-style dark military aesthetic** — `Share Tech Mono` typography, cyan/amber palette, panel borders

---

## Files

| File | Purpose |
|---|---|
| `Adam-3D-spaceship-controller.jsx` | React component — integrate into any React/Vite/Next.js project |
| `demo.html` | Standalone demo — open in a browser with no build step (Three.js r128 via CDN) |

---

## Quick Start (React / Vite)

### 1. Install dependencies

```bash
npm install three @react-three/fiber @react-three/drei
```

### 2. Import and use

```jsx
import Adam3DSpaceshipController from './Adam-3D-spaceship-controller.jsx';

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Adam3DSpaceshipController />
    </div>
  );
}
```

### 3. Load a custom ship model

```jsx
<Adam3DSpaceshipController glbUrl="/models/my-ship.glb" />
```

---

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `glbUrl` | `string` | `null` | URL or object URL of a `.glb` model to replace the default diamond ship |
| `onTelemetry` | `function` | `null` | Callback fired every frame with `{ speed, targetSpeed, heading, position, throttleLabel }` |

### Telemetry object

```js
{
  speed:         12.34,          // current speed in units/s
  targetSpeed:   28.0,           // speed the ship is accelerating toward
  heading:       { x, y, z },   // normalised forward vector
  position:      { x, y, z },   // world position
  throttleLabel: "½ SPEED"       // human-readable throttle state
}
```

---

## Controls

| Input | Action |
|---|---|
| **Double-click** | Set new heading / destination |
| **Left drag** | Orbit camera |
| **Scroll wheel** | Zoom in / out |
| **Throttle buttons** | Set speed (STOP · ¼ · ½ · ¾ · FULL) |
| **⬆ LOAD GLB** | Replace ship model at runtime |

---

## Standalone Demo

Open `demo.html` directly in any modern browser — no server, no build step, no npm. It loads Three.js r128 from the Cloudflare CDN and re-implements the full physics and HUD in vanilla JavaScript, faithful to the JSX component's behaviour.

> **Note:** GLB model loading in the demo requires the npm build with `GLTFLoader`. The CDN demo uses the default diamond ship.

---

## Physics Constants

These can be tuned at the top of the JSX file:

```js
const MAX_SPEED   = 28;    // units/s at full throttle
const ACCEL_RATE  = 4.5;   // units/s²
const DECEL_RATE  = 3.0;   // units/s²
const TURN_RATE   = 1.4;   // rad/s heading interpolation
```

---

## Integration Notes

- The component manages its own Three.js scene via `@react-three/fiber` — it does not conflict with other R3F canvases as long as each is mounted in its own DOM subtree
- The skybox is procedurally generated on mount and disposed on unmount — no texture files required
- All physics state is held in refs (`useRef`) to avoid re-render overhead during the animation loop
- The `OrbitControls` target lerps to the ship position each frame, keeping the camera anchored regardless of world-space travel distance

---

## ⚔️ Weapons Systems — Combat Layer

The `/weapons-systems/` subfolder adds a full Eve Online–style combat layer on top of the base spaceship controller. It introduces seven distinct weapon types across four damage archetypes, each with its own visual effect stack, auto-fire timer, and ZeroBytes-deterministic combat outcome system. A destructible auto-locked dummy target completes the loop, making this a self-contained combat demonstration that can be integrated directly into any project built on the base controller.

### Files

| File | Purpose |
|---|---|
| `weapons-systems/ADAM-flight-weapons.jsx` | React component — drop-in weapons layer with full HUD, weapon selector, and combat log |
| `weapons-systems/demo-weapons.html` | Standalone demo — self-contained, no build step (Three.js r128 via CDN) |

---

### Weapon Types

Seven weapons span four damage archetypes, each with distinct visual effects and fire characteristics:

| Weapon | Archetype | Visual Effect | Fire Style | Alpha / DPS |
|---|---|---|---|---|
| Mining Beam | Thermal | Sustained thin cyan beam | Continuous | 12 DPS |
| Combat Laser | Thermal | Pulsed red beam, opacity oscillation at 18 Hz | 1.2s cycle | 22α |
| Missiles | Explosive | Cone projectile + point light trail + AoE explosion burst | 3.5s cycle | 85α |
| Railguns | EM | Instant-travel streak fading over 280ms + two expanding EM torus rings | 2.8s cycle | 110α |
| Artillery | Kinetic | Slow sphere slug + triple shockwave rings on impact | 6.0s cycle | 260α |
| Mining Drones | Thermal | 3 autonomous drones approach, orbit, and fire harvest beams | Continuous | 18 DPS |
| Combat Drones | Thermal | 3 attack drones approach, orbit, and fire rapid burst beams | 1.4s per drone | 18α |

Higher alpha weapons have longer cycle times to balance time-averaged damage output.

---

### ZeroBytes Combat System

Combat outcomes are driven by a **position-as-seed deterministic hash** — no `Math.random()`, no stored RNG state. Every damage roll is a pure function of weapon ID, fire tick, and world seed:

```js
// Inline Murmur-inspired 32-bit mix — no external dependencies
function positionHash(x, y, z, salt) { ... }

combatRoll(weaponId, tick, worldSeed)
// → deterministic float 0–1, identical across all machines and sessions
```

Damage is then scaled from the base alpha value:

```js
damage = round(alpha × (0.85 + roll × 0.3))  // ±15% variance band
```

Because the same inputs always produce the same output, combat sequences are fully reproducible — useful for server-side validation, match recording, or deterministic AI opponents without any synchronisation overhead.

---

### Drone State Machine

Mining and Combat Drones each run a five-state per-drone behavioural machine:

```
DOCKED → LAUNCHING → APPROACHING → ORBITING → RETURNING → DOCKED
```

| State | Behaviour |
|---|---|
| **DOCKED** | Hovering at an assigned dock slot on the ship hull; dim glow, gentle idle bob |
| **LAUNCHING** | Peels away from the ship on a short diverging arc before committing to an approach vector |
| **APPROACHING** | Flies toward an orbit point around the target; decelerates proportionally to remaining distance to prevent overshoot |
| **ORBITING** | Arcs around the target at a type-specific radius (7u mining / 5u combat) and angular speed; fires beams at staggered intervals between drones |
| **RETURNING** | Triggered automatically on target destruction; each drone flies back to its individual hull dock slot and settles |

When the target respawns, any docked drones with an active weapon assignment automatically re-enter the **LAUNCHING** state. Drones also suppress firing entirely while the target is destroyed, preventing phantom hits during the respawn window.

---

### Target Health & Respawn

The demo includes a destructible target with a live HP integrity bar (2000 HP). All weapon damage routes through a single `damageTarget()` function. On destruction:

- A multi-burst explosion sequence fires at the target position
- All active beams are immediately suppressed
- Drones transition to RETURNING
- An 8-second respawn countdown is displayed in the integrity bar

Non-drone weapon fire intervals continue running but are gated so no shots are wasted while the target is down. On respawn the target reappears and all systems resume automatically.

---

### Performance

All particle effects use **instanced meshes** — a single `InstancedMesh` per effect type means one draw call regardless of how many particles are active. Per-instance colour is set via `setColorAt` so spark bursts can reflect the firing weapon's damage type without spawning separate materials. Beam geometry is created and disposed per-shot rather than maintained in a persistent pool, keeping the scene graph lean between shots.

---

### Quick Start

```bash
npm install three @react-three/fiber @react-three/drei
```

```jsx
import ADAMFlightWeapons from './weapons-systems/ADAM-flight-weapons.jsx';

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ADAMFlightWeapons
        glbUrl="/models/my-ship.glb"            // optional
        onCombatEvent={(e) => console.log(e)}   // optional
      />
    </div>
  );
}
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `glbUrl` | `string` | `null` | URL or object URL of a `.glb` ship model |
| `onCombatEvent` | `function` | `null` | Fired on each hit with `{ weapon, damage, type, tick }` |

### Combat Event object

```js
{
  weapon: "Railguns",   // weapon display name
  damage: 98,           // HP removed this hit (ZeroBytes roll applied)
  type:   "em",         // damage archetype: thermal | explosive | em | kinetic
  tick:   142           // monotonic fire counter for replay / server validation
}
```

### HUD Panels

The weapons layer adds four new panels over the base controller HUD:

| Panel | Position | Content |
|---|---|---|
| **Weapon Selector** | Left | All 7 weapons; click to activate/deactivate; shows archetype, alpha, and fire rate |
| **Target Integrity** | Centre top | HP bar (green → amber → red); respawn countdown when destroyed |
| **Combat Log** | Right | Rolling last-12 hit log with per-hit damage and running total |
| **Drone Status** | Bottom left | Per-drone state label (DOCKED / LAUNCH / APPROACH / ORBIT / RETURN); visible only when a drone weapon is active |

---

## 🛰️ Station Interior — Docking Bay Scene

The `/station-interior-3d/` subfolder extends the project with a fully interactive space station hangar scene, designed as the natural destination once a ship docks. It follows the same low-poly SVGA-style vertex-shaded aesthetic and is built to slot alongside the spaceship controller as a paired scene layer.

### Files

| File | Purpose |
|---|---|
| `station-interior-3d/StationInterior.jsx` | React component — hangar scene with docking flow and services menu |
| `station-interior-3d/demo.html` | Standalone demo — self-contained, no build step (React + Three.js via import maps) |
| `station-interior-3d/station-interior-JSX.md` | Component documentation, architecture overview, and GLB swap-in guide |

### Scene Features

- **Low-poly hangar geometry** — vertex-coloured box interior with open gateway arch, ceiling light strips, and rear wall structural ribs; all tagged `GLB_SLOT` for asset swap-in
- **Hexagonal docking pad** — pulsing cyan ring lights shift to full accent-green on dock confirmation
- **Player ship on pad** — low-poly Interceptor with wing chevrons, engine glow point lights, and idle hover animation that settles on dock
- **NPC traffic** — three shuttles on independent `CatmullRomCurve3` patrol loops at varying heights and speeds
- **Ambient dust particles** — 350 drifting points filling the bay volume
- **Gateway void** — deep space starfield visible through the open hangar mouth
- **Cinematic camera rig** — slow orbit pan pre-dock, low-angle forward pull post-dock; no `OrbitControls` dependency
- **Dock → Services flow** — `DOCK` HUD button triggers pad activation, camera transition, then slides in the station services panel
- **Station Services menu** — Market, Fitting, Repair, Agent Finder, Insurance, Clone Bay; `onServiceSelect` callback on selection
- **Undock** — returns scene to pre-dock state with reverse camera transition

### Quick Start

```bash
npm install three @react-three/fiber @react-three/drei
```

```jsx
import StationInterior from './station-interior-3d/StationInterior';

<StationInterior
  shipClass="interceptor"           // "interceptor" | "frigate" | "hauler"
  stationName="Astra Prime — Bay 7"
  autoRotateCamera={true}
  onDock={() => console.log('Docked')}
  onServiceSelect={(id) => console.log('Service:', id)}
/>
```

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `shipClass` | `'interceptor' \| 'frigate' \| 'hauler'` | `'interceptor'` | Player ship silhouette dimensions |
| `stationName` | `string` | `'Astra Prime — Docking Bay 7'` | Station nameplate label |
| `autoRotateCamera` | `boolean` | `true` | Slow cinematic orbit before docking |
| `onDock` | `() => void` | — | Fired when player confirms dock |
| `onServiceSelect` | `(service: string) => void` | — | Fired on services menu selection |

### GLB Asset Swap-in

All placeholder geometry is tagged with `{/* GLB_SLOT: N */}` comments. Replace with:

```jsx
import { useGLTF } from '@react-three/drei'
const { scene } = useGLTF('/assets/hangar.glb')
return <primitive object={scene} />
```

Slot index reference: `0` hangar shell · `1` docking pad · `2` player ship · `3` NPC shuttle

### TSX Migration

Add a typed prop interface and replace `useRef<any>` with typed variants (`useRef<THREE.Mesh>`, `useRef<THREE.Group>` etc). All animation logic uses standard hooks with no external animation library dependency.

---

## 📚 Citation

### Academic Citation

If you use this codebase in your research or project, please cite:

```bibtex
@software{adam_offline_jsx,
  title = {Adam Offline JSX: Eve Online-style 3D spaceship controller React component},
  author = {[Drift Johnson]},
  year = {2025},
  url = {https://github.com/MushroomFleet/adam-offline-jsx},
  version = {1.0.0}
}
```

### Donate:

[![Ko-Fi](https://cdn.ko-fi.com/cdn/kofi3.png?v=3)](https://ko-fi.com/driftjohnson)
