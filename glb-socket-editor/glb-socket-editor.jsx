/**
 * GLBSocketEditor.jsx
 *
 * A 3D mesh socket positioning editor for spaceship assets.
 * Supports GLB file import, Blender-style transform controls,
 * named socket creation with X-axis mirroring, and JSON export.
 *
 * Migration path: rename to .tsx and add type annotations
 * (types are documented in JSDoc comments throughout).
 *
 * Dependencies: three, @react-three/fiber, @react-three/drei
 */

import React, { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import {
  OrbitControls,
  Grid,
  Environment,
  useGLTF,
  TransformControls,
  GizmoHelper,
  GizmoViewport,
  Html,
} from '@react-three/drei';
import * as THREE from 'three';

// ─── Constants ───────────────────────────────────────────────────────────────

const SOCKET_TYPES = [
  { id: 'weapon', label: 'Weapon Origin', color: '#ff4444', icon: '⚡' },
  { id: 'engine', label: 'Engine Exhaust', color: '#ff8c00', icon: '🔥' },
  { id: 'thruster', label: 'Thruster', color: '#00cfff', icon: '💨' },
  { id: 'shield', label: 'Shield Emitter', color: '#44aaff', icon: '🛡' },
  { id: 'fx',     label: 'FX Emitter',    color: '#aa44ff', icon: '✨' },
  { id: 'custom', label: 'Custom',         color: '#aaaaaa', icon: '📌' },
];

const DEFAULT_SHIP_URL = null; // set to a GLB url for a bundled default

const SOCKET_COLOR_MAP = Object.fromEntries(SOCKET_TYPES.map(t => [t.id, t.color]));

// ─── Utility ─────────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function socketTypeColor(type) {
  return SOCKET_COLOR_MAP[type] ?? '#aaaaaa';
}

// ─── Default Placeholder Ship ────────────────────────────────────────────────

function DefaultShip({ wireframe }) {
  const groupRef = useRef();
  return (
    <group ref={groupRef}>
      {/* Hull body */}
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.45, 2.2, 8]} />
        <meshStandardMaterial
          color="#1a2a3a"
          metalness={0.85}
          roughness={0.25}
          wireframe={wireframe}
        />
      </mesh>
      {/* Cockpit */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <sphereGeometry args={[0.22, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color="#0af"
          metalness={0.3}
          roughness={0.1}
          transparent
          opacity={0.7}
          wireframe={wireframe}
        />
      </mesh>
      {/* Left wing */}
      <mesh position={[-0.9, -0.3, 0]} rotation={[0, 0, 0.3]} castShadow>
        <boxGeometry args={[1.1, 0.07, 0.7]} />
        <meshStandardMaterial color="#0f1e2d" metalness={0.9} roughness={0.2} wireframe={wireframe} />
      </mesh>
      {/* Right wing */}
      <mesh position={[0.9, -0.3, 0]} rotation={[0, 0, -0.3]} castShadow>
        <boxGeometry args={[1.1, 0.07, 0.7]} />
        <meshStandardMaterial color="#0f1e2d" metalness={0.9} roughness={0.2} wireframe={wireframe} />
      </mesh>
      {/* Engine nozzle */}
      <mesh position={[0, -1.25, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.18, 0.35, 10]} />
        <meshStandardMaterial color="#0d0d0d" metalness={1} roughness={0.1} wireframe={wireframe} />
      </mesh>
    </group>
  );
}

// ─── Loaded GLB Ship ──────────────────────────────────────────────────────────

function GLBShip({ url, wireframe, onLoaded }) {
  const { scene } = useGLTF(url);
  useEffect(() => {
    if (scene && onLoaded) onLoaded(scene);
  }, [scene, onLoaded]);

  useEffect(() => {
    scene.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone();
        child.material.wireframe = wireframe;
      }
    });
  }, [scene, wireframe]);

  return <primitive object={scene} castShadow receiveShadow />;
}

// ─── Socket Sphere ────────────────────────────────────────────────────────────

function SocketMarker({ socket, selected, onClick }) {
  const meshRef = useRef();
  const color = socketTypeColor(socket.type);

  useFrame(({ clock }) => {
    if (meshRef.current && selected) {
      meshRef.current.material.emissiveIntensity =
        0.6 + Math.sin(clock.elapsedTime * 4) * 0.4;
    }
  });

  return (
    <group position={[socket.position.x, socket.position.y, socket.position.z]}>
      {/* Sphere */}
      <mesh
        ref={meshRef}
        onClick={e => { e.stopPropagation(); onClick(socket.id); }}
      >
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 1.0 : 0.3}
          transparent
          opacity={0.9}
        />
      </mesh>
      {/* Axis lines */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={6}
            array={new Float32Array([
              -0.14,0,0, 0.14,0,0,
              0,-0.14,0, 0,0.14,0,
              0,0,-0.14, 0,0,0.14,
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} opacity={0.6} transparent />
      </lineSegments>
      {/* Label */}
      <Html distanceFactor={6} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(0,0,0,0.75)',
          color: color,
          fontSize: '10px',
          fontFamily: 'monospace',
          padding: '2px 6px',
          borderRadius: 3,
          border: `1px solid ${color}44`,
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}>
          {socket.name}
        </div>
      </Html>
    </group>
  );
}

// ─── Mirror Ghost ─────────────────────────────────────────────────────────────

function MirroredSocketMarker({ socket }) {
  const color = socketTypeColor(socket.type);
  const mx = -socket.position.x;
  if (Math.abs(mx - socket.position.x) < 0.001) return null;
  return (
    <group position={[mx, socket.position.y, socket.position.z]}>
      <mesh>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.1}
          transparent
          opacity={0.35}
          wireframe
        />
      </mesh>
      <Html distanceFactor={6} style={{ pointerEvents: 'none' }}>
        <div style={{
          background: 'rgba(0,0,0,0.5)',
          color: color + '88',
          fontSize: '10px',
          fontFamily: 'monospace',
          padding: '2px 6px',
          borderRadius: 3,
          border: `1px dashed ${color}33`,
          whiteSpace: 'nowrap',
        }}>
          {socket.name} (mirror)
        </div>
      </Html>
    </group>
  );
}

// ─── Transform Wrapper ────────────────────────────────────────────────────────

function SocketTransformControl({ socket, mode, onPositionChange }) {
  const ref = useRef();
  const { camera, gl } = useThree();

  useEffect(() => {
    const controls = ref.current;
    if (!controls) return;

    const onChange = () => {
      if (ref.current?.object) {
        const p = ref.current.object.position;
        onPositionChange(socket.id, { x: p.x, y: p.y, z: p.z });
      }
    };
    controls.addEventListener('objectChange', onChange);
    return () => controls.removeEventListener('objectChange', onChange);
  }, [socket.id, onPositionChange]);

  return (
    <TransformControls
      ref={ref}
      camera={camera}
      domElement={gl.domElement}
      mode={mode}
      position={[socket.position.x, socket.position.y, socket.position.z]}
      size={0.6}
    >
      <mesh visible={false}>
        <sphereGeometry args={[0.06]} />
      </mesh>
    </TransformControls>
  );
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene({
  glbUrl,
  sockets,
  selectedId,
  transformMode,
  wireframe,
  showMirrors,
  onSelectSocket,
  onPositionChange,
  onMeshLoaded,
}) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
      <directionalLight position={[-5, -2, -5]} intensity={0.3} color="#4488ff" />
      <pointLight position={[0, 4, 0]} intensity={0.5} color="#ffffff" />

      <Suspense fallback={null}>
        {glbUrl ? (
          <GLBShip url={glbUrl} wireframe={wireframe} onLoaded={onMeshLoaded} />
        ) : (
          <DefaultShip wireframe={wireframe} />
        )}
      </Suspense>

      {/* Grid floor */}
      <Grid
        position={[0, -2, 0]}
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#1a3a4a"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#0af"
        fadeDistance={18}
        fadeStrength={1}
        infiniteGrid
      />

      {/* Socket markers */}
      {sockets.map(s => (
        <SocketMarker
          key={s.id}
          socket={s}
          selected={s.id === selectedId}
          onClick={onSelectSocket}
        />
      ))}

      {/* Mirror ghosts */}
      {showMirrors && sockets.map(s =>
        s.mirror ? <MirroredSocketMarker key={s.id + '_m'} socket={s} /> : null
      )}

      {/* Active transform gizmo */}
      {selectedId && (() => {
        const s = sockets.find(x => x.id === selectedId);
        return s ? (
          <SocketTransformControl
            socket={s}
            mode={transformMode}
            onPositionChange={onPositionChange}
          />
        ) : null;
      })()}

      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport
          axisColors={['#ff4444', '#44ff44', '#4444ff']}
          labelColor="white"
        />
      </GizmoHelper>

      <Environment preset="night" />
    </>
  );
}

// ─── UI Components ────────────────────────────────────────────────────────────

function ToolButton({ active, onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: active ? 'rgba(0,175,255,0.2)' : 'rgba(255,255,255,0.04)',
        border: active ? '1px solid #0af' : '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        color: active ? '#0af' : '#888',
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: 'monospace',
        padding: '6px 10px',
        transition: 'all 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {children}
    </button>
  );
}

function SocketListItem({ socket, selected, onClick, onDelete }) {
  const color = socketTypeColor(socket.type);
  return (
    <div
      onClick={() => onClick(socket.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 6,
        cursor: 'pointer',
        background: selected ? `${color}18` : 'transparent',
        border: selected ? `1px solid ${color}55` : '1px solid transparent',
        transition: 'all 0.15s',
        marginBottom: 3,
      }}
    >
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: color, flexShrink: 0,
        boxShadow: `0 0 6px ${color}`,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#ddd', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {socket.name}
        </div>
        <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace' }}>
          {socket.type}{socket.mirror ? ' · mirror' : ''}
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete(socket.id); }}
        style={{
          background: 'none', border: 'none', color: '#444',
          cursor: 'pointer', fontSize: 14, lineHeight: 1,
          padding: '0 2px',
        }}
        title="Delete socket"
      >×</button>
    </div>
  );
}

function VectorDisplay({ label, vec }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
      <span style={{ color: '#555', fontSize: 10, fontFamily: 'monospace', width: 14 }}>{label}</span>
      {['x','y','z'].map((axis, i) => (
        <div key={axis} style={{
          flex: 1,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 4,
          padding: '3px 6px',
          fontFamily: 'monospace',
          fontSize: 11,
          color: ['#ff6666','#66ff66','#6699ff'][i],
          textAlign: 'right',
        }}>
          {vec[axis].toFixed(3)}
        </div>
      ))}
    </div>
  );
}

// ─── Add Socket Dialog ────────────────────────────────────────────────────────

function AddSocketDialog({ onAdd, onCancel }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('weapon');
  const [mirror, setMirror] = useState(false);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#0d1520',
        border: '1px solid #0af4',
        borderRadius: 12,
        padding: 24,
        width: 320,
        boxShadow: '0 0 40px #0af1',
      }}>
        <div style={{ fontSize: 14, color: '#0af', fontFamily: 'monospace', marginBottom: 16, letterSpacing: 1 }}>
          NEW SOCKET
        </div>

        <label style={{ fontSize: 11, color: '#666', fontFamily: 'monospace', display: 'block', marginBottom: 4 }}>
          NAME
        </label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name && onAdd({ name, type, mirror })}
          placeholder="e.g. left_cannon, main_exhaust"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid #0af4',
            borderRadius: 6, padding: '8px 10px',
            color: '#ddd', fontSize: 12, fontFamily: 'monospace',
            marginBottom: 14, outline: 'none',
          }}
        />

        <label style={{ fontSize: 11, color: '#666', fontFamily: 'monospace', display: 'block', marginBottom: 6 }}>
          TYPE
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
          {SOCKET_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              style={{
                background: type === t.id ? `${t.color}22` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${type === t.id ? t.color : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 6, padding: '6px 8px',
                color: type === t.id ? t.color : '#666',
                cursor: 'pointer', fontSize: 11, fontFamily: 'monospace',
                textAlign: 'left', display: 'flex', gap: 6, alignItems: 'center',
              }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer', marginBottom: 18,
          fontSize: 11, color: '#888', fontFamily: 'monospace',
        }}>
          <input
            type="checkbox"
            checked={mirror}
            onChange={e => setMirror(e.target.checked)}
            style={{ accentColor: '#0af', cursor: 'pointer' }}
          />
          Mirror on X axis (symmetric emitters)
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '8px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, color: '#666',
              cursor: 'pointer', fontFamily: 'monospace', fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => name && onAdd({ name, type, mirror })}
            disabled={!name}
            style={{
              flex: 1, padding: '8px',
              background: name ? 'rgba(0,175,255,0.2)' : 'rgba(0,0,0,0.2)',
              border: `1px solid ${name ? '#0af' : 'rgba(255,255,255,0.05)'}`,
              borderRadius: 6,
              color: name ? '#0af' : '#333',
              cursor: name ? 'pointer' : 'not-allowed',
              fontFamily: 'monospace', fontSize: 12,
            }}
          >
            Create Socket
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * GLBSocketEditor
 *
 * Props (all optional):
 * @param {string}   [initialGlbUrl]     - URL to load a GLB on mount
 * @param {Array}    [initialSockets]    - Pre-seeded socket array
 * @param {Function} [onExport]          - Called with JSON data when user exports
 * @param {string}   [style]             - Inline style for outer container
 * @param {string}   [className]         - CSS class for outer container
 */
export default function GLBSocketEditor({
  initialGlbUrl = DEFAULT_SHIP_URL,
  initialSockets = [],
  onExport,
  style,
  className,
}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [glbUrl, setGlbUrl]               = useState(initialGlbUrl);
  const [sockets, setSockets]             = useState(initialSockets);
  const [selectedId, setSelectedId]       = useState(null);
  const [transformMode, setTransformMode] = useState('translate');
  const [wireframe, setWireframe]         = useState(false);
  const [showMirrors, setShowMirrors]     = useState(true);
  const [showDialog, setShowDialog]       = useState(false);
  const [orbitEnabled, setOrbitEnabled]   = useState(true);
  const [exportFlash, setExportFlash]     = useState(false);
  const fileRef = useRef();

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedSocket = sockets.find(s => s.id === selectedId) ?? null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleGlbLoad = useCallback(e => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setGlbUrl(url);
    setSelectedId(null);
  }, []);

  const handleAddSocket = useCallback(({ name, type, mirror }) => {
    const newSocket = {
      id: generateId(),
      name,
      type,
      mirror,
      position: { x: 0, y: 0, z: 0 },
    };
    setSockets(prev => [...prev, newSocket]);
    setSelectedId(newSocket.id);
    setShowDialog(false);
  }, []);

  const handleDeleteSocket = useCallback(id => {
    setSockets(prev => prev.filter(s => s.id !== id));
    setSelectedId(prev => prev === id ? null : prev);
  }, []);

  const handlePositionChange = useCallback((id, position) => {
    setSockets(prev => prev.map(s => s.id === id ? { ...s, position } : s));
  }, []);

  const handleExport = useCallback(() => {
    const data = {
      version: '1.0',
      mesh: glbUrl ? 'custom' : 'default_ship',
      exportedAt: new Date().toISOString(),
      sockets: sockets.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        position: s.position,
        mirror: s.mirror,
        mirroredPosition: s.mirror
          ? { x: -s.position.x, y: s.position.y, z: s.position.z }
          : null,
      })),
    };
    const json = JSON.stringify(data, null, 2);
    if (onExport) {
      onExport(data);
    } else {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'socket-config.json';
      a.click();
    }
    setExportFlash(true);
    setTimeout(() => setExportFlash(false), 1200);
  }, [glbUrl, sockets, onExport]);

  const handleRenameSocket = useCallback((id, newName) => {
    setSockets(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
  }, []);

  const handleToggleMirror = useCallback(id => {
    setSockets(prev => prev.map(s => s.id === id ? { ...s, mirror: !s.mirror } : s));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = e => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'g' || e.key === 'G') setTransformMode('translate');
      if (e.key === 'r' || e.key === 'R') setTransformMode('rotate');
      if (e.key === 's' || e.key === 'S') setTransformMode('scale');
      if (e.key === 'Escape') setSelectedId(null);
      if (e.key === 'Delete' && selectedId) handleDeleteSocket(selectedId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, handleDeleteSocket]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        background: '#06101a',
        fontFamily: 'monospace',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* ── 3D Viewport ──────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Canvas
          shadows
          camera={{ position: [0, 2, 5], fov: 50 }}
          style={{ background: 'radial-gradient(ellipse at center, #0a1a28 0%, #04090f 100%)' }}
        >
          <Scene
            glbUrl={glbUrl}
            sockets={sockets}
            selectedId={selectedId}
            transformMode={transformMode}
            wireframe={wireframe}
            showMirrors={showMirrors}
            onSelectSocket={setSelectedId}
            onPositionChange={handlePositionChange}
            onMeshLoaded={() => {}}
          />
          <OrbitControls
            enabled={orbitEnabled}
            enableDamping
            dampingFactor={0.05}
            makeDefault
          />
        </Canvas>

        {/* Top toolbar */}
        <div style={{
          position: 'absolute', top: 12, left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex', gap: 6,
          background: 'rgba(6,16,26,0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(0,175,255,0.2)',
          borderRadius: 8, padding: '6px 10px',
        }}>
          <ToolButton
            active={transformMode === 'translate'}
            onClick={() => setTransformMode('translate')}
            title="Move (G)"
          >
            ↔ Move <kbd style={{ fontSize: 9, opacity: 0.5 }}>G</kbd>
          </ToolButton>
          <ToolButton
            active={transformMode === 'rotate'}
            onClick={() => setTransformMode('rotate')}
            title="Rotate (R)"
          >
            ↻ Rotate <kbd style={{ fontSize: 9, opacity: 0.5 }}>R</kbd>
          </ToolButton>
          <ToolButton
            active={transformMode === 'scale'}
            onClick={() => setTransformMode('scale')}
            title="Scale (S)"
          >
            ⊡ Scale <kbd style={{ fontSize: 9, opacity: 0.5 }}>S</kbd>
          </ToolButton>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
          <ToolButton active={wireframe} onClick={() => setWireframe(v => !v)} title="Toggle wireframe">
            ⬡ Wire
          </ToolButton>
          <ToolButton active={showMirrors} onClick={() => setShowMirrors(v => !v)} title="Show mirror ghosts">
            ⟺ Mirror
          </ToolButton>
        </div>

        {/* Hint bar */}
        <div style={{
          position: 'absolute', bottom: 12, left: 12,
          color: '#334', fontSize: 10, fontFamily: 'monospace',
          lineHeight: 1.7,
        }}>
          <div>Click socket to select · Drag gizmo to move</div>
          <div>G/R/S — transform mode · ESC — deselect · DEL — delete</div>
        </div>
      </div>

      {/* ── Right Panel ──────────────────────────────────────────── */}
      <div style={{
        width: 260,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid rgba(0,175,255,0.15)',
        background: 'rgba(6,16,26,0.95)',
        backdropFilter: 'blur(12px)',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 16px 10px',
          borderBottom: '1px solid rgba(0,175,255,0.1)',
        }}>
          <div style={{
            fontSize: 11,
            color: '#0af',
            letterSpacing: 3,
            marginBottom: 2,
          }}>
            SOCKET EDITOR
          </div>
          <div style={{ fontSize: 10, color: '#334' }}>
            GLB mesh blueprint tool
          </div>
        </div>

        {/* Mesh section */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 10, color: '#445', marginBottom: 6, letterSpacing: 1 }}>MESH</div>
          <button
            onClick={() => fileRef.current.click()}
            style={{
              width: '100%',
              background: 'rgba(0,175,255,0.06)',
              border: '1px dashed rgba(0,175,255,0.3)',
              borderRadius: 6, padding: '8px',
              color: '#0af', cursor: 'pointer',
              fontSize: 11, fontFamily: 'monospace',
              transition: 'all 0.15s',
            }}
          >
            {glbUrl ? '📦 Replace GLB…' : '📁 Load GLB…'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".glb,.gltf"
            style={{ display: 'none' }}
            onChange={handleGlbLoad}
          />
          {!glbUrl && (
            <div style={{ fontSize: 9, color: '#334', marginTop: 5, textAlign: 'center' }}>
              Using default ship placeholder
            </div>
          )}
          {glbUrl && (
            <button
              onClick={() => { setGlbUrl(null); setSelectedId(null); }}
              style={{
                marginTop: 4, width: '100%',
                background: 'none', border: 'none',
                color: '#444', cursor: 'pointer',
                fontSize: 10, fontFamily: 'monospace',
              }}
            >
              ← revert to default ship
            </button>
          )}
        </div>

        {/* Sockets header */}
        <div style={{
          padding: '10px 16px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ fontSize: 10, color: '#445', letterSpacing: 1 }}>
            SOCKETS ({sockets.length})
          </div>
          <button
            onClick={() => setShowDialog(true)}
            style={{
              background: 'rgba(0,175,255,0.15)',
              border: '1px solid rgba(0,175,255,0.4)',
              borderRadius: 5, padding: '3px 8px',
              color: '#0af', cursor: 'pointer',
              fontSize: 11, fontFamily: 'monospace',
            }}
          >
            + Add
          </button>
        </div>

        {/* Socket list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
          {sockets.length === 0 && (
            <div style={{
              textAlign: 'center', color: '#223',
              fontSize: 11, padding: '24px 0',
              lineHeight: 1.8,
            }}>
              No sockets yet.<br />
              <span style={{ color: '#0af4', fontSize: 10 }}>
                Click "+ Add" to create one
              </span>
            </div>
          )}
          {sockets.map(s => (
            <SocketListItem
              key={s.id}
              socket={s}
              selected={s.id === selectedId}
              onClick={setSelectedId}
              onDelete={handleDeleteSocket}
            />
          ))}
        </div>

        {/* Selected socket inspector */}
        {selectedSocket && (
          <div style={{
            borderTop: '1px solid rgba(0,175,255,0.15)',
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: 10, color: '#0af', letterSpacing: 1, marginBottom: 8 }}>
              INSPECTOR
            </div>

            {/* Rename */}
            <input
              value={selectedSocket.name}
              onChange={e => handleRenameSocket(selectedSocket.id, e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(0,175,255,0.2)',
                borderRadius: 5, padding: '5px 8px',
                color: '#ccc', fontSize: 11, fontFamily: 'monospace',
                marginBottom: 8, outline: 'none',
              }}
            />

            <VectorDisplay label="P" vec={selectedSocket.position} />

            {/* Mirror toggle */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 10, color: '#556', cursor: 'pointer',
              marginTop: 8,
            }}>
              <input
                type="checkbox"
                checked={selectedSocket.mirror}
                onChange={() => handleToggleMirror(selectedSocket.id)}
                style={{ accentColor: '#0af' }}
              />
              X-axis mirror
            </label>

            {selectedSocket.mirror && (
              <VectorDisplay
                label="M"
                vec={{
                  x: -selectedSocket.position.x,
                  y: selectedSocket.position.y,
                  z: selectedSocket.position.z,
                }}
              />
            )}
          </div>
        )}

        {/* Export */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={handleExport}
            style={{
              width: '100%', padding: '9px',
              background: exportFlash
                ? 'rgba(0,255,128,0.2)'
                : 'rgba(0,175,255,0.12)',
              border: `1px solid ${exportFlash ? '#0f8' : '#0af'}`,
              borderRadius: 7,
              color: exportFlash ? '#0f8' : '#0af',
              cursor: 'pointer', fontFamily: 'monospace', fontSize: 12,
              transition: 'all 0.2s',
              letterSpacing: 1,
            }}
          >
            {exportFlash ? '✓ EXPORTED' : '↓ EXPORT JSON'}
          </button>
          <div style={{ fontSize: 9, color: '#223', marginTop: 4, textAlign: 'center' }}>
            {sockets.length} socket{sockets.length !== 1 ? 's' : ''} · socket-config.json
          </div>
        </div>
      </div>

      {/* Add socket dialog */}
      {showDialog && (
        <AddSocketDialog
          onAdd={handleAddSocket}
          onCancel={() => setShowDialog(false)}
        />
      )}
    </div>
  );
}
