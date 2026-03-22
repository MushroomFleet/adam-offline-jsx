/**
 * Warp-effect-tunnel.jsx
 * ─────────────────────────────────────────────────────────────
 * Stargate / warp-tunnel visual effect component.
 * Drop-in for Vite + React + TypeScript + Three.js projects.
 *
 * PROPS
 * ──────────────────────────────────────────────────
 * active          boolean   – triggers the full sequence
 * shipGlbUrl      string    – optional path to a .glb ship asset
 *                             (falls back to a diamond placeholder)
 * destinationName string    – label shown on arrival
 * onArrival       () => void – called when warp completes
 * color           string    – accent hex (default '#00d4ff')
 * speed           number    – tunnel speed multiplier (default 1)
 *
 * MIGRATION TO TSX
 * ──────────────────────────────────────────────────
 * 1. Rename file to Warp-effect-tunnel.tsx
 * 2. Add interface WarpTunnelProps above the component.
 * 3. Replace PropTypes block with TypeScript interface.
 * 4. Import GLTFLoader from 'three/examples/jsm/loaders/GLTFLoader'
 *    (already wired; just uncomment the TSX import line below).
 * 5. All Three.js types resolve automatically via @types/three.
 *
 * DEPENDENCIES (add to package.json if not present)
 * ──────────────────────────────────────────────────
 * three  ^0.165.0
 * ─────────────────────────────────────────────────────────────
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
} from 'react';
import * as THREE from 'three';
// TSX: import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ─── tiny utility ────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ─── WARP PHASES ─────────────────────────────────────────────
const PHASE = {
  IDLE:      'idle',       // nothing happening
  APPROACH:  'approach',   // gate pulses, player nears
  ENTER:     'enter',      // stretching into the gate ring
  TUNNEL:    'tunnel',     // inside the warp tube
  EMERGE:    'emerge',     // white flash, slow decel
  ARRIVED:   'arrived',    // new system
};

// ─── SHADERS ─────────────────────────────────────────────────

/* Gate ring: animated torus with energy waves */
const gateVertGLSL = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  uniform float uTime;
  void main(){
    vUv = uv;
    vNormal = normalMatrix * normal;
    vec3 pos = position;
    // subtle breathing
    float breathe = sin(uTime * 1.4) * 0.018;
    pos *= 1.0 + breathe;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.0);
  }
`;
const gateFragGLSL = /* glsl */`
  varying vec2 vUv;
  varying vec3 vNormal;
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uPulse;
  void main(){
    // fresnel
    vec3 viewDir = normalize(cameraPosition - vNormal);
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.,0.,1.))), 2.5);
    // animated energy rings along the torus tube
    float wave = sin(vUv.x * 30.0 - uTime * 4.0) * 0.5 + 0.5;
    wave *= sin(vUv.y * 6.28318) * 0.5 + 0.5;
    float glow = fresnel * 0.6 + wave * 0.4;
    glow *= 1.0 + uPulse * 1.5;
    vec3 col = uColor * glow;
    col += uColor * 0.12; // base fill
    gl_FragColor = vec4(col, clamp(glow + 0.15, 0.0, 1.0));
  }
`;

/* Warp tube: procedural star-stream cylinder */
const tunnelVertGLSL = /* glsl */`
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }
`;
const tunnelFragGLSL = /* glsl */`
  varying vec2 vUv;
  uniform float uTime;
  uniform float uSpeed;
  uniform vec3  uColor;
  uniform float uWhiteout;

  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }

  void main(){
    // radial coord
    vec2 uv = vUv * 2.0 - 1.0;
    float r  = length(uv);
    float a  = atan(uv.y, uv.x);

    // star streaks: tile in angle + depth
    float depth   = vUv.y - uTime * uSpeed * 0.55;
    float sector  = floor(a * 18.0 / 6.28318);
    float starSeed = hash(vec2(sector, floor(depth * 8.0)));
    float streak  = step(0.92, starSeed) * (1.0 - fract(depth * 8.0));
    streak *= smoothstep(0.95, 1.0, r) * smoothstep(1.0, 0.6, r);

    // tunnel wall gradient
    float wall = smoothstep(0.55, 1.0, r);
    vec3  wallCol = uColor * wall * 0.35;

    // central glow
    float core = exp(-r * r * 3.5) * 0.7;
    vec3  col  = wallCol + uColor * streak + uColor * core;

    // whiteout on arrive
    col = mix(col, vec3(1.0), uWhiteout);

    float alpha = clamp(wall * 0.9 + streak + core * 0.5, 0.0, 1.0);
    alpha = mix(alpha, 1.0, uWhiteout);

    gl_FragColor = vec4(col, alpha);
  }
`;

/* Portal disc: swirling vortex in the gate center */
const portalFragGLSL = /* glsl */`
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uOpen;   // 0→1 as gate opens

  float noise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a = fract(sin(dot(i,             vec2(127.1,311.7)))*43758.5);
    float b = fract(sin(dot(i+vec2(1,0),   vec2(127.1,311.7)))*43758.5);
    float c = fract(sin(dot(i+vec2(0,1),   vec2(127.1,311.7)))*43758.5);
    float d = fract(sin(dot(i+vec2(1,1),   vec2(127.1,311.7)))*43758.5);
    return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
  }

  void main(){
    vec2 uv = vUv * 2.0 - 1.0;
    float r = length(uv);
    float a = atan(uv.y, uv.x);

    // swirl
    float swirl = a + uTime * 1.2 + r * 3.5;
    float n = noise(vec2(cos(swirl)*r*4.0, sin(swirl)*r*4.0 + uTime));
    n = n * 0.5 + noise(vec2(cos(swirl*0.5)*r*7.0, sin(swirl*0.5)*r*7.0 - uTime*0.7)) * 0.5;

    float mask = smoothstep(1.0, 0.7, r) * uOpen;
    vec3 col = mix(uColor * 0.3, uColor, n) * mask;
    col += vec3(1.0) * pow(1.0-r, 5.0) * mask * 0.8; // bright core

    gl_FragColor = vec4(col, mask * (0.6 + n * 0.4));
  }
`;

// Reuse vert for flat quads
const flatVertGLSL = /* glsl */`
  varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;

// ─── DIAMOND SHIP PLACEHOLDER ────────────────────────────────
function buildDiamondShip() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xaaddff,
    emissive: 0x003366,
    roughness: 0.15,
    metalness: 0.9,
    transparent: true,
    opacity: 0.92,
  });

  // body: elongated octahedron
  const body = new THREE.OctahedronGeometry(0.18, 0);
  body.scale(0.6, 1.8, 0.6);
  group.add(new THREE.Mesh(body, mat));

  // wing fins
  const wingGeo = new THREE.ConeGeometry(0.22, 0.12, 4);
  wingGeo.rotateZ(Math.PI / 2);
  const wingMat = mat.clone();
  wingMat.opacity = 0.7;
  const wL = new THREE.Mesh(wingGeo, wingMat);
  wL.position.set(-0.22, -0.05, 0);
  const wR = wL.clone();
  wR.position.set(0.22, -0.05, 0);
  group.add(wL, wR);

  // engine glow
  const glowGeo = new THREE.SphereGeometry(0.06, 8, 8);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.y = -0.34;
  group.add(glow);

  group.rotation.x = Math.PI; // nose forward
  return group;
}

// ─── COMPONENT ───────────────────────────────────────────────
export default function WarpEffectTunnel({
  active        = false,
  shipGlbUrl    = null,
  destinationName = 'Unknown System',
  onArrival     = () => {},
  color         = '#00d4ff',
  speed         = 1,
}) {
  const mountRef   = useRef(null);
  const stateRef   = useRef({
    phase:       PHASE.IDLE,
    t:           0,      // phase timer (seconds)
    phaseDur:    {},     // phase durations
    uniforms:    {},
    scene:       null,
    camera:      null,
    renderer:    null,
    gate:        null,   // THREE.Group
    portal:      null,
    tunnel:      null,
    ship:        null,
    particles:   null,
    animId:      null,
    lastTime:    0,
    colorVec:    new THREE.Color(color),
  });
  const [phase,    setPhase]    = useState(PHASE.IDLE);
  const [arrived,  setArrived]  = useState(false);
  const [flashOpa, setFlashOpa] = useState(0);

  // ── build scene ─────────────────────────────────────────────
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const s = stateRef.current;

    // renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    // scene + camera
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, el.clientWidth / el.clientHeight, 0.01, 1000);
    camera.position.set(0, 0, 4);

    // lighting
    scene.add(new THREE.AmbientLight(0x112233, 3));
    const pt = new THREE.PointLight(new THREE.Color(color), 80, 12);
    pt.position.set(0, 0, 2);
    scene.add(pt);

    // ── starfield backdrop ──────────────────────────────────
    const starGeo = new THREE.BufferGeometry();
    const starPts = new Float32Array(3000 * 3);
    for (let i = 0; i < 3000; i++) {
      starPts[i*3]   = (Math.random()-0.5)*200;
      starPts[i*3+1] = (Math.random()-0.5)*200;
      starPts[i*3+2] = (Math.random()-0.5)*200;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPts, 3));
    const starMat  = new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, sizeAttenuation: true });
    scene.add(new THREE.Points(starGeo, starMat));

    // ── gate group ──────────────────────────────────────────
    const gate = new THREE.Group();
    scene.add(gate);

    const accentColor = new THREE.Color(color);

    // torus ring
    const ringUni = {
      uTime:  { value: 0 },
      uColor: { value: accentColor },
      uPulse: { value: 0 },
    };
    const ringMat = new THREE.ShaderMaterial({
      vertexShader:   gateVertGLSL,
      fragmentShader: gateFragGLSL,
      uniforms:       ringUni,
      transparent:    true,
      depthWrite:     false,
      side:           THREE.DoubleSide,
    });
    const ringGeo  = new THREE.TorusGeometry(1.4, 0.09, 20, 120);
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    gate.add(ringMesh);

    // inner ring (thinner, counter-rotate)
    const ring2Mat = ringMat.clone();
    ring2Mat.uniforms = {
      uTime:  { value: 0 },
      uColor: { value: accentColor.clone().multiplyScalar(0.7) },
      uPulse: { value: 0 },
    };
    const ring2Geo  = new THREE.TorusGeometry(1.25, 0.035, 12, 100);
    const ring2Mesh = new THREE.Mesh(ring2Geo, ring2Mat);
    gate.add(ring2Mesh);

    // portal disc
    const portalUni = {
      uTime:  { value: 0 },
      uColor: { value: accentColor },
      uOpen:  { value: 0 },
    };
    const portalMat = new THREE.ShaderMaterial({
      vertexShader:   flatVertGLSL,
      fragmentShader: portalFragGLSL,
      uniforms:       portalUni,
      transparent:    true,
      depthWrite:     false,
      side:           THREE.DoubleSide,
    });
    const portalGeo  = new THREE.CircleGeometry(1.22, 64);
    const portalMesh = new THREE.Mesh(portalGeo, portalMat);
    portalMesh.position.z = -0.01;
    gate.add(portalMesh);

    // ── warp tunnel cylinder ─────────────────────────────────
    const tunnelUni = {
      uTime:    { value: 0 },
      uSpeed:   { value: speed },
      uColor:   { value: accentColor },
      uWhiteout:{ value: 0 },
    };
    const tunnelMat = new THREE.ShaderMaterial({
      vertexShader:   tunnelVertGLSL,
      fragmentShader: tunnelFragGLSL,
      uniforms:       tunnelUni,
      transparent:    true,
      depthWrite:     false,
      side:           THREE.BackSide,
    });
    const tunnelGeo  = new THREE.CylinderGeometry(2.2, 2.2, 40, 64, 1, true);
    const tunnelMesh = new THREE.Mesh(tunnelGeo, tunnelMat);
    tunnelMesh.rotation.x = Math.PI / 2;
    tunnelMesh.position.z = -18;
    tunnelMesh.visible = false;
    scene.add(tunnelMesh);

    // ── particle ring (gate energy) ──────────────────────────
    const pCount = 180;
    const pGeo   = new THREE.BufferGeometry();
    const pPos   = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const a = (i / pCount) * Math.PI * 2;
      const r = 1.4 + (Math.random()-0.5)*0.12;
      pPos[i*3]   = Math.cos(a)*r;
      pPos[i*3+1] = Math.sin(a)*r;
      pPos[i*3+2] = (Math.random()-0.5)*0.05;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: accentColor,
      size:  0.045,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
    });
    const particles = new THREE.Points(pGeo, pMat);
    gate.add(particles);

    // ── ship ────────────────────────────────────────────────
    let ship;
    if (shipGlbUrl) {
      // TSX users: uncomment GLTFLoader import at top, then swap this block:
      // const loader = new GLTFLoader();
      // loader.load(shipGlbUrl, (gltf) => {
      //   ship = gltf.scene; ship.scale.setScalar(0.15); scene.add(ship);
      //   stateRef.current.ship = ship;
      // });
      ship = buildDiamondShip(); // fallback until loader wired
    } else {
      ship = buildDiamondShip();
    }
    ship.position.set(0, 0, 3.5);
    ship.visible = false;
    scene.add(ship);

    // ── store refs ──────────────────────────────────────────
    Object.assign(s, {
      scene, camera, renderer,
      gate, ring: ringMesh, ring2: ring2Mesh,
      ringUni, ring2Uni: ring2Mat.uniforms,
      portal: portalMesh, portalUni,
      tunnel: tunnelMesh, tunnelUni,
      particles,
      ship,
      pt,
      phaseDur: {
        [PHASE.APPROACH]:  2.5,
        [PHASE.ENTER]:     1.6,
        [PHASE.TUNNEL]:    4.2,
        [PHASE.EMERGE]:    1.8,
        [PHASE.ARRIVED]:   2.0,
      },
    });

    // resize
    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(s.animId);
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── update color when prop changes ──────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    const c = new THREE.Color(color);
    if (s.ringUni?.uColor)    s.ringUni.uColor.value.copy(c);
    if (s.ring2Uni?.uColor)   s.ring2Uni.uColor.value.copy(c);
    if (s.portalUni?.uColor)  s.portalUni.uColor.value.copy(c);
    if (s.tunnelUni?.uColor)  s.tunnelUni.uColor.value.copy(c);
  }, [color]);

  // ── animation loop ──────────────────────────────────────────
  const tick = useCallback((now) => {
    const s = stateRef.current;
    s.animId = requestAnimationFrame(tick);
    const dt = Math.min((now - s.lastTime) / 1000, 0.05);
    s.lastTime = now;
    const elapsed = s.t;

    const {
      scene, camera, renderer,
      gate, ring, ring2, ringUni, ring2Uni,
      portal, portalUni,
      tunnel, tunnelUni,
      particles, ship, pt,
      phase: ph, phaseDur,
    } = s;

    if (!renderer) return;

    // global time
    const T = (performance.now() / 1000);
    if (ringUni) {
      ringUni.uTime.value  = T;
      ring2Uni.uTime.value = T;
      portalUni.uTime.value = T;
      tunnelUni.uTime.value = T;
    }

    // ── gate idle spin ─────────────────────────────────────
    if (gate) {
      ring.rotation.z  =  T * 0.25;
      ring2.rotation.z = -T * 0.38;
    }
    if (particles) particles.rotation.z = T * 0.15;

    // ── phase logic ─────────────────────────────────────────
    if (ph !== PHASE.IDLE && ph !== PHASE.ARRIVED) {
      s.t += dt;
    }
    const dur  = phaseDur[ph] || 1;
    const prog = clamp(s.t / dur, 0, 1);   // 0→1 within phase

    switch (ph) {
      // ── APPROACH ──────────────────────────────────────────
      case PHASE.APPROACH: {
        // camera glides toward gate
        camera.position.z = lerp(4, 1.8, prog);
        // portal opens
        portalUni.uOpen.value = lerp(0, 1, prog);
        ringUni.uPulse.value  = Math.sin(T * 6) * 0.3 * prog;
        ring2Uni.uPulse.value = Math.sin(T * 8 + 1) * 0.3 * prog;
        pt.intensity = lerp(80, 220, prog);

        if (prog >= 1) advancePhase(PHASE.ENTER);
        break;
      }
      // ── ENTER ─────────────────────────────────────────────
      case PHASE.ENTER: {
        camera.position.z = lerp(1.8, -0.5, prog);
        // massive fov stretch
        camera.fov = lerp(75, 120, prog);
        camera.updateProjectionMatrix();
        portalUni.uOpen.value = 1;
        // ship appears ahead
        if (ship) {
          ship.visible = true;
          ship.position.z = lerp(3.5, 1.5, prog);
          ship.scale.setScalar(lerp(0.01, 1, prog));
        }

        if (prog >= 1) {
          // gate fades out, tunnel appears
          gate.visible = false;
          tunnel.visible = true;
          advancePhase(PHASE.TUNNEL);
        }
        break;
      }
      // ── TUNNEL ────────────────────────────────────────────
      case PHASE.TUNNEL: {
        // camera moves through tunnel
        camera.position.z = lerp(-0.5, -32, prog);
        camera.fov = lerp(120, 90, prog);
        camera.updateProjectionMatrix();
        tunnelUni.uSpeed.value = speed * (1 + prog * 2);
        // ship ahead in tunnel
        if (ship) {
          ship.position.z = camera.position.z + lerp(2.5, 1.5, prog);
          // gentle banking sway
          ship.rotation.z = Math.sin(T * 1.8) * 0.12;
          ship.rotation.x = Math.PI + Math.sin(T * 1.1) * 0.05;
        }

        if (prog >= 1) advancePhase(PHASE.EMERGE);
        break;
      }
      // ── EMERGE ────────────────────────────────────────────
      case PHASE.EMERGE: {
        camera.position.z = lerp(-32, -36, prog);
        tunnelUni.uWhiteout.value = prog;
        setFlashOpa(prog);

        if (prog >= 1) {
          tunnel.visible = false;
          if (ship) ship.visible = false;
          advancePhase(PHASE.ARRIVED);
        }
        break;
      }
      // ── ARRIVED ───────────────────────────────────────────
      case PHASE.ARRIVED: {
        // fade white out
        setFlashOpa(1 - prog);
        if (prog >= 1) {
          s.phase = PHASE.IDLE;
          setPhase(PHASE.IDLE);
          setArrived(true);
          onArrival();
        }
        break;
      }
      default: break;
    }

    renderer.render(scene, camera);
  }, [onArrival, speed]);

  function advancePhase(next) {
    stateRef.current.phase = next;
    stateRef.current.t = 0;
    setPhase(next);
  }

  // ── start loop ──────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    s.lastTime = performance.now();
    s.animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(s.animId);
  }, [tick]);

  // ── react to active prop ────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    const s = stateRef.current;
    if (s.phase !== PHASE.IDLE) return;
    // reset scene state
    if (s.gate)   s.gate.visible = true;
    if (s.tunnel) s.tunnel.visible = false;
    if (s.ship)   { s.ship.visible = false; s.ship.scale.setScalar(0.01); }
    if (s.camera) { s.camera.position.set(0,0,4); s.camera.fov = 75; s.camera.updateProjectionMatrix(); }
    if (s.portalUni) s.portalUni.uOpen.value = 0;
    if (s.tunnelUni) { s.tunnelUni.uWhiteout.value = 0; s.tunnelUni.uSpeed.value = speed; }
    setArrived(false);
    setFlashOpa(0);
    s.t = 0;
    s.phase = PHASE.APPROACH;
    setPhase(PHASE.APPROACH);
  }, [active, speed]);

  // ── public reset helper ─────────────────────────────────────
  // Call warpRef.current.reset() from parent to replay
  const reset = useCallback(() => {
    const s = stateRef.current;
    s.phase = PHASE.IDLE;
    setPhase(PHASE.IDLE);
    setArrived(false);
    setFlashOpa(0);
  }, []);

  // expose via ref if parent wraps with useImperativeHandle (TSX pattern)
  useEffect(() => {
    stateRef.current.reset = reset;
  }, [reset]);

  // ── derived UI labels ───────────────────────────────────────
  const phaseLabel = {
    [PHASE.IDLE]:     'GATE INACTIVE',
    [PHASE.APPROACH]: 'APPROACHING GATE',
    [PHASE.ENTER]:    'INITIATING WARP',
    [PHASE.TUNNEL]:   'WARP TUNNEL ACTIVE',
    [PHASE.EMERGE]:   'EXITING WARP',
    [PHASE.ARRIVED]:  `ARRIVED: ${destinationName}`,
  }[phase] || '';

  return (
    <div style={styles.root}>
      {/* Three.js canvas mount */}
      <div ref={mountRef} style={styles.canvas} />

      {/* Whiteout flash overlay */}
      <div style={{ ...styles.flash, opacity: flashOpa }} />

      {/* HUD */}
      <div style={styles.hud}>
        <div style={{ ...styles.hudLine, color }}>
          {'⬡ '.repeat(3)}
        </div>
        <div style={styles.hudLabel}>{phaseLabel}</div>
        {phase === PHASE.TUNNEL && (
          <div style={{ ...styles.hudSpeed, color }}>
            WARP {(speed * (1 + (stateRef.current.t / (stateRef.current.phaseDur[PHASE.TUNNEL]||4)) * 2)).toFixed(2)}×
          </div>
        )}
        <div style={{ ...styles.hudLine, color }}>
          {'⬡ '.repeat(3)}
        </div>
      </div>

      {/* Arrival banner */}
      {arrived && (
        <div style={styles.arrivalBanner}>
          <div style={{ ...styles.arrivalTitle, color }}>— ARRIVED —</div>
          <div style={styles.arrivalDest}>{destinationName}</div>
        </div>
      )}
    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────────
const styles = {
  root: {
    position: 'relative',
    width:    '100%',
    height:   '100%',
    minHeight:'400px',
    background:'#000008',
    overflow: 'hidden',
    fontFamily:"'Courier New', monospace",
  },
  canvas: {
    position: 'absolute',
    inset:    0,
    width:    '100%',
    height:   '100%',
  },
  flash: {
    position:        'absolute',
    inset:           0,
    background:      '#ffffff',
    pointerEvents:   'none',
    transition:      'opacity 0.05s',
  },
  hud: {
    position:  'absolute',
    bottom:    24,
    left:      '50%',
    transform: 'translateX(-50%)',
    textAlign: 'center',
    pointerEvents: 'none',
  },
  hudLine: {
    fontSize:      11,
    letterSpacing: 6,
    opacity:       0.6,
  },
  hudLabel: {
    color:         '#ffffff',
    fontSize:      13,
    letterSpacing: 4,
    textTransform: 'uppercase',
    margin:        '6px 0',
    textShadow:    '0 0 12px rgba(0,212,255,0.9)',
  },
  hudSpeed: {
    fontSize:      11,
    letterSpacing: 3,
    margin:        '2px 0 6px',
  },
  arrivalBanner: {
    position:   'absolute',
    top:        '50%',
    left:       '50%',
    transform:  'translate(-50%,-50%)',
    textAlign:  'center',
    pointerEvents: 'none',
    animation:  'fadeInUp 0.8s ease forwards',
  },
  arrivalTitle: {
    fontSize:      14,
    letterSpacing: 8,
    marginBottom:  10,
  },
  arrivalDest: {
    color:         '#ffffff',
    fontSize:      28,
    letterSpacing: 6,
    fontWeight:    300,
    textShadow:    '0 0 30px rgba(0,212,255,0.8)',
  },
};
