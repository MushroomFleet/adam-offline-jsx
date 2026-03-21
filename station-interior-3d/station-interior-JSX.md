# StationInterior — JSX Component

React Three.js hangar interior scene for a space station docking bay.
Low-poly SVGA-style vertex shading, placeholder geometry ready for .GLB swap.

## Usage

```jsx
import StationInterior from './StationInterior';

// Basic usage
<StationInterior />

// With callbacks
<StationInterior
  onDock={() => console.log('Docked!')}
  onServiceSelect={(service) => console.log('Selected:', service)}
  shipClass="interceptor" // "interceptor" | "frigate" | "hauler"
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onDock` | `() => void` | — | Fired when player clicks Dock |
| `onServiceSelect` | `(service: string) => void` | — | Fired on service menu selection |
| `shipClass` | `'interceptor' \| 'frigate' \| 'hauler'` | `'interceptor'` | Player ship silhouette |
| `stationName` | `string` | `'Astra Prime — Docking Bay 7'` | Station header label |
| `autoRotateCamera` | `boolean` | `true` | Slow orbit camera before docking |

## Architecture

```
StationInterior
├── ThreeCanvas            — R3F Canvas, tone mapping, shadows
│   ├── HangarGeometry     — Low-poly box interior + gateway arch
│   ├── DockingPad         — Hexagonal pad with status lights
│   ├── PlayerShip         — Vertex-shaded low-poly ship mesh
│   ├── NPCTraffic         — 2–4 shuttle meshes on patrol paths
│   ├── AmbientParticles   — Dust / thruster particle trails
│   ├── HangarLighting     — Directional + point lights
│   └── CameraRig          — Cinematic orbit → dock transition
└── HUD
    ├── DockButton          — Primary CTA
    └── ServicesMenu        — Slides in post-dock
        ├── Market
        ├── Fitting
        ├── Insurance
        └── Agent Finder
```

## Swap-in GLB Assets

Replace placeholder `<mesh>` blocks tagged `{/* GLB_SLOT: <name> */}` with:

```jsx
import { useGLTF } from '@react-three/drei'
const { scene } = useGLTF('/assets/player_ship.glb')
return <primitive object={scene} />
```

## Notes

- Built with `@react-three/fiber` + `@react-three/drei`
- Vertex colours set per geometry via `BufferAttribute` for SVGA palette
- All animation via `useFrame` — no external animation lib dependency
- Camera transition uses `lerp` on position/target for smooth dock approach
- NPC paths defined as `CatmullRomCurve3` closed loops around the bay
- TSX migration: add prop interface types, replace `useRef<any>` with typed refs
