/**
 * ZB-3DCombatLayerV3.jsx
 * Zerobytes Position-as-Seed 3D Combat Resolution System for Three.js
 * 
 * VERSION 3.0 - MASSIVE SCALE EDITION
 * 
 * V3 Enhancements over V2:
 * 1. Instanced Rendering - Single draw call for thousands of units
 * 2. Spatial Partitioning - Grid-based O(1) neighbor lookup
 * 3. Typed Arrays - Float32Array for positions, colors
 * 4. Object Pooling - Reusable floating text sprites
 * 5. Batched Matrix Updates - Efficient instance transforms
 * 6. Throttled Rendering - Separate simulation and render ticks
 * 7. LOD System - Simplified rendering for distant/dense areas
 * 
 * Preserves all ZeroBytes Laws:
 * 1. O(1) Access - Direct position lookup
 * 2. Parallelism - Independent unit generation
 * 3. Coherence - Smooth terrain/morale via 3D noise
 * 4. Hierarchy - Battle → Sector → Unit → Attack seeding
 * 5. Determinism - simPos isolation + batched damage
 * 
 * @version 3.0.0
 * @license MIT
 * @author Drift Johnson
 * @repository https://github.com/MushroomFleet/ZB-3DCombatLayer
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as THREE from 'three';

// ============================================================================
// CORE ZEROBYTES HASHING ENGINE (Unchanged from V2)
// ============================================================================

const xxHash32 = (input, seed = 0) => {
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

const quantize = (value, precision = 1000) => Math.round(value * precision);
const hashToFloat = (hash) => (hash & 0xFFFFFFFF) / 0x100000000;
const hashToRange = (hash, min, max) => min + hashToFloat(hash) * (max - min);
const hashToInt = (hash, min, max) => Math.floor(hashToRange(hash, min, max + 1));

export const positionHash = (x, y, z, salt = 0) => {
  const input = [quantize(x), quantize(y), quantize(z)];
  return xxHash32(input, salt);
};

const subHash = (baseHash, index) => xxHash32([baseHash, index], baseHash);

// ============================================================================
// COHERENT NOISE (Unchanged from V2)
// ============================================================================

const smoothstep = (t) => t * t * (3 - 2 * t);

export const coherentValue3D = (x, y, z, seed, octaves = 4, frequency = 0.02) => {
  let value = 0;
  let amplitude = 1;
  let freq = frequency;
  let maxAmplitude = 0;
  
  for (let o = 0; o < octaves; o++) {
    const fx = x * freq;
    const fy = y * freq;
    const fz = z * freq;
    
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const z0 = Math.floor(fz);
    
    const sx = smoothstep(fx - x0);
    const sy = smoothstep(fy - y0);
    const sz = smoothstep(fz - z0);
    
    const n000 = hashToFloat(positionHash(x0, y0, z0, seed + o)) * 2 - 1;
    const n100 = hashToFloat(positionHash(x0 + 1, y0, z0, seed + o)) * 2 - 1;
    const n010 = hashToFloat(positionHash(x0, y0 + 1, z0, seed + o)) * 2 - 1;
    const n110 = hashToFloat(positionHash(x0 + 1, y0 + 1, z0, seed + o)) * 2 - 1;
    const n001 = hashToFloat(positionHash(x0, y0, z0 + 1, seed + o)) * 2 - 1;
    const n101 = hashToFloat(positionHash(x0 + 1, y0, z0 + 1, seed + o)) * 2 - 1;
    const n011 = hashToFloat(positionHash(x0, y0 + 1, z0 + 1, seed + o)) * 2 - 1;
    const n111 = hashToFloat(positionHash(x0 + 1, y0 + 1, z0 + 1, seed + o)) * 2 - 1;
    
    const nx00 = n000 * (1 - sx) + n100 * sx;
    const nx10 = n010 * (1 - sx) + n110 * sx;
    const nx01 = n001 * (1 - sx) + n101 * sx;
    const nx11 = n011 * (1 - sx) + n111 * sx;
    
    const nxy0 = nx00 * (1 - sy) + nx10 * sy;
    const nxy1 = nx01 * (1 - sy) + nx11 * sy;
    
    const nxyz = nxy0 * (1 - sz) + nxy1 * sz;
    
    value += amplitude * nxyz;
    maxAmplitude += amplitude;
    amplitude *= 0.5;
    freq *= 2;
  }
  
  return value / maxAmplitude;
};

export const getTerrainHeight = (x, z, seed) => {
  return coherentValue3D(x, 0, z, seed, 4, 0.04) * 4 + 0.5;
};

// ============================================================================
// V3: SPATIAL GRID FOR O(1) NEIGHBOR LOOKUP
// ============================================================================

export class SpatialGrid {
  constructor(cellSize = 5) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }
  
  _cellKey(x, z) {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    return `${cx},${cz}`;
  }
  
  clear() {
    this.cells.clear();
  }
  
  insert(unit) {
    const key = this._cellKey(unit.simPos.x, unit.simPos.z);
    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }
    this.cells.get(key).push(unit);
  }
  
  insertAll(units) {
    this.clear();
    units.forEach(u => {
      if (u.alive) this.insert(u);
    });
  }
  
  getNearby(x, z, radius = 1) {
    const results = [];
    const cellRadius = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dz = -cellRadius; dz <= cellRadius; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        if (this.cells.has(key)) {
          results.push(...this.cells.get(key));
        }
      }
    }
    
    return results;
  }
  
  findClosestEnemy(unit, enemyGrid, maxRange = 30) {
    const nearby = enemyGrid.getNearby(unit.simPos.x, unit.simPos.z, maxRange);
    
    let closest = null;
    let closestDist = Infinity;
    
    for (const enemy of nearby) {
      if (!enemy.alive) continue;
      const dist = Math.sqrt(
        Math.pow(unit.simPos.x - enemy.simPos.x, 2) +
        Math.pow(unit.simPos.y - enemy.simPos.y, 2) +
        Math.pow(unit.simPos.z - enemy.simPos.z, 2)
      );
      if (dist < closestDist) {
        closestDist = dist;
        closest = enemy;
      }
    }
    
    return { closest, distance: closestDist };
  }
}

// ============================================================================
// V3: UNIT TYPES WITH INSTANCING DATA
// ============================================================================

export const UNIT_TYPES = {
  INFANTRY: {
    id: 1,
    name: 'Infantry',
    baseStats: { attack: 10, defense: 8, precision: 0.55, evasion: 0.15, critChance: 0.08 },
    color: new THREE.Color(0x4a90d9),
    scale: 1.0
  },
  CAVALRY: {
    id: 2,
    name: 'Cavalry',
    baseStats: { attack: 14, defense: 6, precision: 0.45, evasion: 0.25, critChance: 0.12 },
    color: new THREE.Color(0xd9a84a),
    scale: 1.3
  },
  ARCHER: {
    id: 3,
    name: 'Archer',
    baseStats: { attack: 8, defense: 4, precision: 0.7, evasion: 0.1, critChance: 0.15 },
    color: new THREE.Color(0x4ad98a),
    scale: 0.9
  },
  MAGE: {
    id: 4,
    name: 'Mage',
    baseStats: { attack: 16, defense: 3, precision: 0.6, evasion: 0.08, critChance: 0.2 },
    color: new THREE.Color(0x9b4ad9),
    scale: 1.0
  },
  HEAVY: {
    id: 5,
    name: 'Heavy Infantry',
    baseStats: { attack: 12, defense: 15, precision: 0.4, evasion: 0.05, critChance: 0.05 },
    color: new THREE.Color(0x808080),
    scale: 1.4
  }
};

const UNIT_TYPES_ARRAY = Object.values(UNIT_TYPES);

// ============================================================================
// V3: OPTIMIZED UNIT GENERATION WITH INDEX
// ============================================================================

export const generateUnit = (x, y, z, worldSeed, faction = 0, index = 0) => {
  const unitSeed = positionHash(x, y, z, worldSeed);
  
  const typeHash = subHash(unitSeed, 0);
  const unitType = UNIT_TYPES_ARRAY[typeHash % UNIT_TYPES_ARRAY.length];
  
  const statVariance = (i) => 0.8 + hashToFloat(subHash(unitSeed, i)) * 0.4;
  
  const stats = {
    attack: Math.round(unitType.baseStats.attack * statVariance(1)),
    defense: Math.round(unitType.baseStats.defense * statVariance(2)),
    precision: Math.round(unitType.baseStats.precision * statVariance(3) * 100) / 100,
    evasion: Math.round(unitType.baseStats.evasion * statVariance(4) * 100) / 100,
    critChance: Math.round(unitType.baseStats.critChance * statVariance(5) * 100) / 100,
    critMultiplier: 1.5 + hashToFloat(subHash(unitSeed, 6)) * 1.0
  };
  
  const maxHp = 50 + stats.defense * 5;
  
  return {
    id: `unit_${unitSeed.toString(16)}`,
    index, // V3: Track index for instanced mesh updates
    seed: unitSeed,
    type: unitType,
    simPos: { x, y, z },
    renderPos: { x, y, z },
    stats,
    hp: { current: maxHp, max: maxHp },
    faction,
    alive: true,
    // V3: Pre-computed color with faction tint
    baseColor: unitType.color.clone(),
    currentColor: unitType.color.clone()
  };
};

/**
 * V3: Generate army with dynamic sizing
 * Calculates optimal grid formation from unit count
 */
export const generateArmy = (centerX, centerZ, unitCount, spacing, worldSeed, faction = 0, startIndex = 0) => {
  const units = [];
  const armySeed = positionHash(centerX, 0, centerZ, worldSeed + faction * 1000);
  
  // Calculate grid dimensions for formation
  const cols = Math.ceil(Math.sqrt(unitCount * 1.5)); // Wider than deep
  const rows = Math.ceil(unitCount / cols);
  
  let index = startIndex;
  let created = 0;
  
  for (let row = 0; row < rows && created < unitCount; row++) {
    const rowSeed = subHash(armySeed, row);
    for (let col = 0; col < cols && created < unitCount; col++) {
      const baseX = centerX + (col - cols / 2) * spacing;
      const baseZ = centerZ + (row - rows / 2) * spacing;
      
      const jitterX = hashToRange(subHash(rowSeed, col * 2), -spacing * 0.2, spacing * 0.2);
      const jitterZ = hashToRange(subHash(rowSeed, col * 2 + 1), -spacing * 0.2, spacing * 0.2);
      
      const x = baseX + jitterX;
      const z = baseZ + jitterZ;
      const y = getTerrainHeight(x, z, worldSeed);
      
      units.push(generateUnit(x, y, z, worldSeed, faction, index));
      index++;
      created++;
    }
  }
  
  return units;
};

// ============================================================================
// V3: INSTANCED MESH MANAGER
// ============================================================================

export class InstancedArmyRenderer {
  constructor(scene, maxUnits = 2000) {
    this.scene = scene;
    this.maxUnits = maxUnits;
    
    // Shared geometry for all units (cone)
    this.geometry = new THREE.ConeGeometry(0.4, 1.2, 6);
    
    // Material with vertex colors for per-instance coloring
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: false,
      roughness: 0.5,
      metalness: 0.3
    });
    
    // Create instanced mesh
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, maxUnits);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false; // We manage visibility ourselves
    
    // Instance attributes
    this.instanceColors = new Float32Array(maxUnits * 3);
    this.colorAttribute = new THREE.InstancedBufferAttribute(this.instanceColors, 3);
    this.geometry.setAttribute('instanceColor', this.colorAttribute);
    
    // Update material to use instance colors
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         attribute vec3 instanceColor;
         varying vec3 vInstanceColor;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vInstanceColor = instanceColor;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vInstanceColor;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         diffuseColor.rgb *= vInstanceColor;`
      );
    };
    
    // Temp objects for matrix calculations
    this._matrix = new THREE.Matrix4();
    this._position = new THREE.Vector3();
    this._quaternion = new THREE.Quaternion();
    this._scale = new THREE.Vector3();
    this._euler = new THREE.Euler();
    
    scene.add(this.mesh);
  }
  
  updateUnit(unit, index) {
    if (index >= this.maxUnits) return;
    
    const scale = unit.type.scale;
    
    // Position from renderPos (visual)
    this._position.set(
      unit.renderPos.x,
      unit.renderPos.y + 0.6 * scale,
      unit.renderPos.z
    );
    
    // Rotation: upright if alive, fallen if dead
    if (unit.alive) {
      this._euler.set(0, 0, 0);
    } else {
      this._euler.set(Math.PI / 2, 0, 0);
    }
    this._quaternion.setFromEuler(this._euler);
    
    // Scale based on unit type
    this._scale.set(scale, scale, scale);
    
    // Compose matrix
    this._matrix.compose(this._position, this._quaternion, this._scale);
    this.mesh.setMatrixAt(index, this._matrix);
    
    // Color based on HP and faction
    const hpRatio = unit.hp.current / unit.hp.max;
    const color = unit.baseColor.clone();
    
    if (!unit.alive) {
      color.multiplyScalar(0.25);
    } else if (hpRatio < 0.5) {
      color.lerp(new THREE.Color(0xff0000), (0.5 - hpRatio) * 1.5);
    }
    
    // Add faction emissive tint
    const factionTint = unit.faction === 0 ? 0.15 : 0.1;
    if (unit.alive) {
      if (unit.faction === 0) {
        color.r *= 0.85;
        color.b *= 1.15;
      } else {
        color.r *= 1.15;
        color.b *= 0.85;
      }
    }
    
    this.instanceColors[index * 3] = color.r;
    this.instanceColors[index * 3 + 1] = color.g;
    this.instanceColors[index * 3 + 2] = color.b;
  }
  
  updateAll(blueArmy, redArmy) {
    const allUnits = [...blueArmy, ...redArmy];
    
    for (let i = 0; i < allUnits.length; i++) {
      this.updateUnit(allUnits[i], i);
    }
    
    // Hide unused instances
    for (let i = allUnits.length; i < this.maxUnits; i++) {
      this._matrix.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(i, this._matrix);
    }
    
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
    this.mesh.count = allUnits.length;
  }
  
  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ============================================================================
// V3: FLOATING TEXT POOL FOR DAMAGE INDICATORS
// ============================================================================

export class FloatingTextPool {
  constructor(scene, maxTexts = 200) {
    this.scene = scene;
    this.maxTexts = maxTexts;
    this.pool = [];
    this.active = [];
    
    // Pre-create sprite pool
    for (let i = 0; i < maxTexts; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false
      });
      
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      scene.add(sprite);
      
      this.pool.push({
        sprite,
        canvas,
        ctx: canvas.getContext('2d'),
        texture,
        velocity: { x: 0, y: 0, z: 0 },
        life: 0,
        age: 0,
        active: false
      });
    }
  }
  
  spawn(text, position, color, isCrit = false) {
    // Find inactive sprite
    const item = this.pool.find(p => !p.active);
    if (!item) return; // Pool exhausted
    
    // Render text to canvas
    const ctx = item.ctx;
    ctx.clearRect(0, 0, 128, 64);
    
    ctx.font = isCrit ? 'bold 36px Arial' : 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(text, 66, 34);
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 32);
    
    item.texture.needsUpdate = true;
    
    // Position and activate
    item.sprite.position.set(position.x, position.y + 2, position.z);
    item.sprite.scale.set(isCrit ? 3 : 2, isCrit ? 1.5 : 1, 1);
    item.sprite.visible = true;
    
    item.velocity.x = (Math.random() - 0.5) * 0.5;
    item.velocity.y = 2 + Math.random();
    item.velocity.z = (Math.random() - 0.5) * 0.5;
    
    item.life = 1.2;
    item.age = 0;
    item.active = true;
    
    this.active.push(item);
  }
  
  update(delta) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i];
      item.age += delta;
      
      item.sprite.position.x += item.velocity.x * delta;
      item.sprite.position.y += item.velocity.y * delta;
      item.sprite.position.z += item.velocity.z * delta;
      item.velocity.y -= delta * 3;
      
      item.sprite.material.opacity = Math.max(0, 1 - item.age / item.life);
      
      if (item.age >= item.life) {
        item.sprite.visible = false;
        item.active = false;
        this.active.splice(i, 1);
      }
    }
  }
  
  dispose() {
    this.pool.forEach(item => {
      this.scene.remove(item.sprite);
      item.texture.dispose();
      item.sprite.material.dispose();
    });
  }
}

// ============================================================================
// DETERMINISTIC MOVEMENT (Same as V2)
// ============================================================================

export const calculateMovementPhase = (blueArmy, redArmy, worldSeed, round) => {
  const moveSpeed = 1.5;
  const minEngageDistance = 5;
  
  const blueAlive = blueArmy.filter(u => u.alive);
  const redAlive = redArmy.filter(u => u.alive);
  
  const bluePositions = new Map();
  const redPositions = new Map();
  
  const blueCenter = blueAlive.length > 0 ? {
    x: blueAlive.reduce((sum, u) => sum + u.simPos.x, 0) / blueAlive.length,
    z: blueAlive.reduce((sum, u) => sum + u.simPos.z, 0) / blueAlive.length
  } : null;
  
  const redCenter = redAlive.length > 0 ? {
    x: redAlive.reduce((sum, u) => sum + u.simPos.x, 0) / redAlive.length,
    z: redAlive.reduce((sum, u) => sum + u.simPos.z, 0) / redAlive.length
  } : null;
  
  if (redCenter) {
    blueAlive.forEach(unit => {
      const dx = redCenter.x - unit.simPos.x;
      const dz = redCenter.z - unit.simPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist > minEngageDistance) {
        const newX = unit.simPos.x + (dx / dist) * moveSpeed;
        const newZ = unit.simPos.z + (dz / dist) * moveSpeed;
        const newY = getTerrainHeight(newX, newZ, worldSeed);
        bluePositions.set(unit.id, { x: newX, y: newY, z: newZ });
      } else {
        bluePositions.set(unit.id, { ...unit.simPos });
      }
    });
  }
  
  if (blueCenter) {
    redAlive.forEach(unit => {
      const dx = blueCenter.x - unit.simPos.x;
      const dz = blueCenter.z - unit.simPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist > minEngageDistance) {
        const newX = unit.simPos.x + (dx / dist) * moveSpeed;
        const newZ = unit.simPos.z + (dz / dist) * moveSpeed;
        const newY = getTerrainHeight(newX, newZ, worldSeed);
        redPositions.set(unit.id, { x: newX, y: newY, z: newZ });
      } else {
        redPositions.set(unit.id, { ...unit.simPos });
      }
    });
  }
  
  return { bluePositions, redPositions };
};

export const applyMovement = (blueArmy, redArmy, bluePositions, redPositions) => {
  blueArmy.forEach(unit => {
    if (bluePositions.has(unit.id)) {
      const newPos = bluePositions.get(unit.id);
      unit.simPos.x = newPos.x;
      unit.simPos.y = newPos.y;
      unit.simPos.z = newPos.z;
    }
  });
  
  redArmy.forEach(unit => {
    if (redPositions.has(unit.id)) {
      const newPos = redPositions.get(unit.id);
      unit.simPos.x = newPos.x;
      unit.simPos.y = newPos.y;
      unit.simPos.z = newPos.z;
    }
  });
};

// ============================================================================
// DETERMINISTIC COMBAT RESOLUTION WITH SPATIAL GRID
// ============================================================================

const attackSeed = (aSimPos, tSimPos, atkId, seed) => {
  return xxHash32([
    quantize(aSimPos.x), quantize(aSimPos.y), quantize(aSimPos.z),
    quantize(tSimPos.x), quantize(tSimPos.y), quantize(tSimPos.z), atkId
  ], seed);
};

export const resolveAttack3D = (attacker, target, attackId, worldSeed) => {
  const baseHash = attackSeed(attacker.simPos, target.simPos, attackId, worldSeed);
  
  const hitRoll = hashToFloat(subHash(baseHash, 0));
  const critRoll = hashToFloat(subHash(baseHash, 1));
  const damageRoll = hashToFloat(subHash(baseHash, 2));
  
  const dist = Math.sqrt(
    Math.pow(attacker.simPos.x - target.simPos.x, 2) +
    Math.pow(attacker.simPos.y - target.simPos.y, 2) +
    Math.pow(attacker.simPos.z - target.simPos.z, 2)
  );
  
  const elevMod = (attacker.simPos.y - target.simPos.y) * 0.03;
  
  const hitThresh = 0.18 +
    (target.stats.evasion * 0.5) -
    (attacker.stats.precision * 0.3) -
    elevMod;
  
  const inRange = dist < 25;
  const isHit = inRange && hitRoll > Math.max(0.05, Math.min(0.95, hitThresh));
  const isCrit = isHit && critRoll > (1 - attacker.stats.critChance);
  
  let damage = 0;
  if (isHit) {
    const baseDamage = attacker.stats.attack;
    const defenseReduction = target.stats.defense * 0.4;
    const variance = 0.8 + damageRoll * 0.4;
    const critMult = isCrit ? attacker.stats.critMultiplier : 1.0;
    damage = Math.max(1, Math.round((baseDamage - defenseReduction) * variance * critMult));
  }
  
  return { hit: isHit, critical: isCrit, damage, inRange, hash: baseHash };
};

/**
 * V3: Battle resolution using spatial grid for efficient target finding
 */
export const resolveBattleRound = (blueArmy, redArmy, worldSeed, round, blueGrid, redGrid) => {
  const roundSeed = worldSeed + round * 1000;
  
  // PHASE 1: Capture current alive state
  const blueAlive = blueArmy.filter(u => u.alive);
  const redAlive = redArmy.filter(u => u.alive);
  
  // Update spatial grids
  blueGrid.insertAll(blueAlive);
  redGrid.insertAll(redAlive);
  
  // PHASE 2: Collect ALL attack results (no mutations)
  const blueResults = [];
  const redResults = [];
  
  // Blue attacks - use grid for target finding
  blueAlive.forEach(attacker => {
    const { closest } = blueGrid.findClosestEnemy(attacker, redGrid);
    if (closest) {
      const result = resolveAttack3D(attacker, closest, 1, roundSeed);
      blueResults.push({ attacker, target: closest, result });
    }
  });
  
  // Red attacks
  redAlive.forEach(attacker => {
    const { closest } = redGrid.findClosestEnemy(attacker, blueGrid);
    if (closest) {
      const result = resolveAttack3D(attacker, closest, 1, roundSeed + 500);
      redResults.push({ attacker, target: closest, result });
    }
  });
  
  // PHASE 3: Accumulate damage (batched)
  const damageMap = new Map();
  [...blueResults, ...redResults].forEach(({ target, result }) => {
    if (result.hit) {
      damageMap.set(target.id, (damageMap.get(target.id) || 0) + result.damage);
    }
  });
  
  // PHASE 4: Apply accumulated damage
  [...blueArmy, ...redArmy].forEach(unit => {
    if (damageMap.has(unit.id)) {
      unit.hp.current = Math.max(0, unit.hp.current - damageMap.get(unit.id));
    }
  });
  
  // PHASE 5: Check deaths
  [...blueArmy, ...redArmy].forEach(unit => {
    if (unit.hp.current <= 0) {
      unit.alive = false;
    }
  });
  
  return { blueResults, redResults, allResults: [...blueResults, ...redResults] };
};

// ============================================================================
// AOE RESOLUTION (Same as V2, deterministic)
// ============================================================================

export const resolveAOE = (targetArmy, aoeType, worldSeed, round) => {
  const aliveUnits = targetArmy.filter(u => u.alive);
  if (aliveUnits.length === 0) return { results: [], center: null };
  
  const center = {
    x: aliveUnits.reduce((sum, u) => sum + u.simPos.x, 0) / aliveUnits.length,
    y: aliveUnits.reduce((sum, u) => sum + u.simPos.y, 0) / aliveUnits.length,
    z: aliveUnits.reduce((sum, u) => sum + u.simPos.z, 0) / aliveUnits.length
  };
  
  const radius = 10; // Larger radius for bigger armies
  const aoeSeed = positionHash(center.x, center.y, center.z, worldSeed + round * 100 + (aoeType === 'heal' ? 5000 : 0));
  
  const sorted = [...aliveUnits].sort((a, b) => a.id.localeCompare(b.id));
  
  const results = sorted.map((unit, idx) => {
    const dist = Math.sqrt(
      Math.pow(unit.simPos.x - center.x, 2) +
      Math.pow(unit.simPos.z - center.z, 2)
    );
    
    const unitHash = subHash(aoeSeed, idx);
    const hitRoll = hashToFloat(unitHash);
    const hitChance = 0.75 - (dist / radius) * 0.3;
    
    if (dist > radius) {
      return { unit, hit: false, outOfRange: true, value: 0 };
    } else if (aoeType === 'heal') {
      const heal = Math.round(10 + hashToFloat(subHash(unitHash, 1)) * 15);
      return { unit, hit: true, isHeal: true, value: heal };
    } else if (hitRoll < hitChance) {
      const baseDmg = aoeType === 'fireball' ? 20 : 15;
      const dmg = Math.round(baseDmg * (0.7 + hashToFloat(subHash(unitHash, 1)) * 0.6));
      return { unit, hit: true, value: dmg, isCrit: dmg > baseDmg };
    } else {
      return { unit, hit: false, outOfRange: false, value: 0 };
    }
  });
  
  return { results, center, radius };
};

export const applyAOEResults = (results) => {
  results.forEach(({ unit, hit, isHeal, value }) => {
    if (!hit) return;
    
    if (isHeal) {
      unit.hp.current = Math.min(unit.hp.max, unit.hp.current + value);
    } else {
      unit.hp.current = Math.max(0, unit.hp.current - value);
      if (unit.hp.current <= 0) {
        unit.alive = false;
      }
    }
  });
};

// ============================================================================
// DETERMINISM VERIFICATION (Same as V2)
// ============================================================================

export const verifyDeterminism = (worldSeed, totalUnits = 200, rounds = 10) => {
  const unitsPerSide = Math.floor(totalUnits / 2);
  
  const runBattle = () => {
    let blue = generateArmy(-25, 0, unitsPerSide, 1.8, worldSeed, 0, 0);
    let red = generateArmy(25, 0, unitsPerSide, 1.8, worldSeed, 1, unitsPerSide);
    const blueGrid = new SpatialGrid(5);
    const redGrid = new SpatialGrid(5);
    const hashes = [];
    
    for (let r = 0; r < rounds; r++) {
      const { bluePositions, redPositions } = calculateMovementPhase(blue, red, worldSeed, r);
      applyMovement(blue, red, bluePositions, redPositions);
      const { allResults } = resolveBattleRound(blue, red, worldSeed, r, blueGrid, redGrid);
      hashes.push(allResults.map(r => r.result.hash).join(','));
    }
    
    return {
      hashes,
      blueAlive: blue.filter(u => u.alive).length,
      redAlive: red.filter(u => u.alive).length
    };
  };
  
  const run1 = runBattle();
  const run2 = runBattle();
  
  const hashMatch = run1.hashes.every((h, i) => h === run2.hashes[i]);
  const aliveMatch = run1.blueAlive === run2.blueAlive && run1.redAlive === run2.redAlive;
  
  return {
    verified: hashMatch && aliveMatch,
    run1,
    run2,
    hashMatch,
    aliveMatch
  };
};

// ============================================================================
// V3: PERFORMANCE MONITOR
// ============================================================================

export class PerformanceMonitor {
  constructor() {
    this.frameTimes = [];
    this.maxSamples = 60;
    this.lastTime = performance.now();
  }
  
  tick() {
    const now = performance.now();
    const delta = now - this.lastTime;
    this.lastTime = now;
    
    this.frameTimes.push(delta);
    if (this.frameTimes.length > this.maxSamples) {
      this.frameTimes.shift();
    }
  }
  
  getFPS() {
    if (this.frameTimes.length === 0) return 0;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    return Math.round(1000 / avg);
  }
  
  getAvgFrameTime() {
    if (this.frameTimes.length === 0) return 0;
    return this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core hashing
  positionHash,
  hashToFloat,
  hashToRange,
  coherentValue3D,
  getTerrainHeight,
  
  // Generation
  generateUnit,
  generateArmy,
  
  // Spatial
  SpatialGrid,
  
  // Rendering
  InstancedArmyRenderer,
  FloatingTextPool,
  
  // Movement
  calculateMovementPhase,
  applyMovement,
  
  // Combat
  resolveAttack3D,
  resolveBattleRound,
  
  // AOE
  resolveAOE,
  applyAOEResults,
  
  // Verification
  verifyDeterminism,
  
  // Performance
  PerformanceMonitor,
  
  // Constants
  UNIT_TYPES
};
