# Explosion Engine Integration Guide

## React Three.js Destruction System - Integration Documentation

This document provides comprehensive guidance for integrating the `ExplosionEngine` component into an existing React Three.js application, particularly those building Starfox 64 style rail shooters or similar arcade games.

---

## Table of Contents

1. [Prerequisites Assessment](#prerequisites-assessment)
2. [Dependency Requirements](#dependency-requirements)
3. [Integration Approaches](#integration-approaches)
4. [Step-by-Step Integration](#step-by-step-integration)
5. [Configuration & Customization](#configuration--customization)
6. [Enemy Death Integration](#enemy-death-integration)
7. [Boss Destruction Patterns](#boss-destruction-patterns)
8. [Performance Optimization](#performance-optimization)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites Assessment

Before integrating the explosion engine, assess your target codebase for compatibility:

### Required Codebase Analysis

```bash
# Check for existing dependencies
cat package.json | grep -E "(react|three|@react-three)"

# Identify existing Canvas setup
grep -r "Canvas" src/ --include="*.jsx" --include="*.tsx"

# Check for existing game loop patterns
grep -r "useFrame" src/ --include="*.jsx" --include="*.tsx"

# Identify enemy/entity management
grep -r "enemy\|Enemy\|destroy\|Destroy" src/ --include="*.jsx" --include="*.tsx"
```

### Compatibility Checklist

| Requirement | Minimum Version | Notes |
|------------|-----------------|-------|
| React | 18.0+ | Hooks-based component |
| Three.js | 0.150+ | Uses modern Three.js APIs |
| @react-three/fiber | 8.0+ | Canvas provider required |
| Node.js | 16+ | For development tooling |

---

## Dependency Requirements

### Installation

```bash
# npm
npm install three @react-three/fiber

# yarn
yarn add three @react-three/fiber

# pnpm
pnpm add three @react-three/fiber
```

### TypeScript Support (Optional)

```bash
npm install -D @types/three
```

---

## Integration Approaches

### Approach A: Hook-Based Management (Recommended)

Use the `useExplosionManager` hook for full lifecycle control:

```jsx
import { useExplosionManager, ExplosionRenderer } from './ExplosionEngine';

function GameScene() {
  const { explosions, triggerExplosion, removeExplosion } = useExplosionManager();
  
  const handleEnemyDeath = (enemy) => {
    triggerExplosion({
      position: enemy.position,
      forwardVector: enemy.forwardVector,
      explosionClass: 'MEDIUM',
      showWreckage: true,
    });
  };
  
  return (
    <>
      <EnemyManager onEnemyDeath={handleEnemyDeath} />
      <ExplosionRenderer 
        explosions={explosions}
        onExplosionComplete={removeExplosion}
      />
    </>
  );
}
```

### Approach B: Direct Component Usage

Use the `Explosion` component directly for one-off explosions:

```jsx
import { Explosion } from './ExplosionEngine';

function DestructibleEnemy({ position, isDestroyed, forwardVector }) {
  if (!isDestroyed) {
    return <EnemyMesh position={position} />;
  }
  
  return (
    <Explosion
      position={position.toArray()}
      forwardVector={forwardVector}
      explosionClass="MEDIUM"
      showWreckage={true}
      onComplete={() => console.log('Explosion finished')}
    />
  );
}
```

### Approach C: Selective Component Usage

Import individual sub-components for custom effects:

```jsx
import { 
  ShockwaveRing, 
  FallingWreckage, 
  ExplosionFlash,
  CameraShake,
  EXPLOSION_CONFIG 
} from './ExplosionEngine';

function CustomExplosion({ position }) {
  return (
    <>
      <ExplosionFlash position={position} scale={5} duration={200} />
      <ShockwaveRing position={position} maxScale={8} duration={400} />
      <FallingWreckage 
        startPosition={position}
        forwardVector={new Vector3(0, 0, -1)}
        scale={[0.6, 0.35, 0.9]}
      />
    </>
  );
}
```

---

## Step-by-Step Integration

### Step 1: Copy Component File

```bash
# Copy to your components directory
cp ExplosionEngine.jsx src/components/effects/

# Or for TypeScript projects
cp ExplosionEngine.jsx src/components/effects/ExplosionEngine.tsx
```

### Step 2: Resolve Import Paths

Update imports based on your project structure:

```jsx
// Adjust the import path in your game files
import { 
  useExplosionManager, 
  ExplosionRenderer,
  EXPLOSION_CONFIG 
} from '../components/effects/ExplosionEngine';
```

### Step 3: Add to Your Canvas

```jsx
// src/Game.jsx
import { Canvas } from '@react-three/fiber';
import { useExplosionManager, ExplosionRenderer } from './components/effects/ExplosionEngine';

function GameContent() {
  const { explosions, triggerExplosion, removeExplosion } = useExplosionManager();
  
  // Your game logic here...
  
  return (
    <>
      {/* Your existing scene elements */}
      <ambientLight intensity={0.4} />
      <PlayerController />
      <EnemyManager onEnemyDestroyed={(enemy) => {
        triggerExplosion({
          position: enemy.position,
          forwardVector: enemy.velocity.normalize(),
          explosionClass: enemy.type === 'boss' ? 'BOSS' : 'MEDIUM',
        });
      }} />
      
      {/* Explosion renderer - add near end of scene */}
      <ExplosionRenderer 
        explosions={explosions}
        onExplosionComplete={removeExplosion}
      />
    </>
  );
}

export default function Game() {
  return (
    <Canvas camera={{ position: [0, 5, 15], fov: 75 }}>
      <fog attach="fog" args={['#000022', 50, 200]} />
      <GameContent />
    </Canvas>
  );
}
```

### Step 4: Connect to Collision System

```jsx
// src/systems/CollisionSystem.jsx
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';

export function useProjectileCollision({ 
  projectiles, 
  enemies, 
  onEnemyHit 
}) {
  useFrame(() => {
    projectiles.forEach(projectile => {
      enemies.forEach(enemy => {
        if (enemy.isDestroyed) return;
        
        const distance = projectile.position.distanceTo(enemy.position);
        if (distance < enemy.hitRadius) {
          // Deal damage
          enemy.health -= projectile.damage;
          
          // Check for destruction
          if (enemy.health <= 0) {
            onEnemyHit({
              enemy,
              hitPosition: projectile.position.clone(),
              hitDirection: projectile.velocity.clone().normalize(),
            });
          }
        }
      });
    });
  });
}
```

### Step 5: Integrate with Enemy Manager

```jsx
// src/entities/EnemyManager.jsx
import { useState, useCallback } from 'react';
import { useExplosionManager, ExplosionRenderer } from '../components/effects/ExplosionEngine';

export function EnemyManager({ enemySpawnData }) {
  const [enemies, setEnemies] = useState([]);
  const { explosions, triggerExplosion, removeExplosion } = useExplosionManager();
  
  const handleEnemyDestroyed = useCallback((enemyId, position, forwardVector, enemyClass) => {
    // Remove enemy from active list
    setEnemies(prev => prev.filter(e => e.id !== enemyId));
    
    // Determine explosion class based on enemy type
    const explosionClass = 
      enemyClass === 'boss' ? 'BOSS' :
      enemyClass === 'elite' ? 'LARGE' :
      enemyClass === 'fighter' ? 'SMALL' : 'MEDIUM';
    
    // Trigger explosion
    triggerExplosion({
      position,
      forwardVector,
      explosionClass,
      showWreckage: true,
      groundY: -5, // Adjust to your terrain height
    });
  }, [triggerExplosion]);
  
  return (
    <>
      {enemies.map(enemy => (
        <Enemy 
          key={enemy.id}
          {...enemy}
          onDestroyed={() => handleEnemyDestroyed(
            enemy.id,
            enemy.position,
            enemy.forwardVector,
            enemy.class
          )}
        />
      ))}
      
      <ExplosionRenderer 
        explosions={explosions}
        onExplosionComplete={removeExplosion}
      />
    </>
  );
}
```

---

## Configuration & Customization

### Overriding Default Configuration

Create custom explosion classes for your game:

```jsx
// src/config/explosionConfig.js
import { EXPLOSION_CONFIG } from '../components/effects/ExplosionEngine';

// Extend with custom classes
export const CUSTOM_EXPLOSION_CONFIG = {
  ...EXPLOSION_CONFIG,
  CLASSES: {
    ...EXPLOSION_CONFIG.CLASSES,
    
    // Custom mini explosion for projectiles
    PROJECTILE: {
      name: 'PROJECTILE',
      particleCount: 8,
      shockwaveScale: 1.5,
      duration: 400,
      wreckagePieces: 0,
      wreckageScale: [0.2, 0.1, 0.3],
      cameraShake: 0,
      lightIntensity: 5,
      lightDistance: 8,
    },
    
    // Custom mega boss explosion
    MEGA_BOSS: {
      name: 'MEGA_BOSS',
      particleCount: 150,
      shockwaveScale: 25,
      duration: 4000,
      wreckagePieces: 12,
      wreckageScale: [2.0, 1.2, 3.0],
      cameraShake: 1.5,
      lightIntensity: 80,
      lightDistance: 100,
      chainExplosions: true,
      chainCount: 10,
      chainDelay: 150,
    },
  },
};
```

### Modifying Wreckage Behavior

```jsx
// Customize wreckage physics
const CUSTOM_WRECKAGE_CONFIG = {
  GRAVITY: 20,              // Faster falling
  ROTATION_SPEED: { min: 4, max: 12 },  // Faster spinning
  INITIAL_VELOCITY: { min: 5, max: 12 }, // More explosive spread
  SPREAD_ANGLE: Math.PI / 4, // Wider spread
  SMOKE_EMIT_RATE: 0.02,    // More smoke
  GROUND_Y: -10,            // Different ground level
};
```

### Custom Particle Colors

```jsx
// Match your game's visual style
const CUSTOM_PARTICLE_COLORS = {
  CORE: ['#ffffff', '#e0ffff', '#80ffff'],   // Cyan-tinted core
  FIRE: ['#ff00ff', '#ff0088', '#ff0044'],   // Magenta fire
  SMOKE: ['#2a2a3a', '#1a1a2a', '#0a0a1a'],  // Purple-tinted smoke
  SPARK: ['#ffff00', '#ff8800', '#ff4400'],  // Standard sparks
};
```

---

## Enemy Death Integration

### Basic Enemy Component

```jsx
// src/entities/Enemy.jsx
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';

export function Enemy({ 
  id,
  initialPosition, 
  health: initialHealth,
  enemyClass = 'fighter',
  onDestroyed 
}) {
  const meshRef = useRef();
  const [health, setHealth] = useState(initialHealth);
  const [isDestroyed, setIsDestroyed] = useState(false);
  const forwardVector = useRef(new Vector3(0, 0, 1));
  
  const takeDamage = (amount) => {
    if (isDestroyed) return;
    
    const newHealth = health - amount;
    setHealth(newHealth);
    
    if (newHealth <= 0) {
      setIsDestroyed(true);
      onDestroyed({
        id,
        position: meshRef.current.position.clone(),
        forwardVector: forwardVector.current.clone(),
        enemyClass,
      });
    }
  };
  
  useFrame((state, delta) => {
    if (isDestroyed || !meshRef.current) return;
    
    // Update forward vector based on movement
    // ... your movement logic
  });
  
  if (isDestroyed) return null;
  
  return (
    <mesh ref={meshRef} position={initialPosition}>
      <boxGeometry args={[2, 1, 3]} />
      <meshStandardMaterial color="#ff4444" />
    </mesh>
  );
}
```

### Enemy Type Mapping

```jsx
// src/config/enemyExplosionMap.js
export const ENEMY_EXPLOSION_MAP = {
  // Basic enemies
  'fighter': 'SMALL',
  'scout': 'SMALL',
  'drone': 'SMALL',
  
  // Standard enemies
  'bomber': 'MEDIUM',
  'cruiser': 'MEDIUM',
  'turret': 'MEDIUM',
  
  // Elite enemies
  'elite_fighter': 'LARGE',
  'destroyer': 'LARGE',
  'mini_boss': 'LARGE',
  
  // Bosses
  'boss': 'BOSS',
  'final_boss': 'BOSS',
};

export function getExplosionClass(enemyType) {
  return ENEMY_EXPLOSION_MAP[enemyType] || 'MEDIUM';
}
```

---

## Boss Destruction Patterns

### Multi-Phase Boss Death

```jsx
// src/entities/Boss.jsx
import { useState, useCallback } from 'react';
import { Vector3 } from 'three';

export function Boss({ position, onFullyDestroyed }) {
  const [phase, setPhase] = useState('alive');
  const [parts, setParts] = useState([
    { id: 'left_wing', health: 100, position: new Vector3(-5, 0, 0) },
    { id: 'right_wing', health: 100, position: new Vector3(5, 0, 0) },
    { id: 'core', health: 200, position: new Vector3(0, 0, 0) },
  ]);
  
  const { triggerExplosion } = useExplosionManager();
  
  const handlePartDestroyed = useCallback((partId) => {
    setParts(prev => prev.filter(p => p.id !== partId));
    
    const part = parts.find(p => p.id === partId);
    if (!part) return;
    
    // Trigger part explosion
    triggerExplosion({
      position: part.position.clone().add(position),
      forwardVector: new Vector3(0, 0, 1),
      explosionClass: partId === 'core' ? 'BOSS' : 'LARGE',
      showWreckage: true,
    });
    
    // Check if boss is fully destroyed
    if (partId === 'core') {
      setPhase('dying');
      
      // Trigger chain of final explosions
      const finalExplosionSequence = async () => {
        for (let i = 0; i < 5; i++) {
          await new Promise(resolve => setTimeout(resolve, 300));
          triggerExplosion({
            position: position.clone().add(new Vector3(
              (Math.random() - 0.5) * 10,
              (Math.random() - 0.5) * 5,
              (Math.random() - 0.5) * 10
            )),
            explosionClass: 'MEDIUM',
            showWreckage: false,
          });
        }
        
        // Final massive explosion
        await new Promise(resolve => setTimeout(resolve, 500));
        triggerExplosion({
          position: position.clone(),
          forwardVector: new Vector3(0, 0, 1),
          explosionClass: 'BOSS',
          showWreckage: true,
        });
        
        onFullyDestroyed();
      };
      
      finalExplosionSequence();
    }
  }, [parts, position, triggerExplosion, onFullyDestroyed]);
  
  // ... render boss parts
}
```

### Segmented Boss Destruction

```jsx
// For bosses that break apart progressively
function SegmentedBoss({ segments, onSegmentDestroyed }) {
  const { triggerExplosion } = useExplosionManager();
  
  const destroySegment = (segment) => {
    // Explosion at segment location
    triggerExplosion({
      position: segment.worldPosition,
      forwardVector: segment.normal,
      explosionClass: segment.isWeakPoint ? 'LARGE' : 'MEDIUM',
      showWreckage: true,
    });
    
    onSegmentDestroyed(segment.id);
  };
  
  // ... segment rendering
}
```

---

## Performance Optimization

### Object Pooling

```jsx
// src/systems/ExplosionPool.jsx
import { useMemo, useCallback, useRef } from 'react';

export function useExplosionPool(maxExplosions = 20) {
  const poolRef = useRef([]);
  
  // Pre-allocate explosion slots
  useMemo(() => {
    for (let i = 0; i < maxExplosions; i++) {
      poolRef.current.push({
        id: i,
        active: false,
        position: null,
        config: null,
      });
    }
  }, [maxExplosions]);
  
  const acquireExplosion = useCallback((config) => {
    const slot = poolRef.current.find(s => !s.active);
    if (!slot) {
      console.warn('Explosion pool exhausted');
      return null;
    }
    
    slot.active = true;
    slot.position = config.position;
    slot.config = config;
    return slot.id;
  }, []);
  
  const releaseExplosion = useCallback((id) => {
    const slot = poolRef.current.find(s => s.id === id);
    if (slot) {
      slot.active = false;
      slot.position = null;
      slot.config = null;
    }
  }, []);
  
  const activeExplosions = useMemo(() => 
    poolRef.current.filter(s => s.active),
    [poolRef.current]
  );
  
  return { acquireExplosion, releaseExplosion, activeExplosions };
}
```

### Particle Count Scaling

```jsx
// Reduce particles based on active explosion count
function getScaledParticleCount(baseCount, activeExplosions) {
  if (activeExplosions < 3) return baseCount;
  if (activeExplosions < 6) return Math.floor(baseCount * 0.7);
  if (activeExplosions < 10) return Math.floor(baseCount * 0.5);
  return Math.floor(baseCount * 0.3);
}
```

### LOD for Distant Explosions

```jsx
// Simplified explosion for distant views
function getExplosionLOD(distanceToCamera) {
  if (distanceToCamera < 30) return 'HIGH';
  if (distanceToCamera < 60) return 'MEDIUM';
  return 'LOW';
}

const LOD_PARTICLE_MULTIPLIER = {
  HIGH: 1.0,
  MEDIUM: 0.5,
  LOW: 0.2,
};
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Explosions not visible | Position outside camera view | Check explosion position coordinates |
| Wreckage falls through floor | Ground Y mismatch | Adjust `groundY` parameter to match terrain |
| Performance drops | Too many particles | Reduce `particleCount` in config or implement pooling |
| Explosions look flat | Missing lighting | Ensure scene has ambient and directional lights |
| Shockwave not visible | Camera angle | Shockwave is horizontal; adjust camera or add vertical ring |
| Secondary explosions missing | Option disabled | Check `showWreckage` is `true` |

### Debug Visualization

```jsx
function ExplosionDebug({ explosions }) {
  return (
    <Html fullscreen>
      <div style={{
        position: 'fixed',
        top: 10,
        left: 10,
        background: 'rgba(0,0,0,0.8)',
        color: '#0f0',
        padding: 10,
        fontFamily: 'monospace',
        fontSize: 11,
      }}>
        <div>Active Explosions: {explosions.length}</div>
        {explosions.map(exp => (
          <div key={exp.id}>
            #{exp.id}: {exp.explosionClass} @ 
            [{exp.position.x.toFixed(1)}, {exp.position.y.toFixed(1)}, {exp.position.z.toFixed(1)}]
          </div>
        ))}
      </div>
    </Html>
  );
}
```

### Performance Monitoring

```jsx
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

function PerformanceMonitor({ explosionEngine }) {
  const frameTimesRef = useRef([]);
  
  useFrame((state, delta) => {
    frameTimesRef.current.push(delta);
    if (frameTimesRef.current.length > 60) {
      frameTimesRef.current.shift();
    }
    
    const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
    const fps = 1 / avgFrameTime;
    
    if (fps < 30) {
      console.warn(`Low FPS (${fps.toFixed(1)}) with ${explosionEngine.stats.particleCount} particles`);
    }
  });
  
  return null;
}
```

---

## Quick Reference

### Exported Components

| Export | Type | Description |
|--------|------|-------------|
| `default` | Component | Complete standalone demo |
| `Explosion` | Component | Single explosion with all effects |
| `ExplosionRenderer` | Component | Renders managed explosion array |
| `FallingWreckage` | Component | Single debris piece with smoke |
| `ShockwaveRing` | Component | Expanding ring effect |
| `ExplosionFlash` | Component | Initial bright burst |
| `ExplosionParticle` | Component | Single particle |
| `SmokeParticle` | Component | Smoke trail particle |
| `CameraShake` | Component | Screen shake controller |
| `useExplosionManager` | Hook | Explosion lifecycle management |
| `EXPLOSION_CONFIG` | Object | All configuration constants |

### Explosion Class Quick Reference

| Class | Particles | Shockwave | Wreckage | Duration | Use Case |
|-------|-----------|-----------|----------|----------|----------|
| SMALL | 15 | 3x | 1 piece | 800ms | Fighters, projectiles |
| MEDIUM | 30 | 5x | 2 pieces | 1000ms | Standard enemies |
| LARGE | 50 | 8x | 4 pieces | 1400ms | Elite enemies |
| BOSS | 100 | 15x | 8 pieces | 2500ms | Boss defeats |

### Hook API

```typescript
interface UseExplosionManagerReturn {
  explosions: Explosion[];
  triggerExplosion: (config: ExplosionConfig) => number;
  removeExplosion: (id: number) => void;
  clearAllExplosions: () => void;
}

interface ExplosionConfig {
  position: Vector3 | [number, number, number];
  forwardVector?: Vector3 | [number, number, number];
  explosionClass?: 'SMALL' | 'MEDIUM' | 'LARGE' | 'BOSS';
  showWreckage?: boolean;
  groundY?: number;
}
```

---

## Support & Resources

- **Three.js Documentation**: https://threejs.org/docs/
- **React Three Fiber**: https://docs.pmnd.rs/react-three-fiber/
- **Project Repository**: https://github.com/MushroomFleet/ExplosionEngine-JSX

---

*This integration guide covers common scenarios. For specific use cases or advanced customization, examine the source component directly and modify as needed.*
