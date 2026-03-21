/**
 * Adam-3D-spaceship-controller.jsx
 * Eve Online–style deadspace pocket: orbit camera, newtonian flight,
 * double-click heading, speed throttle, GLB support, space skybox.
 *
 * Dependencies (CDN or npm):
 *   three ^0.165
 *   @react-three/fiber ^8
 *   @react-three/drei ^9
 *   react / react-dom ^18
 *
 * Props:
 *   glbUrl       {string}  optional – URL to a .glb model (default: diamond)
 *   onTelemetry  {fn}      optional – called each frame with telemetry object
 */

import React, {
  useRef, useState, useEffect, useCallback, useMemo, Suspense,
} from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  OrbitControls, Stars, useGLTF, Html,
} from '@react-three/drei';

// ─── Constants ───────────────────────────────────────────────────────────────
const SPEED_LEVELS  = [0, 0.25, 0.5, 0.75, 1.0];   // multipliers
const MAX_SPEED     = 28;                             // units / s at full throttle
const ACCEL_RATE    = 4.5;                            // units / s²
const DECEL_RATE    = 3.0;                            // units / s²
const TURN_RATE     = 1.4;                            // rad / s  (yaw + pitch blend)
const SKYBOX_RADIUS = 900;

// ─── Utility ─────────────────────────────────────────────────────────────────
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Build a procedural star-field cube-map texture (no file needed)
function buildStarfieldCubemap(renderer) {
  const size  = 512;
  const faces = [];
  for (let f = 0; f < 6; f++) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    // Deep space gradient
    const grd = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/1.4);
    grd.addColorStop(0,   '#060a14');
    grd.addColorStop(0.6, '#030608');
    grd.addColorStop(1,   '#010205');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    // Stars
    const rng = (() => { let s = f * 9301 + 49297; return () => { s=(s*9301+49297)%233280; return s/233280; }; })();
    for (let i = 0; i < 320; i++) {
      const x = rng() * size, y = rng() * size;
      const r = rng() * 1.4 + 0.3;
      const bright = rng();
      let color;
      if (bright > 0.93)      color = `rgba(180,220,255,${0.7+rng()*0.3})`;
      else if (bright > 0.85) color = `rgba(255,210,160,${0.5+rng()*0.3})`;
      else                     color = `rgba(200,220,255,${0.2+rng()*0.5})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    // Nebula wisps (subtle)
    for (let n = 0; n < 3; n++) {
      const gx = rng()*size, gy = rng()*size;
      const ng = ctx.createRadialGradient(gx,gy,0,gx,gy,80+rng()*120);
      const hue = [220,180,260,200][Math.floor(rng()*4)];
      ng.addColorStop(0,   `hsla(${hue},60%,30%,0.06)`);
      ng.addColorStop(1,   'transparent');
      ctx.fillStyle = ng;
      ctx.fillRect(0,0,size,size);
    }
    const tex = new THREE.CanvasTexture(canvas);
    faces.push(tex.image);
    tex.dispose();
  }
  const cubeMap = new THREE.CubeTexture(faces);
  cubeMap.needsUpdate = true;
  return cubeMap;
}

// ─── Default diamond ship ─────────────────────────────────────────────────────
function DiamondShip() {
  const bodyRef = useRef();
  useFrame(({ clock }) => {
    if (bodyRef.current) {
      // Gentle idle bobbing
      bodyRef.current.rotation.z = Math.sin(clock.elapsedTime * 0.7) * 0.03;
    }
  });
  return (
    <group ref={bodyRef}>
      {/* Main hull – elongated octahedron */}
      <mesh castShadow>
        <octahedronGeometry args={[1.5, 0]} />
        <meshStandardMaterial
          color="#1a2840"
          metalness={0.95}
          roughness={0.15}
          emissive="#0a1525"
          emissiveIntensity={0.3}
        />
      </mesh>
      {/* Fore spike */}
      <mesh position={[0, 0, 2.2]} rotation={[Math.PI/2, 0, 0]}>
        <coneGeometry args={[0.35, 1.5, 6]} />
        <meshStandardMaterial color="#0d1e35" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Aft spike */}
      <mesh position={[0, 0, -2.2]} rotation={[-Math.PI/2, 0, 0]}>
        <coneGeometry args={[0.35, 1.5, 6]} />
        <meshStandardMaterial color="#0d1e35" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Wing panels */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 1.8, 0, 0]} rotation={[0, 0, side * 0.4]}>
          <boxGeometry args={[1.4, 0.08, 0.9]} />
          <meshStandardMaterial color="#112030" metalness={0.95} roughness={0.1}
            emissive="#0a2040" emissiveIntensity={0.4} />
        </mesh>
      ))}
      {/* Engine glow */}
      <pointLight position={[0, 0, -1.8]} color="#4488ff" intensity={2} distance={6} />
      <mesh position={[0, 0, -2.4]}>
        <sphereGeometry args={[0.22, 12, 8]} />
        <meshStandardMaterial color="#2255cc" emissive="#3366ff" emissiveIntensity={3}
          transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

// ─── GLB ship ────────────────────────────────────────────────────────────────
function GlbShip({ url }) {
  const { scene } = useGLTF(url);
  const clone = useMemo(() => scene.clone(), [scene]);
  return <primitive object={clone} />;
}

// ─── Engine exhaust particles ─────────────────────────────────────────────────
function EngineExhaust({ speed, targetSpeed }) {
  const ref       = useRef();
  const countMax  = 120;
  const positions = useMemo(() => new Float32Array(countMax * 3), []);
  const alphas    = useMemo(() => new Float32Array(countMax), []);
  const particles = useRef([]);

  // Initialise pool
  useEffect(() => {
    particles.current = Array.from({ length: countMax }, () => ({
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 0,
    }));
  }, []);

  useFrame((_, dt) => {
    if (!ref.current) return;
    const intensity = Math.max(0, speed / MAX_SPEED);
    // Spawn
    const spawnCount = Math.floor(intensity * 4);
    let spawned = 0;
    for (const p of particles.current) {
      if (p.life <= 0 && spawned < spawnCount) {
        p.pos.set(
          (Math.random()-0.5)*0.3,
          (Math.random()-0.5)*0.3,
          -2.0 - Math.random()*0.5,
        );
        const spread = 0.4 + (1 - intensity) * 0.8;
        p.vel.set(
          (Math.random()-0.5)*spread*0.5,
          (Math.random()-0.5)*spread*0.5,
          -(2 + Math.random()*3) * intensity,
        );
        p.maxLife = p.life = 0.4 + Math.random()*0.5;
        spawned++;
      }
    }
    // Update
    let i = 0;
    for (const p of particles.current) {
      if (p.life > 0) {
        p.life -= dt;
        p.pos.addScaledVector(p.vel, dt);
        positions[i*3]   = p.pos.x;
        positions[i*3+1] = p.pos.y;
        positions[i*3+2] = p.pos.z;
        alphas[i]         = Math.max(0, p.life / p.maxLife);
      } else {
        positions[i*3]   = 0;
        positions[i*3+1] = 0;
        positions[i*3+2] = -999;
        alphas[i]         = 0;
      }
      i++;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#5599ff"
        size={0.18}
        transparent
        opacity={0.7}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ─── Target reticle ───────────────────────────────────────────────────────────
function TargetReticle({ position }) {
  const ref   = useRef();
  const angle = useRef(0);
  useFrame((_, dt) => {
    if (ref.current) {
      angle.current += dt * 0.8;
      ref.current.rotation.z = angle.current;
    }
  });
  return (
    <group position={position} ref={ref}>
      {[0, Math.PI/2, Math.PI, Math.PI*1.5].map((r, i) => (
        <mesh key={i} rotation={[0, 0, r]} position={[0.6, 0.6, 0]}>
          <planeGeometry args={[0.35, 0.06]} />
          <meshBasicMaterial color="#00ccff" transparent opacity={0.8}
            depthTest={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Scene: ship + physics + camera ──────────────────────────────────────────
function ShipScene({ glbUrl, throttleIndex, onTelemetry }) {
  const { gl, scene, camera } = useThree();

  // Ship state
  const shipPos      = useRef(new THREE.Vector3(0, 0, 0));
  const shipFwd      = useRef(new THREE.Vector3(0, 0, 1));   // current heading
  const targetFwd    = useRef(new THREE.Vector3(0, 0, 1));   // desired heading
  const currentSpeed = useRef(0);
  const shipGroup    = useRef();
  const orbitRef     = useRef();
  const targetPt     = useRef(null);    // double-click world position
  const raycaster    = new THREE.Raycaster();

  // Skybox (procedural, locked to scene)
  useEffect(() => {
    const cubemap   = buildStarfieldCubemap(gl);
    scene.background = cubemap;
    return () => { cubemap.dispose(); scene.background = null; };
  }, [gl, scene]);

  // Double-click → set new heading
  useEffect(() => {
    const canvas = gl.domElement;
    const onDbl  = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x    = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      const y    = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      raycaster.setFromCamera({ x, y }, camera);
      // Target point 200 units along ray from ship
      const dir = raycaster.ray.direction.clone().normalize();
      const pt  = shipPos.current.clone().addScaledVector(dir, 200);
      targetPt.current = pt;
      // Compute direction from ship to point, projected to flat if needed
      const toTarget = pt.clone().sub(shipPos.current).normalize();
      targetFwd.current.copy(toTarget);
    };
    canvas.addEventListener('dblclick', onDbl);
    return () => canvas.removeEventListener('dblclick', onDbl);
  }, [gl, camera]);

  // Per-frame physics + camera
  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05); // cap for tab-switch spikes

    const targetSpeed = MAX_SPEED * SPEED_LEVELS[throttleIndex];

    // Newtonian acceleration / deceleration
    if (currentSpeed.current < targetSpeed) {
      currentSpeed.current = Math.min(targetSpeed, currentSpeed.current + ACCEL_RATE * dt);
    } else if (currentSpeed.current > targetSpeed) {
      currentSpeed.current = Math.max(targetSpeed, currentSpeed.current - DECEL_RATE * dt);
    }

    // Smooth heading interpolation (slerp)
    if (currentSpeed.current > 0.01) {
      const q      = new THREE.Quaternion().setFromUnitVectors(shipFwd.current, targetFwd.current);
      const axis   = new THREE.Vector3();
      const fAngle = q.angleTo(new THREE.Quaternion());
      if (fAngle > 0.001) {
        const step = Math.min(1, (TURN_RATE * dt) / Math.max(0.001, fAngle));
        shipFwd.current.applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(shipFwd.current, targetFwd.current)
            .slerp(new THREE.Quaternion(), 1 - step)
        );
        shipFwd.current.normalize();
      }
    }

    // Move ship
    shipPos.current.addScaledVector(shipFwd.current, currentSpeed.current * dt);

    // Update mesh
    if (shipGroup.current) {
      shipGroup.current.position.copy(shipPos.current);
      if (currentSpeed.current > 0.05) {
        const look = new THREE.Matrix4().lookAt(
          new THREE.Vector3(0,0,0), shipFwd.current, new THREE.Vector3(0,1,0)
        );
        const qRot = new THREE.Quaternion().setFromRotationMatrix(look);
        // banking
        const cross = new THREE.Vector3().crossVectors(
          new THREE.Vector3(0,0,1).applyQuaternion(shipGroup.current.quaternion),
          shipFwd.current
        );
        const bankQ = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0,0,1).applyQuaternion(qRot),
          cross.y * 0.4
        );
        shipGroup.current.quaternion.slerp(bankQ.multiply(qRot), 0.06);
      }
    }

    // Lock skybox to ship (move scene background implicitly; camera follows)
    // OrbitControls target tracks ship
    if (orbitRef.current) {
      orbitRef.current.target.lerp(shipPos.current, 0.12);
      orbitRef.current.update();
    }

    // Dismiss target reticle when close
    if (targetPt.current) {
      const dist = shipPos.current.distanceTo(targetPt.current);
      if (dist < 5) targetPt.current = null;
    }

    // Telemetry callback
    onTelemetry?.({
      speed:  currentSpeed.current,
      targetSpeed,
      heading: { x: +shipFwd.current.x.toFixed(3), y: +shipFwd.current.y.toFixed(3), z: +shipFwd.current.z.toFixed(3) },
      position: { x: +shipPos.current.x.toFixed(1), y: +shipPos.current.y.toFixed(1), z: +shipPos.current.z.toFixed(1) },
      throttleLabel: ['STOP','¼ SPEED','½ SPEED','¾ SPEED','FULL'][throttleIndex],
    });
  });

  const [tgt, setTgt] = useState(null);
  useFrame(() => {
    if (targetPt.current) setTgt(targetPt.current.clone());
    else setTgt(null);
  });

  return (
    <>
      {/* Ambient + directional light mimicking a distant star */}
      <ambientLight intensity={0.08} color="#1a2040" />
      <directionalLight position={[80, 40, -60]} intensity={1.4} color="#ffd8a0" castShadow />
      <pointLight position={[-40, 20, 40]} intensity={0.3} color="#2244aa" />

      {/* Ship group */}
      <group ref={shipGroup}>
        <Suspense fallback={null}>
          {glbUrl ? <GlbShip url={glbUrl} /> : <DiamondShip />}
        </Suspense>
        <EngineExhaust speed={currentSpeed.current} targetSpeed={MAX_SPEED * SPEED_LEVELS[throttleIndex]} />
      </group>

      {/* Target reticle */}
      {tgt && <TargetReticle position={[tgt.x, tgt.y, tgt.z]} />}

      {/* Orbit camera */}
      <OrbitControls
        ref={orbitRef}
        enablePan={false}
        minDistance={4}
        maxDistance={80}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.9}
      />

      {/* Background star-field */}
      <Stars radius={800} depth={60} count={5000} factor={4} saturation={0.3} fade />
    </>
  );
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function Hud({ telemetry, throttleIndex, onThrottle, glbUrl, onGlbLoad }) {
  const LABELS = ['STOP', '¼', '½', '¾', 'FULL'];
  const pct    = telemetry ? (telemetry.speed / MAX_SPEED) * 100 : 0;

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file) onGlbLoad(URL.createObjectURL(file));
  };

  return (
    <div style={styles.hud}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <span style={styles.shipLabel}>◈ DEADSPACE POCKET</span>
        <span style={styles.hint}>DBL-CLICK TO SET HEADING  ·  SCROLL TO ZOOM</span>
        <label style={styles.loadBtn}>
          ⬆ LOAD GLB
          <input type="file" accept=".glb" onChange={handleFile} style={{ display:'none' }} />
        </label>
      </div>

      {/* Speed indicator - left side */}
      <div style={styles.speedPanel}>
        <div style={styles.panelTitle}>VELOCITY</div>
        <div style={styles.speedBar}>
          <div style={{ ...styles.speedFill, height: `${pct}%`,
            background: pct > 85 ? 'linear-gradient(#ff4433,#ff8833)' :
                        pct > 50 ? 'linear-gradient(#00ccff,#0066ff)' :
                                   'linear-gradient(#33aaff,#0044cc)' }} />
          {[0,25,50,75,100].map(m => (
            <div key={m} style={{ ...styles.speedMark, bottom: `${m}%` }}>
              <span style={styles.speedMarkLabel}>{m}</span>
            </div>
          ))}
        </div>
        <div style={styles.speedReadout}>
          {telemetry?.speed.toFixed(1) ?? '0.0'} <span style={styles.unit}>u/s</span>
        </div>
      </div>

      {/* Throttle controls - bottom centre */}
      <div style={styles.throttlePanel}>
        <div style={styles.panelTitle}>THROTTLE</div>
        <div style={styles.throttleBtns}>
          {LABELS.map((lbl, i) => (
            <button
              key={i}
              onClick={() => onThrottle(i)}
              style={{
                ...styles.throttleBtn,
                ...(i === throttleIndex ? styles.throttleBtnActive : {}),
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
        <div style={styles.throttleLabel}>
          {telemetry?.throttleLabel ?? 'STOP'}
        </div>
      </div>

      {/* Telemetry readout - right side */}
      <div style={styles.telemetryPanel}>
        <div style={styles.panelTitle}>TELEMETRY</div>
        {telemetry && (
          <>
            <TelRow label="SPD" value={`${telemetry.speed.toFixed(2)} u/s`} />
            <TelRow label="HDG X" value={telemetry.heading.x} />
            <TelRow label="HDG Y" value={telemetry.heading.y} />
            <TelRow label="HDG Z" value={telemetry.heading.z} />
            <div style={styles.telDivider} />
            <TelRow label="POS X" value={`${telemetry.position.x}`} />
            <TelRow label="POS Y" value={`${telemetry.position.y}`} />
            <TelRow label="POS Z" value={`${telemetry.position.z}`} />
          </>
        )}
      </div>

      {/* Inertia indicator */}
      {telemetry && Math.abs(telemetry.speed - telemetry.targetSpeed) > 0.5 && (
        <div style={styles.inertiaIndicator}>
          {telemetry.speed < telemetry.targetSpeed ? '▲ ACCELERATING' : '▼ DECELERATING'}
        </div>
      )}
    </div>
  );
}

function TelRow({ label, value }) {
  return (
    <div style={styles.telRow}>
      <span style={styles.telLabel}>{label}</span>
      <span style={styles.telValue}>{value}</span>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function Adam3DSpaceshipController({ glbUrl: initGlb, onTelemetry }) {
  const [throttleIndex, setThrottle] = useState(0);
  const [telemetry, setTelemetry]    = useState(null);
  const [glbUrl, setGlbUrl]          = useState(initGlb ?? null);

  const handleTelemetry = useCallback((t) => {
    setTelemetry(t);
    onTelemetry?.(t);
  }, [onTelemetry]);

  return (
    <div style={styles.root}>
      <Canvas
        camera={{ position: [0, 6, 20], fov: 55, near: 0.1, far: 2000 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        shadows
        style={styles.canvas}
      >
        <ShipScene
          glbUrl={glbUrl}
          throttleIndex={throttleIndex}
          onTelemetry={handleTelemetry}
        />
      </Canvas>

      <Hud
        telemetry={telemetry}
        throttleIndex={throttleIndex}
        onThrottle={setThrottle}
        glbUrl={glbUrl}
        onGlbLoad={setGlbUrl}
      />

      {/* Scanline overlay */}
      <div style={styles.scanlines} />
      {/* Vignette */}
      <div style={styles.vignette} />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const COLOR = {
  bg:      '#020508',
  cyan:    '#00c8ff',
  cyanDim: '#0066aa',
  amber:   '#ffaa00',
  red:     '#ff3322',
  panel:   'rgba(0,20,40,0.72)',
  border:  'rgba(0,180,255,0.18)',
  text:    '#88ccee',
  dim:     '#224466',
};

const FONT = {
  mono: '"Share Tech Mono", "Courier New", monospace',
};

const styles = {
  root: {
    position: 'relative',
    width: '100%',
    height: '100%',
    background: COLOR.bg,
    fontFamily: FONT.mono,
    userSelect: 'none',
    overflow: 'hidden',
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  },
  hud: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 38,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    background: 'rgba(0,10,22,0.82)',
    borderBottom: `1px solid ${COLOR.border}`,
    pointerEvents: 'auto',
  },
  shipLabel: {
    color: COLOR.cyan,
    fontSize: 12,
    letterSpacing: '0.2em',
    fontWeight: 700,
  },
  hint: {
    color: COLOR.dim,
    fontSize: 10,
    letterSpacing: '0.15em',
  },
  loadBtn: {
    color: COLOR.amber,
    fontSize: 11,
    letterSpacing: '0.15em',
    cursor: 'pointer',
    border: `1px solid ${COLOR.amber}44`,
    padding: '3px 10px',
    borderRadius: 2,
    background: 'rgba(80,40,0,0.3)',
    transition: 'background 0.2s',
    pointerEvents: 'auto',
  },
  // Speed panel
  speedPanel: {
    position: 'absolute',
    left: 20,
    top: 58,
    bottom: 80,
    width: 64,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: COLOR.panel,
    border: `1px solid ${COLOR.border}`,
    borderRadius: 3,
    padding: '10px 0',
    pointerEvents: 'none',
  },
  panelTitle: {
    color: COLOR.dim,
    fontSize: 9,
    letterSpacing: '0.2em',
    marginBottom: 8,
  },
  speedBar: {
    flex: 1,
    width: 16,
    position: 'relative',
    background: 'rgba(0,40,80,0.5)',
    border: `1px solid ${COLOR.border}`,
    borderRadius: 2,
    overflow: 'visible',
    margin: '0 0 8px',
  },
  speedFill: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    transition: 'height 0.15s ease, background 0.3s',
    borderRadius: 2,
    boxShadow: '0 0 8px #0099ff88',
  },
  speedMark: {
    position: 'absolute',
    right: -28,
    display: 'flex',
    alignItems: 'center',
  },
  speedMarkLabel: {
    color: COLOR.dim,
    fontSize: 8,
  },
  speedReadout: {
    color: COLOR.cyan,
    fontSize: 11,
    letterSpacing: '0.05em',
  },
  unit: { color: COLOR.dim, fontSize: 9 },
  // Throttle panel
  throttlePanel: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    background: COLOR.panel,
    border: `1px solid ${COLOR.border}`,
    borderRadius: 3,
    padding: '10px 16px',
    pointerEvents: 'auto',
  },
  throttleBtns: {
    display: 'flex',
    gap: 4,
  },
  throttleBtn: {
    background: 'rgba(0,30,60,0.8)',
    border: `1px solid ${COLOR.cyanDim}`,
    color: COLOR.text,
    fontFamily: FONT.mono,
    fontSize: 11,
    letterSpacing: '0.1em',
    padding: '5px 12px',
    cursor: 'pointer',
    borderRadius: 2,
    transition: 'all 0.15s',
  },
  throttleBtnActive: {
    background: 'rgba(0,100,200,0.4)',
    border: `1px solid ${COLOR.cyan}`,
    color: COLOR.cyan,
    boxShadow: `0 0 10px ${COLOR.cyan}66`,
  },
  throttleLabel: {
    color: COLOR.cyan,
    fontSize: 10,
    letterSpacing: '0.2em',
  },
  // Telemetry panel
  telemetryPanel: {
    position: 'absolute',
    right: 20,
    top: 58,
    width: 170,
    background: COLOR.panel,
    border: `1px solid ${COLOR.border}`,
    borderRadius: 3,
    padding: '10px 14px',
    pointerEvents: 'none',
  },
  telRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  telLabel: {
    color: COLOR.dim,
    fontSize: 10,
    letterSpacing: '0.15em',
  },
  telValue: {
    color: COLOR.cyan,
    fontSize: 10,
    letterSpacing: '0.05em',
  },
  telDivider: {
    borderTop: `1px solid ${COLOR.border}`,
    margin: '6px 0',
  },
  // Inertia indicator
  inertiaIndicator: {
    position: 'absolute',
    top: 58,
    left: '50%',
    transform: 'translateX(-50%)',
    color: COLOR.amber,
    fontSize: 11,
    letterSpacing: '0.25em',
    background: 'rgba(0,10,20,0.7)',
    border: `1px solid ${COLOR.amber}44`,
    padding: '4px 14px',
    borderRadius: 2,
    animation: 'pulse 1.2s ease-in-out infinite',
    pointerEvents: 'none',
  },
  // Scanlines
  scanlines: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 3px)',
    pointerEvents: 'none',
    zIndex: 10,
  },
  // Vignette
  vignette: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,10,0.7) 100%)',
    pointerEvents: 'none',
    zIndex: 9,
  },
};
