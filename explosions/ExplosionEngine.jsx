import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  Vector3, 
  Euler, 
  MathUtils, 
  Color, 
  AdditiveBlending,
  NormalBlending,
  DoubleSide
} from 'three';

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================
const EXPLOSION_CONFIG = {
  // Explosion Classes
  CLASSES: {
    SMALL: {
      name: 'SMALL',
      particleCount: 15,
      shockwaveScale: 3,
      duration: 800,
      wreckagePieces: 1,
      wreckageScale: [0.4, 0.25, 0.6],
      cameraShake: 0.1,
      lightIntensity: 8,
      lightDistance: 15,
    },
    MEDIUM: {
      name: 'MEDIUM',
      particleCount: 30,
      shockwaveScale: 5,
      duration: 1000,
      wreckagePieces: 2,
      wreckageScale: [0.6, 0.35, 0.9],
      cameraShake: 0.25,
      lightIntensity: 15,
      lightDistance: 25,
    },
    LARGE: {
      name: 'LARGE',
      particleCount: 50,
      shockwaveScale: 8,
      duration: 1400,
      wreckagePieces: 4,
      cameraShake: 0.5,
      wreckageScale: [1.0, 0.5, 1.4],
      lightIntensity: 25,
      lightDistance: 40,
    },
    BOSS: {
      name: 'BOSS',
      particleCount: 100,
      shockwaveScale: 15,
      duration: 2500,
      wreckagePieces: 8,
      wreckageScale: [1.5, 0.8, 2.0],
      cameraShake: 1.0,
      lightIntensity: 50,
      lightDistance: 60,
      chainExplosions: true,
      chainCount: 5,
      chainDelay: 200,
    },
  },

  // Wreckage Physics
  WRECKAGE: {
    GRAVITY: 15,
    ROTATION_SPEED: { min: 2, max: 8 },
    INITIAL_VELOCITY: { min: 3, max: 8 },
    SPREAD_ANGLE: Math.PI / 6,
    SMOKE_EMIT_RATE: 0.03,
    SMOKE_PARTICLE_COUNT: 30,
    GROUND_Y: -5,
    SECONDARY_EXPLOSION_SCALE: 0.4,
  },

  // Particle System
  PARTICLES: {
    LIFETIME: { min: 0.3, max: 1.2 },
    SPEED: { min: 8, max: 25 },
    SIZE: { min: 0.1, max: 0.6 },
    COLORS: {
      CORE: ['#ffffff', '#ffffa0', '#ffff00'],
      FIRE: ['#ff8800', '#ff4400', '#ff2200'],
      SMOKE: ['#444444', '#333333', '#222222', '#111111'],
      SPARK: ['#ffff88', '#ffaa44', '#ff6600'],
    },
  },

  // Shockwave
  SHOCKWAVE: {
    DURATION: 400,
    MAX_OPACITY: 0.8,
    RING_COUNT: 2,
  },

  // Screen Effects
  SCREEN_FLASH: {
    DURATION: 150,
    INTENSITY: 0.8,
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const randomRange = (min, max) => Math.random() * (max - min) + min;
const randomSpread = (spread) => (Math.random() - 0.5) * 2 * spread;

const createRandomDirection = (forwardVector, spreadAngle) => {
  const dir = forwardVector.clone().normalize();
  const perpX = new Vector3(1, 0, 0).cross(dir).normalize();
  const perpY = dir.clone().cross(perpX).normalize();
  
  const angleX = randomSpread(spreadAngle);
  const angleY = randomSpread(spreadAngle);
  
  return dir
    .add(perpX.multiplyScalar(Math.sin(angleX)))
    .add(perpY.multiplyScalar(Math.sin(angleY)))
    .normalize();
};

// ============================================================================
// EXPLOSION PARTICLE COMPONENT
// ============================================================================
function ExplosionParticle({ 
  startPosition, 
  direction, 
  speed, 
  size, 
  color, 
  lifetime,
  type = 'fire',
  onComplete 
}) {
  const meshRef = useRef();
  const startTime = useRef(Date.now());
  const velocity = useRef(direction.clone().multiplyScalar(speed));
  
  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    const elapsed = (Date.now() - startTime.current) / 1000;
    const progress = elapsed / lifetime;
    
    if (progress >= 1) {
      onComplete?.();
      return;
    }
    
    // Update position
    meshRef.current.position.add(velocity.current.clone().multiplyScalar(delta));
    
    // Apply drag and gravity based on type
    if (type === 'fire') {
      velocity.current.multiplyScalar(0.96);
      velocity.current.y += delta * 2; // Fire rises
    } else if (type === 'spark') {
      velocity.current.multiplyScalar(0.98);
      velocity.current.y -= delta * 15; // Sparks fall
    } else if (type === 'smoke') {
      velocity.current.multiplyScalar(0.92);
      velocity.current.y += delta * 1; // Smoke rises slowly
    }
    
    // Scale down and fade
    const scale = size * (1 - progress * 0.7);
    meshRef.current.scale.setScalar(Math.max(0.01, scale));
    
    if (meshRef.current.material) {
      meshRef.current.material.opacity = Math.max(0, 1 - progress);
    }
  });

  const isSmoke = type === 'smoke';
  
  return (
    <mesh ref={meshRef} position={startPosition}>
      {isSmoke ? (
        <icosahedronGeometry args={[size, 0]} />
      ) : (
        <sphereGeometry args={[size, 6, 6]} />
      )}
      <meshBasicMaterial 
        color={color} 
        transparent 
        opacity={1}
        blending={isSmoke ? NormalBlending : AdditiveBlending}
        depthWrite={!isSmoke}
      />
    </mesh>
  );
}

// ============================================================================
// SHOCKWAVE RING COMPONENT
// ============================================================================
function ShockwaveRing({ position, maxScale, duration, delay = 0, onComplete }) {
  const meshRef = useRef();
  const startTime = useRef(null);
  const [active, setActive] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      startTime.current = Date.now();
      setActive(true);
    }, delay);
    return () => clearTimeout(timer);
  }, [delay]);
  
  useFrame(() => {
    if (!meshRef.current || !active || !startTime.current) return;
    
    const elapsed = Date.now() - startTime.current;
    const progress = elapsed / duration;
    
    if (progress >= 1) {
      onComplete?.();
      return;
    }
    
    // Expand ring
    const scale = MathUtils.lerp(0.1, maxScale, easeOutQuad(progress));
    meshRef.current.scale.set(scale, scale, 1);
    
    // Fade out
    const opacity = EXPLOSION_CONFIG.SHOCKWAVE.MAX_OPACITY * (1 - easeInQuad(progress));
    meshRef.current.material.opacity = opacity;
  });

  if (!active) return null;

  return (
    <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.8, 1, 32]} />
      <meshBasicMaterial 
        color="#ffaa44"
        transparent
        opacity={EXPLOSION_CONFIG.SHOCKWAVE.MAX_OPACITY}
        side={DoubleSide}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

// Easing functions
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
const easeInQuad = (t) => t * t;
const easeOutExpo = (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);

// ============================================================================
// EXPLOSION FLASH (CORE BURST)
// ============================================================================
function ExplosionFlash({ position, scale, duration, onComplete }) {
  const meshRef = useRef();
  const lightRef = useRef();
  const startTime = useRef(Date.now());
  
  useFrame(() => {
    if (!meshRef.current) return;
    
    const elapsed = Date.now() - startTime.current;
    const progress = elapsed / duration;
    
    if (progress >= 1) {
      onComplete?.();
      return;
    }
    
    // Rapid expansion then fade
    const expansionProgress = Math.min(progress * 4, 1);
    const currentScale = scale * easeOutExpo(expansionProgress);
    meshRef.current.scale.setScalar(currentScale);
    
    // Fade
    const opacity = 1 - easeInQuad(progress);
    meshRef.current.material.opacity = opacity;
    
    // Light fade
    if (lightRef.current) {
      lightRef.current.intensity = 30 * (1 - progress);
    }
  });

  return (
    <group position={position}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial 
          color="#ffffff"
          transparent
          opacity={1}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <pointLight 
        ref={lightRef}
        color="#ffaa44"
        intensity={30}
        distance={scale * 10}
      />
    </group>
  );
}

// ============================================================================
// SMOKE TRAIL PARTICLE
// ============================================================================
function SmokeParticle({ position, velocity, size, onComplete }) {
  const meshRef = useRef();
  const startTime = useRef(Date.now());
  const lifetime = randomRange(0.8, 1.5);
  const vel = useRef(velocity.clone());
  const currentSize = useRef(size);
  
  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    const elapsed = (Date.now() - startTime.current) / 1000;
    const progress = elapsed / lifetime;
    
    if (progress >= 1) {
      onComplete?.();
      return;
    }
    
    // Move and slow down
    meshRef.current.position.add(vel.current.clone().multiplyScalar(delta));
    vel.current.multiplyScalar(0.95);
    vel.current.y += delta * 0.8; // Rise slowly
    
    // Grow then shrink
    const growPhase = Math.min(progress * 3, 1);
    const shrinkPhase = Math.max(0, (progress - 0.5) * 2);
    const scale = size * (1 + growPhase * 0.5) * (1 - shrinkPhase * 0.8);
    meshRef.current.scale.setScalar(Math.max(0.01, scale));
    
    // Fade
    meshRef.current.material.opacity = 0.6 * (1 - progress);
  });

  const colorIndex = Math.floor(Math.random() * EXPLOSION_CONFIG.PARTICLES.COLORS.SMOKE.length);
  
  return (
    <mesh ref={meshRef} position={position}>
      <icosahedronGeometry args={[size, 0]} />
      <meshBasicMaterial 
        color={EXPLOSION_CONFIG.PARTICLES.COLORS.SMOKE[colorIndex]}
        transparent
        opacity={0.6}
      />
    </mesh>
  );
}

// ============================================================================
// FALLING WRECKAGE COMPONENT
// ============================================================================
function FallingWreckage({ 
  startPosition, 
  forwardVector, 
  scale = [0.6, 0.35, 0.9],
  onGroundHit,
  groundY = EXPLOSION_CONFIG.WRECKAGE.GROUND_Y 
}) {
  const groupRef = useRef();
  const [smokeParticles, setSmokeParticles] = useState([]);
  const [hasLanded, setHasLanded] = useState(false);
  
  const physics = useRef({
    velocity: createRandomDirection(forwardVector, EXPLOSION_CONFIG.WRECKAGE.SPREAD_ANGLE)
      .multiplyScalar(randomRange(
        EXPLOSION_CONFIG.WRECKAGE.INITIAL_VELOCITY.min,
        EXPLOSION_CONFIG.WRECKAGE.INITIAL_VELOCITY.max
      )),
    rotationSpeed: new Vector3(
      randomRange(EXPLOSION_CONFIG.WRECKAGE.ROTATION_SPEED.min, EXPLOSION_CONFIG.WRECKAGE.ROTATION_SPEED.max),
      randomRange(EXPLOSION_CONFIG.WRECKAGE.ROTATION_SPEED.min, EXPLOSION_CONFIG.WRECKAGE.ROTATION_SPEED.max),
      randomRange(EXPLOSION_CONFIG.WRECKAGE.ROTATION_SPEED.min, EXPLOSION_CONFIG.WRECKAGE.ROTATION_SPEED.max)
    ),
    lastSmokeTime: 0,
  });

  const removeSmoke = useCallback((id) => {
    setSmokeParticles(prev => prev.filter(p => p.id !== id));
  }, []);

  useFrame((state, delta) => {
    if (!groupRef.current || hasLanded) return;
    
    const phys = physics.current;
    
    // Apply gravity
    phys.velocity.y -= EXPLOSION_CONFIG.WRECKAGE.GRAVITY * delta;
    
    // Update position
    groupRef.current.position.add(phys.velocity.clone().multiplyScalar(delta));
    
    // Update rotation
    groupRef.current.rotation.x += phys.rotationSpeed.x * delta;
    groupRef.current.rotation.y += phys.rotationSpeed.y * delta;
    groupRef.current.rotation.z += phys.rotationSpeed.z * delta;
    
    // Emit smoke trail
    const now = Date.now();
    if (now - phys.lastSmokeTime > EXPLOSION_CONFIG.WRECKAGE.SMOKE_EMIT_RATE * 1000) {
      phys.lastSmokeTime = now;
      
      const smokeVel = new Vector3(
        randomSpread(1),
        randomRange(0.5, 1.5),
        randomSpread(1)
      );
      
      setSmokeParticles(prev => [...prev, {
        id: now + Math.random(),
        position: groupRef.current.position.clone(),
        velocity: smokeVel,
        size: randomRange(0.3, 0.6),
      }]);
    }
    
    // Check ground collision
    if (groupRef.current.position.y <= groundY) {
      setHasLanded(true);
      onGroundHit?.(groupRef.current.position.clone());
    }
  });

  if (hasLanded) {
    return (
      <>
        {smokeParticles.map(smoke => (
          <SmokeParticle
            key={smoke.id}
            position={smoke.position}
            velocity={smoke.velocity}
            size={smoke.size}
            onComplete={() => removeSmoke(smoke.id)}
          />
        ))}
      </>
    );
  }

  return (
    <>
      <group ref={groupRef} position={startPosition}>
        <mesh>
          <boxGeometry args={scale} />
          <meshStandardMaterial 
            color="#1a1a1a"
            metalness={0.8}
            roughness={0.3}
            emissive="#110800"
            emissiveIntensity={0.5}
          />
        </mesh>
        {/* Glowing hot spots */}
        <mesh position={[scale[0] * 0.3, 0, 0]}>
          <sphereGeometry args={[scale[1] * 0.3, 4, 4]} />
          <meshBasicMaterial color="#ff4400" transparent opacity={0.8} />
        </mesh>
        {/* Trailing ember */}
        <pointLight color="#ff4400" intensity={3} distance={5} />
      </group>
      
      {smokeParticles.map(smoke => (
        <SmokeParticle
          key={smoke.id}
          position={smoke.position}
          velocity={smoke.velocity}
          size={smoke.size}
          onComplete={() => removeSmoke(smoke.id)}
        />
      ))}
    </>
  );
}

// ============================================================================
// MAIN EXPLOSION COMPONENT
// ============================================================================
function Explosion({ 
  position, 
  forwardVector = new Vector3(0, 0, -1),
  explosionClass = 'MEDIUM',
  onComplete,
  showWreckage = true,
  groundY = EXPLOSION_CONFIG.WRECKAGE.GROUND_Y,
}) {
  const config = EXPLOSION_CONFIG.CLASSES[explosionClass] || EXPLOSION_CONFIG.CLASSES.MEDIUM;
  
  const [particles, setParticles] = useState([]);
  const [shockwaves, setShockwaves] = useState([]);
  const [wreckage, setWreckage] = useState([]);
  const [flash, setFlash] = useState(true);
  const [secondaryExplosions, setSecondaryExplosions] = useState([]);
  const [chainExplosions, setChainExplosions] = useState([]);
  const [isComplete, setIsComplete] = useState(false);
  
  const startTime = useRef(Date.now());
  const particleIdCounter = useRef(0);
  
  // Initialize explosion
  useEffect(() => {
    // Create particles
    const newParticles = [];
    const colors = EXPLOSION_CONFIG.PARTICLES.COLORS;
    
    for (let i = 0; i < config.particleCount; i++) {
      const type = i < config.particleCount * 0.2 ? 'core' :
                   i < config.particleCount * 0.6 ? 'fire' :
                   i < config.particleCount * 0.8 ? 'spark' : 'smoke';
      
      const colorSet = type === 'core' ? colors.CORE :
                       type === 'fire' ? colors.FIRE :
                       type === 'spark' ? colors.SPARK : colors.SMOKE;
      
      const dir = new Vector3(
        randomSpread(1),
        randomSpread(1),
        randomSpread(1)
      ).normalize();
      
      newParticles.push({
        id: particleIdCounter.current++,
        direction: dir,
        speed: randomRange(
          EXPLOSION_CONFIG.PARTICLES.SPEED.min,
          EXPLOSION_CONFIG.PARTICLES.SPEED.max
        ) * (type === 'core' ? 1.5 : type === 'smoke' ? 0.3 : 1),
        size: randomRange(
          EXPLOSION_CONFIG.PARTICLES.SIZE.min,
          EXPLOSION_CONFIG.PARTICLES.SIZE.max
        ) * (type === 'core' ? 0.5 : type === 'smoke' ? 2 : 1),
        color: colorSet[Math.floor(Math.random() * colorSet.length)],
        lifetime: randomRange(
          EXPLOSION_CONFIG.PARTICLES.LIFETIME.min,
          EXPLOSION_CONFIG.PARTICLES.LIFETIME.max
        ) * (type === 'smoke' ? 2 : 1),
        type,
      });
    }
    setParticles(newParticles);
    
    // Create shockwaves
    const newShockwaves = [];
    for (let i = 0; i < EXPLOSION_CONFIG.SHOCKWAVE.RING_COUNT; i++) {
      newShockwaves.push({
        id: i,
        delay: i * 80,
        scale: config.shockwaveScale * (1 - i * 0.2),
      });
    }
    setShockwaves(newShockwaves);
    
    // Create wreckage
    if (showWreckage) {
      const newWreckage = [];
      for (let i = 0; i < config.wreckagePieces; i++) {
        const scaleVariation = 0.3;
        newWreckage.push({
          id: i,
          scale: config.wreckageScale.map(s => 
            s * randomRange(1 - scaleVariation, 1 + scaleVariation)
          ),
        });
      }
      setWreckage(newWreckage);
    }
    
    // Boss chain explosions
    if (config.chainExplosions) {
      const chains = [];
      for (let i = 0; i < config.chainCount; i++) {
        chains.push({
          id: i,
          delay: (i + 1) * config.chainDelay,
          offset: new Vector3(
            randomSpread(3),
            randomSpread(2),
            randomSpread(3)
          ),
        });
      }
      setChainExplosions(chains);
    }
  }, [config, showWreckage]);
  
  // Check completion
  useFrame(() => {
    const elapsed = Date.now() - startTime.current;
    if (elapsed > config.duration + 3000 && !isComplete) {
      setIsComplete(true);
      onComplete?.();
    }
  });
  
  const removeParticle = useCallback((id) => {
    setParticles(prev => prev.filter(p => p.id !== id));
  }, []);
  
  const removeShockwave = useCallback((id) => {
    setShockwaves(prev => prev.filter(s => s.id !== id));
  }, []);
  
  const handleWreckageGroundHit = useCallback((hitPosition) => {
    // Trigger secondary explosion
    setSecondaryExplosions(prev => [...prev, {
      id: Date.now() + Math.random(),
      position: hitPosition,
    }]);
  }, []);

  if (isComplete) return null;

  return (
    <group position={position}>
      {/* Central flash */}
      {flash && (
        <ExplosionFlash
          position={[0, 0, 0]}
          scale={config.shockwaveScale * 0.5}
          duration={200}
          onComplete={() => setFlash(false)}
        />
      )}
      
      {/* Particles */}
      {particles.map(particle => (
        <ExplosionParticle
          key={particle.id}
          startPosition={[0, 0, 0]}
          direction={particle.direction}
          speed={particle.speed}
          size={particle.size}
          color={particle.color}
          lifetime={particle.lifetime}
          type={particle.type}
          onComplete={() => removeParticle(particle.id)}
        />
      ))}
      
      {/* Shockwaves */}
      {shockwaves.map(wave => (
        <ShockwaveRing
          key={wave.id}
          position={[0, 0, 0]}
          maxScale={wave.scale}
          duration={EXPLOSION_CONFIG.SHOCKWAVE.DURATION}
          delay={wave.delay}
          onComplete={() => removeShockwave(wave.id)}
        />
      ))}
      
      {/* Falling wreckage */}
      {wreckage.map(piece => (
        <FallingWreckage
          key={piece.id}
          startPosition={new Vector3(0, 0, 0)}
          forwardVector={forwardVector}
          scale={piece.scale}
          groundY={groundY}
          onGroundHit={handleWreckageGroundHit}
        />
      ))}
      
      {/* Chain explosions for bosses */}
      {chainExplosions.map(chain => (
        <DelayedExplosion
          key={chain.id}
          position={chain.offset}
          delay={chain.delay}
          explosionClass="SMALL"
          showWreckage={false}
        />
      ))}
      
      {/* Secondary ground explosions */}
      {secondaryExplosions.map(exp => (
        <Explosion
          key={exp.id}
          position={exp.position.toArray()}
          explosionClass="SMALL"
          showWreckage={false}
          onComplete={() => {
            setSecondaryExplosions(prev => prev.filter(e => e.id !== exp.id));
          }}
        />
      ))}
    </group>
  );
}

// ============================================================================
// DELAYED EXPLOSION (FOR CHAIN EFFECTS)
// ============================================================================
function DelayedExplosion({ position, delay, explosionClass, showWreckage }) {
  const [triggered, setTriggered] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => setTriggered(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  
  if (!triggered) return null;
  
  return (
    <Explosion
      position={position instanceof Vector3 ? position.toArray() : position}
      explosionClass={explosionClass}
      showWreckage={showWreckage}
    />
  );
}

// ============================================================================
// EXPLOSION MANAGER HOOK
// ============================================================================
function useExplosionManager() {
  const [explosions, setExplosions] = useState([]);
  const explosionIdRef = useRef(0);
  
  const triggerExplosion = useCallback(({
    position,
    forwardVector = new Vector3(0, 0, -1),
    explosionClass = 'MEDIUM',
    showWreckage = true,
    groundY = EXPLOSION_CONFIG.WRECKAGE.GROUND_Y,
  }) => {
    const id = explosionIdRef.current++;
    
    setExplosions(prev => [...prev, {
      id,
      position: position instanceof Vector3 ? position.clone() : new Vector3(...position),
      forwardVector: forwardVector instanceof Vector3 ? forwardVector.clone() : new Vector3(...forwardVector),
      explosionClass,
      showWreckage,
      groundY,
    }]);
    
    return id;
  }, []);
  
  const removeExplosion = useCallback((id) => {
    setExplosions(prev => prev.filter(e => e.id !== id));
  }, []);
  
  const clearAllExplosions = useCallback(() => {
    setExplosions([]);
  }, []);
  
  return {
    explosions,
    triggerExplosion,
    removeExplosion,
    clearAllExplosions,
  };
}

// ============================================================================
// EXPLOSION RENDERER COMPONENT
// ============================================================================
function ExplosionRenderer({ explosions, onExplosionComplete }) {
  return (
    <>
      {explosions.map(explosion => (
        <Explosion
          key={explosion.id}
          position={explosion.position.toArray()}
          forwardVector={explosion.forwardVector}
          explosionClass={explosion.explosionClass}
          showWreckage={explosion.showWreckage}
          groundY={explosion.groundY}
          onComplete={() => onExplosionComplete?.(explosion.id)}
        />
      ))}
    </>
  );
}

// ============================================================================
// CAMERA SHAKE COMPONENT
// ============================================================================
function CameraShake({ intensity = 0, duration = 300 }) {
  const { camera } = useThree();
  const startTime = useRef(null);
  const originalPosition = useRef(null);
  
  useEffect(() => {
    if (intensity > 0) {
      startTime.current = Date.now();
      originalPosition.current = camera.position.clone();
    }
  }, [intensity, camera]);
  
  useFrame(() => {
    if (!startTime.current || !originalPosition.current) return;
    
    const elapsed = Date.now() - startTime.current;
    const progress = elapsed / duration;
    
    if (progress >= 1) {
      camera.position.copy(originalPosition.current);
      startTime.current = null;
      return;
    }
    
    const shake = intensity * (1 - progress);
    camera.position.x = originalPosition.current.x + randomSpread(shake);
    camera.position.y = originalPosition.current.y + randomSpread(shake);
  });
  
  return null;
}

// ============================================================================
// PLACEHOLDER ENEMY FOR TESTING
// ============================================================================
function TestEnemy({ position, onDestroy }) {
  const meshRef = useRef();
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.01;
    }
  });
  
  return (
    <group position={position} onClick={onDestroy}>
      <mesh ref={meshRef}>
        <boxGeometry args={[2, 1, 3]} />
        <meshStandardMaterial color="#ff4444" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial color="#44ff44" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ============================================================================
// DEMO SCENE COMPONENT
// ============================================================================
function DemoScene({ explosionTrigger, explosionClass, showWreckage }) {
  const { triggerExplosion, explosions, removeExplosion } = useExplosionManager();
  const [cameraShakeIntensity, setCameraShakeIntensity] = useState(0);
  const [enemy, setEnemy] = useState({ visible: true, position: new Vector3(0, 0, -15) });
  
  // Handle external trigger
  useEffect(() => {
    if (explosionTrigger > 0) {
      const config = EXPLOSION_CONFIG.CLASSES[explosionClass];
      
      triggerExplosion({
        position: enemy.position.clone(),
        forwardVector: new Vector3(0, 0.2, 1),
        explosionClass,
        showWreckage,
      });
      
      setEnemy(prev => ({ ...prev, visible: false }));
      setCameraShakeIntensity(config?.cameraShake || 0.25);
      
      // Respawn enemy after delay
      setTimeout(() => {
        setEnemy({ visible: true, position: new Vector3(0, 0, -15) });
        setCameraShakeIntensity(0);
      }, config?.duration + 2000 || 3000);
    }
  }, [explosionTrigger, explosionClass, showWreckage, enemy.position, triggerExplosion]);
  
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 20, 10]} intensity={0.8} />
      <pointLight position={[0, 5, -10]} intensity={0.5} color="#4488ff" />
      
      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, EXPLOSION_CONFIG.WRECKAGE.GROUND_Y, 0]}>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#1a1a2a" metalness={0.2} roughness={0.8} />
      </mesh>
      
      {/* Grid helper */}
      <gridHelper 
        args={[50, 50, '#333355', '#222244']} 
        position={[0, EXPLOSION_CONFIG.WRECKAGE.GROUND_Y + 0.01, 0]} 
      />
      
      {/* Sky gradient background mesh */}
      <mesh position={[0, 0, -50]}>
        <planeGeometry args={[200, 100]} />
        <meshBasicMaterial color="#0a0a1a" />
      </mesh>
      
      {/* Enemy */}
      {enemy.visible && (
        <TestEnemy 
          position={enemy.position.toArray()} 
          onDestroy={() => {}}
        />
      )}
      
      {/* Explosions */}
      <ExplosionRenderer 
        explosions={explosions}
        onExplosionComplete={removeExplosion}
      />
      
      {/* Camera shake */}
      <CameraShake intensity={cameraShakeIntensity} duration={500} />
    </>
  );
}

// ============================================================================
// MAIN EXPORT COMPONENT
// ============================================================================
export default function ExplosionEngine() {
  const [trigger, setTrigger] = useState(0);
  const [explosionClass, setExplosionClass] = useState('MEDIUM');
  const [showWreckage, setShowWreckage] = useState(true);
  
  return (
    <div style={{ width: '100%', height: '100vh', background: '#000011' }}>
      <Canvas
        camera={{ position: [0, 8, 20], fov: 60 }}
        gl={{ antialias: true }}
      >
        <fog attach="fog" args={['#0a0a1a', 30, 80]} />
        <DemoScene 
          explosionTrigger={trigger}
          explosionClass={explosionClass}
          showWreckage={showWreckage}
        />
      </Canvas>
      
      {/* Control Panel */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        background: 'rgba(0,0,0,0.8)',
        padding: 20,
        borderRadius: 8,
        color: '#00ff88',
        fontFamily: 'monospace',
      }}>
        <div style={{ marginBottom: 10 }}>
          <label>Explosion Class: </label>
          <select 
            value={explosionClass}
            onChange={(e) => setExplosionClass(e.target.value)}
            style={{ background: '#1a1a2a', color: '#00ff88', border: '1px solid #00ff88', padding: 5 }}
          >
            {Object.keys(EXPLOSION_CONFIG.CLASSES).map(cls => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label>
            <input 
              type="checkbox" 
              checked={showWreckage}
              onChange={(e) => setShowWreckage(e.target.checked)}
            />
            {' '}Show Wreckage
          </label>
        </div>
        <button
          onClick={() => setTrigger(t => t + 1)}
          style={{
            background: '#ff4400',
            color: 'white',
            border: 'none',
            padding: '10px 30px',
            fontSize: 16,
            cursor: 'pointer',
            borderRadius: 4,
          }}
        >
          TRIGGER EXPLOSION
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// NAMED EXPORTS FOR INTEGRATION
// ============================================================================
export {
  Explosion,
  ExplosionRenderer,
  FallingWreckage,
  ShockwaveRing,
  ExplosionFlash,
  ExplosionParticle,
  SmokeParticle,
  CameraShake,
  useExplosionManager,
  EXPLOSION_CONFIG,
};
