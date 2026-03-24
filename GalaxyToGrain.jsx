import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// GALAXY-TO-GRAIN DRILL-DOWN
// Demonstrates hierarchical constraint propagation across cosmic scales
// Position-is-seed methodology: coordinates determine all properties
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// HASH FUNCTIONS: Pure deterministic generation
// ─────────────────────────────────────────────────────────────────────────────

const splitmix64 = (seed) => {
  let z = BigInt(seed) + 0x9e3779b97f4a7c15n;
  z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n;
  z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn;
  z = z ^ (z >> 31n);
  return Number(z & 0xffffffffn) / 0xffffffff;
};

const hashCoord = (x, y, salt = 0, seed = 42) => {
  const a = Math.floor(x * 1000);
  const b = Math.floor(y * 1000);
  const combined = (a * 73856093) ^ (b * 19349663) ^ (salt * 83492791) ^ seed;
  return splitmix64(Math.abs(combined));
};

const hashToRange = (hash, min, max) => min + hash * (max - min);
const hashToBool = (hash, probability) => hash < probability;

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLEX NOISE: For coherent spatial variation
// ─────────────────────────────────────────────────────────────────────────────

const grad2 = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1]
];

const permutation = Array.from({ length: 512 }, (_, i) => {
  const h = splitmix64(i * 12345);
  return Math.floor(h * 256);
});

const simplex2D = (x, y, seed = 0) => {
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = y - Y0;
  
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  
  const ii = ((i % 256) + 256) % 256;
  const jj = ((j % 256) + 256) % 256;
  
  const gi0 = permutation[(ii + permutation[(jj + seed) % 512]) % 512] % 8;
  const gi1 = permutation[(ii + i1 + permutation[(jj + j1 + seed) % 512]) % 512] % 8;
  const gi2 = permutation[(ii + 1 + permutation[(jj + 1 + seed) % 512]) % 512] % 8;
  
  let n0 = 0, n1 = 0, n2 = 0;
  
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    t0 *= t0;
    n0 = t0 * t0 * (grad2[gi0][0] * x0 + grad2[gi0][1] * y0);
  }
  
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    t1 *= t1;
    n1 = t1 * t1 * (grad2[gi1][0] * x1 + grad2[gi1][1] * y1);
  }
  
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    t2 *= t2;
    n2 = t2 * t2 * (grad2[gi2][0] * x2 + grad2[gi2][1] * y2);
  }
  
  return 70 * (n0 + n1 + n2);
};

const fbm = (x, y, octaves = 4, persistence = 0.5, lacunarity = 2, seed = 0) => {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  
  for (let i = 0; i < octaves; i++) {
    value += amplitude * simplex2D(x * frequency, y * frequency, seed + i * 100);
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  
  return value / maxValue;
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRAINT SYSTEM: Hierarchical property inheritance
// ─────────────────────────────────────────────────────────────────────────────

const STAR_CLASSES = [
  { type: 'O', color: '#9bb0ff', temp: [30000, 60000], mass: [16, 150], luminosity: [30000, 1000000], rarity: 0.00003 },
  { type: 'B', color: '#aabfff', temp: [10000, 30000], mass: [2.1, 16], luminosity: [25, 30000], rarity: 0.001 },
  { type: 'A', color: '#cad7ff', temp: [7500, 10000], mass: [1.4, 2.1], luminosity: [5, 25], rarity: 0.006 },
  { type: 'F', color: '#f8f7ff', temp: [6000, 7500], mass: [1.04, 1.4], luminosity: [1.5, 5], rarity: 0.03 },
  { type: 'G', color: '#fff4ea', temp: [5200, 6000], mass: [0.8, 1.04], luminosity: [0.6, 1.5], rarity: 0.076 },
  { type: 'K', color: '#ffd2a1', temp: [3700, 5200], mass: [0.45, 0.8], luminosity: [0.08, 0.6], rarity: 0.121 },
  { type: 'M', color: '#ffcc6f', temp: [2400, 3700], mass: [0.08, 0.45], luminosity: [0.0001, 0.08], rarity: 0.765 },
];

const PLANET_TYPES = {
  molten: { color: '#ff4400', emoji: '🔥', tempRange: [1000, 3000] },
  desert: { color: '#d4a574', emoji: '🏜️', tempRange: [300, 500] },
  rocky: { color: '#8b7355', emoji: '🪨', tempRange: [200, 400] },
  earthlike: { color: '#4a90d9', emoji: '🌍', tempRange: [250, 310] },
  ocean: { color: '#1e90ff', emoji: '🌊', tempRange: [273, 350] },
  ice: { color: '#b0e0e6', emoji: '❄️', tempRange: [50, 200] },
  gasGiant: { color: '#deb887', emoji: '🪐', tempRange: [100, 500] },
  iceGiant: { color: '#87ceeb', emoji: '💎', tempRange: [50, 150] },
};

const TERRAIN_BIOMES = {
  volcanic: { color: '#8b0000', pattern: 'lava' },
  barren: { color: '#696969', pattern: 'craters' },
  dunes: { color: '#c2b280', pattern: 'waves' },
  mountains: { color: '#4a4a4a', pattern: 'peaks' },
  plains: { color: '#228b22', pattern: 'grass' },
  forest: { color: '#006400', pattern: 'trees' },
  ocean: { color: '#006994', pattern: 'water' },
  tundra: { color: '#d3e4e5', pattern: 'snow' },
  glacier: { color: '#e0ffff', pattern: 'ice' },
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERATION FUNCTIONS: Pure functional, deterministic
// ─────────────────────────────────────────────────────────────────────────────

const generateGalaxyRegion = (regionX, regionY, universeSeed) => {
  const regionSeed = hashCoord(regionX, regionY, 1, universeSeed);
  const densityNoise = (fbm(regionX * 0.3, regionY * 0.3, 3, 0.6, 2, universeSeed) + 1) / 2;
  const spiralArm = Math.sin(Math.atan2(regionY, regionX) * 2 + Math.sqrt(regionX * regionX + regionY * regionY) * 0.5);
  const density = densityNoise * 0.5 + (spiralArm + 1) * 0.25;
  
  const metallicity = hashToRange(hashCoord(regionX, regionY, 2, universeSeed), 0.001, 0.04);
  const age = hashToRange(hashCoord(regionX, regionY, 3, universeSeed), 1, 13); // Billion years
  const nebulaDensity = Math.max(0, fbm(regionX * 0.5, regionY * 0.5, 2, 0.5, 2, universeSeed + 100));
  
  return {
    id: `region-${regionX}-${regionY}`,
    x: regionX,
    y: regionY,
    seed: regionSeed,
    constraints: {
      density: Math.max(0.1, Math.min(1, density)),
      metallicity,
      age,
      nebulaDensity,
      dominantStarBias: age < 5 ? 0.3 : age < 10 ? 0 : -0.3, // Young regions favor hot stars
    }
  };
};

const generateStarCluster = (clusterId, region) => {
  const clusterSeed = hashCoord(clusterId, region.seed, 4, region.seed);
  const clusterX = hashToRange(hashCoord(clusterId, 0, 5, region.seed), -0.4, 0.4);
  const clusterY = hashToRange(hashCoord(clusterId, 0, 6, region.seed), -0.4, 0.4);
  
  // Inherit and modify constraints
  const localDensity = region.constraints.density * hashToRange(clusterSeed, 0.5, 1.5);
  const localMetallicity = region.constraints.metallicity * hashToRange(hashCoord(clusterId, 1, 7, region.seed), 0.8, 1.2);
  
  const starCount = Math.floor(3 + localDensity * 12);
  
  return {
    id: `cluster-${region.id}-${clusterId}`,
    parentRegion: region,
    x: clusterX,
    y: clusterY,
    seed: clusterSeed,
    starCount,
    constraints: {
      ...region.constraints,
      density: localDensity,
      metallicity: localMetallicity,
      clusterAge: region.constraints.age + hashToRange(hashCoord(clusterId, 2, 8, region.seed), -2, 2),
    }
  };
};

const generateStar = (starId, cluster) => {
  const starSeed = hashCoord(starId, cluster.seed, 9, cluster.seed);
  const starX = hashToRange(hashCoord(starId, 0, 10, cluster.seed), -0.35, 0.35);
  const starY = hashToRange(hashCoord(starId, 0, 11, cluster.seed), -0.35, 0.35);
  
  // Star class selection influenced by region constraints
  let classRoll = hashCoord(starId, 1, 12, cluster.seed);
  classRoll += cluster.constraints.dominantStarBias * 0.3;
  classRoll = Math.max(0, Math.min(1, classRoll));
  
  let cumulative = 0;
  let starClass = STAR_CLASSES[6]; // Default to M
  for (const sc of STAR_CLASSES) {
    cumulative += sc.rarity;
    if (classRoll < cumulative) {
      starClass = sc;
      break;
    }
  }
  
  // Derive properties from class and constraints
  const mass = hashToRange(hashCoord(starId, 2, 13, cluster.seed), starClass.mass[0], starClass.mass[1]);
  const luminosity = hashToRange(hashCoord(starId, 3, 14, cluster.seed), starClass.luminosity[0], starClass.luminosity[1]);
  const temperature = hashToRange(hashCoord(starId, 4, 15, cluster.seed), starClass.temp[0], starClass.temp[1]);
  
  // Habitable zone calculation (simplified)
  const hzInner = Math.sqrt(luminosity / 1.1);
  const hzOuter = Math.sqrt(luminosity / 0.53);
  const frostLine = 2.7 * Math.sqrt(luminosity);
  
  const planetCount = Math.floor(hashToRange(hashCoord(starId, 5, 16, cluster.seed), 0, 1 + cluster.constraints.metallicity * 300));
  
  return {
    id: `star-${cluster.id}-${starId}`,
    parentCluster: cluster,
    x: starX,
    y: starY,
    seed: starSeed,
    class: starClass,
    mass,
    luminosity,
    temperature,
    planetCount: Math.min(planetCount, 12),
    constraints: {
      ...cluster.constraints,
      hzInner,
      hzOuter,
      frostLine,
      stellarMass: mass,
      stellarLuminosity: luminosity,
    }
  };
};

const generatePlanet = (planetId, star) => {
  const planetSeed = hashCoord(planetId, star.seed, 17, star.seed);
  
  // Orbital radius using Titius-Bode variant
  const baseAU = 0.4 + 0.3 * Math.pow(2, planetId);
  let orbitalRadius = baseAU * Math.pow(star.constraints.stellarMass, 0.5);
  orbitalRadius *= hashToRange(hashCoord(planetId, 0, 18, star.seed), 0.7, 1.3);
  
  // Temperature from stellar luminosity
  const temperature = 278 * Math.pow(star.constraints.stellarLuminosity, 0.25) / Math.sqrt(orbitalRadius);
  
  // Planet type determination based on constraints
  let planetType;
  const typeRoll = hashCoord(planetId, 1, 19, star.seed);
  
  if (orbitalRadius > star.constraints.frostLine) {
    // Beyond frost line
    if (typeRoll < 0.4) {
      planetType = 'gasGiant';
    } else if (typeRoll < 0.6) {
      planetType = 'iceGiant';
    } else {
      planetType = 'ice';
    }
  } else if (orbitalRadius > star.constraints.hzInner && orbitalRadius < star.constraints.hzOuter) {
    // Habitable zone
    const habitableRoll = hashCoord(planetId, 2, 20, star.seed);
    if (habitableRoll < 0.1 * (star.constraints.metallicity / 0.02)) {
      planetType = 'earthlike';
    } else if (habitableRoll < 0.3) {
      planetType = 'ocean';
    } else if (habitableRoll < 0.6) {
      planetType = 'desert';
    } else {
      planetType = 'rocky';
    }
  } else if (temperature > 600) {
    planetType = 'molten';
  } else if (temperature > 350) {
    planetType = 'desert';
  } else {
    planetType = 'rocky';
  }
  
  const mass = planetType === 'gasGiant' ? hashToRange(planetSeed, 50, 300) :
               planetType === 'iceGiant' ? hashToRange(planetSeed, 10, 30) :
               hashToRange(planetSeed, 0.1, 5);
  
  const radius = planetType === 'gasGiant' ? hashToRange(hashCoord(planetId, 3, 21, star.seed), 9, 12) :
                 planetType === 'iceGiant' ? hashToRange(hashCoord(planetId, 3, 21, star.seed), 3.5, 5) :
                 Math.pow(mass, 0.27);
  
  const hasAtmosphere = (11.2 * Math.sqrt(mass) / radius) > (6 * 0.157 * Math.sqrt(temperature));
  const hasLiquidWater = (planetType === 'earthlike' || planetType === 'ocean') && hasAtmosphere;
  
  return {
    id: `planet-${star.id}-${planetId}`,
    parentStar: star,
    index: planetId,
    seed: planetSeed,
    type: planetType,
    typeInfo: PLANET_TYPES[planetType],
    orbitalRadius,
    temperature: Math.round(temperature),
    mass,
    radius,
    hasAtmosphere,
    hasLiquidWater,
    constraints: {
      ...star.constraints,
      planetType,
      planetTemperature: temperature,
      planetMass: mass,
      inHabitableZone: orbitalRadius > star.constraints.hzInner && orbitalRadius < star.constraints.hzOuter,
    }
  };
};

const generateTerrain = (terrainX, terrainY, planet) => {
  const terrainSeed = hashCoord(terrainX, terrainY, 22, planet.seed);
  
  // Base terrain from noise
  const elevation = fbm(terrainX * 4, terrainY * 4, 6, 0.5, 2, planet.seed);
  const moisture = fbm(terrainX * 2 + 100, terrainY * 2 + 100, 4, 0.6, 2, planet.seed + 1);
  const temperature = planet.constraints.planetTemperature + fbm(terrainX * 3, terrainY * 3, 3, 0.4, 2, planet.seed + 2) * 50;
  
  // Biome selection based on planet constraints
  let biome;
  if (planet.constraints.planetType === 'molten') {
    biome = elevation > 0.3 ? 'volcanic' : 'volcanic';
  } else if (planet.constraints.planetType === 'ice') {
    biome = elevation > 0.4 ? 'glacier' : 'tundra';
  } else if (planet.constraints.planetType === 'desert') {
    biome = elevation > 0.5 ? 'mountains' : 'dunes';
  } else if (planet.constraints.planetType === 'ocean') {
    biome = elevation > 0.6 ? 'mountains' : elevation > 0.2 ? 'plains' : 'ocean';
  } else if (planet.constraints.planetType === 'earthlike') {
    if (elevation < 0.1) biome = 'ocean';
    else if (temperature < 270) biome = elevation > 0.5 ? 'glacier' : 'tundra';
    else if (moisture > 0.3) biome = elevation > 0.6 ? 'mountains' : 'forest';
    else biome = elevation > 0.6 ? 'mountains' : 'plains';
  } else if (planet.constraints.planetType === 'gasGiant' || planet.constraints.planetType === 'iceGiant') {
    biome = 'barren'; // Shouldn't drill into gas giants
  } else {
    biome = elevation > 0.5 ? 'mountains' : 'barren';
  }
  
  return {
    id: `terrain-${planet.id}-${terrainX}-${terrainY}`,
    parentPlanet: planet,
    x: terrainX,
    y: terrainY,
    seed: terrainSeed,
    elevation,
    moisture,
    temperature,
    biome,
    biomeInfo: TERRAIN_BIOMES[biome],
    constraints: {
      ...planet.constraints,
      localElevation: elevation,
      localMoisture: moisture,
      localTemperature: temperature,
    }
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// REACT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const ZOOM_LEVELS = ['galaxy', 'cluster', 'star', 'planet', 'terrain'];

export default function GalaxyToGrain() {
  const [universeSeed, setUniverseSeed] = useState(42);
  const [zoomLevel, setZoomLevel] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [selectedCluster, setSelectedCluster] = useState(null);
  const [selectedStar, setSelectedStar] = useState(null);
  const [selectedPlanet, setSelectedPlanet] = useState(null);
  const [showConstraints, setShowConstraints] = useState(true);
  const [animating, setAnimating] = useState(false);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  // Generate galaxy regions
  const galaxyRegions = useMemo(() => {
    const regions = [];
    for (let x = -2; x <= 2; x++) {
      for (let y = -2; y <= 2; y++) {
        regions.push(generateGalaxyRegion(x, y, universeSeed));
      }
    }
    return regions;
  }, [universeSeed]);

  // Generate clusters when region selected
  const clusters = useMemo(() => {
    if (!selectedRegion) return [];
    return Array.from({ length: 5 + Math.floor(selectedRegion.constraints.density * 8) }, (_, i) =>
      generateStarCluster(i, selectedRegion)
    );
  }, [selectedRegion]);

  // Generate stars when cluster selected
  const stars = useMemo(() => {
    if (!selectedCluster) return [];
    return Array.from({ length: selectedCluster.starCount }, (_, i) =>
      generateStar(i, selectedCluster)
    );
  }, [selectedCluster]);

  // Generate planets when star selected
  const planets = useMemo(() => {
    if (!selectedStar) return [];
    return Array.from({ length: selectedStar.planetCount }, (_, i) =>
      generatePlanet(i, selectedStar)
    );
  }, [selectedStar]);

  // Generate terrain grid when planet selected
  const terrainGrid = useMemo(() => {
    if (!selectedPlanet) return [];
    const grid = [];
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        grid.push(generateTerrain(x / 8, y / 8, selectedPlanet));
      }
    }
    return grid;
  }, [selectedPlanet]);

  // Animation for transitions
  useEffect(() => {
    if (animating) {
      const timeout = setTimeout(() => setAnimating(false), 500);
      return () => clearTimeout(timeout);
    }
  }, [animating]);

  // Canvas rendering for terrain detail
  useEffect(() => {
    if (zoomLevel !== 4 || !selectedPlanet || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    let frame = 0;
    const render = () => {
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);
      
      // Render terrain heightmap
      const cellSize = width / 32;
      for (let x = 0; x < 32; x++) {
        for (let y = 0; y < 32; y++) {
          const terrain = generateTerrain(x / 32, y / 32, selectedPlanet);
          const biomeColor = TERRAIN_BIOMES[terrain.biome]?.color || '#333';
          
          // Add elevation-based shading
          const shade = 0.5 + terrain.elevation * 0.5;
          ctx.fillStyle = biomeColor;
          ctx.globalAlpha = shade;
          ctx.fillRect(x * cellSize, y * cellSize, cellSize + 1, cellSize + 1);
        }
      }
      ctx.globalAlpha = 1;
      
      // Add scan line effect
      ctx.strokeStyle = 'rgba(100, 200, 255, 0.1)';
      const scanY = (frame * 2) % height;
      ctx.beginPath();
      ctx.moveTo(0, scanY);
      ctx.lineTo(width, scanY);
      ctx.stroke();
      
      frame++;
      animationRef.current = requestAnimationFrame(render);
    };
    
    render();
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [zoomLevel, selectedPlanet]);

  const handleZoomIn = useCallback((item, newLevel) => {
    setAnimating(true);
    setTimeout(() => {
      if (newLevel === 1) setSelectedRegion(item);
      else if (newLevel === 2) setSelectedCluster(item);
      else if (newLevel === 3) setSelectedStar(item);
      else if (newLevel === 4) setSelectedPlanet(item);
      setZoomLevel(newLevel);
    }, 100);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (zoomLevel === 0) return;
    setAnimating(true);
    setTimeout(() => {
      if (zoomLevel === 4) setSelectedPlanet(null);
      else if (zoomLevel === 3) setSelectedStar(null);
      else if (zoomLevel === 2) setSelectedCluster(null);
      else if (zoomLevel === 1) setSelectedRegion(null);
      setZoomLevel(zoomLevel - 1);
    }, 100);
  }, [zoomLevel]);

  const getCurrentConstraints = () => {
    if (zoomLevel === 4 && selectedPlanet) return selectedPlanet.constraints;
    if (zoomLevel === 3 && selectedStar) return selectedStar.constraints;
    if (zoomLevel === 2 && selectedCluster) return selectedCluster.constraints;
    if (zoomLevel === 1 && selectedRegion) return selectedRegion.constraints;
    return null;
  };

  const formatConstraint = (key, value) => {
    if (typeof value === 'number') {
      if (key.includes('temperature') || key.includes('Temperature')) return `${value.toFixed(0)}K`;
      if (key.includes('mass') || key.includes('Mass')) return `${value.toFixed(2)}M☉`;
      if (key.includes('luminosity') || key.includes('Luminosity')) return `${value.toFixed(3)}L☉`;
      if (key.includes('age') || key.includes('Age')) return `${value.toFixed(1)} Gyr`;
      if (key.includes('metallicity')) return `${(value * 100).toFixed(2)}%`;
      return value.toFixed(3);
    }
    if (typeof value === 'boolean') return value ? '✓' : '✗';
    return String(value);
  };

  const breadcrumb = [
    'Galaxy',
    selectedRegion ? `Region (${selectedRegion.x}, ${selectedRegion.y})` : null,
    selectedCluster ? `Cluster ${selectedCluster.id.split('-').pop()}` : null,
    selectedStar ? `${selectedStar.class.type}-class Star` : null,
    selectedPlanet ? `${selectedPlanet.typeInfo.emoji} Planet ${selectedPlanet.index + 1}` : null,
  ].filter(Boolean).slice(0, zoomLevel + 1);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(145deg, #05050a 0%, #0a0a15 50%, #050510 100%)',
      color: '#e0e8ff',
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Starfield background */}
      <div style={{
        position: 'fixed',
        inset: 0,
        background: `
          radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.8), transparent),
          radial-gradient(1px 1px at 40% 70%, rgba(255,255,255,0.5), transparent),
          radial-gradient(1px 1px at 60% 20%, rgba(255,255,255,0.6), transparent),
          radial-gradient(1px 1px at 80% 90%, rgba(255,255,255,0.4), transparent),
          radial-gradient(2px 2px at 10% 80%, rgba(100,150,255,0.3), transparent),
          radial-gradient(2px 2px at 90% 40%, rgba(255,150,100,0.3), transparent)
        `,
        pointerEvents: 'none',
        opacity: 0.5,
      }} />

      {/* Header */}
      <header style={{
        position: 'relative',
        marginBottom: '24px',
        padding: '20px 24px',
        background: 'rgba(10, 15, 30, 0.8)',
        border: '1px solid rgba(100, 150, 255, 0.2)',
        borderRadius: '8px',
        backdropFilter: 'blur(10px)',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '1.5rem',
          fontWeight: 300,
          letterSpacing: '0.15em',
          color: '#7cb3ff',
          textTransform: 'uppercase',
        }}>
          Galaxy-to-Grain Drill-Down
        </h1>
        <p style={{
          margin: '8px 0 0',
          fontSize: '0.75rem',
          color: 'rgba(200, 220, 255, 0.6)',
          letterSpacing: '0.05em',
        }}>
          Hierarchical Constraint Propagation • Position-is-Seed Methodology
        </p>
        
        {/* Controls */}
        <div style={{
          display: 'flex',
          gap: '16px',
          marginTop: '16px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
            <span style={{ color: 'rgba(200, 220, 255, 0.7)' }}>Universe Seed:</span>
            <input
              type="number"
              value={universeSeed}
              onChange={(e) => {
                setUniverseSeed(Number(e.target.value));
                setZoomLevel(0);
                setSelectedRegion(null);
                setSelectedCluster(null);
                setSelectedStar(null);
                setSelectedPlanet(null);
              }}
              style={{
                width: '80px',
                padding: '4px 8px',
                background: 'rgba(20, 30, 60, 0.8)',
                border: '1px solid rgba(100, 150, 255, 0.3)',
                borderRadius: '4px',
                color: '#7cb3ff',
                fontFamily: 'inherit',
                fontSize: '0.8rem',
              }}
            />
          </label>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
            <input
              type="checkbox"
              checked={showConstraints}
              onChange={(e) => setShowConstraints(e.target.checked)}
              style={{ accentColor: '#7cb3ff' }}
            />
            <span style={{ color: 'rgba(200, 220, 255, 0.7)' }}>Show Constraints</span>
          </label>
          
          {zoomLevel > 0 && (
            <button
              onClick={handleZoomOut}
              style={{
                padding: '6px 16px',
                background: 'rgba(100, 150, 255, 0.1)',
                border: '1px solid rgba(100, 150, 255, 0.4)',
                borderRadius: '4px',
                color: '#7cb3ff',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.75rem',
                letterSpacing: '0.05em',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => e.target.style.background = 'rgba(100, 150, 255, 0.2)'}
              onMouseLeave={(e) => e.target.style.background = 'rgba(100, 150, 255, 0.1)'}
            >
              ← Zoom Out
            </button>
          )}
        </div>
      </header>

      {/* Breadcrumb navigation */}
      <div style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '20px',
        fontSize: '0.75rem',
        color: 'rgba(200, 220, 255, 0.5)',
      }}>
        {breadcrumb.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: 'rgba(100, 150, 255, 0.4)' }}>›</span>}
            <span style={{
              color: i === breadcrumb.length - 1 ? '#7cb3ff' : 'inherit',
              fontWeight: i === breadcrumb.length - 1 ? 500 : 400,
            }}>
              {item}
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* Main content area */}
      <div style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: showConstraints ? '1fr 280px' : '1fr',
        gap: '24px',
      }}>
        {/* Visualization panel */}
        <div style={{
          background: 'rgba(8, 12, 24, 0.9)',
          border: '1px solid rgba(100, 150, 255, 0.15)',
          borderRadius: '8px',
          padding: '24px',
          minHeight: '500px',
          position: 'relative',
          overflow: 'hidden',
          transition: 'opacity 0.3s',
          opacity: animating ? 0.5 : 1,
        }}>
          {/* Level indicator */}
          <div style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            padding: '4px 12px',
            background: 'rgba(100, 150, 255, 0.1)',
            border: '1px solid rgba(100, 150, 255, 0.3)',
            borderRadius: '12px',
            fontSize: '0.65rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'rgba(200, 220, 255, 0.7)',
          }}>
            {ZOOM_LEVELS[zoomLevel]} view
          </div>

          {/* Galaxy view */}
          {zoomLevel === 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '12px',
              maxWidth: '600px',
              margin: '40px auto',
            }}>
              {galaxyRegions.map((region) => (
                <button
                  key={region.id}
                  onClick={() => handleZoomIn(region, 1)}
                  style={{
                    aspectRatio: '1',
                    background: `radial-gradient(circle at center, 
                      rgba(${100 + region.constraints.nebulaDensity * 100}, ${100 + region.constraints.density * 100}, 255, ${0.1 + region.constraints.density * 0.3}),
                      rgba(10, 15, 30, 0.9))`,
                    border: '1px solid rgba(100, 150, 255, 0.2)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.3s',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.border = '1px solid rgba(100, 150, 255, 0.6)';
                    e.target.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.border = '1px solid rgba(100, 150, 255, 0.2)';
                    e.target.style.transform = 'scale(1)';
                  }}
                >
                  {/* Stars dots */}
                  {Array.from({ length: Math.floor(region.constraints.density * 15) }, (_, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        width: `${2 + hashCoord(i, region.seed, 100, region.seed) * 3}px`,
                        height: `${2 + hashCoord(i, region.seed, 100, region.seed) * 3}px`,
                        borderRadius: '50%',
                        background: STAR_CLASSES[Math.floor(hashCoord(i, region.seed, 101, region.seed) * 7)].color,
                        left: `${10 + hashCoord(i, region.seed, 102, region.seed) * 80}%`,
                        top: `${10 + hashCoord(i, region.seed, 103, region.seed) * 80}%`,
                        boxShadow: `0 0 4px ${STAR_CLASSES[Math.floor(hashCoord(i, region.seed, 101, region.seed) * 7)].color}`,
                      }}
                    />
                  ))}
                  <span style={{
                    position: 'absolute',
                    bottom: '4px',
                    left: '4px',
                    fontSize: '0.6rem',
                    color: 'rgba(200, 220, 255, 0.5)',
                  }}>
                    ({region.x},{region.y})
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Cluster view */}
          {zoomLevel === 1 && selectedRegion && (
            <div style={{
              position: 'relative',
              height: '450px',
              margin: '20px',
            }}>
              {clusters.map((cluster) => (
                <button
                  key={cluster.id}
                  onClick={() => handleZoomIn(cluster, 2)}
                  style={{
                    position: 'absolute',
                    left: `${45 + cluster.x * 100}%`,
                    top: `${45 + cluster.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                    width: `${40 + cluster.constraints.density * 40}px`,
                    height: `${40 + cluster.constraints.density * 40}px`,
                    background: `radial-gradient(circle, rgba(150, 180, 255, 0.3), transparent)`,
                    border: '1px solid rgba(100, 150, 255, 0.3)',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.border = '1px solid rgba(100, 150, 255, 0.8)';
                    e.target.style.boxShadow = '0 0 20px rgba(100, 150, 255, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.border = '1px solid rgba(100, 150, 255, 0.3)';
                    e.target.style.boxShadow = 'none';
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    bottom: '-20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '0.6rem',
                    color: 'rgba(200, 220, 255, 0.5)',
                    whiteSpace: 'nowrap',
                  }}>
                    {cluster.starCount} stars
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Star view */}
          {zoomLevel === 2 && selectedCluster && (
            <div style={{
              position: 'relative',
              height: '450px',
              margin: '20px',
            }}>
              {stars.map((star) => (
                <button
                  key={star.id}
                  onClick={() => handleZoomIn(star, 3)}
                  style={{
                    position: 'absolute',
                    left: `${45 + star.x * 120}%`,
                    top: `${45 + star.y * 120}%`,
                    transform: 'translate(-50%, -50%)',
                    width: `${20 + Math.log(star.luminosity + 1) * 8}px`,
                    height: `${20 + Math.log(star.luminosity + 1) * 8}px`,
                    background: `radial-gradient(circle, ${star.class.color}, transparent)`,
                    border: 'none',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    boxShadow: `0 0 ${10 + Math.log(star.luminosity + 1) * 5}px ${star.class.color}`,
                    transition: 'all 0.3s',
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = 'translate(-50%, -50%) scale(1.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translate(-50%, -50%) scale(1)';
                  }}
                >
                  <span style={{
                    position: 'absolute',
                    bottom: '-24px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '0.6rem',
                    color: star.class.color,
                    whiteSpace: 'nowrap',
                    textShadow: `0 0 4px ${star.class.color}`,
                  }}>
                    {star.class.type} • {star.planetCount}🪐
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Planet view */}
          {zoomLevel === 3 && selectedStar && (
            <div style={{
              position: 'relative',
              height: '450px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {/* Central star */}
              <div style={{
                position: 'absolute',
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                background: `radial-gradient(circle, ${selectedStar.class.color}, transparent)`,
                boxShadow: `0 0 40px ${selectedStar.class.color}`,
              }} />
              
              {/* Habitable zone ring */}
              <div style={{
                position: 'absolute',
                width: `${100 + selectedStar.constraints.hzOuter * 40}px`,
                height: `${100 + selectedStar.constraints.hzOuter * 40}px`,
                borderRadius: '50%',
                border: '2px dashed rgba(100, 255, 150, 0.3)',
                pointerEvents: 'none',
              }} />
              
              {/* Frost line ring */}
              <div style={{
                position: 'absolute',
                width: `${100 + selectedStar.constraints.frostLine * 40}px`,
                height: `${100 + selectedStar.constraints.frostLine * 40}px`,
                borderRadius: '50%',
                border: '1px dashed rgba(150, 200, 255, 0.2)',
                pointerEvents: 'none',
              }} />
              
              {/* Planets */}
              {planets.map((planet, i) => {
                const angle = (i / planets.length) * Math.PI * 2 - Math.PI / 2;
                const radius = 60 + planet.orbitalRadius * 35;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                
                return (
                  <button
                    key={planet.id}
                    onClick={() => planet.type !== 'gasGiant' && planet.type !== 'iceGiant' && handleZoomIn(planet, 4)}
                    disabled={planet.type === 'gasGiant' || planet.type === 'iceGiant'}
                    style={{
                      position: 'absolute',
                      left: `calc(50% + ${x}px)`,
                      top: `calc(50% + ${y}px)`,
                      transform: 'translate(-50%, -50%)',
                      width: `${12 + Math.min(planet.radius, 12) * 2}px`,
                      height: `${12 + Math.min(planet.radius, 12) * 2}px`,
                      background: planet.typeInfo.color,
                      border: planet.constraints.inHabitableZone ? '2px solid rgba(100, 255, 150, 0.6)' : 'none',
                      borderRadius: '50%',
                      cursor: planet.type === 'gasGiant' || planet.type === 'iceGiant' ? 'not-allowed' : 'pointer',
                      opacity: planet.type === 'gasGiant' || planet.type === 'iceGiant' ? 0.7 : 1,
                      transition: 'all 0.3s',
                      boxShadow: `0 0 8px ${planet.typeInfo.color}`,
                    }}
                    onMouseEnter={(e) => {
                      if (planet.type !== 'gasGiant' && planet.type !== 'iceGiant') {
                        e.target.style.transform = 'translate(-50%, -50%) scale(1.4)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'translate(-50%, -50%) scale(1)';
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      top: '-20px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: '0.9rem',
                    }}>
                      {planet.typeInfo.emoji}
                    </span>
                  </button>
                );
              })}
              
              {planets.length === 0 && (
                <p style={{ color: 'rgba(200, 220, 255, 0.5)', fontStyle: 'italic' }}>
                  No planets in this system
                </p>
              )}
            </div>
          )}

          {/* Terrain view */}
          {zoomLevel === 4 && selectedPlanet && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              padding: '20px',
            }}>
              <div style={{
                fontSize: '0.75rem',
                color: 'rgba(200, 220, 255, 0.6)',
                textAlign: 'center',
              }}>
                {selectedPlanet.typeInfo.emoji} {selectedPlanet.type.charAt(0).toUpperCase() + selectedPlanet.type.slice(1)} Planet Surface
                <br />
                <span style={{ fontSize: '0.65rem' }}>
                  {selectedPlanet.temperature}K • {selectedPlanet.hasAtmosphere ? 'Atmosphere ✓' : 'No Atmosphere'} • {selectedPlanet.hasLiquidWater ? 'Liquid Water ✓' : ''}
                </span>
              </div>
              
              <canvas
                ref={canvasRef}
                width={400}
                height={400}
                style={{
                  border: '1px solid rgba(100, 150, 255, 0.2)',
                  borderRadius: '4px',
                  imageRendering: 'pixelated',
                }}
              />
              
              {/* Biome legend */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                justifyContent: 'center',
                maxWidth: '400px',
              }}>
                {Object.entries(TERRAIN_BIOMES).map(([name, info]) => (
                  <div key={name} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.6rem',
                    color: 'rgba(200, 220, 255, 0.6)',
                  }}>
                    <div style={{
                      width: '10px',
                      height: '10px',
                      background: info.color,
                      borderRadius: '2px',
                    }} />
                    {name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Constraint panel */}
        {showConstraints && (
          <div style={{
            background: 'rgba(8, 12, 24, 0.9)',
            border: '1px solid rgba(100, 150, 255, 0.15)',
            borderRadius: '8px',
            padding: '16px',
            fontSize: '0.7rem',
            maxHeight: '600px',
            overflowY: 'auto',
          }}>
            <h3 style={{
              margin: '0 0 12px',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: '#7cb3ff',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              borderBottom: '1px solid rgba(100, 150, 255, 0.2)',
              paddingBottom: '8px',
            }}>
              Inherited Constraints
            </h3>
            
            {getCurrentConstraints() ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {Object.entries(getCurrentConstraints()).map(([key, value]) => (
                  <div key={key} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    background: 'rgba(100, 150, 255, 0.05)',
                    borderRadius: '4px',
                    borderLeft: `2px solid ${
                      key.includes('hz') || key.includes('habitable') ? 'rgba(100, 255, 150, 0.5)' :
                      key.includes('stellar') || key.includes('luminosity') ? 'rgba(255, 200, 100, 0.5)' :
                      key.includes('planet') || key.includes('local') ? 'rgba(100, 150, 255, 0.5)' :
                      'rgba(150, 150, 150, 0.3)'
                    }`,
                  }}>
                    <span style={{ color: 'rgba(200, 220, 255, 0.6)' }}>
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span style={{ color: '#7cb3ff', fontFamily: 'monospace' }}>
                      {formatConstraint(key, value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'rgba(200, 220, 255, 0.4)', fontStyle: 'italic' }}>
                Select a region to view constraints
              </p>
            )}
            
            {/* Constraint inheritance diagram */}
            <div style={{
              marginTop: '20px',
              padding: '12px',
              background: 'rgba(100, 150, 255, 0.05)',
              borderRadius: '4px',
            }}>
              <div style={{
                fontSize: '0.65rem',
                color: 'rgba(200, 220, 255, 0.5)',
                marginBottom: '8px',
                letterSpacing: '0.05em',
              }}>
                INHERITANCE CHAIN
              </div>
              {['Galaxy', 'Region', 'Cluster', 'Star', 'Planet', 'Terrain'].map((level, i) => (
                <div key={level} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 0',
                  opacity: i <= zoomLevel ? 1 : 0.3,
                }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: i <= zoomLevel ? '#7cb3ff' : 'rgba(100, 150, 255, 0.3)',
                    boxShadow: i === zoomLevel ? '0 0 8px #7cb3ff' : 'none',
                  }} />
                  <span style={{ color: i === zoomLevel ? '#7cb3ff' : 'inherit' }}>{level}</span>
                  {i < 5 && (
                    <div style={{
                      flex: 1,
                      height: '1px',
                      background: i < zoomLevel ? 'rgba(100, 150, 255, 0.3)' : 'rgba(100, 150, 255, 0.1)',
                    }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div style={{
        position: 'relative',
        marginTop: '24px',
        padding: '16px 20px',
        background: 'rgba(10, 15, 30, 0.6)',
        border: '1px solid rgba(100, 150, 255, 0.1)',
        borderRadius: '8px',
        fontSize: '0.7rem',
        color: 'rgba(200, 220, 255, 0.5)',
      }}>
        <strong style={{ color: 'rgba(200, 220, 255, 0.7)' }}>How it works:</strong> Each zoom level inherits and constrains properties from its parent. 
        Galaxy regions define density/metallicity/age → Clusters inherit and modify these → Stars are constrained by cluster properties → 
        Planets are constrained by stellar habitable zones and frost lines → Terrain biomes are constrained by planetary temperature and composition. 
        Same seed always produces identical results at any coordinate.
      </div>
    </div>
  );
}
