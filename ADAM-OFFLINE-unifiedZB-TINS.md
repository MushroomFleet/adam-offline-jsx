# ADAM OFFLINE ZB — Unified Implementation Plan

```
      .                                                      .
        .n                   .                 .                  n.
  .   .dP                  dP                   9b                 9b.    .
 4    qXb         .       dX                     Xb       .        dXp     t
dX.    9Xb      .dXb    __                     __    dXb.     dXP     .Xb
9XXb._       _.dXXXXb dXXXXbo.               .odXXXXb dXXXXb._       _.dXXP
 9XXXXXXXXXXXXXXXXXXXVXXXXXXXXOo.           .oOXXXXXXXXVXXXXXXXXXXXXXXXXXXXP
  `9XXXXXXXXXXXXXXXXXXXXX'~   ~`OOO8b   d8OOO'~   ~`XXXXXXXXXXXXXXXXXXXXXP'
    `9XXXXXXXXXXXP' `9XX'   DIE    `98v8P'  HUMAN   `XXP' `9XXXXXXXXXXXP'
        ~~~~~~~       9X.          .db|db.          .XP       ~~~~~~~
                        )b.  .dbo.dP'`v'`9b.odb.  .dX(
                      ,dXXXXXXXXXXXb     dXXXXXXXXXXXb.
                     dXXXXXXXXXXXP'   .   `9XXXXXXXXXXXb
                    dXXXXXXXXXXXXb   d|b   dXXXXXXXXXXXXb
                    9XXb'   `XXXXXb.dX|Xb.dXXXXX'   `dXXP
                     `'      9XXXXXX(   )XXXXXXP      `'
                              XXXX X.`v'.X XXXX
                              XP^X'`b   d'`X^XX
                              X. 9  `   '  P )X
                              `b  `       '  d'
```

> **TINS Plan** — There Is No Source. This document IS the source.
> **Version:** 1.0 — Unified ZeroBytes Build
> **Target Stack:** TypeScript, React 18, Three.js, Vite
> **Build Paradigm:** From-scratch implementation using this plan alone

---

## Description

**ADAM OFFLINE ZB** is a tactical space simulation RPG set in a deterministic, procedurally generated star cluster. The player is a stranded pilot ("Capsuleer") who must navigate hostile space, mine resources, trade goods, engage in tactical combat, and upgrade their ship to survive — all within a universe that springs complete from a single world seed.

The game is built on a **three-layer deterministic procedural stack**:

- **Layer 1 — ZeroBytes O(1):** Every entity (star, asteroid, pirate, price) is a pure function of its coordinates. No stored world data.
- **Layer 2 — Zero-Quadratic O(N²):** Every relationship between two entities (faction tension, trade viability, NPC bonds) is derived from their coordinate pair.
- **Layer 3 — Zero-Cubic O(N³):** Every emergent three-entity property (coalition stability, trade circuits, wolf-pack AI) is derived from the triple hash.

**No `Math.random()`. No stored world state. No databases.** The universe regenerates identically from `WORLD_SEED` on any machine, any time. Only player-caused mutations (depleted asteroids, cleared sites, cargo, XP) are saved.

---

## Functionality

### Core Gameplay Loop

1. **Dock** at a station — buy/sell cargo, train skills, refine ore, craft modules
2. **Undock** and navigate — warp between planets, belts, gates within a system
3. **Mine** asteroids — lock target, activate mining laser, fill cargo hold
4. **Trade** between stations — exploit deterministic price differentials and trade circuits
5. **Fight** pirates — tactical stat-based combat with shield/armor/hull cascade
6. **Jump** between star systems via gates — explore HAVEN, FRONTIER, and DEADZONE
7. **Progress** — earn XP, train skills, unlock ships, discover crafting recipes

### Security Zones

| Zone | Danger | Resources | Pirates | Police |
|------|--------|-----------|---------|--------|
| **HAVEN** (High Sec) | Low | Common ores (Veldspar, Scordite) | None | Strong patrols |
| **FRONTIER** (Low Sec) | Medium | Mid ores (Pyroxeres, Plagioclase, Omber) | Frigates, Destroyers | Weak/none |
| **DEADZONE** (Null Sec) | Extreme | Rare ores (Kernite through Arkonor, Mercoxit) | Cruisers, Battlecruisers, warp scramble | None |

Zone boundaries are not hard lines — `border_danger_level()` creates a smooth gradient of increasing threat near borders using coherent noise + distance blending.

### Controls & Interface

**Mouse:**
- Left Click: Select object
- Left Click + Drag: Rotate camera
- Scroll Wheel: Zoom

**HUD Elements:**
1. **Overview Panel** (right) — all nearby objects sorted by distance, powered by `SpatialGrid.getNearby()`
2. **Action Menu** (top-right) — context-sensitive: Approach, Orbit, Warp, Dock, Lock, Mine
3. **Telemetry** (bottom-center) — Shield / Armor / Hull / Capacitor bars
4. **Module Bar** (bottom) — weapon/module slots, F1/F2/F3 activation keys
5. **Political Pulse** (top-left) — current coalition state for the cluster
6. **Route Advisor** (market tab) — trade route profit multipliers

### Combat System

Combat is **tactical and stat-based**, not twitch:

1. Lock target (click in overview or 3D view)
2. Ensure weapon range (Lasers: 20km instant, Missiles: 40km with travel time)
3. Activate weapon modules (drains capacitor)
4. Damage cascades: **Shield → Armor (with resistance) → Hull**
5. Hull reaches 0 = ship destroyed, escape pod warps to nearest HAVEN

**Wolf-Pack AI:** When 3+ pirates are within 15km, Zero-Cubic `wolfpack_dynamic()` determines group behaviour:
- `COORDINATED_ASSAULT` — tight formation, shared target focus, assigned roles (tackler/DPS/logistics)
- `FERAL_SWARM` — independent, unpredictable, dangerous but exploitable
- `BETRAYAL_PATTERN` — two focus player, one acts as bait, may scatter

**Warp Scramble:** DEADZONE pirates can prevent escape. Determined by `positionHash(pirate.pos, round, WORLD_SEED + 0xDEAD)`. Only the tackler-role pirate in a coordinated pack applies scramble.

### Mining & Industry

1. Warp to asteroid belt
2. Approach within 5,000m
3. Lock asteroid, activate Mining Laser (5,000m range, 20 m³/cycle, 5 cap/cycle)
4. Asteroids deplete — **depletion is the ONLY mining state that is saved**
5. Return to station to sell raw ore or refine at Refinery Console

**Contested Fields (Zero-Cubic):** When three belts form a triangle within 50km, emergent properties appear:
- Shared pirate patrol routes across all three
- Rare centroid ore seam at the triangle's geometric center
- Mining one belt creates extraction interference in the other two
- Classifications: `HOT_ZONE` / `DISPUTED` / `WATCHED`

### Trade Economy

**Per-Station Pricing (ZeroBytes):** Each station has a deterministic price personality. Prices drift slowly via `coherent_value(day_number * 0.05, item_salt, WORLD_SEED)` — ±15% daily drift. Zone modifiers: HAVEN 0.90x buy, FRONTIER 1.05x, DEADZONE 1.30x.

**Trade Routes (Zero-Quadratic):** Directional viability `trade_viability(A→B) ≠ trade_viability(B→A)`. Based on supply/demand complementarity minus distance cost. Players see profit multipliers in a Route Advisor panel.

**Trade Circuits (Zero-Cubic):** Three-station closed loops with emergent circuit bonus. Discovered by visiting all three nodes. Profit tiers: MARGINAL / GOOD / EXCELLENT / LEGENDARY. Circuit decay: `WORLD_SEED + epoch` shifts circuits weekly.

### Three-Reagent Crafting

At the station Refinery Console, combine any three reagents (12 types: Tritanium through LiquidOzone). ~40% of combinations yield a module product. Fully symmetric (`reaction(A,B,C) == reaction(C,A,B)`). Quality tiers: DAMAGED / STANDARD / ENHANCED / PERFECT. 10% volatile reaction chance (cosmetic explosion VFX). Discovery system — unknown recipes show as `??? + ??? + ??? → ?` until performed.

**18 possible products** including Shield Booster I, Railgun I, Warp Disruptor I, Cloaking Device, ADAM Core Fragment (narrative hook for endgame gate restoration).

### Faction Politics (Zero-Cubic)

Three-zone coalition stability is a genuinely triadic property:
- `PACT` (stability > 0.75) — three-way non-aggression, trade bonanzas
- `SHIFTING` (0.25–0.75) — two aligned against the third, escort missions
- `COLLAPSE` (< 0.25) — triple-war imminent, all factions hostile

Viewable at diplomatic terminals. Cascades hierarchically: zone → system → station level.

### NPC Social Graph (Zero-Quadratic)

Each system has 6–8 NPCs with deterministic roles (trader, miner, pirate, bounty_hunter, police, smuggler). Pairwise relationships: WINGMAN / NEMESIS / DEBTOR / OLD_CONTACT / STRANGER. Surfaced as ambient dialogue at stations. WINGMAN pairs can be hired together at discount.

### Resonance Anomalies (Zero-Cubic)

Three nearby star systems can generate anomaly types at their centroid: Null-Space Echo, Capacitor Surge Zone, Pirate Nexus, Ancient ADAM Relay, Gravitational Lens, Void Crystal Field, Ghost Signal, Faction Flashpoint. Detected via Anomaly Scanner module (F3 skill unlock). Shift weekly via epoch seed.

### Progression

- **XP** from mining, kills, trading
- **Skills:** Gunnery (damage), Shield Management, Mining (yield), Navigation (warp speed), Hull Upgrades (ship unlocks)
- **Ships:** Rookie Frigate → Combat Frigate → Prospector Barge → Destroyer → Pathfinder Corvette (classified)
- XP thresholds per skill per level (5 levels each), defined in `SKILL_TREE`

### Death Penalty

Ship destroyed → Escape Pod auto-warps to nearest HAVEN station. Player receives a Rookie Frigate. All cargo in the wreck is **lost forever**. Wreck position is deterministic, loot table derived from wreck coordinates + ship class.

### Minimal Save Format

```json
{
  "world_seed": 181534047,
  "created_utc": 1700000000,
  "player": {
    "name": "Capsuleer_Alpha",
    "location": { "system": [1, 0], "position": [0, 0, 0] },
    "ship_class": "ROOKIE_FRIGATE",
    "isk": 50000,
    "xp": 0,
    "skills": { "GUNNERY": 0, "SHIELD_MANAGEMENT": 0, "MINING": 0, "NAVIGATION": 0, "HULL_UPGRADES": 0 },
    "cargo": [],
    "known_circuits": [],
    "known_recipes": [],
    "faction_rep": {}
  },
  "depleted_asteroids": [],
  "cleared_sites": [],
  "salvaged_wrecks": []
}
```

Everything else — stars, belts, pirates, prices, factions, anomalies, gates, planets — is regenerated on demand from `world_seed` and coordinates.

---

## Technical Implementation

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Language | TypeScript (strict mode) | All game logic and UI |
| UI Framework | React 18 | HUD panels, menus, state management |
| 3D Rendering | Three.js | Space scene, ships, asteroids, effects |
| Build Tool | Vite | Fast dev server, ESM bundling |
| State | Zustand | Lightweight reactive game state |
| Styling | Tailwind CSS | HUD and panel styling |

### Project Structure

```
adam-offline-zb/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── public/
│   └── fonts/
├── src/
│   ├── main.tsx                          # React entry point
│   ├── App.tsx                           # Root component, game loop orchestration
│   │
│   ├── engine/                           # PURE LOGIC — no React, no Three.js imports
│   │   ├── constants.ts                  # WORLD_SEED, salt constants, tuning values
│   │   ├── hash-core.ts                  # xxHash32, positionHash, hashToFloat, hashToRange, hashToInt, subHash
│   │   ├── noise.ts                      # coherentValue3D, smoothstep
│   │   ├── spatial-grid.ts               # SpatialGrid class (O(1) neighbor lookup)
│   │   │
│   │   ├── zero-bytes/                   # Layer 1: O(1) Entity Generation
│   │   │   ├── cluster-gen.ts            # generateStarSystem()
│   │   │   ├── asteroid-gen.ts           # generateBelt(), generateAsteroid()
│   │   │   ├── planet-gen.ts             # generatePlanet()
│   │   │   ├── gate-gen.ts              # getGateConnections()
│   │   │   ├── pirate-gen.ts            # generatePiratePatrol()
│   │   │   ├── market-gen.ts            # getStationPrice()
│   │   │   └── loot-gen.ts              # generateWreckLoot()
│   │   │
│   │   ├── zero-quadratic/              # Layer 2: O(N²) Pairwise Relations
│   │   │   ├── pair-hash.ts             # pairHash (symmetric), asymmetricPairHash, relationshipStrength
│   │   │   ├── zone-borders.ts          # zoneBorderTension(), borderDangerLevel()
│   │   │   ├── faction-relations.ts     # factionTension(), aggressionTowardPlayer()
│   │   │   ├── trade-routes.ts          # tradeViability(), bestRouteForCargo()
│   │   │   ├── belt-complement.ts       # beltComplementarity(), depletionPressure()
│   │   │   ├── npc-social.ts            # npcRelationship(), systemSocialGraph()
│   │   │   ├── skill-market.ts          # stationSkillSupply(), interStationSkillTransfer()
│   │   │   └── hierarchy.ts             # zonePairSeed → factionPairSeed → npcPairSeed chain
│   │   │
│   │   ├── zero-cubic/                  # Layer 3: O(N³) Triadic Emergence
│   │   │   ├── triple-hash.ts           # tripleHash (symmetric), asymmetricTripleHash, tripleStrength
│   │   │   ├── coalition.ts             # coalitionStability(), classifyTripleAlliance()
│   │   │   ├── trade-circuits.ts        # tradeCircuitViability(), discoverCircuitsNear()
│   │   │   ├── wolfpack.ts              # wolfpackDynamic(), spawnWolfpackNear()
│   │   │   ├── contested-fields.ts      # contestedField(), centroidSeamActive()
│   │   │   ├── crafting.ts              # compoundReaction(), getKnownReactions()
│   │   │   └── resonance.ts             # systemResonance(), scanForAnomalies()
│   │   │
│   │   ├── combat/                      # Combat Resolution (ported from ZB-3DCombatLayerV3)
│   │   │   ├── ship-types.ts            # SHIP_TYPES constant, ship stat definitions
│   │   │   ├── weapon-types.ts          # WEAPON_TYPES: LASER, MISSILE, MINING_LASER
│   │   │   ├── ship-generator.ts        # generateShip() — position-seeded ship with layered HP
│   │   │   ├── attack-resolver.ts       # resolveAttack3D(), resolveShipAttack()
│   │   │   ├── damage-model.ts          # applyShipDamage() — shield→armor→hull cascade
│   │   │   ├── battle-round.ts          # resolveBattleRound(), resolveFleetCombatRound()
│   │   │   ├── warp-scramble.ts         # checkWarpScramble()
│   │   │   ├── escape-pod.ts            # resolveEscapePod()
│   │   │   ├── movement.ts             # calculateMovementPhase()
│   │   │   └── verify-determinism.ts    # verifyAdamCombatDeterminism()
│   │   │
│   │   ├── progression/
│   │   │   ├── skill-tree.ts            # SKILL_TREE, getSkillLevel(), getUnlockedShips()
│   │   │   └── xp-rewards.ts            # XP tables for mining, combat, trading
│   │   │
│   │   └── save/
│   │       ├── save-format.ts           # SaveData type, default save factory
│   │       ├── save-manager.ts          # localStorage load/save/export/import
│   │       └── mutation-tracker.ts      # Track depleted_asteroids, cleared_sites, etc.
│   │
│   ├── renderer/                        # Three.js visual layer
│   │   ├── scene-manager.ts             # Scene, camera, renderer, lighting setup
│   │   ├── space-scene-renderer.ts      # InstancedMesh for ships (ported from V3 InstancedArmyRenderer)
│   │   ├── asteroid-renderer.ts         # Instanced asteroid field rendering
│   │   ├── floating-text-pool.ts        # Damage/shield/armor numbers (ported from V3, Math.random fixed)
│   │   ├── skybox.ts                    # Starfield background
│   │   ├── effects/
│   │   │   ├── warp-effect.ts           # Warp tunnel VFX
│   │   │   ├── weapon-effects.ts        # Laser beams, missile trails
│   │   │   ├── explosion.ts             # Ship destruction VFX
│   │   │   └── shield-flash.ts          # Shield impact VFX
│   │   └── performance-monitor.ts       # FPS counter, draw call tracking
│   │
│   ├── state/                           # Zustand stores
│   │   ├── game-store.ts               # Master game state: player, location, mode
│   │   ├── combat-store.ts             # Active combat state: fleets, round, results
│   │   ├── ui-store.ts                 # Panel visibility, selected target, modals
│   │   └── save-store.ts               # Persisted mutation state
│   │
│   ├── systems/                         # Game loop systems (tick-driven)
│   │   ├── game-loop.ts                # Master loop: sim tick (4Hz) + render tick (60Hz)
│   │   ├── navigation-system.ts        # Warp, approach, orbit commands
│   │   ├── combat-system.ts            # Combat round orchestration
│   │   ├── mining-system.ts            # Mining laser cycling, depletion
│   │   └── ai-system.ts               # NPC behavior, wolf-pack evaluation
│   │
│   ├── ui/                             # React HUD components
│   │   ├── HUD.tsx                     # Layout shell for all HUD elements
│   │   ├── OverviewPanel.tsx           # Sorted object list from SpatialGrid
│   │   ├── ActionMenu.tsx              # Context-sensitive commands
│   │   ├── TelemetryBar.tsx            # Shield/Armor/Hull/Cap bars
│   │   ├── ModuleBar.tsx               # F1/F2/F3 weapon slots
│   │   ├── PoliticalPulse.tsx          # Coalition state display
│   │   ├── StationUI/
│   │   │   ├── StationPanel.tsx        # Dock UI container
│   │   │   ├── MarketTab.tsx           # Buy/sell + Route Advisor
│   │   │   ├── RefineryTab.tsx         # Three-reagent crafting
│   │   │   ├── SkillsTab.tsx           # Skill training queue
│   │   │   ├── ShipTab.tsx             # Ship fitting, hull selection
│   │   │   └── DiplomacyTab.tsx        # Coalition status, NPC social graph
│   │   ├── MapView.tsx                 # 2D cluster map overlay
│   │   ├── CircuitLog.tsx              # Discovered trade circuits
│   │   └── DeathScreen.tsx             # Escape pod notification
│   │
│   └── types/                          # Shared TypeScript types
│       ├── world.ts                    # StarSystem, Planet, AsteroidBelt, Asteroid
│       ├── ships.ts                    # Ship, ShipType, WeaponType, DamageResult
│       ├── economy.ts                  # TradeRoute, TradeCircuit, MarketPrice
│       ├── factions.ts                # FactionRelation, CoalitionState, WolfpackDynamic
│       ├── combat.ts                  # AttackResult, BattleRound, WarpScrambleResult
│       └── player.ts                  # PlayerState, SkillTree, SaveData
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ADAM OFFLINE ZB                              │
├─────────────┬──────────────┬────────────────┬───────────────────────┤
│   React UI  │  Three.js    │  Game Systems  │    Engine (Pure)      │
│   (HUD)     │  (Renderer)  │  (Tick-Driven) │    (No side effects)  │
├─────────────┼──────────────┼────────────────┼───────────────────────┤
│ OverviewPnl │ SpaceScene   │ game-loop.ts   │ ┌─────────────────┐  │
│ ActionMenu  │ AsteroidRend │ combat-sys.ts  │ │ Zero-Cubic (L3) │  │
│ Telemetry   │ FloatingText │ mining-sys.ts  │ │ coalition.ts    │  │
│ ModuleBar   │ WeaponFX     │ nav-sys.ts     │ │ wolfpack.ts     │  │
│ StationUI/* │ Explosions   │ ai-sys.ts      │ │ circuits.ts     │  │
│ MapView     │              │                │ ├─────────────────┤  │
│ PolitPulse  │              │  Zustand       │ │ Zero-Quad (L2)  │  │
│             │              │  Stores        │ │ faction-rel.ts  │  │
│             │              │  ┌──────────┐  │ │ trade-routes.ts │  │
│             │              │  │game-store│  │ │ npc-social.ts   │  │
│             │              │  │combat-st │  │ ├─────────────────┤  │
│             │              │  │ui-store  │  │ │ ZeroBytes (L1)  │  │
│             │              │  │save-store│  │ │ cluster-gen.ts  │  │
│             │              │  └──────────┘  │ │ asteroid-gen.ts │  │
│             │              │                │ │ pirate-gen.ts   │  │
│             │              │                │ │ market-gen.ts   │  │
│             │              │                │ ├─────────────────┤  │
│             │              │                │ │ Hash Core       │  │
│             │              │                │ │ xxHash32        │  │
│             │              │                │ │ positionHash    │  │
│             │              │                │ │ coherentValue3D │  │
│             │              │                │ └─────────────────┘  │
├─────────────┴──────────────┴────────────────┴───────────────────────┤
│                     localStorage (Save Data)                        │
│         Only: player state + depleted/cleared/salvaged sets         │
└─────────────────────────────────────────────────────────────────────┘
```

### Tick Architecture

```
Simulation Tick (4 Hz — every 250ms):
  ├─ Combat rounds (resolveFleetCombatRound)
  ├─ Mining cycles (ore extraction, depletion check)
  ├─ NPC AI decisions (wolf-pack evaluation, aggression checks)
  ├─ Capacitor recharge (+5/tick, capped at max)
  └─ SpatialGrid rebuild

Render Tick (requestAnimationFrame — ~60 Hz):
  ├─ Lerp ship renderPos toward simPos (factor 0.15)
  ├─ FloatingTextPool.update(delta)
  ├─ Weapon effect animations
  ├─ Camera controls
  └─ Three.js renderer.render(scene, camera)
```

### Data Models

#### StarSystem

```typescript
interface StarSystem {
  coord: [number, number];          // Grid position (sx, sy)
  name: string;                      // "SYS-XXXX" from seed
  seed: number;                      // positionHash(sx, sy, 0, WORLD_SEED)
  starType: 'Red Dwarf' | 'Yellow Star' | 'Blue Giant' | 'Neutron Star' | 'Binary';
  planetCount: number;               // 1–8
  securityZone: 'HAVEN' | 'FRONTIER' | 'DEADZONE';
  hasStation: boolean;
  hasGate: boolean;
  numBelts: number;                  // 1–4
  policeStrength: number;            // 0–10
}
```

#### Ship

```typescript
interface Ship {
  id: string;                        // "ship_" + hex seed
  seed: number;
  type: ShipType;
  simPos: Vec3;                      // Simulation position (source of truth)
  renderPos: Vec3;                   // Visual position (lerped)
  stats: {
    attack: number;
    defense: number;
    precision: number;               // 0.0–1.0
    evasion: number;                 // 0.0–1.0
    critChance: number;              // 0.0–1.0
    critMultiplier: number;          // 1.5–2.5
  };
  shield: { current: number; max: number };
  armor: { current: number; max: number };
  hull: { current: number; max: number };
  capacitor: { current: number; max: number };
  faction: number;                   // 0 = player, 1 = hostile
  alive: boolean;
  baseColor: THREE.Color;
}
```

#### ShipType

```typescript
const SHIP_TYPES = {
  ROOKIE_FRIGATE: {
    id: 1, name: 'Rookie Frigate',
    baseStats: { attack: 8, defense: 5, precision: 0.55, evasion: 0.20, critChance: 0.08 },
    scale: 1.0,
    slots: { weapon: 1, defense: 1, utility: 1 },
  },
  COMBAT_FRIGATE: {
    id: 2, name: 'Combat Frigate',
    baseStats: { attack: 14, defense: 8, precision: 0.50, evasion: 0.22, critChance: 0.12 },
    scale: 1.2,
    slots: { weapon: 2, defense: 1, utility: 2 },
  },
  PROSPECTOR_BARGE: {
    id: 3, name: 'Prospector Barge',
    baseStats: { attack: 4, defense: 12, precision: 0.35, evasion: 0.08, critChance: 0.04 },
    scale: 1.5,
    slots: { weapon: 1, defense: 3, utility: 4 },
  },
  DESTROYER: {
    id: 4, name: 'Destroyer',
    baseStats: { attack: 20, defense: 10, precision: 0.45, evasion: 0.15, critChance: 0.10 },
    scale: 1.8,
    slots: { weapon: 4, defense: 2, utility: 2 },
  },
  PATHFINDER_CORVETTE: {
    id: 5, name: 'Pathfinder Corvette',
    baseStats: { attack: 18, defense: 14, precision: 0.60, evasion: 0.30, critChance: 0.18 },
    scale: 1.4,
    slots: { weapon: 3, defense: 3, utility: 3 },
  },
} as const;
```

#### WeaponType

```typescript
const WEAPON_TYPES = {
  LASER: {
    name: 'Combat Laser', range: 20000, travelTime: 0,
    precisionBonus: 0.05, damageType: 'EM', capacitorDrain: 12,
  },
  MISSILE: {
    name: 'Light Missile', range: 40000, travelTime: 3,
    precisionBonus: -0.05, damageType: 'kinetic', capacitorDrain: 8,
  },
  MINING_LASER: {
    name: 'Mining Laser', range: 5000, travelTime: 0,
    precisionBonus: 0, damageType: 'mining', miningYield: 20, capacitorDrain: 5,
  },
} as const;
```

#### Asteroid

```typescript
interface Asteroid {
  id: string;                        // "sx,sy:Bn:Aax,ay"
  seed: number;
  position: Vec3;
  oreType: string;
  volume: number;                    // m³ total
  volumeRemaining: number;           // Runtime — NOT saved (use depleted set)
  richness: number;                  // 0.0–1.0
  sizeClass: 'Small' | 'Medium' | 'Large';
  depleted: boolean;                 // Checked against save.depleted_asteroids
}
```

---

## Hash Engine — The Foundation

Every implementation file depends on this. Build it first. Port directly from `ZB-3DCombatLayerV3.jsx`.

### `src/engine/hash-core.ts`

```typescript
/**
 * ZeroBytes Hash Engine — ported from ZB-3DCombatLayerV3.jsx
 * The SOLE source of randomness in ADAM OFFLINE ZB.
 * No Math.random() anywhere in game logic. Ever.
 */

export const xxHash32 = (input: number[], seed: number = 0): number => {
  const PRIME1 = 0x9E3779B1;
  const PRIME2 = 0x85EBCA77;
  const PRIME3 = 0xC2B2AE3D;
  const PRIME4 = 0x27D4EB2F;
  const PRIME5 = 0x165667B1;

  let h32 = seed + PRIME5;

  for (let i = 0; i < input.length; i++) {
    h32 += input[i] * PRIME3;
    h32 = Math.imul(h32, PRIME4);
    h32 ^= h32 >>> 15;
  }

  h32 ^= h32 >>> 13;
  h32 = Math.imul(h32, PRIME2);
  h32 ^= h32 >>> 16;
  h32 = Math.imul(h32, PRIME3);
  h32 ^= h32 >>> 13;

  return h32 >>> 0;
};

export const quantize = (value: number, precision: number = 1000): number =>
  Math.round(value * precision);

export const hashToFloat = (hash: number): number =>
  (hash & 0xFFFFFFFF) / 0x100000000;

export const hashToRange = (hash: number, min: number, max: number): number =>
  min + hashToFloat(hash) * (max - min);

export const hashToInt = (hash: number, min: number, max: number): number =>
  Math.floor(hashToRange(hash, min, max + 1));

export const positionHash = (x: number, y: number, z: number, salt: number = 0): number =>
  xxHash32([quantize(x), quantize(y), quantize(z)], salt);

export const subHash = (baseHash: number, index: number): number =>
  xxHash32([baseHash, index], baseHash);
```

### `src/engine/noise.ts`

```typescript
import { positionHash, hashToFloat } from './hash-core';

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export const coherentValue3D = (
  x: number, y: number, z: number,
  seed: number, octaves: number = 4, frequency: number = 0.02
): number => {
  let value = 0, amplitude = 1, freq = frequency, maxAmplitude = 0;

  for (let o = 0; o < octaves; o++) {
    const fx = x * freq, fy = y * freq, fz = z * freq;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
    const sx = smoothstep(fx - x0), sy = smoothstep(fy - y0), sz = smoothstep(fz - z0);

    const n000 = hashToFloat(positionHash(x0, y0, z0, seed + o)) * 2 - 1;
    const n100 = hashToFloat(positionHash(x0+1, y0, z0, seed + o)) * 2 - 1;
    const n010 = hashToFloat(positionHash(x0, y0+1, z0, seed + o)) * 2 - 1;
    const n110 = hashToFloat(positionHash(x0+1, y0+1, z0, seed + o)) * 2 - 1;
    const n001 = hashToFloat(positionHash(x0, y0, z0+1, seed + o)) * 2 - 1;
    const n101 = hashToFloat(positionHash(x0+1, y0, z0+1, seed + o)) * 2 - 1;
    const n011 = hashToFloat(positionHash(x0, y0+1, z0+1, seed + o)) * 2 - 1;
    const n111 = hashToFloat(positionHash(x0+1, y0+1, z0+1, seed + o)) * 2 - 1;

    const nx00 = n000 * (1 - sx) + n100 * sx;
    const nx10 = n010 * (1 - sx) + n110 * sx;
    const nx01 = n001 * (1 - sx) + n101 * sx;
    const nx11 = n011 * (1 - sx) + n111 * sx;
    const nxy0 = nx00 * (1 - sy) + nx10 * sy;
    const nxy1 = nx01 * (1 - sy) + nx11 * sy;

    value += amplitude * (nxy0 * (1 - sz) + nxy1 * sz);
    maxAmplitude += amplitude;
    amplitude *= 0.5;
    freq *= 2;
  }

  return value / maxAmplitude;
};
```

### Layer 2 Foundation — `src/engine/zero-quadratic/pair-hash.ts`

```typescript
import { xxHash32, hashToFloat } from '../hash-core';

/** Symmetric: pairHash(A, B) === pairHash(B, A). Always sort before packing. */
export const pairHash = (
  ax: number, ay: number, bx: number, by: number, salt: number = 0
): number => {
  const [[p1x, p1y], [p2x, p2y]] = [[ax, ay], [bx, by]].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1]
  );
  return xxHash32([p1x, p1y, p2x, p2y], salt);
};

/** Directional: asymmetricPairHash(A→B) !== asymmetricPairHash(B→A). */
export const asymmetricPairHash = (
  ax: number, ay: number, bx: number, by: number, salt: number = 0
): number => xxHash32([ax, ay, bx, by], salt);

/** Deterministic 0.0–1.0 intensity with quadratic distance falloff. */
export const relationshipStrength = (
  ax: number, ay: number, bx: number, by: number,
  salt: number, maxDist: number = 100
): number => {
  const dist = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
  if (dist > maxDist) return 0;
  const base = hashToFloat(pairHash(ax, ay, bx, by, salt));
  const falloff = 1 - (dist / maxDist) ** 2;
  return base * falloff;
};

/** Child relationship inherits parent tension through seed lineage. */
export const hierarchicalPairSeed = (
  parentPairSeed: number, localA: number, localB: number
): number => pairHash(localA, parentPairSeed, localB, parentPairSeed >>> 16, 0);
```

### Layer 3 Foundation — `src/engine/zero-cubic/triple-hash.ts`

```typescript
import { xxHash32, hashToFloat, positionHash } from '../hash-core';

/** Fully symmetric: all 6 permutations produce the same hash. Sort before packing. */
export const tripleHash = (
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, salt: number = 0
): number => {
  const pts = [[ax, ay], [bx, by], [cx, cy]].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1]
  );
  return xxHash32(
    [pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1]],
    salt
  );
};

/** Ordered triple: prop(A,B,C) !== prop(A,C,B). For directed triadic flows. */
export const asymmetricTripleHash = (
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, salt: number = 0
): number => xxHash32([ax, ay, bx, by, cx, cy], salt);

/** Returns true if ANY pair exceeds maxDist — guard before triadic evaluation. */
export const tripleProximityGuard = (
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, maxDist: number
): boolean => {
  const d = (x1: number, y1: number, x2: number, y2: number) =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  return d(ax, ay, bx, by) > maxDist ||
         d(bx, by, cx, cy) > maxDist ||
         d(ax, ay, cx, cy) > maxDist;
};

/** Deterministic triadic intensity with weakest-pair proximity falloff. 0.0–1.0. */
export const tripleStrength = (
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, salt: number, maxDist: number = 200
): number => {
  if (tripleProximityGuard(ax, ay, bx, by, cx, cy, maxDist)) return 0;
  const d = (x1: number, y1: number, x2: number, y2: number) =>
    Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const weakest = Math.max(d(ax, ay, bx, by), d(bx, by, cx, cy), d(ax, ay, cx, cy));
  const falloff = 1 - (weakest / maxDist) ** 2;
  return hashToFloat(tripleHash(ax, ay, bx, by, cx, cy, salt)) * falloff;
};

/** Child triple inherits parent triple context via seed cascade. */
export const hierarchicalTripleSeed = (
  parentTripleSeed: number, localA: number, localB: number, localC: number
): number => tripleHash(
  localA, parentTripleSeed & 0xFFFF,
  localB, (parentTripleSeed >>> 16) & 0xFFFF,
  localC, (parentTripleSeed >>> 32) & 0xFFFF,
  0
);
```

---

## Salt Constants — `src/engine/constants.ts`

```typescript
/** Change only to create a new game universe. Stored per save file. */
export const DEFAULT_WORLD_SEED = 0xADAM0FF1;

// ── Layer 1: ZeroBytes Salts ────────────────────────────────────────
export const SALT = {
  // Cluster generation
  STAR_TYPE:      100,
  PLANET_COUNT:   101,
  SECURITY:       102,
  GATE_COUNT:     103,
  STATION:        104,

  // Asteroid generation
  ORE_TYPE:       200,
  ORE_VOLUME:     201,
  RICHNESS:       202,
  ORE_SIZE:       203,
  BELT_COUNT:     204,

  // Pirate generation
  PIRATE_COUNT:   300,
  PIRATE_FACTION: 301,
  PIRATE_SHIP:    302,
  SCRAMBLE:       303,
  SITE_COUNT:     304,

  // Market generation
  BASE_PRICE:     400,
  DAILY_DRIFT:    401,
  SUPPLY:         402,

  // Loot generation
  LOOT_TYPE:      500,
  LOOT_QTY:       501,
  LOOT_COUNT:     502,

  // Planet generation
  PLANET_TYPE:    600,
  ATMOSPHERE:     601,
  ANOMALY:        602,
  SCAN_STRENGTH:  603,

  // Gate network
  GATE_DIRECTION: 700,
  GATE_ACTIVE:    701,
} as const;

// ── N-Cap Budgets ───────────────────────────────────────────────────
export const N_CAPS = {
  TRADE_CIRCUIT_STATIONS: 24,     // Max stations for circuit discovery O(N³)
  ANOMALY_SCAN_SYSTEMS:   20,     // Max systems for resonance scan
  WOLFPACK_ENEMIES:       3,      // Hard cap — always exactly 3
  CONTESTED_BELTS:        8,      // Max belts per system for field eval
  NPC_PER_SYSTEM:         8,      // Max NPCs per system social graph
  SOCIAL_GRAPH_MAX:       16,     // Hard ceiling for NPC count
} as const;

// ── Gameplay Tuning ─────────────────────────────────────────────────
export const TUNING = {
  SIM_INTERVAL_MS:        250,    // 4 Hz simulation tick
  RENDER_LERP_FACTOR:     0.15,   // Visual smoothing
  CAP_RECHARGE_PER_TICK:  5,      // Capacitor regen per sim tick
  WARP_MIN_DISTANCE:      5000,   // Metres — must be > 5km to warp
  DOCK_DISTANCE:          2000,   // Metres — within 2km to dock/use gate
  WOLFPACK_RADIUS:        15000,  // Metres — 15km wolf-pack evaluation radius
  BELT_MAX_INFLUENCE:     50000,  // Metres — 50km contested field radius
  RESONANCE_MAX_DIST:     5.0,    // Light-year grid units
  CIRCUIT_MAX_LEG:        300,    // AU — max single trade circuit leg
} as const;
```

---

## Combat Resolution — Ported from ZB-3DCombatLayerV3

### `src/engine/combat/attack-resolver.ts`

```typescript
import { positionHash, hashToFloat, subHash, quantize } from '../hash-core';
import { coherentValue3D } from '../noise';
import type { Ship, AttackResult } from '../../types/combat';

/**
 * Core attack resolution — ported directly from V3 resolveAttack3D.
 * Pure function. No side effects. Returns result without modifying ship state.
 */
export const resolveAttack3D = (
  attacker: Ship, target: Ship,
  attackId: number, worldSeed: number
): AttackResult => {
  const attackSeed = positionHash(
    attacker.simPos.x, attacker.simPos.z, attackId, worldSeed
  );

  // Distance between combatants
  const dist = Math.sqrt(
    (target.simPos.x - attacker.simPos.x) ** 2 +
    (target.simPos.y - attacker.simPos.y) ** 2 +
    (target.simPos.z - attacker.simPos.z) ** 2
  );

  // Terrain/morale modifier via coherent noise (3D space "morale field")
  const morale = coherentValue3D(
    attacker.simPos.x * 0.1, attacker.simPos.y * 0.1,
    attacker.simPos.z * 0.1, worldSeed, 2, 0.05
  );
  const moraleMod = 1 + morale * 0.15;

  // Hit calculation
  const hitChance = Math.max(0.05, Math.min(0.95,
    attacker.stats.precision * moraleMod - target.stats.evasion
  ));
  const hitRoll = hashToFloat(subHash(attackSeed, 0));
  const hit = hitRoll < hitChance;

  if (!hit) {
    return { hit: false, damage: 0, isCrit: false, hash: attackSeed };
  }

  // Damage calculation
  let damage = Math.max(1,
    attacker.stats.attack * moraleMod - target.stats.defense * 0.5
  );

  // Crit check
  const critRoll = hashToFloat(subHash(attackSeed, 1));
  const isCrit = critRoll < attacker.stats.critChance;
  if (isCrit) {
    damage = Math.round(damage * attacker.stats.critMultiplier);
  }

  // Distance penalty — attacks beyond optimal range lose damage
  const optimalRange = 15000; // metres
  if (dist > optimalRange) {
    const rangePenalty = Math.max(0.3, 1 - (dist - optimalRange) / 30000);
    damage = Math.round(damage * rangePenalty);
  }

  return {
    hit: true,
    damage: Math.round(damage),
    isCrit,
    hash: attackSeed,
  };
};
```

### `src/engine/combat/damage-model.ts`

```typescript
import type { Ship, DamageLog } from '../../types/combat';

/**
 * Apply damage through the Shield → Armor → Hull cascade.
 * Mutates the ship object. Returns damage log and destruction flag.
 */
export const applyShipDamage = (ship: Ship, rawDamage: number): DamageLog => {
  let remaining = rawDamage;
  const log: Array<{ layer: string; absorbed: number }> = [];

  // Shield absorbs first
  if (ship.shield.current > 0) {
    const absorbed = Math.min(ship.shield.current, remaining);
    ship.shield.current -= absorbed;
    remaining -= absorbed;
    log.push({ layer: 'shield', absorbed });
  }

  // Armor absorbs with resistance
  if (remaining > 0 && ship.armor.current > 0) {
    const armorResist = Math.min(0.4, ship.stats.defense * 0.02);
    const armorDamage = Math.round(remaining * (1 - armorResist));
    const absorbed = Math.min(ship.armor.current, armorDamage);
    ship.armor.current -= absorbed;
    remaining -= absorbed;
    log.push({ layer: 'armor', absorbed });
  }

  // Hull is the kill layer
  if (remaining > 0) {
    const hullDamage = Math.min(ship.hull.current, remaining);
    ship.hull.current -= hullDamage;
    log.push({ layer: 'hull', absorbed: hullDamage });
  }

  if (ship.hull.current <= 0) {
    ship.hull.current = 0;
    ship.alive = false;
  }

  return { log, destroyed: !ship.alive };
};
```

---

## Rendering Layer — Ported from ZB-3DCombatLayerV3

### `src/renderer/space-scene-renderer.ts`

Port `InstancedArmyRenderer` from V3 with these changes:
- Replace `ConeGeometry` with `OctahedronGeometry(0.6, 0)` for ship diamonds
- Set material to `roughness: 0.2, metalness: 0.8` for metallic space look
- Dead ships scale to 0.2 (debris) instead of rotating (falling)
- Color tinting: player ships blue-shifted, hostile ships red-shifted
- HP-based color lerp uses `hull.current / hull.max` instead of flat `hp`
- Max instances: 500 (ships are fewer than infantry units)

### `src/renderer/floating-text-pool.ts`

Port `FloatingTextPool` from V3 with the **Math.random() fix**:

```typescript
// FIXED: Replace the three Math.random() lines in spawn() with:
const vSeed = positionHash(
  quantize(position.x), quantize(position.y), quantize(position.z),
  Date.now() & 0xFFFF  // Cosmetic-only — time salt is acceptable for VFX
);
item.velocity.x = hashToRange(subHash(vSeed, 0), -0.25, 0.25);
item.velocity.y = 2 + hashToFloat(subHash(vSeed, 1));
item.velocity.z = hashToRange(subHash(vSeed, 2), -0.25, 0.25);
```

This is the **only** place `Date.now()` appears, and it is cosmetic-only (VFX drift direction).

---

## Ore & Commodity Tables

```typescript
// ── Ore Types by Security Zone ──────────────────────────────────────
export const ORE_TABLE: Record<string, string[]> = {
  HAVEN:    ['Veldspar', 'Scordite'],
  FRONTIER: ['Pyroxeres', 'Plagioclase', 'Omber'],
  DEADZONE: ['Kernite', 'Jaspet', 'Hemorphite', 'Hedbergite', 'Arkonor'],
};

// Extended ore table for contested fields
export const ALL_ORES = [
  'Veldspar', 'Scordite', 'Pyroxeres', 'Plagioclase', 'Omber',
  'Kernite', 'Jaspet', 'Hemorphite', 'Hedbergite', 'Gneiss',
  'Dark Ochre', 'Crokite', 'Bistot', 'Arkonor', 'Mercoxit',
];

// ── Base ISK Values ─────────────────────────────────────────────────
export const BASE_PRICES: Record<string, number> = {
  Veldspar: 35, Scordite: 48, Pyroxeres: 95, Plagioclase: 120,
  Omber: 200, Kernite: 380, Jaspet: 620, Hemorphite: 900,
  Hedbergite: 1400, Arkonor: 3800, Mercoxit: 8000,
  Tritanium: 5, Pyerite: 10, Mexallon: 25, Isogen: 60,
  Nocxium: 150, Zydrine: 500, Megacyte: 2000, Morphite: 5000,
  Coolant: 80, EnrichedUranium: 300, HeavyWater: 40, LiquidOzone: 30,
};

// ── Crafting Reagents ───────────────────────────────────────────────
export const REAGENT_IDS: Record<string, number> = {
  Tritanium: 1, Pyerite: 2, Mexallon: 3, Isogen: 4,
  Nocxium: 5, Zydrine: 6, Megacyte: 7, Morphite: 8,
  Coolant: 9, EnrichedUranium: 10, HeavyWater: 11, LiquidOzone: 12,
};

// ── Craftable Module Products ───────────────────────────────────────
export const MODULE_PRODUCTS = [
  'Shield Booster I', 'Armor Repairer I', 'Mining Laser II',
  'Warp Drive Stabilizer', 'Afterburner II', 'Railgun I',
  'Missile Launcher II', 'Capacitor Battery', 'Sensor Dampener',
  'Target Painter', 'Warp Disruptor I', 'Cloaking Device',
  'Drone Bay Upgrade', 'Hull Reinforcement', 'Overcharge Array',
  'Pathfinder Upgrade', 'ADAM Core Fragment', 'Gate Key Component',
];

// ── Pirate Factions ─────────────────────────────────────────────────
export const PIRATE_FACTIONS_LIST = {
  FRONTIER: ['Rogue Drones', 'Blood Raiders', 'Guristas'],
  DEADZONE: ["Sansha's Nation", 'Angel Cartel', 'Serpentis', 'The Obsidian Order'],
};

// Named faction anchors for Zero-Quadratic relations
export const FACTION_ANCHORS = [
  { id: 0, pos: [150, 20] as const, name: 'Iron Reavers' },
  { id: 1, pos: [170, -10] as const, name: 'Null Syndicate' },
  { id: 2, pos: [260, 35] as const, name: 'Void Wraiths' },
  { id: 3, pos: [300, -20] as const, name: 'Capsule Hunters' },
];

// ── Zone Centroids (for Zero-Quadratic/Cubic relations) ─────────────
export const ZONE_CENTROIDS = {
  HAVEN:    [0, 0] as const,
  FRONTIER: [100, 50] as const,
  DEADZONE: [200, 0] as const,
};

// ── Loot Tables by Ship Class ───────────────────────────────────────
export const LOOT_TABLES: Record<string, Array<[string, number, number]>> = {
  ROOKIE_FRIGATE:    [['Tritanium Scrap', 50, 300], ['Small Armor Plate', 1, 3], ['Civilian Shield Booster', 0, 1]],
  COMBAT_FRIGATE:    [['Pyerite Ore', 100, 500], ['150mm Railgun I', 0, 1], ['Cap Booster Charge', 5, 20]],
  DESTROYER:         [['Kernite Fragment', 50, 200], ['Medium Shield Extender I', 0, 1], ['Salvage Drone', 1, 3]],
  PATHFINDER_CORVETTE: [['Megacyte Sample', 10, 50], ['425mm Railgun I', 0, 1], ['Deadspace Module Fragment', 0, 1]],
};

// ── Skill Tree ──────────────────────────────────────────────────────
export const SKILL_TREE = {
  GUNNERY:            { levels: [0, 1000, 3000, 7000, 15000], bonus: 'attackMult', perLevel: 0.08 },
  SHIELD_MANAGEMENT:  { levels: [0, 800, 2500, 6000, 12000], bonus: 'shieldMult', perLevel: 0.10 },
  MINING:             { levels: [0, 500, 1500, 4000, 9000],  bonus: 'yieldMult',  perLevel: 0.15 },
  NAVIGATION:         { levels: [0, 1200, 3500, 8000, 18000], bonus: 'warpSpeedMult', perLevel: 0.12 },
  HULL_UPGRADES: {
    levels: [0, 5000, 12000, 25000, 50000],
    unlocks: ['ROOKIE_FRIGATE', 'COMBAT_FRIGATE', 'PROSPECTOR_BARGE', 'DESTROYER', 'PATHFINDER_CORVETTE'],
  },
} as const;

// ── Anomaly Types (Zero-Cubic resonance) ────────────────────────────
export const ANOMALY_TYPES = [
  'Null-Space Echo', 'Capacitor Surge Zone', 'Pirate Nexus',
  'Ancient ADAM Relay', 'Gravitational Lens', 'Void Crystal Field',
  'Ghost Signal', 'Faction Flashpoint',
];

// ── NPC Roles ───────────────────────────────────────────────────────
export const NPC_ROLES = ['trader', 'miner', 'pirate', 'bounty_hunter', 'police', 'smuggler'];

// ── Wolf-pack Roles ─────────────────────────────────────────────────
export const WOLFPACK_ROLES = ['tackler', 'DPS', 'logistics', 'heavy_DPS', 'disruptor'];
```

---

## Build Sequence

Implement in this exact order. Each step depends on prior steps.

### Phase 1 — Project Scaffold & Hash Engine

| Step | File | What |
|------|------|------|
| 1.1 | `package.json` | Vite + React 18 + Three.js + Zustand + Tailwind + TypeScript |
| 1.2 | `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts` | Standard config, strict TS |
| 1.3 | `src/engine/hash-core.ts` | xxHash32, positionHash, hashToFloat, all helpers |
| 1.4 | `src/engine/noise.ts` | coherentValue3D with 3D trilinear interpolation |
| 1.5 | `src/engine/constants.ts` | WORLD_SEED, all salt constants, N-caps, tuning |
| 1.6 | `src/engine/spatial-grid.ts` | SpatialGrid class (port from V3) |
| 1.7 | `src/types/*.ts` | All TypeScript interfaces and types |

**Verification:** Write a test that calls `positionHash(1, 2, 3, 42)` twice and asserts identical results. Call it 1000 times with different inputs — all must be deterministic.

### Phase 2 — Layer 1: ZeroBytes Entity Generation

| Step | File | What |
|------|------|------|
| 2.1 | `src/engine/zero-bytes/cluster-gen.ts` | `generateStarSystem(sx, sy, worldSeed)` |
| 2.2 | `src/engine/zero-bytes/asteroid-gen.ts` | `generateBelt()`, `generateAsteroid()` |
| 2.3 | `src/engine/zero-bytes/planet-gen.ts` | `generatePlanet(sx, sy, orbitIdx, systemSeed)` |
| 2.4 | `src/engine/zero-bytes/gate-gen.ts` | `getGateConnections(sx, sy)` — 1–4 connections |
| 2.5 | `src/engine/zero-bytes/pirate-gen.ts` | `generatePiratePatrol(beltSeed, asteroidSeed, zone)` |
| 2.6 | `src/engine/zero-bytes/market-gen.ts` | `getStationPrice(sx, sy, item, day, zone)` |
| 2.7 | `src/engine/zero-bytes/loot-gen.ts` | `generateWreckLoot(wx, wy, wz, shipClass)` |

**Verification:** Generate system (5, 3) twice — assert all fields identical. Generate forward then reverse for 100 positions — assert identical.

### Phase 3 — Layer 2: Zero-Quadratic Pairwise Relations

| Step | File | What |
|------|------|------|
| 3.1 | `src/engine/zero-quadratic/pair-hash.ts` | pairHash, asymmetricPairHash, relationshipStrength |
| 3.2 | `src/engine/zero-quadratic/zone-borders.ts` | zoneBorderTension(), borderDangerLevel() |
| 3.3 | `src/engine/zero-quadratic/faction-relations.ts` | factionTension(), aggressionTowardPlayer() |
| 3.4 | `src/engine/zero-quadratic/trade-routes.ts` | tradeViability(), bestRouteForCargo() |
| 3.5 | `src/engine/zero-quadratic/belt-complement.ts` | beltComplementarity(), depletionPressure() |
| 3.6 | `src/engine/zero-quadratic/npc-social.ts` | npcRelationship(), systemSocialGraph() |
| 3.7 | `src/engine/zero-quadratic/skill-market.ts` | stationSkillSupply(), interStationSkillTransfer() |
| 3.8 | `src/engine/zero-quadratic/hierarchy.ts` | zonePairSeed → factionPairSeed → npcPairSeed |

**Verification:** Assert symmetry: `pairHash(A,B) === pairHash(B,A)` for all functions. Assert asymmetry: `asymmetricPairHash(A,B) !== asymmetricPairHash(B,A)`.

### Phase 4 — Layer 3: Zero-Cubic Triadic Emergence

| Step | File | What |
|------|------|------|
| 4.1 | `src/engine/zero-cubic/triple-hash.ts` | tripleHash, tripleStrength, proximityGuard |
| 4.2 | `src/engine/zero-cubic/coalition.ts` | coalitionStability(), classifyTripleAlliance() |
| 4.3 | `src/engine/zero-cubic/trade-circuits.ts` | tradeCircuitViability(), discoverCircuitsNear() |
| 4.4 | `src/engine/zero-cubic/wolfpack.ts` | wolfpackDynamic(), spawnWolfpackNear() |
| 4.5 | `src/engine/zero-cubic/contested-fields.ts` | contestedField(), centroidSeamActive() |
| 4.6 | `src/engine/zero-cubic/crafting.ts` | compoundReaction(), getKnownReactions() |
| 4.7 | `src/engine/zero-cubic/resonance.ts` | systemResonance(), scanForAnomalies() |

**Verification:** Assert all 6 permutations of `tripleHash(A,B,C)` produce identical results. Assert N-caps are enforced — no function accepts unbounded input.

### Phase 5 — Combat System (V3 Port to TSX)

| Step | File | What |
|------|------|------|
| 5.1 | `src/engine/combat/ship-types.ts` | SHIP_TYPES constant with all 5 hulls |
| 5.2 | `src/engine/combat/weapon-types.ts` | WEAPON_TYPES: LASER, MISSILE, MINING_LASER |
| 5.3 | `src/engine/combat/ship-generator.ts` | generateShip() with layered HP |
| 5.4 | `src/engine/combat/attack-resolver.ts` | resolveAttack3D(), resolveShipAttack() |
| 5.5 | `src/engine/combat/damage-model.ts` | applyShipDamage() cascade |
| 5.6 | `src/engine/combat/battle-round.ts` | resolveBattleRound(), resolveFleetCombatRound() |
| 5.7 | `src/engine/combat/warp-scramble.ts` | checkWarpScramble() |
| 5.8 | `src/engine/combat/escape-pod.ts` | resolveEscapePod() |
| 5.9 | `src/engine/combat/movement.ts` | calculateMovementPhase() |
| 5.10 | `src/engine/combat/verify-determinism.ts` | verifyAdamCombatDeterminism() |

**Verification:** Run `verifyAdamCombatDeterminism()` — must print pass. Run same 10-round fight twice — all hashes, all outcomes, all HP values must match exactly.

### Phase 6 — Progression & Save System

| Step | File | What |
|------|------|------|
| 6.1 | `src/engine/progression/skill-tree.ts` | SKILL_TREE, getSkillLevel(), getUnlockedShips() |
| 6.2 | `src/engine/progression/xp-rewards.ts` | XP for mining/combat/trading events |
| 6.3 | `src/engine/save/save-format.ts` | SaveData type, createDefaultSave() |
| 6.4 | `src/engine/save/save-manager.ts` | loadSave(), saveSave(), exportSave(), importSave() |
| 6.5 | `src/engine/save/mutation-tracker.ts` | depleteAsteroid(), clearSite(), salvageWreck() |

### Phase 7 — Three.js Rendering

| Step | File | What |
|------|------|------|
| 7.1 | `src/renderer/scene-manager.ts` | Scene, PerspectiveCamera, WebGLRenderer, lights |
| 7.2 | `src/renderer/space-scene-renderer.ts` | InstancedMesh ships (OctahedronGeometry) |
| 7.3 | `src/renderer/asteroid-renderer.ts` | Instanced asteroid field (IcosahedronGeometry) |
| 7.4 | `src/renderer/floating-text-pool.ts` | Damage numbers (V3 port, Math.random fixed) |
| 7.5 | `src/renderer/skybox.ts` | Starfield particle background |
| 7.6 | `src/renderer/effects/*.ts` | Warp, weapons, explosions, shield flash |
| 7.7 | `src/renderer/performance-monitor.ts` | FPS, draw calls, memory |

### Phase 8 — Zustand State Management

| Step | File | What |
|------|------|------|
| 8.1 | `src/state/game-store.ts` | Player state, current system, game mode (docked/space/combat/warping) |
| 8.2 | `src/state/combat-store.ts` | Active fleets, round counter, attack results |
| 8.3 | `src/state/ui-store.ts` | Selected target, panel states, modal stack |
| 8.4 | `src/state/save-store.ts` | Wraps save-manager, auto-save on mutation |

### Phase 9 — Game Systems (Tick-Driven)

| Step | File | What |
|------|------|------|
| 9.1 | `src/systems/game-loop.ts` | setInterval(simTick, 250) + requestAnimationFrame(renderTick) |
| 9.2 | `src/systems/navigation-system.ts` | Warp, approach, orbit command execution |
| 9.3 | `src/systems/combat-system.ts` | Combat round orchestration, wolf-pack eval |
| 9.4 | `src/systems/mining-system.ts` | Mining laser cycling, ore extraction, depletion |
| 9.5 | `src/systems/ai-system.ts` | NPC patrol routes, aggression checks, wolf-pack AI |

### Phase 10 — React HUD

| Step | File | What |
|------|------|------|
| 10.1 | `src/App.tsx` | Mount Three.js canvas + HUD overlay |
| 10.2 | `src/ui/HUD.tsx` | Layout grid for all HUD elements |
| 10.3 | `src/ui/OverviewPanel.tsx` | Sorted object list, distance, type icons |
| 10.4 | `src/ui/ActionMenu.tsx` | Approach/Orbit/Warp/Dock/Lock/Mine buttons |
| 10.5 | `src/ui/TelemetryBar.tsx` | Shield/Armor/Hull/Cap horizontal bars |
| 10.6 | `src/ui/ModuleBar.tsx` | F1/F2/F3 slots with cooldown indicators |
| 10.7 | `src/ui/PoliticalPulse.tsx` | PACT/SHIFTING/COLLAPSE indicator |
| 10.8 | `src/ui/StationUI/*.tsx` | Market, Refinery, Skills, Ship fitting, Diplomacy tabs |
| 10.9 | `src/ui/MapView.tsx` | 2D cluster star map with zone coloring |
| 10.10 | `src/ui/CircuitLog.tsx` | Discovered trade circuits list |
| 10.11 | `src/ui/DeathScreen.tsx` | Escape pod destination + cargo loss notification |

### Phase 11 — Integration & Polish

| Step | What |
|------|------|
| 11.1 | Wire all systems together in App.tsx |
| 11.2 | Run `verifyAdamCombatDeterminism()` — must pass |
| 11.3 | Grep entire `src/` for `Math.random()` — zero results in game logic |
| 11.4 | Test: generate same system from two browser tabs — verify identical |
| 11.5 | Test: save game, reload, verify universe is identical |
| 11.6 | Test: deplete asteroid, save, reload, verify it stays depleted |
| 11.7 | Performance: 60 FPS with 200 ships in combat scene |
| 11.8 | Performance: < 2ms for trade circuit discovery (N=24) |

---

## Anti-Patterns — NEVER Use

```typescript
// ❌ FORBIDDEN — Destroys determinism
Math.random();
Date.now();              // except in FloatingTextPool cosmetic VFX
performance.now() % 1;   // as a random source
crypto.getRandomValues(); // anywhere in game logic

// ❌ FORBIDDEN — Order-dependent generation
for (let i = 0; i < target; i++) state = next(state);

// ❌ FORBIDDEN — Platform-dependent hash
hash(string);            // Python/JS built-in hash is session-randomized

// ❌ FORBIDDEN — Unbounded N in triadic loops
for (const a of allPirates)        // N could be 500 → N³ = 125M
  for (const b of allPirates)
    for (const c of allPirates)
      evaluateWolfpack(a, b, c);

// ❌ FORBIDDEN — Reducing triadic to pairwise average
const badCoalition = (pairAB + pairBC + pairAC) / 3; // Destroys emergent info

// ❌ FORBIDDEN — Proximity guard on only one pair
if (dist(a, b) > max) return 0; // Must check ALL pairs in triple

// ✅ ALWAYS USE
const h = positionHash(x, y, z, WORLD_SEED);
const value = hashToFloat(h);
const sub = subHash(h, propertyIndex);
```

---

## Seed Hierarchy — Complete Map

```
WORLD_SEED (0xADAM0FF1)
│
├─ Layer 1: ZeroBytes O(1) — "What IS this entity?"
│   ├─ positionHash(sx, sy, 0, WORLD_SEED) → Star System
│   │   ├─ subHash(sysSeed, 0) → starMass
│   │   ├─ subHash(sysSeed, 1) → numBelts
│   │   ├─ subHash(sysSeed, 2) → numPlanets
│   │   └─ subHash(sysSeed, 3) → numJumpGates
│   ├─ positionHash(beltIdx, 0, 0, sysSeed) → Belt Seed
│   │   └─ positionHash(ax, ay, az, beltSeed) → Asteroid Seed
│   │       ├─ subHash(astSeed, 0) → oreType
│   │       ├─ subHash(astSeed, 1) → volume
│   │       └─ subHash(astSeed, 99) → pirateSeed (if pirates present)
│   ├─ positionHash(sx, sy, orbitIdx, sysSeed) → Planet Seed
│   └─ positionHash(x, y, z, WORLD_SEED) → Ship Seed
│       ├─ subHash(shipSeed, 1–6) → stat variances
│       └─ subHash(shipSeed, 0xE5CA9E) → escape pod destination
│
├─ Layer 2: Zero-Quadratic O(N²) — "What is the RELATIONSHIP between two?"
│   ├─ pairHash(zoneA, zoneB, WORLD_SEED + 1..3) → zone border tension
│   ├─ pairHash(factionA, factionB, WORLD_SEED + 10..13) → faction tension
│   ├─ asymmetricPairHash(stationA, stationB, WORLD_SEED + 30) → trade viability
│   ├─ pairHash(beltA, beltB, WORLD_SEED + 700) → belt complementarity
│   ├─ pairHash(npcA, npcB, locationSeed) → NPC relationship
│   └─ hierarchicalPairSeed(zonePair → factionPair → npcPair) → inheritance chain
│
└─ Layer 3: Zero-Cubic O(N³) — "What EMERGES when three meet?"
    ├─ tripleHash(zoneA, zoneB, zoneC, WORLD_SEED) → coalition stability
    ├─ tripleHash(portA, portB, portC, WORLD_SEED + 200) → trade circuit bonus
    ├─ tripleHash(pirateA, pirateB, pirateC, encounterSeed) → wolf-pack cohesion
    ├─ tripleHash(beltA, beltB, beltC, WORLD_SEED + 600) → contested field
    ├─ tripleHash(reagentA, reagentB, reagentC, WORLD_SEED + 700) → compound reaction
    └─ tripleHash(sysA, sysB, sysC, WORLD_SEED + 800) → resonance anomaly
```

---

## Style Guide

### Visual Theme
- **Color palette:** Deep navy backgrounds (#0a0e1a), cyan accents (#00d4ff), amber warnings (#ffaa00), red damage (#ff4444), green shields (#44ff88)
- **Font:** Monospace for all HUD elements (JetBrains Mono or similar)
- **Panels:** Semi-transparent dark backgrounds with 1px cyan borders, rounded corners
- **Bars:** Shield = cyan, Armor = amber, Hull = red, Capacitor = white

### HUD Layout
```
┌─────────────────────────────────────────────────────┐
│ [Political Pulse]          [Action Menu ▼]          │
│                                                     │
│                                                     │
│                    3D SPACE VIEW                     │ [Overview]
│                   (Three.js Canvas)                  │ [Panel   ]
│                                                     │ [sorted  ]
│                                                     │ [by dist ]
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ ████ Shield  ████ Armor  ██ Hull  ████ Cap  │    │
│  │ [F1 Laser] [F2 Missile] [F3 Scanner]        │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Station UI
Full-screen overlay when docked. Tab bar across top: Market | Refinery | Skills | Ship | Diplomacy. Each tab is a React component with its own state slice.

---

## Testing Scenarios

### Determinism Tests (Critical — Must All Pass)
1. Generate star system (5, 3) in two separate browser tabs → assert all fields match
2. Run 10-round combat fight twice → all attack hashes, damage values, HP states identical
3. Generate asteroid belt, then generate it again in reverse order → identical asteroids
4. Query `factionTension(0, 1)` and `factionTension(1, 0)` → identical (symmetric)
5. Query `tradeViability(A→B)` and `tradeViability(B→A)` → different (asymmetric by design)
6. All 6 permutations of `tripleHash(A, B, C)` → identical hash value
7. Save game, reload, regenerate current system → universe matches exactly
8. Grep `src/` for `Math.random()` → zero matches in any file except floating-text-pool.ts cosmetic section

### Gameplay Tests
9. Mine asteroid to depletion → depleted flag persists across save/load
10. Die in DEADZONE → escape pod warps to nearest HAVEN, receive Rookie Frigate, cargo lost
11. Wolf-pack of 3 pirates within 15km → correctly classified as COORDINATED/FERAL/BETRAYAL
12. Three-reagent crafting → symmetric (order doesn't matter), ~40% yield a product
13. Trade circuit discovery → N capped at 24 stations, results sorted by viability
14. Anomaly scan → N capped at 20 systems, only proximate triples evaluated

### Performance Tests
15. 200 ships in combat scene → 60 FPS on mid-range hardware
16. Trade circuit discovery with N=24 → < 2ms
17. Full system generation (system + belts + asteroids + pirates) → < 5ms
18. Coalition stability query → < 0.1ms (only 1 triple, 3 fixed zones)

---

## Accessibility Requirements

- All HUD text minimum 14px
- High contrast between text and panel backgrounds (WCAG AA)
- Keyboard navigation for all menus (Tab, Enter, Escape)
- Module activation via F-keys (not mouse-only)
- Color-blind safe: use shape/pattern indicators alongside color for shield/armor/hull
- Screen reader labels on all interactive elements

---

## Performance Goals

| Metric | Target |
|--------|--------|
| Frame rate | 60 FPS with 200 ships |
| System generation | < 5ms |
| Combat round resolution | < 1ms for 50 ships |
| Trade circuit discovery (N=24) | < 2ms |
| Anomaly scan (N=20) | < 1ms |
| Save file size | < 10KB typical |
| Initial load | < 3 seconds |
| Bundle size | < 2MB gzipped |

---

## Extended Features (Post-MVP)

These are NOT required for the initial build but are architecturally supported:

1. **Multiplayer** — The deterministic foundation means two clients with the same WORLD_SEED see the same universe. Only player-mutation diffs need syncing.
2. **Replay System** — Record only player inputs + timestamps. Replay deterministically produces identical combat outcomes.
3. **Modding** — Custom WORLD_SEED + ore/ship/faction tables = total conversion mods with zero code changes.
4. **Ancient ADAM Relay Endgame** — Gate restoration quest chain triggered by finding relay anomalies and crafting Gate Key Components from three Morphite reactions.
5. **Anomaly Scanner Module** — F3 unlock via Navigation skill, reveals resonance anomalies.

---

## Reference Mapping

This unified plan draws from these source artifacts (all consumed, none need separate implementation):

| Source | What It Contributed | Where It Lives in This Plan |
|--------|--------------------|-----------------------------|
| `adam-offline-zero.md` | Game design, controls, zones, progression | Functionality section, data tables |
| `adam-offline-zerobytes-report.md` | O(1) entity generation for all world objects | Phase 2, Layer 1 engine files |
| `adam-offline-zeroquadratic-report.md` | O(N²) pairwise faction/trade/NPC relations | Phase 3, Layer 2 engine files |
| `adam-offline-zerocubic-report.md` | O(N³) coalition/circuit/wolfpack/crafting/anomaly | Phase 4, Layer 3 engine files |
| `adam-offline-ZB3Dcombat-report.md` | Combat integration, ship types, weapon types, skills | Phase 5, combat engine files |
| `ZB-3DCombatLayerV3.jsx` | Hash engine, SpatialGrid, InstancedRenderer, FloatingText | Phase 1 (hash-core), Phase 7 (renderer) |

**No source artifact needs to be consulted separately.** This TINS plan contains everything needed to build ADAM OFFLINE ZB from scratch.

---

*The universe springs complete from coordinates. Zero bytes store infinity.*

*TINS — There Is No Source. This document IS the source.*
