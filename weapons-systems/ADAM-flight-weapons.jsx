/**
 * ADAM-flight-weapons.jsx
 * Eve Online–style weapons layer built on top of Adam-3D-spaceship-controller.
 *
 * Weapons:
 *   Mining Beam     – sustained thermal beam (cyan)
 *   Combat Laser    – pulsed thermal beam (red)
 *   Missiles        – explosive projectiles with trails + blast
 *   Railguns        – EM instant-strike streaks + rings
 *   Artillery       – kinetic slow-slug + shockwave
 *   Mining Drones   – 3 orbit drones, harvest beams (thermal)
 *   Combat Drones   – 3 attack drones, rapid laser bursts (thermal)
 *
 * Combat outcomes use ZeroBytes position-as-seed deterministic hashing.
 * All particle effects use instanced meshes (single draw call per type).
 *
 * Props:
 *   glbUrl         {string}   optional GLB ship model
 *   onCombatEvent  {fn}       called with { weapon, damage, type, tick }
 */

import React, {
  useRef, useState, useEffect, useCallback, useMemo, Suspense,
} from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, useGLTF } from '@react-three/drei';

// ═══════════════════════════════════════════════════════════════════════════════
// ZEROBYTES COMBAT HASH  (position-as-seed, no external deps)
// ═══════════════════════════════════════════════════════════════════════════════
function positionHash(x, y, z, salt = 0) {
  // 32-bit integer Murmur-inspired mix
  let h = (salt * 2654435769) | 0;
  h ^= (x * 374761393) | 0;
  h  = (Math.imul(h, 0x9e3779b9) ^ (h >>> 16)) | 0;
  h ^= (y * 1013904223) | 0;
  h  = (Math.imul(h, 0x85ebca6b) ^ (h >>> 13)) | 0;
  h ^= (z * 1664525)    | 0;
  h  = (Math.imul(h, 0xc2b2ae35) ^ (h >>> 16)) | 0;
  return h >>> 0; // unsigned
}
function hashFloat(h) { return (h & 0xFFFFFF) / 0x1000000; }

// Deterministic combat roll: weapon seed + tick → outcome 0-1
function combatRoll(weaponId, tick, worldSeed = 42) {
  const h = positionHash(weaponId, tick, worldSeed, 0xDEADBEEF);
  return hashFloat(h);
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEAPON DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════
export const WEAPONS = [
  { id: 0, name: 'Mining Beam',    type: 'thermal',    icon: '⚡', color: '#00ffcc', emissive: 0x00ffcc,
    fireRate: 0.0,  // continuous
    alpha: 8,    dps: 12,  continuous: true,
    desc: 'Sustained thermal extraction beam' },
  { id: 1, name: 'Combat Laser',   type: 'thermal',    icon: '🔴', color: '#ff2200', emissive: 0xff2200,
    fireRate: 1.2, alpha: 22,   dps: 0,   continuous: false,
    desc: 'High-frequency pulsed thermal lance' },
  { id: 2, name: 'Missiles',       type: 'explosive',  icon: '🚀', color: '#ff8800', emissive: 0xff6600,
    fireRate: 3.5, alpha: 85,   dps: 0,   continuous: false,
    desc: 'Lock-on warheads, area-of-effect blast' },
  { id: 3, name: 'Railguns',       type: 'em',         icon: '⚡', color: '#44aaff', emissive: 0x2266ff,
    fireRate: 2.8, alpha: 110,  dps: 0,   continuous: false,
    desc: 'Electromagnetic slug, instant travel' },
  { id: 4, name: 'Artillery',      type: 'kinetic',    icon: '💥', color: '#ffcc44', emissive: 0xcc8800,
    fireRate: 6.0, alpha: 260,  dps: 0,   continuous: false,
    desc: 'Heavy kinetic shell, high alpha damage' },
  { id: 5, name: 'Mining Drones',  type: 'thermal',    icon: '🤖', color: '#00ddff', emissive: 0x0088cc,
    fireRate: 0.0, alpha: 6,    dps: 18,  continuous: true,
    desc: '3 autonomous extraction drones' },
  { id: 6, name: 'Combat Drones',  type: 'thermal',    icon: '🤖', color: '#ff4488', emissive: 0xcc0044,
    fireRate: 0.8, alpha: 18,   dps: 0,   continuous: false,
    desc: '3 combat drones, rapid burst fire' },
];

const DAMAGE_COLORS = {
  thermal:   '#ff6633',
  explosive: '#ff9900',
  em:        '#44aaff',
  kinetic:   '#ffdd44',
};

// ═══════════════════════════════════════════════════════════════════════════════
// INSTANCED PARTICLE POOL
// ═══════════════════════════════════════════════════════════════════════════════
function useInstancedParticles(maxCount, geo, mat) {
  const mesh = useRef();
  const pool = useRef([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    pool.current = Array.from({ length: maxCount }, () => ({
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      scale: 1, life: 0, maxLife: 0, active: false,
    }));
  }, [maxCount]);

  const spawn = useCallback((pos, vel, scale, life) => {
    const p = pool.current.find(p => !p.active);
    if (!p) return;
    p.pos.copy(pos); p.vel.copy(vel);
    p.scale = scale; p.life = life; p.maxLife = life; p.active = true;
  }, []);

  const tick = useCallback((dt) => {
    if (!mesh.current) return;
    let visible = 0;
    for (const p of pool.current) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.pos.addScaledVector(p.vel, dt);
      const s = p.scale * (p.life / p.maxLife);
      dummy.position.copy(p.pos);
      dummy.scale.setScalar(Math.max(0.001, s));
      dummy.updateMatrix();
      mesh.current.setMatrixAt(visible, dummy.matrix);
      visible++;
    }
    // hide unused instances
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    for (let i = visible; i < maxCount; i++) {
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  }, [maxCount, dummy]);

  return { meshRef: mesh, spawn, tick };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEAM RENDERER  (reusable for all beam weapons)
// ═══════════════════════════════════════════════════════════════════════════════
function BeamLine({ start, end, color, width = 0.08, opacity = 1.0, pulse = false }) {
  const ref      = useRef();
  const timeRef  = useRef(0);

  useFrame((_, dt) => {
    timeRef.current += dt;
    if (ref.current && pulse) {
      ref.current.material.opacity = 0.5 + 0.5 * Math.sin(timeRef.current * 18);
    }
  });

  const dir = end.clone().sub(start);
  const len = dir.length();
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), dir.normalize()
  );

  return (
    <mesh ref={ref} position={mid} quaternion={quat}>
      <cylinderGeometry args={[width, width, len, 5, 1]} />
      <meshBasicMaterial
        color={color} transparent opacity={opacity}
        blending={THREE.AdditiveBlending} depthWrite={false}
      />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MISSILE PROJECTILE
// ═══════════════════════════════════════════════════════════════════════════════
function MissileProjectile({ origin, target, color, onHit }) {
  const ref     = useRef();
  const posRef  = useRef(origin.clone());
  const hitRef  = useRef(false);
  const trail   = useRef([]);

  useFrame((_, dt) => {
    if (hitRef.current || !ref.current) return;
    const dir = target.clone().sub(posRef.current).normalize();
    posRef.current.addScaledVector(dir, 28 * dt);
    ref.current.position.copy(posRef.current);
    ref.current.lookAt(target);

    if (posRef.current.distanceTo(target) < 2.5) {
      hitRef.current = true;
      onHit?.(posRef.current.clone());
    }
  });

  return (
    <group ref={ref}>
      <mesh>
        <coneGeometry args={[0.12, 0.8, 6]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2}
          metalness={0.8} roughness={0.2} />
      </mesh>
      <pointLight color={color} intensity={1.5} distance={4} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPLOSION BURST
// ═══════════════════════════════════════════════════════════════════════════════
function ExplosionBurst({ position, color, onDone }) {
  const ref      = useRef();
  const lifeRef  = useRef(0.7);

  useFrame((_, dt) => {
    lifeRef.current -= dt;
    if (ref.current) {
      const t = 1 - Math.max(0, lifeRef.current / 0.7);
      const s = 1 + t * 6;
      ref.current.scale.setScalar(s);
      ref.current.children.forEach(c => {
        if (c.material) c.material.opacity = Math.max(0, 1 - t * 1.4);
      });
    }
    if (lifeRef.current <= 0) onDone?.();
  });

  return (
    <group ref={ref} position={[position.x, position.y, position.z]}>
      <mesh>
        <sphereGeometry args={[0.8, 12, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.8}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh scale={[1.6, 1.6, 1.6]}>
        <sphereGeometry args={[0.8, 8, 6]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.3}
          blending={THREE.AdditiveBlending} depthWrite={false} wireframe />
      </mesh>
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EM RING (railgun impact)
// ═══════════════════════════════════════════════════════════════════════════════
function EMRing({ position, color }) {
  const ref     = useRef();
  const lifeRef = useRef(0.6);

  useFrame((_, dt) => {
    lifeRef.current -= dt;
    if (ref.current) {
      const t = 1 - Math.max(0, lifeRef.current / 0.6);
      ref.current.scale.setScalar(1 + t * 5);
      if (ref.current.material) ref.current.material.opacity = Math.max(0, 1 - t * 1.6);
    }
  });

  return (
    <mesh ref={ref} position={[position.x, position.y, position.z]}
          rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[1, 0.07, 8, 32]} />
      <meshBasicMaterial color={color} transparent opacity={0.9}
        blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHOCKWAVE RING (artillery)
// ═══════════════════════════════════════════════════════════════════════════════
function ShockwaveRing({ position }) {
  const rings = [-0.5, 0, 0.5];
  return (
    <>
      {rings.map((offset, i) => (
        <EMRing key={i}
          position={{ x: position.x, y: position.y + offset, z: position.z }}
          color="#ffcc44" />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRONE  (mining or combat)
// ═══════════════════════════════════════════════════════════════════════════════
function Drone({ index, total, shipPos, targetPos, color, isCombat, onFire }) {
  const ref      = useRef();
  const angleRef = useRef((index / total) * Math.PI * 2);
  const beamRef  = useRef(false);
  const timerRef = useRef(0);
  const ORBIT_R  = 6;
  const ORBIT_SPD = isCombat ? 1.4 : 0.7;

  useFrame((_, dt) => {
    timerRef.current += dt;
    angleRef.current += ORBIT_SPD * dt;
    if (!ref.current) return;

    const x = shipPos.x + Math.cos(angleRef.current) * ORBIT_R;
    const y = shipPos.y + Math.sin(angleRef.current * 0.5) * 1.5;
    const z = shipPos.z + Math.sin(angleRef.current) * ORBIT_R;
    ref.current.position.set(x, y, z);

    // Combat drones fire periodically
    const rateThresh = isCombat ? 1.5 : 3.0;
    if (timerRef.current > rateThresh) {
      timerRef.current = 0;
      onFire?.({ x, y, z });
    }
  });

  return (
    <group ref={ref}>
      <mesh>
        <octahedronGeometry args={[0.4, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6}
          metalness={0.9} roughness={0.2} />
      </mesh>
      <pointLight color={color} intensity={1} distance={3} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DUMMY TARGET
// ═══════════════════════════════════════════════════════════════════════════════
function DummyTarget({ position, hitFlash }) {
  const ref     = useRef();
  const timeRef = useRef(0);

  useFrame((_, dt) => {
    timeRef.current += dt;
    if (ref.current) {
      ref.current.rotation.y += dt * 0.4;
      ref.current.rotation.x += dt * 0.15;
      // hit flash
      const flash = hitFlash.current > 0;
      ref.current.children.forEach((c, i) => {
        if (c.material) {
          c.material.emissiveIntensity = flash ? 3 : (i === 0 ? 0.3 : 0.1);
        }
      });
      hitFlash.current = Math.max(0, hitFlash.current - dt * 4);
    }
  });

  return (
    <group ref={ref} position={[position.x, position.y, position.z]}>
      {/* main body */}
      <mesh>
        <icosahedronGeometry args={[2.2, 1]} />
        <meshStandardMaterial color="#1a3040" metalness={0.7} roughness={0.4}
          emissive="#002244" emissiveIntensity={0.3} wireframe={false} />
      </mesh>
      {/* cage */}
      <mesh scale={[1.15, 1.15, 1.15]}>
        <icosahedronGeometry args={[2.2, 1]} />
        <meshBasicMaterial color="#0066aa" transparent opacity={0.15}
          wireframe depthWrite={false} />
      </mesh>
      {/* lock ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3, 0.06, 8, 40]} />
        <meshBasicMaterial color="#00ccff" transparent opacity={0.5}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 3]}>
        <torusGeometry args={[3, 0.04, 8, 40]} />
        <meshBasicMaterial color="#00ccff" transparent opacity={0.3}
          blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <pointLight color="#004488" intensity={1.5} distance={8} />
    </group>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RAILGUN STREAK
// ═══════════════════════════════════════════════════════════════════════════════
function RailStreak({ origin, target, color }) {
  const ref     = useRef();
  const lifeRef = useRef(0.25);

  useFrame((_, dt) => {
    lifeRef.current -= dt;
    if (ref.current && ref.current.material) {
      ref.current.material.opacity = Math.max(0, lifeRef.current / 0.25);
    }
  });

  return (
    <BeamLine ref={ref}
      start={origin} end={target}
      color={color} width={0.15} opacity={1} pulse={false}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTILLERY SLUG
// ═══════════════════════════════════════════════════════════════════════════════
function ArtillerySlug({ origin, target, onHit }) {
  const ref    = useRef();
  const posRef = useRef(origin.clone());
  const hitRef = useRef(false);
  const SPEED  = 18;

  useFrame((_, dt) => {
    if (hitRef.current || !ref.current) return;
    const dir = target.clone().sub(posRef.current).normalize();
    posRef.current.addScaledVector(dir, SPEED * dt);
    ref.current.position.copy(posRef.current);
    if (posRef.current.distanceTo(target) < 2.5) {
      hitRef.current = true;
      onHit?.(posRef.current.clone());
    }
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.25, 6, 4]} />
      <meshStandardMaterial color="#ffcc44" emissive="#cc8800" emissiveIntensity={3}
        metalness={0.6} roughness={0.3} />
    </mesh>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPARK PARTICLES (instanced)
// ═══════════════════════════════════════════════════════════════════════════════
function SparkSystem({ color, spawnSignal }) {
  const MAX     = 200;
  const geo     = useMemo(() => new THREE.SphereGeometry(0.08, 4, 3), []);
  const mat     = useMemo(() => new THREE.MeshBasicMaterial({
    color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }), [color]);
  const { meshRef, spawn, tick } = useInstancedParticles(MAX, geo, mat);

  useFrame((_, dt) => {
    if (spawnSignal.current > 0) {
      const n = Math.min(spawnSignal.current, 6);
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
        );
        spawn(spawnSignal.pos.clone(), v, 0.6 + Math.random() * 0.5, 0.3 + Math.random() * 0.4);
      }
      spawnSignal.current = 0;
    }
    tick(dt);
  });

  return (
    <instancedMesh ref={meshRef} args={[geo, mat, MAX]} />
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SKYBOX
// ═══════════════════════════════════════════════════════════════════════════════
function buildSkybox() {
  const size = 512;
  const imgs = [];
  for (let f = 0; f < 6; f++) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/1.3);
    g.addColorStop(0,'#060a14'); g.addColorStop(.6,'#030608'); g.addColorStop(1,'#010205');
    ctx.fillStyle = g; ctx.fillRect(0,0,size,size);
    let s = f*9301+49297;
    const rng = () => { s=(s*9301+49297)%233280; return s/233280; };
    for (let i=0;i<380;i++) {
      const x=rng()*size,y=rng()*size,r=rng()*1.5+.3,b=rng();
      ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
      ctx.fillStyle = b>.93?`rgba(180,220,255,${.7+rng()*.3})`:b>.85?`rgba(255,200,140,${.5+rng()*.3})`:`rgba(200,220,255,${.15+rng()*.4})`;
      ctx.fill();
    }
    imgs.push(c);
  }
  const t = new THREE.CubeTexture(imgs);
  t.needsUpdate = true;
  return t;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIAMOND SHIP (default)
// ═══════════════════════════════════════════════════════════════════════════════
function DiamondShip() {
  return (
    <group>
      <mesh>
        <octahedronGeometry args={[1.5, 0]} />
        <meshStandardMaterial color="#1a2840" metalness={.95} roughness={.15}
          emissive="#0a1525" emissiveIntensity={.3} />
      </mesh>
      <mesh position={[0,0,2.2]} rotation={[Math.PI/2,0,0]}>
        <coneGeometry args={[.35,1.5,6]} />
        <meshStandardMaterial color="#0d1e35" metalness={.9} roughness={.2} />
      </mesh>
      <mesh position={[0,0,-2.2]} rotation={[-Math.PI/2,0,0]}>
        <coneGeometry args={[.35,1.5,6]} />
        <meshStandardMaterial color="#0d1e35" metalness={.9} roughness={.2} />
      </mesh>
      {[-1,1].map(s => (
        <mesh key={s} position={[s*1.8,0,0]} rotation={[0,0,s*.4]}>
          <boxGeometry args={[1.4,.08,.9]} />
          <meshStandardMaterial color="#112030" metalness={.95} roughness={.1}
            emissive="#0a2040" emissiveIntensity={.4} />
        </mesh>
      ))}
      <mesh position={[0,0,-2.4]}>
        <sphereGeometry args={[.22,12,8]} />
        <meshStandardMaterial color="#2255cc" emissive="#3366ff" emissiveIntensity={3}
          transparent opacity={.85} />
      </mesh>
      <pointLight position={[0,0,-1.8]} color="#4488ff" intensity={2} distance={6} />
    </group>
  );
}

function GlbShip({ url }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(), [scene]);
  return <primitive object={clone} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEAPON EFFECTS LAYER
// ═══════════════════════════════════════════════════════════════════════════════
function WeaponEffects({
  activeWeapon, shipPos, targetPos, hitFlash,
  onDamage, tickRef,
}) {
  const w = activeWeapon ? WEAPONS[activeWeapon] : null;

  // Beam state (continuous)
  const beamActive    = w && w.continuous;
  const beamPulse     = w && w.id === 1;
  const beamColor     = w?.color ?? '#ffffff';

  // Projectiles & impacts
  const [missiles, setMissiles]   = useState([]);
  const [rails, setRails]         = useState([]);
  const [artSlugs, setArtSlugs]   = useState([]);
  const [explosions, setExplosions] = useState([]);
  const [emRings, setEmRings]     = useState([]);
  const [shocks, setShocks]       = useState([]);

  // Drone fire beams
  const [droneBeams, setDroneBeams] = useState([]);

  // Spark spawn signal
  const sparkSignal = useRef({ current: 0, pos: new THREE.Vector3() });

  // Ship gun hardpoint (forward-right offset)
  const gunPos = () => new THREE.Vector3(
    shipPos.x + 0.8,
    shipPos.y + 0.1,
    shipPos.z + 2.8,
  );

  // Fire function — called by timer
  const fire = useCallback(() => {
    if (!w) return;
    const roll = combatRoll(w.id, tickRef.current++, 77);
    const baseDmg = w.continuous ? w.dps * 0.1 : w.alpha;
    const dmg = Math.round(baseDmg * (0.85 + roll * 0.3));
    onDamage?.(w, dmg);
    hitFlash.current = 1;
    sparkSignal.current = 8;
    sparkSignal.pos.copy(targetPos);

    if (w.id === 2) { // missiles
      setMissiles(m => [...m, { id: Date.now() + Math.random(), pos: gunPos() }]);
    }
    if (w.id === 3) { // railguns
      setRails(r => [...r, { id: Date.now() + Math.random() }]);
      setTimeout(() => setEmRings(e => [...e, { id: Date.now(), pos: { ...targetPos } }]), 50);
    }
    if (w.id === 4) { // artillery
      setArtSlugs(a => [...a, { id: Date.now() + Math.random(), pos: gunPos() }]);
    }
  }, [w, tickRef, onDamage, hitFlash, targetPos, sparkSignal]);

  // Auto-fire timer
  const fireTimerRef = useRef(null);
  const prevWeapon   = useRef(null);

  useEffect(() => {
    if (fireTimerRef.current) clearInterval(fireTimerRef.current);
    if (!w) return;
    if (w.continuous) {
      fireTimerRef.current = setInterval(fire, 100); // 10/s for continuous
    } else {
      fire(); // immediate first shot
      fireTimerRef.current = setInterval(fire, w.fireRate * 1000);
    }
    return () => clearInterval(fireTimerRef.current);
  }, [w?.id]);

  // Drone fire handler
  const handleDroneFire = useCallback((dronePos) => {
    if (!w || (w.id !== 5 && w.id !== 6)) return;
    const roll = combatRoll(w.id, tickRef.current++, 99);
    const dmg  = Math.round(w.alpha * (0.8 + roll * 0.4));
    onDamage?.(w, dmg);
    hitFlash.current = 0.6;
    const beamId = Date.now() + Math.random();
    setDroneBeams(b => [...b, { id: beamId, from: { ...dronePos }, to: { ...targetPos } }]);
    setTimeout(() => setDroneBeams(b => b.filter(x => x.id !== beamId)), 180);
  }, [w, tickRef, onDamage, hitFlash, targetPos]);

  return (
    <>
      {/* ── BEAM weapons (0: mining, 1: combat laser) ── */}
      {w && (w.id === 0 || w.id === 1) && (
        <BeamLine
          start={new THREE.Vector3(shipPos.x + 0.8, shipPos.y, shipPos.z + 2.5)}
          end={new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z)}
          color={beamColor}
          width={w.id === 0 ? 0.06 : 0.12}
          opacity={w.id === 0 ? 0.7 : 0.95}
          pulse={w.id === 1}
        />
      )}

      {/* ── MISSILES ── */}
      {missiles.map(m => (
        <MissileProjectile key={m.id}
          origin={m.pos}
          target={new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z)}
          color="#ff8800"
          onHit={(pos) => {
            setMissiles(ms => ms.filter(x => x.id !== m.id));
            setExplosions(e => [...e, { id: Date.now() + Math.random(), pos }]);
          }}
        />
      ))}

      {/* ── RAILGUN STREAKS ── */}
      {rails.map(r => (
        <RailStreak key={r.id}
          origin={new THREE.Vector3(shipPos.x, shipPos.y + 0.5, shipPos.z + 2.5)}
          target={new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z)}
          color="#44aaff"
        />
      ))}
      {/* clean up after 300ms */}
      {rails.length > 0 && (
        <RailCleanup rails={rails} setRails={setRails} />
      )}

      {/* ── EM RINGS ── */}
      {emRings.map(r => (
        <EMRing key={r.id}
          position={r.pos}
          color="#44aaff"
        />
      ))}

      {/* ── ARTILLERY SLUGS ── */}
      {artSlugs.map(a => (
        <ArtillerySlug key={a.id}
          origin={a.pos}
          target={new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z)}
          onHit={(pos) => {
            setArtSlugs(s => s.filter(x => x.id !== a.id));
            setShocks(s => [...s, { id: Date.now() + Math.random(), pos }]);
          }}
        />
      ))}

      {/* ── EXPLOSIONS ── */}
      {explosions.map(e => (
        <ExplosionBurst key={e.id} position={e.pos} color="#ff6600"
          onDone={() => setExplosions(ex => ex.filter(x => x.id !== e.id))} />
      ))}

      {/* ── SHOCKWAVES ── */}
      {shocks.map(s => (
        <ShockwaveRing key={s.id} position={s.pos} />
      ))}

      {/* ── DRONES ── */}
      {w && (w.id === 5 || w.id === 6) && (
        [0, 1, 2].map(i => (
          <Drone key={i} index={i} total={3}
            shipPos={shipPos} targetPos={targetPos}
            color={w.color} isCombat={w.id === 6}
            onFire={handleDroneFire}
          />
        ))
      )}

      {/* ── DRONE BEAMS ── */}
      {droneBeams.map(b => (
        <BeamLine key={b.id}
          start={new THREE.Vector3(b.from.x, b.from.y, b.from.z)}
          end={new THREE.Vector3(b.to.x, b.to.y, b.to.z)}
          color={w?.id === 6 ? '#ff4488' : '#00ddff'}
          width={0.05} opacity={0.85} pulse={false}
        />
      ))}

      {/* ── INSTANCED SPARKS ── */}
      <SparkSystem
        color={w?.color ?? '#ffffff'}
        spawnSignal={sparkSignal}
      />
    </>
  );
}

// Rail cleanup helper
function RailCleanup({ rails, setRails }) {
  const timerRef = useRef(null);
  useEffect(() => {
    timerRef.current = setTimeout(() => setRails([]), 300);
    return () => clearTimeout(timerRef.current);
  }, [rails.length]);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN 3D SCENE
// ═══════════════════════════════════════════════════════════════════════════════
const TARGET_POS = { x: 0, y: 0, z: -40 };

function Scene({ glbUrl, activeWeapon, hitFlash, onDamage, tickRef }) {
  const { gl, scene } = useThree();
  const shipPos  = useRef(new THREE.Vector3(0, 0, 0));
  const orbitRef = useRef();

  useEffect(() => {
    const cb = buildSkybox();
    scene.background = cb;
    return () => { cb.dispose(); scene.background = null; };
  }, [gl, scene]);

  return (
    <>
      <ambientLight intensity={0.08} color="#1a2040" />
      <directionalLight position={[80, 40, -60]} intensity={1.4} color="#ffd8a0" />
      <pointLight position={[-40, 20, 40]} intensity={0.3} color="#2244aa" />

      {/* Player ship */}
      <group position={[0, 0, 0]}>
        <Suspense fallback={null}>
          {glbUrl ? <GlbShip url={glbUrl} /> : <DiamondShip />}
        </Suspense>
      </group>

      {/* Dummy target */}
      <DummyTarget
        position={TARGET_POS}
        hitFlash={hitFlash}
      />

      {/* Weapons */}
      <WeaponEffects
        activeWeapon={activeWeapon}
        shipPos={shipPos.current}
        targetPos={TARGET_POS}
        hitFlash={hitFlash}
        onDamage={onDamage}
        tickRef={tickRef}
      />

      <Stars radius={800} depth={60} count={5000} factor={4} saturation={0.3} fade />

      <OrbitControls
        ref={orbitRef}
        enablePan={false}
        minDistance={6}
        maxDistance={80}
        enableDamping
        dampingFactor={0.08}
        target={new THREE.Vector3(0, 0, -20)}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEAPONS HUD
// ═══════════════════════════════════════════════════════════════════════════════
function WeaponsHud({
  activeWeapon, onSelect, combatLog, totalDamage, glbUrl, onGlbLoad,
}) {
  const C = {
    bg: 'rgba(0,8,18,0.92)', border: 'rgba(0,180,255,0.18)',
    cyan: '#00c8ff', dim: '#224466', amber: '#ffaa00',
    red: '#ff3322', text: '#88ccee',
  };
  const MONO = '"Share Tech Mono","Courier New",monospace';

  return (
    <div style={{ position:'absolute', inset:0, pointerEvents:'none', fontFamily:MONO }}>

      {/* Top bar */}
      <div style={{ position:'absolute',top:0,left:0,right:0,height:38,
        display:'flex',alignItems:'center',justifyContent:'space-between',
        padding:'0 20px', background:'rgba(0,10,22,0.88)',
        borderBottom:`1px solid ${C.border}`, pointerEvents:'auto' }}>
        <span style={{ color:C.cyan, fontSize:12, letterSpacing:'.2em', fontWeight:700 }}>
          ◈ ADAM COMBAT SYSTEMS
        </span>
        <span style={{ color:C.dim, fontSize:10, letterSpacing:'.15em' }}>
          TARGET LOCKED · SCROLL ZOOM · DRAG ORBIT
        </span>
        <label style={{ color:C.amber, fontSize:11, letterSpacing:'.15em', cursor:'pointer',
          border:`1px solid rgba(255,170,0,.3)`, padding:'3px 10px', borderRadius:2,
          background:'rgba(80,40,0,.3)' }}>
          ⬆ GLB
          <input type="file" accept=".glb" onChange={e => {
            const f = e.target.files?.[0];
            if (f) onGlbLoad(URL.createObjectURL(f));
          }} style={{ display:'none' }} />
        </label>
      </div>

      {/* Weapon selector — left panel */}
      <div style={{ position:'absolute', left:16, top:54, width:220,
        background:C.bg, border:`1px solid ${C.border}`, borderRadius:3,
        padding:'10px 0', pointerEvents:'auto' }}>
        <div style={{ color:C.dim, fontSize:9, letterSpacing:'.2em',
          padding:'0 14px 8px', borderBottom:`1px solid ${C.border}` }}>
          WEAPON SELECT
        </div>
        {WEAPONS.map(w => {
          const isActive = activeWeapon === w.id;
          const typeColor = DAMAGE_COLORS[w.type];
          return (
            <div key={w.id}
              onClick={() => onSelect(isActive ? null : w.id)}
              style={{
                display:'flex', alignItems:'center', gap:8,
                padding:'8px 14px', cursor:'pointer',
                background: isActive ? 'rgba(0,100,200,0.25)' : 'transparent',
                borderLeft: isActive ? `2px solid ${typeColor}` : '2px solid transparent',
                transition:'all .15s',
              }}>
              <span style={{ fontSize:14 }}>{w.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ color: isActive ? typeColor : C.text,
                  fontSize:11, letterSpacing:'.08em' }}>{w.name}</div>
                <div style={{ color:C.dim, fontSize:9, letterSpacing:'.1em' }}>
                  {w.type.toUpperCase()} · {w.continuous ? `${w.dps} DPS` : `${w.alpha} α · ${w.fireRate}s`}
                </div>
              </div>
              {isActive && (
                <div style={{ width:6, height:6, borderRadius:'50%',
                  background:typeColor, boxShadow:`0 0 6px ${typeColor}` }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Combat log — right panel */}
      <div style={{ position:'absolute', right:16, top:54, width:200,
        background:C.bg, border:`1px solid ${C.border}`, borderRadius:3,
        padding:'10px 14px', maxHeight:340, overflow:'hidden' }}>
        <div style={{ color:C.dim, fontSize:9, letterSpacing:'.2em',
          marginBottom:8, borderBottom:`1px solid ${C.border}`, paddingBottom:6 }}>
          COMBAT LOG
        </div>
        <div style={{ marginBottom:10 }}>
          <span style={{ color:C.dim, fontSize:9 }}>TOTAL DAMAGE  </span>
          <span style={{ color:C.cyan, fontSize:16, letterSpacing:'.05em' }}>
            {totalDamage.toLocaleString()}
          </span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
          {combatLog.slice(-10).reverse().map((entry, i) => (
            <div key={i} style={{ display:'flex', justifyContent:'space-between',
              opacity: 1 - i * 0.08 }}>
              <span style={{ color: DAMAGE_COLORS[entry.type], fontSize:9,
                letterSpacing:'.1em' }}>
                {entry.weapon}
              </span>
              <span style={{ color:'#ff6644', fontSize:9 }}>
                -{entry.damage}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Active weapon status — bottom */}
      {activeWeapon !== null && (
        <div style={{ position:'absolute', bottom:20, left:'50%',
          transform:'translateX(-50%)',
          display:'flex', flexDirection:'column', alignItems:'center', gap:6,
          background:C.bg, border:`1px solid ${DAMAGE_COLORS[WEAPONS[activeWeapon].type]}44`,
          borderRadius:3, padding:'10px 20px', pointerEvents:'auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:8, height:8, borderRadius:'50%',
              background: DAMAGE_COLORS[WEAPONS[activeWeapon].type],
              boxShadow:`0 0 8px ${DAMAGE_COLORS[WEAPONS[activeWeapon].type]}`,
              animation:'pulse 0.8s ease-in-out infinite' }} />
            <span style={{ color: DAMAGE_COLORS[WEAPONS[activeWeapon].type],
              fontSize:12, letterSpacing:'.2em', fontWeight:700 }}>
              {WEAPONS[activeWeapon].name.toUpperCase()} — ACTIVE
            </span>
            <div style={{ width:8, height:8, borderRadius:'50%',
              background: DAMAGE_COLORS[WEAPONS[activeWeapon].type],
              boxShadow:`0 0 8px ${DAMAGE_COLORS[WEAPONS[activeWeapon].type]}`,
              animation:'pulse 0.8s ease-in-out infinite' }} />
          </div>
          <span style={{ color:C.dim, fontSize:9, letterSpacing:'.15em' }}>
            {WEAPONS[activeWeapon].desc}
          </span>
          <button onClick={() => onSelect(null)} style={{
            background:'rgba(80,0,0,.5)', border:'1px solid rgba(255,50,50,.4)',
            color:'#ff6644', fontFamily:MONO, fontSize:10, letterSpacing:'.15em',
            padding:'3px 14px', borderRadius:2, cursor:'pointer',
          }}>
            ✕ DEACTIVATE
          </button>
        </div>
      )}

      {/* Damage type legend — bottom right */}
      <div style={{ position:'absolute', bottom:20, right:16,
        background:C.bg, border:`1px solid ${C.border}`, borderRadius:3,
        padding:'8px 12px' }}>
        <div style={{ color:C.dim, fontSize:9, letterSpacing:'.2em', marginBottom:6 }}>
          DAMAGE TYPES
        </div>
        {Object.entries(DAMAGE_COLORS).map(([type, col]) => (
          <div key={type} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
            <div style={{ width:8, height:3, background:col, borderRadius:1 }} />
            <span style={{ color:col, fontSize:9, letterSpacing:'.15em' }}>
              {type.toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      {/* Scanlines */}
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        backgroundImage:'repeating-linear-gradient(0deg,rgba(0,0,0,.04) 0px,rgba(0,0,0,.04) 1px,transparent 1px,transparent 3px)',
        zIndex:10 }} />
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        background:'radial-gradient(ellipse at center,transparent 50%,rgba(0,0,10,.65) 100%)',
        zIndex:9 }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
export default function ADAMFlightWeapons({ glbUrl: initGlb, onCombatEvent }) {
  const [activeWeapon, setActiveWeapon] = useState(null);
  const [combatLog, setCombatLog]       = useState([]);
  const [totalDamage, setTotalDamage]   = useState(0);
  const [glbUrl, setGlbUrl]             = useState(initGlb ?? null);
  const hitFlash = useRef(0);
  const tickRef  = useRef(0);

  const handleDamage = useCallback((w, dmg) => {
    setTotalDamage(t => t + dmg);
    setCombatLog(log => [...log.slice(-49), { weapon: w.name, damage: dmg, type: w.type }]);
    onCombatEvent?.({ weapon: w.name, damage: dmg, type: w.type, tick: tickRef.current });
  }, [onCombatEvent]);

  const handleSelect = useCallback((id) => {
    setActiveWeapon(id);
  }, []);

  return (
    <div style={{ position:'relative', width:'100%', height:'100%',
      background:'#020508', overflow:'hidden' }}>
      <Canvas
        camera={{ position: [12, 8, 18], fov: 55, near: 0.1, far: 2000 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        shadows
        style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}
      >
        <Scene
          glbUrl={glbUrl}
          activeWeapon={activeWeapon}
          hitFlash={hitFlash}
          onDamage={handleDamage}
          tickRef={tickRef}
        />
      </Canvas>
      <WeaponsHud
        activeWeapon={activeWeapon}
        onSelect={handleSelect}
        combatLog={combatLog}
        totalDamage={totalDamage}
        glbUrl={glbUrl}
        onGlbLoad={setGlbUrl}
      />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
      `}</style>
    </div>
  );
}
