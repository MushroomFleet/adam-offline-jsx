/**
 * StationInterior.jsx
 * Low-poly space station hangar scene — React Three Fiber
 *
 * Dependencies (CDN in demo.html / npm in project):
 *   three, @react-three/fiber, @react-three/drei
 *
 * TSX migration: add typed prop interface, replace useRef<any> with typed variants
 */

import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Text } from '@react-three/drei';
import * as THREE from 'three';

// ─── SVGA Palette ────────────────────────────────────────────────────────────
const PAL = {
  hull:       new THREE.Color('#1a2540'),
  hullLight:  new THREE.Color('#2e4070'),
  glow:       new THREE.Color('#00d4ff'),
  glowWarm:   new THREE.Color('#ff8c00'),
  padBase:    new THREE.Color('#0d1a30'),
  padRing:    new THREE.Color('#003a5c'),
  accent:     new THREE.Color('#00ffcc'),
  npcA:       new THREE.Color('#8844aa'),
  npcB:       new THREE.Color('#aa4422'),
  wall:       new THREE.Color('#111827'),
  wallLight:  new THREE.Color('#1f2d45'),
  floor:      new THREE.Color('#0a1020'),
  floorGrid:  new THREE.Color('#1a3040'),
  void:       new THREE.Color('#000510'),
  starfield:  new THREE.Color('#ffffff'),
};

// ─── Vertex-colour helper ─────────────────────────────────────────────────────
function applyVertexColors(geometry, colorFn) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const c = colorFn(y, i);
    colors[i * 3]     = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// ─── Hangar Box Geometry ──────────────────────────────────────────────────────
// Large hollow box: closed rear/sides/ceiling, open front (gateway)
function HangarGeometry() {
  const mats = useMemo(() => ({
    wall: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.BackSide }),
    floor: new THREE.MeshLambertMaterial({ vertexColors: true }),
    trim: new THREE.MeshLambertMaterial({ color: PAL.glow, emissive: PAL.glow, emissiveIntensity: 0.4 }),
    glass: new THREE.MeshLambertMaterial({ color: PAL.void, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  }), []);

  // Colour gradient for walls: dark base → slightly lighter at ceiling
  const wallGeo = useMemo(() => {
    const g = new THREE.BoxGeometry(40, 20, 60, 4, 4, 6);
    applyVertexColors(g, (y) => {
      const t = (y + 10) / 20;
      return new THREE.Color().lerpColors(PAL.wall, PAL.wallLight, t * 0.5);
    });
    return g;
  }, []);

  // Floor with subtle grid colour bands
  const floorGeo = useMemo(() => {
    const g = new THREE.PlaneGeometry(40, 60, 8, 12);
    applyVertexColors(g, (y, i) => {
      const row = Math.floor(i / 9);
      return row % 2 === 0 ? PAL.floor : PAL.floorGrid;
    });
    return g;
  }, []);

  return (
    <group>
      {/* Main shell — BackSide so we see inside */}
      {/* GLB_SLOT: 0 — replace with hangar interior .glb */}
      <mesh geometry={wallGeo} material={mats.wall} receiveShadow />

      {/* Floor plane */}
      <mesh geometry={floorGeo} material={mats.floor} rotation={[-Math.PI / 2, 0, 0]} position={[0, -10, 0]} receiveShadow />

      {/* Gateway arch trim — bright cyan glow strip */}
      {[[-19.8, 0], [19.8, 0]].map(([x], i) => (
        <mesh key={i} material={mats.trim} position={[x, 0, -30]}>
          <boxGeometry args={[0.3, 20, 0.3]} />
        </mesh>
      ))}
      <mesh material={mats.trim} position={[0, 9.8, -30]}>
        <boxGeometry args={[40, 0.3, 0.3]} />
      </mesh>

      {/* Ceiling light strips */}
      {[-10, 0, 10].map((z, i) => (
        <mesh key={i} material={mats.trim} position={[0, 9.6, z]}>
          <boxGeometry args={[38, 0.15, 0.15]} />
        </mesh>
      ))}

      {/* Rear wall structural ribs */}
      {[-15, -5, 5, 15].map((x, i) => (
        <mesh key={i} material={mats.trim} position={[x, 0, 29.8]}>
          <boxGeometry args={[0.2, 20, 0.2]} />
        </mesh>
      ))}

      {/* Gateway void fill — deep dark plane beyond the opening */}
      <mesh material={mats.glass} position={[0, 0, -30.1]}>
        <planeGeometry args={[40, 20]} />
      </mesh>
    </group>
  );
}

// ─── Docking Pad ──────────────────────────────────────────────────────────────
function DockingPad({ docked }) {
  const lightRefs = useRef([]);
  const t = useRef(0);

  useFrame((_, dt) => {
    t.current += dt;
    lightRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const pulse = 0.5 + 0.5 * Math.sin(t.current * 2 + i * 1.05);
      ref.material.emissiveIntensity = docked ? 0.2 + pulse * 0.8 : 0.1 + pulse * 0.15;
      ref.material.color.set(docked ? PAL.accent : PAL.glow);
      ref.material.emissive.set(docked ? PAL.accent : PAL.glow);
    });
  });

  const hexPoints = useMemo(() => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pts.push([Math.cos(a) * 6, Math.sin(a) * 6]);
    }
    return pts;
  }, []);

  return (
    <group position={[0, -9.9, 8]}>
      {/* Base hex slab */}
      {/* GLB_SLOT: 1 — replace with docking_pad.glb */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <cylinderGeometry args={[6.5, 7, 0.3, 6]} />
        <meshLambertMaterial color={PAL.padBase} />
      </mesh>

      {/* Hex ring segments — pulsing lights */}
      {hexPoints.map(([x, z], i) => (
        <mesh
          key={i}
          ref={el => lightRefs.current[i] = el}
          position={[x, 0.2, z]}
        >
          <boxGeometry args={[0.4, 0.15, 2.5]} />
          <meshLambertMaterial
            color={PAL.glow}
            emissive={PAL.glow}
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}

      {/* Center cross markings */}
      {[[12, 0], [0, 12]].map(([rw, rd], i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.25, 0]}>
          <planeGeometry args={[rw || 0.3, rd || 0.3]} />
          <meshLambertMaterial color={PAL.accent} emissive={PAL.accent} emissiveIntensity={0.6} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.25, 0]}>
        <planeGeometry args={[0.3, 12]} />
        <meshLambertMaterial color={PAL.accent} emissive={PAL.accent} emissiveIntensity={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.25, 0]}>
        <planeGeometry args={[12, 0.3]} />
        <meshLambertMaterial color={PAL.accent} emissive={PAL.accent} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

// ─── Player Ship (low-poly interceptor) ───────────────────────────────────────
function PlayerShip({ shipClass = 'interceptor', docked }) {
  const ref = useRef();
  const t = useRef(0);

  useFrame((_, dt) => {
    if (!ref.current) return;
    t.current += dt * 0.4;
    if (!docked) {
      ref.current.position.y = -7 + Math.sin(t.current) * 0.25;
      ref.current.rotation.y = Math.sin(t.current * 0.3) * 0.04;
    } else {
      ref.current.position.y = THREE.MathUtils.lerp(ref.current.position.y, -9.3, dt * 2);
      ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, 0, dt * 2);
    }
  });

  // Fuselage shape varies by ship class
  const dims = {
    interceptor: { body: [1.2, 0.5, 5],  wing: [5,   0.12, 2.5], cockpit: [0.7, 0.5, 1.2] },
    frigate:     { body: [2,   0.8, 7],  wing: [7,   0.18, 3],   cockpit: [1.2, 0.7, 1.5] },
    hauler:      { body: [2.5, 1.2, 6],  wing: [5.5, 0.2, 2],    cockpit: [1.5, 0.8, 1.2] },
  }[shipClass];

  return (
    <group ref={ref} position={[0, -7, 8]} rotation={[0, Math.PI, 0]}>
      {/* GLB_SLOT: 2 — replace this group with player_ship.glb */}

      {/* Main fuselage */}
      <mesh castShadow>
        <boxGeometry args={dims.body} />
        <meshLambertMaterial color={PAL.hull} />
      </mesh>

      {/* Cockpit blister */}
      <mesh position={[0, dims.body[1] * 0.6, -dims.body[2] * 0.3]}>
        <boxGeometry args={dims.cockpit} />
        <meshLambertMaterial color={PAL.glow} emissive={PAL.glow} emissiveIntensity={0.5} transparent opacity={0.85} />
      </mesh>

      {/* Wings */}
      <mesh position={[0, 0, 0.5]} castShadow>
        <boxGeometry args={dims.wing} />
        <meshLambertMaterial color={PAL.hullLight} />
      </mesh>

      {/* Wing chevron accent */}
      <mesh position={[0, dims.wing[1] / 2 + 0.05, 0.5]}>
        <boxGeometry args={[dims.wing[0] * 0.6, 0.06, 0.3]} />
        <meshLambertMaterial color={PAL.accent} emissive={PAL.accent} emissiveIntensity={0.7} />
      </mesh>

      {/* Engine pods */}
      {[-dims.body[0] * 0.6, dims.body[0] * 0.6].map((x, i) => (
        <group key={i} position={[x, -0.1, dims.body[2] * 0.45]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.18, 0.24, 1.2, 6]} />
            <meshLambertMaterial color={PAL.hull} />
          </mesh>
          {/* Engine glow */}
          <mesh position={[0, 0.65, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.1, 6]} />
            <meshLambertMaterial color={PAL.glowWarm} emissive={PAL.glowWarm} emissiveIntensity={1.2} />
          </mesh>
          <pointLight color={PAL.glowWarm} intensity={0.8} distance={3} position={[0, 0.8, 0]} />
        </group>
      ))}

      {/* Nose cone */}
      <mesh position={[0, 0, -dims.body[2] * 0.58]}>
        <coneGeometry args={[dims.body[0] * 0.35, dims.body[2] * 0.3, 5]} />
        <meshLambertMaterial color={PAL.hullLight} />
      </mesh>
    </group>
  );
}

// ─── NPC Shuttle (simple low-poly) ────────────────────────────────────────────
function NPCShuttle({ color, path, speed, offset = 0 }) {
  const ref = useRef();
  const t = useRef(offset);

  useFrame((_, dt) => {
    t.current = (t.current + dt * speed) % 1;
    const pt = path.getPoint(t.current);
    const ahead = path.getPoint((t.current + 0.01) % 1);
    if (ref.current) {
      ref.current.position.copy(pt);
      ref.current.lookAt(ahead);
    }
  });

  return (
    <group ref={ref}>
      {/* GLB_SLOT: 3 — replace with npc_shuttle.glb */}
      <mesh castShadow>
        <boxGeometry args={[1, 0.5, 2.5]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <mesh position={[0, 0.3, -0.6]}>
        <boxGeometry args={[0.6, 0.35, 0.6]} />
        <meshLambertMaterial color={PAL.glow} emissive={PAL.glow} emissiveIntensity={0.4} transparent opacity={0.8} />
      </mesh>
      {/* Engine glow */}
      <mesh position={[0, 0, 1.3]}>
        <cylinderGeometry args={[0.12, 0.12, 0.08, 5]} />
        <meshLambertMaterial color={PAL.glowWarm} emissive={PAL.glowWarm} emissiveIntensity={1} />
      </mesh>
      <pointLight color={PAL.glowWarm} intensity={0.5} distance={4} position={[0, 0, 1.5]} />
    </group>
  );
}

// ─── NPC Traffic ──────────────────────────────────────────────────────────────
function NPCTraffic() {
  const paths = useMemo(() => {
    // Two patrol loops around the bay at different heights
    const loop1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-15, -4, -20),
      new THREE.Vector3(15, -3, -20),
      new THREE.Vector3(18, -5, 0),
      new THREE.Vector3(14, -4, 20),
      new THREE.Vector3(-14, -6, 20),
      new THREE.Vector3(-18, -4, 0),
    ], true);

    const loop2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(10, 2, -25),
      new THREE.Vector3(-12, 1, -15),
      new THREE.Vector3(-16, 3, 5),
      new THREE.Vector3(-8, 2, 22),
      new THREE.Vector3(12, 1, 22),
      new THREE.Vector3(16, 3, 5),
    ], true);

    return [loop1, loop2];
  }, []);

  return (
    <>
      <NPCShuttle color={PAL.npcA} path={paths[0]} speed={0.06} offset={0} />
      <NPCShuttle color={PAL.npcB} path={paths[0]} speed={0.06} offset={0.5} />
      <NPCShuttle color={PAL.npcA} path={paths[1]} speed={0.04} offset={0.25} />
    </>
  );
}

// ─── Ambient Dust Particles ────────────────────────────────────────────────────
function DustParticles() {
  const ref = useRef();
  const count = 300;

  const [positions, velocities] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 38;
      pos[i * 3 + 1] = Math.random() * 18 - 9;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 58;
      vel[i * 3]     = (Math.random() - 0.5) * 0.01;
      vel[i * 3 + 1] = (Math.random() - 0.5) * 0.005;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
    }
    return [pos, vel];
  }, []);

  useFrame(() => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      pos[i * 3]     += velocities[i * 3];
      pos[i * 3 + 1] += velocities[i * 3 + 1];
      pos[i * 3 + 2] += velocities[i * 3 + 2];
      // wrap
      if (pos[i * 3] > 19)  pos[i * 3] = -19;
      if (pos[i * 3] < -19) pos[i * 3] = 19;
      if (pos[i * 3 + 1] > 9)  pos[i * 3 + 1] = -9;
      if (pos[i * 3 + 1] < -9) pos[i * 3 + 1] = 9;
      if (pos[i * 3 + 2] > 29)  pos[i * 3 + 2] = -29;
      if (pos[i * 3 + 2] < -29) pos[i * 3 + 2] = 29;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial color={PAL.glow} size={0.06} transparent opacity={0.4} sizeAttenuation />
    </points>
  );
}

// ─── Gateway Space Stars (visible through opening) ────────────────────────────
function GatewayVoid() {
  return (
    <group position={[0, 0, -29]}>
      <Stars radius={50} depth={20} count={800} factor={2} saturation={0} speed={0.3} />
    </group>
  );
}

// ─── Hangar Lighting ──────────────────────────────────────────────────────────
function HangarLighting() {
  return (
    <>
      <ambientLight color="#091420" intensity={0.8} />
      {/* Primary overhead cool white */}
      <directionalLight
        color="#c8e8ff"
        intensity={1.2}
        position={[0, 15, 5]}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      {/* Gateway rim light — cool blue from outside */}
      <directionalLight color={PAL.glow} intensity={0.5} position={[0, 2, -30]} />
      {/* Warm fill from rear */}
      <directionalLight color="#ff9940" intensity={0.2} position={[0, 0, 30]} />
      {/* Ceiling strip accent lights */}
      {[-10, 0, 10].map((z, i) => (
        <pointLight key={i} color={PAL.glow} intensity={0.4} distance={12} position={[0, 9, z]} />
      ))}
    </>
  );
}

// ─── Camera Rig ───────────────────────────────────────────────────────────────
function CameraRig({ docked, autoRotate }) {
  const { camera } = useThree();
  const t = useRef(0);
  const targetPos = useRef(new THREE.Vector3(0, 2, 22));
  const targetLook = useRef(new THREE.Vector3(0, -2, 0));
  const tempLook = useRef(new THREE.Vector3());

  useEffect(() => {
    camera.position.set(0, 2, 22);
    camera.lookAt(0, -2, 0);
  }, []);

  useFrame((_, dt) => {
    t.current += dt;

    if (docked) {
      // Cinematic low-angle forward pull into the hangar
      targetPos.current.set(
        Math.sin(t.current * 0.15) * 8,
        -1 + Math.sin(t.current * 0.2) * 1.5,
        14 + Math.sin(t.current * 0.1) * 3
      );
      targetLook.current.set(0, -4, 5);
    } else if (autoRotate) {
      // Slow orbit pan — cinematic
      const r = 22;
      const angle = t.current * 0.12;
      targetPos.current.set(
        Math.sin(angle) * r,
        3 + Math.sin(t.current * 0.08) * 2,
        Math.cos(angle) * r
      );
      targetLook.current.set(0, -2, 5);
    }

    camera.position.lerp(targetPos.current, dt * 1.2);
    tempLook.current.lerp(targetLook.current, dt * 1.5);
    camera.lookAt(tempLook.current);
  });

  return null;
}

// ─── Services Menu ────────────────────────────────────────────────────────────
const SERVICES = [
  { id: 'market',    icon: '◈', label: 'Market',       sub: 'Buy & sell goods' },
  { id: 'fitting',   icon: '⊕', label: 'Fitting',      sub: 'Outfit your ship' },
  { id: 'repair',    icon: '⟳', label: 'Repair',       sub: 'Hull & module repair' },
  { id: 'agents',    icon: '✦', label: 'Agent Finder',  sub: 'Missions & contracts' },
  { id: 'insurance', icon: '⬡', label: 'Insurance',    sub: 'Protect your assets' },
  { id: 'clone',     icon: '⧖', label: 'Clone Bay',    sub: 'Medical services' },
];

function ServicesMenu({ visible, onSelect, onUndock }) {
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);

  if (!visible) return null;

  return (
    <div style={styles.menuOverlay}>
      <div style={styles.menuPanel}>
        <div style={styles.menuHeader}>
          <div style={styles.menuHeaderTop}>
            <span style={styles.menuTitle}>STATION SERVICES</span>
            <span style={styles.menuSub}>Astra Prime • Bay 7 • DOCKED</span>
          </div>
          <div style={styles.statusIndicator}>
            <span style={styles.statusDot} />
            <span>All systems nominal</span>
          </div>
        </div>

        <div style={styles.serviceGrid}>
          {SERVICES.map(svc => (
            <button
              key={svc.id}
              style={{
                ...styles.serviceBtn,
                ...(selected === svc.id ? styles.serviceBtnActive : {}),
                ...(hovered === svc.id && selected !== svc.id ? styles.serviceBtnHover : {}),
              }}
              onMouseEnter={() => setHovered(svc.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => {
                setSelected(svc.id);
                onSelect && onSelect(svc.id);
              }}
            >
              <span style={styles.serviceIcon}>{svc.icon}</span>
              <span style={styles.serviceLabel}>{svc.label}</span>
              <span style={styles.serviceSub}>{svc.sub}</span>
            </button>
          ))}
        </div>

        <div style={styles.menuFooter}>
          <div style={styles.shipInfo}>
            <span style={styles.shipLabel}>▶ DOCKED SHIP</span>
            <span style={styles.shipName}>Viper Mk.II</span>
          </div>
          <button style={styles.undockBtn} onClick={onUndock}>
            UNDOCK
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dock Button HUD ──────────────────────────────────────────────────────────
function DockHUD({ onDock }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={styles.hudOverlay}>
      <div style={styles.hudInfo}>
        <div style={styles.hudStation}>ASTRA PRIME STATION</div>
        <div style={styles.hudBay}>Docking Bay 7 — Approach Authorised</div>
        <div style={styles.hudDist}>Distance: 0.2 km</div>
      </div>
      <button
        style={{ ...styles.dockBtn, ...(hovered ? styles.dockBtnHover : {}) }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={onDock}
      >
        <span style={styles.dockBtnIcon}>⬡</span>
        DOCK
      </button>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function StationInterior({
  onDock,
  onServiceSelect,
  shipClass = 'interceptor',
  stationName = 'Astra Prime — Docking Bay 7',
  autoRotateCamera = true,
}) {
  const [docked, setDocked] = useState(false);
  const [showServices, setShowServices] = useState(false);

  const handleDock = useCallback(() => {
    setDocked(true);
    setTimeout(() => setShowServices(true), 1200);
    onDock && onDock();
  }, [onDock]);

  const handleUndock = useCallback(() => {
    setShowServices(false);
    setTimeout(() => setDocked(false), 400);
  }, []);

  return (
    <div style={styles.root}>
      {/* ── Three.js Canvas ── */}
      <Canvas
        shadows
        style={styles.canvas}
        camera={{ fov: 55, near: 0.1, far: 300, position: [0, 2, 22] }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.9 }}
      >
        <fog attach="fog" args={['#000a18', 40, 120]} />

        <HangarLighting />
        <HangarGeometry />
        <DockingPad docked={docked} />
        <PlayerShip shipClass={shipClass} docked={docked} />
        <NPCTraffic />
        <DustParticles />
        <GatewayVoid />
        <CameraRig docked={docked} autoRotate={autoRotateCamera} />
      </Canvas>

      {/* ── Scanline / vignette overlay ── */}
      <div style={styles.scanlines} />
      <div style={styles.vignette} />

      {/* ── Station nameplate ── */}
      <div style={styles.nameplate}>
        <span style={styles.nameplateLabel}>◈</span>
        {stationName}
      </div>

      {/* ── HUD / menus ── */}
      {!docked && <DockHUD onDock={handleDock} />}
      <ServicesMenu visible={showServices} onSelect={onServiceSelect} onUndock={handleUndock} />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  root: {
    position: 'relative',
    width: '100%',
    height: '100vh',
    background: '#000510',
    fontFamily: "'Share Tech Mono', 'Courier New', monospace",
    overflow: 'hidden',
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  },
  scanlines: {
    position: 'absolute',
    inset: 0,
    background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
    pointerEvents: 'none',
    zIndex: 2,
  },
  vignette: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,5,16,0.7) 100%)',
    pointerEvents: 'none',
    zIndex: 2,
  },
  nameplate: {
    position: 'absolute',
    top: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    color: '#00d4ff',
    fontSize: '11px',
    letterSpacing: '3px',
    textTransform: 'uppercase',
    padding: '6px 18px',
    border: '1px solid rgba(0,212,255,0.25)',
    background: 'rgba(0,10,24,0.6)',
    backdropFilter: 'blur(8px)',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  nameplateLabel: { color: '#00ffcc', fontSize: 14 },

  // Dock HUD
  hudOverlay: {
    position: 'absolute',
    bottom: 40,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    zIndex: 10,
  },
  hudInfo: {
    textAlign: 'center',
    color: 'rgba(0,212,255,0.7)',
    fontSize: '11px',
    letterSpacing: '2px',
    lineHeight: 1.8,
  },
  hudStation: { color: '#00ffcc', fontSize: '13px', letterSpacing: '4px' },
  hudBay: {},
  hudDist: { color: 'rgba(0,212,255,0.4)', fontSize: '10px' },
  dockBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 44px',
    background: 'transparent',
    border: '1px solid #00d4ff',
    color: '#00d4ff',
    fontSize: '16px',
    letterSpacing: '5px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    fontFamily: "'Share Tech Mono', monospace",
    clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)',
  },
  dockBtnHover: {
    background: 'rgba(0,212,255,0.12)',
    color: '#00ffcc',
    borderColor: '#00ffcc',
    boxShadow: '0 0 20px rgba(0,212,255,0.3)',
  },
  dockBtnIcon: { fontSize: 18 },

  // Services menu
  menuOverlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: 40,
    zIndex: 20,
    animation: 'fadeIn 0.5s ease',
  },
  menuPanel: {
    width: 360,
    background: 'rgba(5, 12, 28, 0.92)',
    border: '1px solid rgba(0,212,255,0.3)',
    backdropFilter: 'blur(20px)',
    padding: '24px 0',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 0 60px rgba(0,212,255,0.1), inset 0 0 40px rgba(0,0,0,0.4)',
  },
  menuHeader: {
    padding: '0 24px 20px',
    borderBottom: '1px solid rgba(0,212,255,0.15)',
    marginBottom: 4,
  },
  menuHeaderTop: { marginBottom: 10 },
  menuTitle: {
    display: 'block',
    color: '#00d4ff',
    fontSize: '13px',
    letterSpacing: '4px',
    marginBottom: 4,
  },
  menuSub: {
    display: 'block',
    color: 'rgba(0,212,255,0.45)',
    fontSize: '10px',
    letterSpacing: '2px',
  },
  statusIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#00ffcc',
    fontSize: '10px',
    letterSpacing: '1px',
  },
  statusDot: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#00ffcc',
    boxShadow: '0 0 6px #00ffcc',
  },
  serviceGrid: {
    display: 'flex',
    flexDirection: 'column',
    padding: '8px 0',
  },
  serviceBtn: {
    display: 'grid',
    gridTemplateColumns: '36px 1fr',
    gridTemplateRows: 'auto auto',
    alignItems: 'center',
    padding: '14px 24px',
    background: 'transparent',
    border: 'none',
    borderLeft: '2px solid transparent',
    color: 'rgba(0,212,255,0.6)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
    fontFamily: "'Share Tech Mono', monospace",
    gap: '0 8px',
  },
  serviceBtnHover: {
    background: 'rgba(0,212,255,0.05)',
    color: '#00d4ff',
    borderLeftColor: 'rgba(0,212,255,0.4)',
  },
  serviceBtnActive: {
    background: 'rgba(0,255,204,0.07)',
    color: '#00ffcc',
    borderLeftColor: '#00ffcc',
  },
  serviceIcon: {
    gridRow: '1 / 3',
    fontSize: 20,
    display: 'flex',
    alignItems: 'center',
  },
  serviceLabel: {
    display: 'block',
    fontSize: '12px',
    letterSpacing: '2px',
    textTransform: 'uppercase',
  },
  serviceSub: {
    display: 'block',
    fontSize: '10px',
    opacity: 0.5,
    letterSpacing: '1px',
  },
  menuFooter: {
    padding: '20px 24px 0',
    borderTop: '1px solid rgba(0,212,255,0.15)',
    marginTop: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shipInfo: { display: 'flex', flexDirection: 'column', gap: 4 },
  shipLabel: { color: 'rgba(0,212,255,0.4)', fontSize: '9px', letterSpacing: '2px' },
  shipName: { color: '#00d4ff', fontSize: '13px', letterSpacing: '2px' },
  undockBtn: {
    padding: '8px 18px',
    background: 'transparent',
    border: '1px solid rgba(255,100,60,0.5)',
    color: 'rgba(255,100,60,0.7)',
    fontSize: '10px',
    letterSpacing: '3px',
    cursor: 'pointer',
    fontFamily: "'Share Tech Mono', monospace",
    transition: 'all 0.15s',
  },
};
