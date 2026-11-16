/* ============================================================
   GAT: Liberty Shores — open-world island sandbox (3D)
   Three.js. Island city + animated ocean, many vehicle types
   (car, bike, cycle, boat, ship, plane, helicopter, tank),
   animals, custom rigidbody physics for props & player,
   shooting, wanted system, and classic cheat codes.
   ============================================================ */
import * as THREE from 'three';

// ---------------- helpers ----------------
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pick = a => a[randi(0, a.length - 1)];
const lerp = (a, b, t) => a + (b - a) * t;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------------- renderer / scene ----------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const SKY_DAY = 0x8fc9ff, SKY_NIGHT = 0x0a1230;
scene.background = new THREE.Color(SKY_DAY);
scene.fog = new THREE.Fog(SKY_DAY, 340, 1500);   // pushed back so distant hills/mountains stay visible

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 2000);
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------------- lighting ----------------
const hemi = new THREE.HemisphereLight(0xcfeaff, 0x5a6b48, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3d9, 1.25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 320;
const SH = 110;
sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH;
sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
sun.shadow.bias = -0.0004;
scene.add(sun); scene.add(sun.target);
const muzzleLight = new THREE.PointLight(0xffcc55, 0, 30, 2); scene.add(muzzleLight);

// ---------------- world layout ----------------
const TILE = 14;
const COLS = 30, ROWS = 30;                 // the island grid
const WORLD_W = COLS * TILE, WORLD_H = ROWS * TILE;
const HALF_W = WORLD_W / 2, HALF_H = WORLD_H / 2;
const OCEAN_BOUND = 1100;                    // how far the sea + play area extends
const WATER_Y = -2.3;                        // sea sits well below the island surface (~0.5)
// tiles: 0 road, 1 building, 2 park, 3 sidewalk, 4 beach
const map = [];
function buildMapGrid() {
  for (let y = 0; y < ROWS; y++) {
    map[y] = [];
    for (let x = 0; x < COLS; x++) {
      const edge = x < 2 || y < 2 || x >= COLS - 2 || y >= ROWS - 2;
      if (edge) { map[y][x] = 4; continue; }          // beach ring
      const roadX = x % 5 === 0, roadY = y % 5 === 0;
      if (roadX || roadY) map[y][x] = 0;
      else if (x % 5 === 1 || x % 5 === 4 || y % 5 === 1 || y % 5 === 4) map[y][x] = 3;
      else map[y][x] = Math.random() < 0.78 ? 1 : 2;
    }
  }
}
buildMapGrid();

function tileAtWorld(wx, wz) {
  const tx = Math.floor((wx + HALF_W) / TILE), ty = Math.floor((wz + HALF_H) / TILE);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return 5; // ocean
  return map[ty][tx];
}
const isSolidW = (wx, wz) => tileAtWorld(wx, wz) === 1;
// top surface height under a point — flat tile heights in the city, sculpted terrain outside it
function groundHeightAt(wx, wz) {
  if (inIsland(wx, wz)) {
    switch (tileAtWorld(wx, wz)) {
      case 3: return 0.82;   // sidewalk / curb
      case 2: return 0.75;   // park
      case 4: return 0.70;   // beach
      default: return 0.62;  // road / building base
    }
  }
  const ty = terrainY(wx, wz);
  return ty > WATER_Y ? ty : WATER_Y;   // hillside / coast, or the sea surface
}
const inIsland = (wx, wz) => wx > -HALF_W && wx < HALF_W && wz > -HALF_H && wz < HALF_H;
const overWater = (wx, wz) => inIsland(wx, wz) ? false : terrainY(wx, wz) <= WATER_Y + 0.35;
const tileCenter = (tx, ty) => ({ x: (tx + 0.5) * TILE - HALF_W, z: (ty + 0.5) * TILE - HALF_H });

// ================================================================
//  TERRAIN — height-mapped elevation (Perlin fBm)
//  The 30×30 city grid stays perfectly FLAT (elevation 0). Outside it,
//  terrain rises into hills/mountains toward the edges, then descends
//  to a new coastline. Water level (WATER_Y) is constant throughout.
// ================================================================
const CITY_Y = 0.5;                 // flat city ground reference height
const CITY_HALF = HALF_W;           // 210 — half-extent of the flat city square (the grid)
const RIM_BLEND = 55;               // distance over which terrain ramps up out of the flat rim
const PEAK_D = 380;                 // distance past the city where the mountains peak
const SHORE_D = 600;                // distance past the city where land meets the new sea
const MAX_ELEV = 108;               // peak mountain height above the city
const SHORE_R = CITY_HALF + SHORE_D;             // ~810 — world radius of the coastline
const LAND_BOUND = SHORE_R + 130;                // ~940 — half-size of the terrain mesh

// --- compact seeded Perlin noise + fBm (three core ships no noise) ---
const _perm = new Uint8Array(512);
(() => {
  const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
  let s = 1337; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0, t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) _perm[i] = p[i & 255];
})();
const _fade = t => t * t * t * (t * (t * 6 - 15) + 10);
function _grad(h, x, z) { const g = h & 7, u = g < 4 ? x : z, v = g < 4 ? z : x; return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v); }
function perlin2(x, z) {
  const X = Math.floor(x) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); z -= Math.floor(z);
  const u = _fade(x), w = _fade(z), A = _perm[X] + Z, B = _perm[X + 1] + Z;
  return lerp(lerp(_grad(_perm[A], x, z), _grad(_perm[B], x - 1, z), u),
              lerp(_grad(_perm[A + 1], x, z - 1), _grad(_perm[B + 1], x - 1, z - 1), u), w);
}
function fbm(x, z) { let a = 0.5, f = 1, sum = 0; for (let o = 0; o < 4; o++) { sum += perlin2(x * f, z * f) * a; f *= 2; a *= 0.5; } return sum; }

// how far outside the flat city square a point is (0 inside the city)
function distOutsideCity(wx, wz) { const dx = Math.max(0, Math.abs(wx) - CITY_HALF), dz = Math.max(0, Math.abs(wz) - CITY_HALF); return Math.sqrt(dx * dx + dz * dz); }
// world Y of the terrain surface at (wx,wz) — exactly CITY_Y inside the flat city
function terrainY(wx, wz) {
  const d = distOutsideCity(wx, wz);
  if (d <= 0) return CITY_Y;                                     // flat city — untouched
  const t = d < PEAK_D ? d / PEAK_D : 1 - (d - PEAK_D) / (SHORE_D - PEAK_D);  // rise 0→1, then fall 1→<0
  const shaped = t >= 0 ? Math.pow(t, 1.25) : t, s = Math.max(0, shaped);
  const elev = shaped * MAX_ELEV
    + (fbm(wx * 0.004, wz * 0.004) * 0.5 + 0.5) * 26 * s         // rolling hills on the slopes
    + Math.abs(fbm(wx * 0.011, wz * 0.011)) * 22 * s             // rocky ridge lines up high
    + fbm(wx * 0.03, wz * 0.03) * 3;                             // fine surface detail
  const y = CITY_Y + elev * clamp(d / RIM_BLEND, 0, 1);          // blend smoothly out of the flat rim
  return Math.max(y, WATER_Y - 6);
}
// vertex colour by elevation: seabed → grass → dirt → rock → snow
function terrainColor(y) {
  if (y <= WATER_Y + 0.2) return [0.42, 0.38, 0.26];
  if (y < 6) return [0.36, 0.55, 0.30];
  if (y < 24) return [0.30, 0.52, 0.27];
  if (y < 52) return [0.46, 0.40, 0.28];
  if (y < 85) return [0.40, 0.40, 0.42];
  return [0.86, 0.90, 0.94];
}
function buildTerrain() {
  const SIZE = LAND_BOUND * 2, SEG = 190;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const hidden = Math.abs(x) < CITY_HALF + 2 && Math.abs(z) < CITY_HALF + 2;   // tuck the city area under the flat tiles
    const y = hidden ? -3 : terrainY(x, z);
    pos.setY(i, y);
    const c = terrainColor(y), v = 0.9 + Math.random() * 0.2;
    colors[i * 3] = c[0] * v; colors[i * 3 + 1] = c[1] * v; colors[i * 3 + 2] = c[2] * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  mesh.receiveShadow = true; scene.add(mesh);
  scatterHills();
}
function addPine(x, z, y) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(CYL, mat(0x5b3a1e)); trunk.scale.set(0.7, 5, 0.7); trunk.position.y = 2.5; trunk.castShadow = true; g.add(trunk);
  for (let i = 0; i < 3; i++) { const cone = new THREE.Mesh(CONE, mat(0x2d5a34)); const sc = 5 - i * 1.1; cone.scale.set(sc, 4 - i, sc); cone.position.y = 4 + i * 2.4; cone.castShadow = true; g.add(cone); }
  g.position.set(x, y, z); scene.add(g);
}
function addRock(x, z, y) {
  const r = new THREE.Mesh(SPH, mat(pick([0x6b6b70, 0x585860, 0x777a80]))); r.scale.set(rand(2, 5), rand(2, 4), rand(2, 5)); r.position.set(x, y + 0.4, z); r.castShadow = true; r.receiveShadow = true; scene.add(r);
}
function scatterHills() {
  let pines = 0, rocks = 0, tries = 0;
  while ((pines < 110 || rocks < 34) && tries < 5000) {
    tries++;
    const x = rand(-SHORE_R, SHORE_R), z = rand(-SHORE_R, SHORE_R);
    if (Math.abs(x) < CITY_HALF + 12 && Math.abs(z) < CITY_HALF + 12) continue;   // not on/next to the city
    const y = terrainY(x, z);
    if (y < 4 || y > 82) continue;                       // between the shore and the snow line
    if (pines < 110 && Math.random() < 0.75) { addPine(x, z, y); pines++; }
    else if (rocks < 34) { addRock(x, z, y); rocks++; }
  }
}

// ---------------- shared geo / materials ----------------
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const SPH = new THREE.SphereGeometry(0.5, 14, 12);
const CONE = new THREE.ConeGeometry(0.5, 1, 14);
const mat = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
const BUILDING_COLORS = [0xe74c3c, 0xe67e22, 0xf1c40f, 0x2ecc71, 0x1abc9c, 0x3498db,
  0x9b59b6, 0xff6b9d, 0x16a085, 0xd35400, 0xc0392b, 0x8e44ad, 0x27ae60, 0x2980b9,
  0xf39c12, 0xe84393, 0x00cec9, 0x6c5ce7, 0xfd79a8, 0x00b894];

// ================================================================
//  PROCEDURAL TEXTURES + PBR MATERIALS  (CanvasTexture at runtime)
//  Buildings/ground use MeshStandardMaterial so they respond to the
//  sun/hemi lighting with real roughness + baked window grids.
// ================================================================
const matStd = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function addNoise(ctx, w, h, amt) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
}
function texFrom(canvas, { srgb = true, rep = 1, repY = null } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, repY ?? rep);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4; return t;
}
function solidNoiseCanvas(base, amt, size = 128) {
  const c = makeCanvas(size, size), x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, size, size); addNoise(x, size, size, amt); return c;
}
// ground / road / sidewalk surfaces
const asphaltCanvas = (() => { const c = solidNoiseCanvas('#2e2f35', 16), x = c.getContext('2d');
  x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 1;
  for (let i = 0; i < 10; i++) { x.beginPath(); x.moveTo(Math.random() * 128, Math.random() * 128); x.lineTo(Math.random() * 128, Math.random() * 128); x.stroke(); } return c; })();
const concreteCanvas = (() => { const c = solidNoiseCanvas('#9aa0a8', 14), x = c.getContext('2d');
  x.strokeStyle = 'rgba(0,0,0,0.16)'; x.lineWidth = 2; x.beginPath();
  x.moveTo(64, 0); x.lineTo(64, 128); x.moveTo(0, 64); x.lineTo(128, 64); x.stroke(); return c; })();
const grassCanvas = solidNoiseCanvas('#4c9a4c', 32);
const parkCanvas = solidNoiseCanvas('#3fa54a', 32);
const sandCanvas = solidNoiseCanvas('#e6d59a', 20);

const ROAD_MAT = matStd(0xffffff, { map: texFrom(asphaltCanvas), roughness: 0.8 });
const SIDE_MAT = matStd(0xffffff, { map: texFrom(concreteCanvas), roughness: 0.92 });
const PARK_MAT = matStd(0xffffff, { map: texFrom(parkCanvas), roughness: 1 });
const SAND_MAT = matStd(0xffffff, { map: texFrom(sandCanvas), roughness: 1 });
const GRASS_MAT = matStd(0xffffff, { map: texFrom(grassCanvas, { rep: 22 }), roughness: 1 });
const SKIRT_MAT = matStd(0xffffff, { map: texFrom(sandCanvas, { rep: 22 }), roughness: 1 });
const ROOF_MAT = matStd(0x2b3540, { roughness: 0.9 });
const LANE_MAT = matStd(0xcabf86, { roughness: 0.7 });   // faded road-paint yellow-white

// building facades — window grid baked into color/emissive/roughness maps
const facadeMaterials = [], facadeCache = new Map();
function facadeTextureSet(baseColor, rows, cols) {
  const W = 128, H = 256, col = new THREE.Color(baseColor);
  const mc = makeCanvas(W, H), m = mc.getContext('2d');
  m.fillStyle = '#' + col.getHexString(); m.fillRect(0, 0, W, H); addNoise(m, W, H, 18);
  const grd = m.createLinearGradient(0, 0, 0, H);            // baked vertical ambient occlusion
  grd.addColorStop(0, 'rgba(255,255,255,0.10)'); grd.addColorStop(0.18, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.42)');
  m.fillStyle = grd; m.fillRect(0, 0, W, H);
  const ec = makeCanvas(W, H), e = ec.getContext('2d'); e.fillStyle = '#000'; e.fillRect(0, 0, W, H);   // emissive (lit windows)
  const rc = makeCanvas(W, H), r = rc.getContext('2d'); r.fillStyle = '#e6e6e6'; r.fillRect(0, 0, W, H); // roughness (rough walls)
  const mx = W * 0.16, my = H * 0.08, cw = (W - mx * (cols + 1)) / cols, ch = (H - my * (rows + 1)) / rows;
  for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) {
    const x = mx + cx * (cw + mx), y = my + ry * (ch + my);
    const wg = m.createLinearGradient(x, y, x + cw, y + ch);   // glass with a sky sheen
    wg.addColorStop(0, '#2b3a4d'); wg.addColorStop(1, '#3f5f7d');
    m.fillStyle = wg; m.fillRect(x, y, cw, ch);
    m.strokeStyle = 'rgba(0,0,0,0.55)'; m.lineWidth = 2; m.strokeRect(x, y, cw, ch);
    if (Math.random() < 0.55) { e.fillStyle = '#ffce7a'; e.fillRect(x, y, cw, ch); }  // ~half glow at night
    r.fillStyle = '#1e222a'; r.fillRect(x, y, cw, ch);         // windows = smooth/glossy
  }
  return {
    map: texFrom(mc, { srgb: true }), emissiveMap: texFrom(ec, { srgb: true }), roughnessMap: texFrom(rc, { srgb: false }),
  };
}
function facadeMaterial(color, h) {
  const bucket = h < 20 ? 0 : h < 34 ? 1 : 2, rows = [3, 5, 8][bucket], key = color + '_' + bucket;
  let mtl = facadeCache.get(key);
  if (!mtl) {
    const s = facadeTextureSet(color, rows, 3);
    mtl = new THREE.MeshStandardMaterial({ map: s.map, emissiveMap: s.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughnessMap: s.roughnessMap, roughness: 1, metalness: 0 });
    facadeCache.set(key, mtl); facadeMaterials.push(mtl);
  }
  return mtl;
}

const buildingMeshes = [];

// ---------------- enterable-building doors ----------------
const INTERIOR_LABEL = { store: 'Convenience Store', home: 'Apartment', office: 'Office' };
const INTERIOR_SIGN = { store: 0x00e0d0, home: 0x37d67a, office: 0xffa64d };
const doors = [];
// build a door + neon sign on a building facade facing an open (road/sidewalk) tile
function registerDoor(cx, cz, w, h, face) {
  const type = pick(['store', 'store', 'home', 'home', 'office']);
  const nx = cx + face[0] * (w / 2), nz = cz + face[1] * (w / 2);
  const doorway = new THREE.Mesh(BOX, matStd(0x141414, { roughness: 1 }));
  if (face[0] !== 0) doorway.scale.set(0.6, 4, 3); else doorway.scale.set(3, 4, 0.6);
  doorway.position.set(nx + face[0] * 0.1, 2.4, nz + face[1] * 0.1); scene.add(doorway);
  const sc = INTERIOR_SIGN[type];
  const sign = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: sc, emissive: sc, emissiveIntensity: 0.9, roughness: 0.5 }));
  if (face[0] !== 0) sign.scale.set(0.3, 1, 3.6); else sign.scale.set(3.6, 1, 0.3);
  sign.position.set(nx + face[0] * 0.25, 5, nz + face[1] * 0.25); scene.add(sign);
  doors.push({
    type,
    pos: V3(cx + face[0] * (w / 2 + 1.4), 0.6, cz + face[1] * (w / 2 + 1.4)),
    returnPos: V3(cx + face[0] * (w / 2 + 3.2), 0, cz + face[1] * (w / 2 + 3.2)),
    returnYaw: Math.atan2(face[0], face[1]),
    interior: null,
  });
}

// ---------------- ocean ----------------
let ocean, oceanPos, oceanBase;
function buildOcean() {
  const geo = new THREE.PlaneGeometry(OCEAN_BOUND * 2.4, OCEAN_BOUND * 2.4, 80, 80);
  geo.rotateX(-Math.PI / 2);
  ocean = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x1d70b8, shininess: 90, specular: 0x9fd8ff, transparent: true, opacity: 0.92 }));
  ocean.position.y = WATER_Y; ocean.receiveShadow = true; scene.add(ocean);
  oceanPos = geo.attributes.position;
  oceanBase = Float32Array.from(oceanPos.array);
}
function animateOcean(t) {
  const a = oceanPos.array;
  for (let i = 0; i < a.length; i += 3) {
    const x = oceanBase[i], z = oceanBase[i + 2];
    a[i + 1] = Math.sin(x * 0.012 + t * 1.1) * 0.5 + Math.cos(z * 0.015 + t * 0.9) * 0.5;
  }
  oceanPos.needsUpdate = true;
}

// ---------------- build the island city ----------------
function buildCity() {
  buildOcean();
  // island base (grass) + a sandy skirt — deep box so the landmass rises above the sea
  const island = new THREE.Mesh(new THREE.BoxGeometry(WORLD_W, 9, WORLD_H), GRASS_MAT);
  island.position.y = 0.5 - 4.5; island.receiveShadow = true; scene.add(island);      // top at y=0.5
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(WORLD_W + 12, 9, WORLD_H + 12), SKIRT_MAT);
  skirt.position.y = 0.3 - 4.5; skirt.receiveShadow = true; scene.add(skirt);          // sandy shore just below

  const roadMat = ROAD_MAT, sideMat = SIDE_MAT, parkMat = PARK_MAT, sandMat = SAND_MAT;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const t = map[y][x]; const c = tileCenter(x, y);
    if (t === 0) { const r = new THREE.Mesh(BOX, roadMat); r.scale.set(TILE, 0.4, TILE); r.position.set(c.x, 0.42, c.z); r.receiveShadow = true; scene.add(r); }
    else if (t === 3) { const s = new THREE.Mesh(BOX, sideMat); s.scale.set(TILE, 0.6, TILE); s.position.set(c.x, 0.52, c.z); s.receiveShadow = true; scene.add(s); if (Math.random() < 0.25) addStreetlight(c.x + rand(-4, 4), c.z + rand(-4, 4)); }
    else if (t === 4) { const s = new THREE.Mesh(BOX, sandMat); s.scale.set(TILE, 0.5, TILE); s.position.set(c.x, 0.45, c.z); s.receiveShadow = true; scene.add(s); if (Math.random() < 0.15) addPalm(c.x + rand(-4, 4), c.z + rand(-4, 4)); }
    else if (t === 2) { const p = new THREE.Mesh(BOX, parkMat); p.scale.set(TILE, 0.5, TILE); p.position.set(c.x, 0.5, c.z); p.receiveShadow = true; scene.add(p); if (Math.random() < 0.8) addTree(c.x + rand(-3, 3), c.z + rand(-3, 3)); }
    else {
      const h = rand(10, 46), col = pick(BUILDING_COLORS);
      const w = TILE - 2.5;
      const b = new THREE.Mesh(BOX, facadeMaterial(col, h)); b.scale.set(w, h, w); b.position.set(c.x, h / 2 + 0.5, c.z); b.castShadow = true; b.receiveShadow = true; scene.add(b); buildingMeshes.push(b);
      const roof = new THREE.Mesh(BOX, ROOF_MAT); roof.scale.set(w + 0.6, 1, w + 0.6); roof.position.set(c.x, h + 1, c.z); roof.castShadow = true; scene.add(roof);
      // some buildings become enterable — door faces an adjacent road/sidewalk tile
      let face = null;
      for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nt = map[y + d[1]] && map[y + d[1]][x + d[0]]; if (nt === 0 || nt === 3) { face = d; break; } }
      if (face && Math.random() < 0.2) registerDoor(c.x, c.z, w, h, face);
    }
  }
  addLaneLines();
}
// dashed-look center lane markings down the middle of each road corridor
function addLaneLines() {
  const zLen = (ROWS - 4) * TILE, xLen = (COLS - 4) * TILE;
  for (let gx = 5; gx < COLS - 2; gx += 5) {
    const wx = (gx + 0.5) * TILE - HALF_W;
    const g = new THREE.Mesh(BOX, LANE_MAT); g.scale.set(0.32, 0.06, zLen); g.position.set(wx, 0.63, 0); g.receiveShadow = true; scene.add(g);
  }
  for (let gy = 5; gy < ROWS - 2; gy += 5) {
    const wz = (gy + 0.5) * TILE - HALF_H;
    const g = new THREE.Mesh(BOX, LANE_MAT); g.scale.set(xLen, 0.06, 0.32); g.position.set(0, 0.63, wz); g.receiveShadow = true; scene.add(g);
  }
}
function addTree(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(CYL, mat(0x7a4a25)); trunk.scale.set(0.8, 3, 0.8); trunk.position.y = 1.5; trunk.castShadow = true;
  const leaf = new THREE.Mesh(SPH, mat(0x2e8b3d)); leaf.scale.set(4, 4.5, 4); leaf.position.y = 4.5; leaf.castShadow = true;
  g.add(trunk, leaf); g.position.set(x, 0.6, z); scene.add(g);
}
function addPalm(x, z) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(CYL, mat(0x9c6b3a)); trunk.scale.set(0.6, 6, 0.6); trunk.position.y = 3; trunk.rotation.z = rand(-0.15, 0.15); trunk.castShadow = true; g.add(trunk);
  for (let i = 0; i < 6; i++) { const frond = new THREE.Mesh(BOX, mat(0x2ea84a)); frond.scale.set(4.5, 0.2, 1.1); frond.position.set(0, 6, 0); frond.rotation.y = i * TAU / 6; frond.rotation.z = 0.4; g.add(frond); }
  g.position.set(x, 0.5, z); scene.add(g);
}
function addStreetlight(x, z) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(CYL, mat(0x444a52)); pole.scale.set(0.35, 8, 0.35); pole.position.y = 4; g.add(pole);
  const head = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffcc55, emissiveIntensity: 0.6 })); head.scale.set(1.2, 0.5, 0.8); head.position.set(0, 8, 0.6); g.add(head);
  g.position.set(x, 0.6, z); scene.add(g);
}
buildCity();
buildTerrain();

// ---------------- humanoid character ----------------
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xffe0bd];
const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1, 0xf1c40f, 0xff6b9d, 0x00cec9];
const PANTS = [0x2c3e50, 0x34495e, 0x7f5539, 0x1e272e, 0x2f3640, 0x44567a];
const HAIR = [0x1a1a1a, 0x3b2417, 0x6b4423, 0x8b5a2b, 0x2c2c2c, 0x111111];
function makeHuman(o = {}) {
  const skin = o.skin ?? pick(SKIN), shirt = o.shirt ?? pick(SHIRTS), pants = o.pants ?? pick(PANTS), hair = o.hair ?? pick(HAIR);
  const g = new THREE.Group();
  const skinMat = mat(skin), shirtMat = mat(shirt), pantsMat = mat(pants), hairMat = mat(hair);
  const lLeg = new THREE.Group(), rLeg = new THREE.Group();
  lLeg.position.set(-0.35, 1.7, 0); rLeg.position.set(0.35, 1.7, 0);
  for (const grp of [lLeg, rLeg]) {
    const leg = new THREE.Mesh(BOX, pantsMat); leg.scale.set(0.55, 1.7, 0.55); leg.position.y = -0.85; leg.castShadow = true; grp.add(leg);
    const shoe = new THREE.Mesh(BOX, mat(0x111111)); shoe.scale.set(0.6, 0.35, 0.9); shoe.position.set(0, -1.7, 0.15); grp.add(shoe);
  }
  g.add(lLeg, rLeg);
  const torso = new THREE.Mesh(BOX, shirtMat); torso.scale.set(1.1, 1.9, 0.7); torso.position.y = 2.7; torso.castShadow = true; g.add(torso);
  const hips = new THREE.Mesh(BOX, pantsMat); hips.scale.set(1.05, 0.5, 0.68); hips.position.y = 1.75; g.add(hips);
  const lArm = new THREE.Group(), rArm = new THREE.Group();
  lArm.position.set(-0.75, 3.5, 0); rArm.position.set(0.75, 3.5, 0);
  for (const grp of [lArm, rArm]) {
    const upper = new THREE.Mesh(BOX, shirtMat); upper.scale.set(0.4, 0.95, 0.4); upper.position.y = -0.48; upper.castShadow = true; grp.add(upper);
    const hand = new THREE.Mesh(BOX, skinMat); hand.scale.set(0.42, 0.85, 0.42); hand.position.y = -1.28; grp.add(hand);
  }
  g.add(lArm, rArm);
  const neck = new THREE.Mesh(CYL, skinMat); neck.scale.set(0.35, 0.4, 0.35); neck.position.y = 3.85; g.add(neck);
  const head = new THREE.Mesh(BOX, skinMat); head.scale.set(0.85, 0.9, 0.85); head.position.y = 4.4; head.castShadow = true; g.add(head);
  const hairMesh = new THREE.Mesh(BOX, hairMat); hairMesh.scale.set(0.92, 0.4, 0.92); hairMesh.position.y = 4.75; g.add(hairMesh);
  for (const sx of [-0.2, 0.2]) { const e = new THREE.Mesh(BOX, mat(0x111111)); e.scale.set(0.12, 0.12, 0.08); e.position.set(sx, 4.45, 0.43); g.add(e); }
  g.userData.parts = { lLeg, rLeg, lArm, rArm, torso, head };
  g.scale.setScalar(0.42);
  return g;
}
function setBigHead(h, big) { const t = big ? 2.4 : 1; h.userData.parts.head.scale.set(0.85 * t, 0.9 * t, 0.85 * t); }
function animateHuman(h, phase, moving) {
  const p = h.userData.parts;
  const sw = moving ? Math.sin(phase) * 0.8 : Math.sin(phase * 0.3) * 0.05;
  p.lLeg.rotation.x = sw; p.rLeg.rotation.x = -sw; p.lArm.rotation.x = -sw * 0.8; p.rArm.rotation.x = sw * 0.8;
}

// ---------------- animals ----------------
function makeDog(x, z) {
  const g = new THREE.Group();
  const c = pick([0x6b4423, 0x2c2c2c, 0xd9b382, 0xf0f0f0, 0x8b5a2b]);
  const body = new THREE.Mesh(BOX, mat(c)); body.scale.set(1.1, 1.0, 2.4); body.position.y = 1.4; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(BOX, mat(c)); head.scale.set(0.9, 0.9, 1.0); head.position.set(0, 1.7, 1.5); head.castShadow = true; g.add(head);
  const snout = new THREE.Mesh(BOX, mat(0x2a2a2a)); snout.scale.set(0.5, 0.4, 0.5); snout.position.set(0, 1.5, 2.1); g.add(snout);
  const tail = new THREE.Mesh(BOX, mat(c)); tail.scale.set(0.3, 0.3, 1.0); tail.position.set(0, 1.7, -1.4); tail.rotation.x = -0.6; g.add(tail);
  const legs = [];
  for (const lx of [-0.4, 0.4]) for (const lz of [-0.9, 0.9]) { const leg = new THREE.Group(); const m = new THREE.Mesh(BOX, mat(c)); m.scale.set(0.3, 1.4, 0.3); m.position.y = -0.7; leg.add(m); leg.position.set(lx, 1.4, lz); g.add(leg); legs.push(leg); }
  g.scale.setScalar(0.5); g.position.set(x, 0, z);
  const dog = { obj: g, etype: 'animal', pos: V3(x, 0, z), yaw: rand(0, TAU), hp: 30, state: 'wander', wanderT: rand(1, 3), speed: rand(6, 10), phase: 0, legs, panic: 0 };
  g.userData.entity = dog; scene.add(g); animals.push(dog); return dog;
}
function makeBird(x, z) {
  const g = new THREE.Group();
  const c = pick([0xffffff, 0x222222, 0x8b5a2b, 0x4a90d9]);
  const body = new THREE.Mesh(BOX, mat(c)); body.scale.set(0.5, 0.4, 1.0); g.add(body);
  const lw = new THREE.Mesh(BOX, mat(c)), rw = new THREE.Mesh(BOX, mat(c));
  lw.scale.set(1.4, 0.1, 0.6); rw.scale.set(1.4, 0.1, 0.6); lw.position.x = -0.8; rw.position.x = 0.8; g.add(lw, rw);
  g.scale.setScalar(0.9);
  const bird = { obj: g, etype: 'bird', pos: V3(x, rand(30, 60), z), yaw: rand(0, TAU), wings: { lw, rw }, phase: rand(0, TAU), speed: rand(14, 22) };
  g.position.copy(bird.pos); scene.add(g); birds.push(bird); return bird;
}

// ---------------- weapons ----------------
const WEAPONS = {
  fist:    { name: 'FIST',    dmg: 18, rate: 20, range: 6,   spread: 0,    ammo: Infinity, melee: true },
  pistol:  { name: 'PISTOL',  dmg: 26, rate: 13, range: 160, spread: 0.02, ammo: 60,  tracer: 0xffe98a },
  smg:     { name: 'SMG',     dmg: 16, rate: 5,  range: 150, spread: 0.06, ammo: 240, auto: true, tracer: 0xffd24a },
  shotgun: { name: 'SHOTGUN', dmg: 14, rate: 32, range: 80,  spread: 0.16, ammo: 40,  pellets: 8, tracer: 0xffbb55 },
  rocket:  { name: 'ROCKET',  dmg: 200,rate: 55, range: 300, spread: 0,    ammo: 8,   rocket: true, tracer: 0xff6a2b },
};
const WEAPON_ORDER = ['fist', 'pistol', 'smg', 'shotgun', 'rocket'];

// ---------------- player ----------------
const player = {
  obj: makeHuman({ shirt: 0x1f6feb, pants: 0x22262e, skin: 0xf1c27d, hair: 0x1a1a1a }),
  pos: V3(0, 0, 0), vy: 0, onGround: true, swimming: false,
  hp: 100, maxHp: 100, armor: 0, maxArmor: 100,
  money: 0, wanted: 0, heat: 0, weapon: 'pistol', cooldown: 0, phase: 0,
  ammo: { fist: Infinity, pistol: 60, smg: 240, shotgun: 40, rocket: 8 },
  inVehicle: null, god: false, bigHead: false, hitFlash: 0,
};
// start on a road near the middle
player.pos.set(TILE * 0.5, groundHeightAt(TILE * 0.5, TILE * 0.5), TILE * 0.5);
scene.add(player.obj);
let PLAYER_NAME = 'Player';

// ---------------- entity arrays ----------------
const peds = [], cops = [], vehicles = [], animals = [], birds = [], props = [],
  pickups = [], tracers = [], projectiles = [], effects = [];

// ================================================================
//  VEHICLES
// ================================================================
const CAR_COLORS = [0xe74c3c, 0x2980b9, 0x27ae60, 0xf1c40f, 0x9b59b6, 0xecf0f1, 0x1a1a1a, 0xe67e22];
function wheel(x, y, z, r = 1.1) { const w = new THREE.Mesh(CYL, mat(0x161616)); w.scale.set(r, 0.7, r); w.rotation.z = Math.PI / 2; w.position.set(x, y, z); return w; }

function buildCar(color, tank) {
  const g = new THREE.Group();
  const w = tank ? 4.2 : 3.4, l = tank ? 7.4 : 6.4;
  const body = new THREE.Mesh(BOX, mat(tank ? 0x55632f : color)); body.scale.set(w, 1.4, l); body.position.y = 1.1; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(BOX, tank ? mat(0x44502a) : mat(0x101820)); cabin.scale.set(w * 0.86, 1.1, l * 0.5); cabin.position.set(0, 2.1, -0.2); cabin.castShadow = true; g.add(cabin);
  if (tank) { const bar = new THREE.Mesh(CYL, mat(0x3a4522)); bar.scale.set(0.4, 4.4, 0.4); bar.rotation.x = Math.PI / 2; bar.position.set(0, 2.2, 3.6); g.add(bar); }
  const ws = [wheel(-w / 2, 0.8, l / 2 - 1.2), wheel(w / 2, 0.8, l / 2 - 1.2), wheel(-w / 2, 0.8, -l / 2 + 1.2), wheel(w / 2, 0.8, -l / 2 + 1.2)];
  ws.forEach(x => g.add(x));
  const hl = new THREE.MeshLambertMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 0.6 });
  for (const wx of [-1, 1]) { const h = new THREE.Mesh(BOX, hl); h.scale.set(0.5, 0.4, 0.2); h.position.set(wx * (w / 2 - 0.4), 1.1, l / 2); g.add(h); }
  return { g, wheels: ws, w, l };
}
function buildBike(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(BOX, mat(color)); body.scale.set(0.9, 0.9, 3.4); body.position.y = 1.3; body.castShadow = true; g.add(body);
  const seat = new THREE.Mesh(BOX, mat(0x111)); seat.scale.set(0.9, 0.5, 1.2); seat.position.set(0, 1.9, -0.6); g.add(seat);
  const bar = new THREE.Mesh(CYL, mat(0x222)); bar.scale.set(0.2, 1.4, 0.2); bar.rotation.z = Math.PI / 2; bar.position.set(0, 2.1, 1.4); g.add(bar);
  const ws = [wheel(0, 1.0, 1.6, 1.2), wheel(0, 1.0, -1.6, 1.2)]; ws.forEach(x => { x.scale.set(1.2, 0.4, 1.2); g.add(x); });
  return { g, wheels: ws, w: 1.2, l: 3.4 };
}
function buildCycle(color) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(BOX, mat(color)); frame.scale.set(0.25, 0.25, 2.6); frame.position.y = 1.4; g.add(frame);
  const seat = new THREE.Mesh(BOX, mat(0x111)); seat.scale.set(0.5, 0.25, 0.7); seat.position.set(0, 1.8, -0.9); g.add(seat);
  const bar = new THREE.Mesh(CYL, mat(0x333)); bar.scale.set(0.12, 1.0, 0.12); bar.rotation.z = Math.PI / 2; bar.position.set(0, 2.0, 1.2); g.add(bar);
  const ws = [wheel(0, 1.1, 1.3, 1.3), wheel(0, 1.1, -1.3, 1.3)]; ws.forEach(x => { x.scale.set(1.3, 0.18, 1.3); g.add(x); });
  return { g, wheels: ws, w: 0.8, l: 2.8 };
}
function buildBoat(big) {
  const g = new THREE.Group();
  const s = big ? 2.2 : 1;
  const hull = new THREE.Mesh(BOX, mat(big ? 0xb0b6bd : 0xd94f4f)); hull.scale.set(4 * s, 1.6, 10 * s); hull.position.y = 0.8; hull.castShadow = true; g.add(hull);
  const bow = new THREE.Mesh(CONE, mat(big ? 0xb0b6bd : 0xd94f4f)); bow.scale.set(4 * s, 4 * s, 1.6); bow.rotation.x = Math.PI / 2; bow.position.set(0, 0.8, 5.6 * s); g.add(bow);
  const cabin = new THREE.Mesh(BOX, mat(0xffffff)); cabin.scale.set(3 * s, 2.2, 3.5 * s); cabin.position.set(0, 2.4, -1 * s); cabin.castShadow = true; g.add(cabin);
  if (big) { const mast = new THREE.Mesh(CYL, mat(0x555)); mast.scale.set(0.4, 12, 0.4); mast.position.set(0, 8, 0); g.add(mast); const funnel = new THREE.Mesh(CYL, mat(0xe74c3c)); funnel.scale.set(1.2, 3, 1.2); funnel.position.set(0, 4.5, -3); g.add(funnel); }
  return { g, w: 4 * s, l: 10 * s };
}
function buildHeli() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(SPH, mat(0x2b6cb0)); body.scale.set(2.6, 2.4, 5.5); body.position.y = 2.2; body.castShadow = true; g.add(body);
  const glass = new THREE.Mesh(SPH, mat(0x113355)); glass.scale.set(2.2, 2.0, 2.4); glass.position.set(0, 2.4, 2.6); g.add(glass);
  const tail = new THREE.Mesh(BOX, mat(0x2b6cb0)); tail.scale.set(0.6, 0.6, 6); tail.position.set(0, 2.6, -4.5); tail.castShadow = true; g.add(tail);
  for (const sx of [-1.2, 1.2]) { const skid = new THREE.Mesh(BOX, mat(0x222)); skid.scale.set(0.25, 0.25, 5); skid.position.set(sx, 0.2, 0); g.add(skid); const bar = new THREE.Mesh(BOX, mat(0x222)); bar.scale.set(0.25, 1.0, 0.25); bar.position.set(sx, 0.7, 0); g.add(bar); }
  const rotor = new THREE.Group();
  for (let i = 0; i < 2; i++) { const blade = new THREE.Mesh(BOX, mat(0x111)); blade.scale.set(16, 0.15, 0.9); blade.rotation.y = i * Math.PI / 2; rotor.add(blade); }
  rotor.position.y = 3.8; g.add(rotor);
  const tailRotor = new THREE.Group();
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(BOX, mat(0x111)); b.scale.set(0.15, 3, 0.4); b.rotation.z = i * Math.PI / 2; tailRotor.add(b); }
  tailRotor.position.set(0.4, 3, -7); g.add(tailRotor);
  return { g, rotor, tailRotor, w: 3, l: 8 };
}
function buildPlane() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(CYL, mat(0xecf0f1)); body.scale.set(1.6, 11, 1.6); body.rotation.x = Math.PI / 2; body.position.y = 2.5; body.castShadow = true; g.add(body);
  const nose = new THREE.Mesh(CONE, mat(0x3498db)); nose.scale.set(1.6, 3, 1.6); nose.rotation.x = Math.PI / 2; nose.position.set(0, 2.5, 6.5); g.add(nose);
  const wing = new THREE.Mesh(BOX, mat(0xdfe6e9)); wing.scale.set(20, 0.4, 2.6); wing.position.set(0, 2.6, 0.5); wing.castShadow = true; g.add(wing);
  const tailW = new THREE.Mesh(BOX, mat(0xdfe6e9)); tailW.scale.set(7, 0.35, 1.6); tailW.position.set(0, 3, -5); g.add(tailW);
  const fin = new THREE.Mesh(BOX, mat(0x3498db)); fin.scale.set(0.35, 2.6, 2.2); fin.position.set(0, 4, -5); g.add(fin);
  const prop = new THREE.Group(); for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(BOX, mat(0x111)); b.scale.set(0.3, 5, 0.3); b.rotation.z = i * Math.PI / 2; prop.add(b); } prop.position.set(0, 2.5, 8); g.add(prop);
  return { g, prop, w: 3, l: 11 };
}

const VEHICLE_DEFS = {
  car:   { build: () => buildCar(pick(CAR_COLORS), false), max: 42, accel: 34, hp: 150, name: 'Car',        cls: 'ground' },
  tank:  { build: () => buildCar(0x55632f, true),          max: 24, accel: 20, hp: 900, name: 'Tank',       cls: 'ground' },
  bike:  { build: () => buildBike(pick(CAR_COLORS)),       max: 56, accel: 44, hp: 70,  name: 'Motorbike',  cls: 'ground' },
  cycle: { build: () => buildCycle(pick(CAR_COLORS)),      max: 20, accel: 16, hp: 40,  name: 'Bicycle',    cls: 'ground' },
  boat:  { build: () => buildBoat(false),                  max: 40, accel: 26, hp: 200, name: 'Speedboat',  cls: 'water' },
  ship:  { build: () => buildBoat(true),                   max: 26, accel: 14, hp: 600, name: 'Ship',       cls: 'water' },
  heli:  { build: () => buildHeli(),                       max: 55, accel: 40, hp: 260, name: 'Helicopter', cls: 'air' },
  plane: { build: () => buildPlane(),                      max: 90, accel: 46, hp: 220, name: 'Airplane',   cls: 'air' },
};
function makeVehicle(kind, x, z, y = 0) {
  const def = VEHICLE_DEFS[kind];
  const built = def.build();
  built.g.position.set(x, y, z);
  const v = {
    kind, cls: def.cls, obj: built.g, parts: built, pos: V3(x, y, z),
    yaw: rand(0, TAU), speed: 0, vy: 0, roll: 0, pitchLean: 0,
    max: def.max, accel: def.accel, hp: def.hp, name: def.name,
    wanderYaw: rand(0, TAU), tank: kind === 'tank', turboMul: 1, spin: 0,
  };
  built.g.userData.entity = v;
  scene.add(built.g); vehicles.push(v); return v;
}
function spawnTraffic(n) {
  let placed = 0, tries = 0;
  while (placed < n && tries < n * 40) { tries++;
    const x = rand(-HALF_W + TILE * 3, HALF_W - TILE * 3), z = rand(-HALF_H + TILE * 3, HALF_H - TILE * 3);
    if (tileAtWorld(x, z) === 0 && player.pos.distanceTo(V3(x, 0, z)) > 40) { makeVehicle('car', x, z); placed++; }
  }
}
function spawnStarterVehicles() {
  // a little sample of everything near where the player starts / around the island
  makeVehicle('bike', TILE * 1.2, -TILE * 0.5);
  makeVehicle('cycle', -TILE * 0.6, TILE * 1.2);
  makeVehicle('heli', TILE * 2, TILE * 2, 0);
  makeVehicle('plane', -HALF_W + TILE * 4, 0, 0);
  // water vehicles now live out past the mountains, on the new coastline
  makeVehicle('boat', 0, SHORE_R + 60, 0);
  makeVehicle('ship', SHORE_R + 90, 0, 0);
  makeVehicle('boat', 0, -(SHORE_R + 60), 0);
}

// ---------------- pedestrians & cops ----------------
function makePed(x, z) {
  const obj = makeHuman(); obj.position.set(x, 0, z);
  const ped = { obj, etype: 'ped', pos: V3(x, 0, z), yaw: rand(0, TAU), hp: 40, state: 'wander', panic: 0, wanderT: rand(1, 4), speed: rand(3.5, 6), phase: rand(0, TAU) };
  obj.userData.entity = ped; scene.add(obj); peds.push(ped); return ped;
}
function spawnPeds(n) {
  let placed = 0, tries = 0;
  while (placed < n && tries < n * 40) { tries++;
    const x = rand(-HALF_W + TILE * 2, HALF_W - TILE * 2), z = rand(-HALF_H + TILE * 2, HALF_H - TILE * 2);
    const t = tileAtWorld(x, z);
    if ((t === 3 || t === 2 || t === 0 || t === 4) && player.pos.distanceTo(V3(x, 0, z)) > 30) { makePed(x, z); placed++; }
  }
}
function makeCop(x, z) {
  const obj = makeHuman({ shirt: 0x14307a, pants: 0x0c1533, hair: 0x111111 }); obj.position.set(x, 0, z);
  const cop = { obj, etype: 'cop', pos: V3(x, 0, z), yaw: 0, hp: 70, speed: 7, shootCd: randi(20, 60), phase: 0 };
  obj.userData.entity = cop; scene.add(obj); cops.push(cop); return cop;
}

// ================================================================
//  PHYSICS PROPS (custom rigidbodies)
// ================================================================
const GRAVITY = -30;
function makeProp(kind, x, z) {
  let mesh, radius, mass;
  if (kind === 'barrel') { mesh = new THREE.Mesh(CYL, mat(pick([0xd35400, 0xc0392b, 0x27ae60, 0x2c3e50]))); mesh.scale.set(1.4, 2.4, 1.4); radius = 1.4; mass = 3; }
  else if (kind === 'crate') { mesh = new THREE.Mesh(BOX, mat(0x9c6b3a)); mesh.scale.set(2.2, 2.2, 2.2); radius = 1.4; mass = 4; }
  else { mesh = new THREE.Mesh(CONE, mat(0xff7f24)); mesh.scale.set(1.2, 2.0, 1.2); radius = 1.0; mass = 1; } // cone
  mesh.castShadow = true; mesh.position.set(x, radius, z);
  const p = { kind, mesh, pos: V3(x, radius, z), vel: V3(), ang: V3(), radius, mass, rest: 0.35, rest0: radius, resting: false };
  mesh.userData.entity = p; scene.add(mesh); props.push(p); return p;
}
function scatterProps() {
  let n = 0, tries = 0;
  while (n < 60 && tries < 600) { tries++;
    const x = rand(-HALF_W + TILE * 2, HALF_W - TILE * 2), z = rand(-HALF_H + TILE * 2, HALF_H - TILE * 2);
    const t = tileAtWorld(x, z);
    if (t === 0 || t === 3 || t === 4) { makeProp(pick(['barrel', 'crate', 'cone']), x, z); n++; }
  }
}
function impulse(p, vec, spin = 1) {
  p.vel.addScaledVector(vec, 1 / p.mass); p.resting = false;
  p.ang.x += rand(-1, 1) * spin; p.ang.y += rand(-1, 1) * spin; p.ang.z += rand(-1, 1) * spin;
}
function updateProps(dt) {
  for (const p of props) {
    if (p.resting) continue;
    p.vel.y += GRAVITY * dt;
    p.pos.addScaledVector(p.vel, dt);
    // ground / water
    const groundY = overWater(p.pos.x, p.pos.z) ? WATER_Y + p.rest0 : p.rest0;
    if (p.pos.y <= groundY) {
      p.pos.y = groundY;
      if (p.vel.y < -1) p.vel.y = -p.vel.y * p.rest; else p.vel.y = 0;
      p.vel.x *= 0.86; p.vel.z *= 0.86;
      p.ang.multiplyScalar(0.82);
      if (Math.abs(p.vel.y) < 0.6 && p.vel.lengthSq() < 0.4 && p.ang.lengthSq() < 0.2) { p.resting = true; p.vel.set(0, 0, 0); p.ang.set(0, 0, 0); }
    }
    // building walls: push out
    if (isSolidW(p.pos.x, p.pos.z)) {
      p.vel.x *= -0.4; p.vel.z *= -0.4;
      p.pos.addScaledVector(p.vel, dt * 2);
    }
    p.pos.x = clamp(p.pos.x, -OCEAN_BOUND, OCEAN_BOUND); p.pos.z = clamp(p.pos.z, -OCEAN_BOUND, OCEAN_BOUND);
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.x += p.ang.x * dt; p.mesh.rotation.y += p.ang.y * dt; p.mesh.rotation.z += p.ang.z * dt;
  }
  // prop vs prop (cheap O(n^2) over active props only)
  for (let i = 0; i < props.length; i++) {
    const a = props[i]; if (a.resting) continue;
    for (let j = i + 1; j < props.length; j++) {
      const b = props[j];
      const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z; const d2 = dx * dx + dz * dz;
      const rr = a.radius + b.radius;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2), overlap = (rr - d) * 0.5, nx = dx / d, nz = dz / d;
        a.pos.x += nx * overlap; a.pos.z += nz * overlap; b.pos.x -= nx * overlap; b.pos.z -= nz * overlap;
        const push = 3; a.vel.x += nx * push; a.vel.z += nz * push; b.vel.x -= nx * push; b.vel.z -= nz * push;
        b.resting = false;
      }
    }
  }
}
// anything moving can shove props
function shoveProps(pos, vel, reach, power) {
  for (const p of props) {
    const dx = p.pos.x - pos.x, dz = p.pos.z - pos.z; const d2 = dx * dx + dz * dz;
    if (d2 < reach * reach) {
      const d = Math.sqrt(d2) || 1;
      const dir = V3(dx / d, 0.25, dz / d);
      impulse(p, dir.multiplyScalar(power).add(V3(vel.x, 0, vel.z)), 4);
    }
  }
}

// ================================================================
//  INPUT / CAMERA
// ================================================================
let yaw = 0, pitch = 0.55;
const keys = {};
let firing = false, locked = false, started = false;
const crosshair = document.getElementById('crosshair'), lockHint = document.getElementById('lock-hint');
canvas.addEventListener('click', () => { if (started && !locked) canvas.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  crosshair.classList.toggle('show', locked); lockHint.classList.toggle('show', started && !locked);
});
document.addEventListener('mousemove', e => { if (!locked) return; yaw -= e.movementX * 0.0025; pitch = clamp(pitch + e.movementY * 0.0022, 0.1, 1.2); });
document.addEventListener('mousedown', e => { if (locked && e.button === 0) firing = true; });
document.addEventListener('mouseup', e => { if (e.button === 0) firing = false; });
addEventListener('keydown', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = true;
  handleCheatKey(e.key);
  if (k === 'f') tryEnterExit();
  if (k === 'e') tryInteract();
  if (k >= '1' && k <= '5') { const w = WEAPON_ORDER[+k - 1]; if (w) selectWeapon(w); }
  if ([' ', 'ArrowUp', 'ArrowDown', 'Shift'].includes(e.key)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });
function selectWeapon(w) { player.weapon = w; updateHUD(); toast(WEAPONS[w].name); }

// ================================================================
//  CHEATS
// ================================================================
let cheatBuffer = '', turbo = false, night = false, cheatTimer = 0;
const cheatBufEl = document.getElementById('cheat-buffer'), cheatMsgEl = document.getElementById('cheat-msg');
function nearPlayer(off = 12) { const a = rand(0, TAU); return { x: player.pos.x + Math.cos(a) * off, z: player.pos.z + Math.sin(a) * off }; }
const CHEATS = {
  HESOYAM: () => { player.hp = player.maxHp; player.armor = player.maxArmor; player.money += 250000; cheatMsg('Health, Armor & $250,000'); },
  FULLAMMO: () => { for (const w in player.ammo) if (WEAPONS[w].ammo !== Infinity) player.ammo[w] = WEAPONS[w].ammo * 3; cheatMsg('All weapons loaded'); },
  PANZER: () => { const p = nearPlayer(); makeVehicle('tank', p.x, p.z); cheatMsg('Tank delivered'); },
  CHOPPER: () => { const p = nearPlayer(11); makeVehicle('heli', p.x, p.z); cheatMsg('Helicopter delivered'); },
  JETSET: () => { const p = nearPlayer(12); makeVehicle('plane', p.x, p.z); cheatMsg('Airplane delivered'); },
  SEAFARER: () => { let x = player.pos.x, z = player.pos.z; if (!overWater(x, z)) { const a = Math.atan2(z, x) || 0, R = SHORE_R + 45; x = Math.cos(a) * R; z = Math.sin(a) * R; } makeVehicle('boat', x, z); cheatMsg('Boat delivered at the coast'); },
  TWOWHEELS: () => { const p = nearPlayer(); makeVehicle('bike', p.x, p.z); cheatMsg('Motorbike delivered'); },
  PEDALS: () => { const p = nearPlayer(); makeVehicle('cycle', p.x, p.z); cheatMsg('Bicycle delivered'); },
  ROCKETMAN: () => { player.ammo.rocket += 20; selectWeapon('rocket'); cheatMsg('Rocket Launcher'); },
  GODMODE: () => { player.god = !player.god; cheatMsg('God Mode ' + (player.god ? 'ON' : 'OFF')); },
  LEAVEMEALONE: () => { setWanted(0); player.heat = 0; cheatMsg('Wanted level cleared'); },
  ITSALLGONE: () => { setWanted(5); player.heat = 100; cheatMsg('Five stars incoming!'); },
  SPEEDFREAK: () => { turbo = !turbo; cheatMsg('Turbo ' + (turbo ? 'ON' : 'OFF')); },
  BAABAA: () => { player.bigHead = !player.bigHead; setBigHead(player.obj, player.bigHead); cheatMsg('Big Head ' + (player.bigHead ? 'ON' : 'OFF')); },
  NIGHTMODE: () => { night = !night; applyNight(); cheatMsg('Night mode ' + (night ? 'ON' : 'OFF')); },
  CASHMONEY: () => { player.money += 100000; cheatMsg('$100,000'); },
};
function handleCheatKey(key) {
  if (key.length !== 1 || !/[a-zA-Z]/.test(key)) return;
  cheatBuffer = (cheatBuffer + key.toUpperCase()).slice(-16); cheatBufEl.textContent = cheatBuffer;
  for (const code in CHEATS) if (cheatBuffer.endsWith(code)) { CHEATS[code](); cheatBuffer = ''; cheatBufEl.textContent = ''; updateHUD(); break; }
}
function cheatMsg(t) { cheatMsgEl.textContent = t; cheatMsgEl.classList.add('show'); cheatTimer = 2.4; }
function toast(t) { cheatMsg(t); cheatTimer = 1.2; }
function applyNight() {
  if (night) { scene.background = new THREE.Color(SKY_NIGHT); scene.fog.color.set(SKY_NIGHT); hemi.intensity = 0.3; sun.intensity = 0.28; hemi.color.set(0x33406b); ocean.material.color.set(0x0a2038); }
  else { scene.background = new THREE.Color(SKY_DAY); scene.fog.color.set(SKY_DAY); hemi.intensity = 0.9; sun.intensity = 1.25; hemi.color.set(0xcfeaff); ocean.material.color.set(0x1d70b8); }
  for (const fm of facadeMaterials) fm.emissiveIntensity = night ? 1.15 : 0;   // lit windows glow at night
}

// ---------------- wanted ----------------
function setWanted(n) { player.wanted = clamp(n, 0, 5); updateHUD(); }
function addHeat(a) { player.heat = clamp(player.heat + a, 0, 120); const l = Math.min(5, Math.floor(player.heat / 20)); if (l > player.wanted) setWanted(l); }

// ================================================================
//  COMBAT
// ================================================================
const raycaster = new THREE.Raycaster();
const _fwd = new THREE.Vector3();
function cameraForward() { camera.getWorldDirection(_fwd); return _fwd.clone(); }
function getEntity(obj) { let o = obj; while (o) { if (o.userData && o.userData.entity) return o.userData.entity; o = o.parent; } return null; }
function collectTargets() {
  const l = [];
  for (const p of peds) l.push(p.obj); for (const c of cops) l.push(c.obj);
  for (const a of animals) l.push(a.obj);
  for (const v of vehicles) if (v !== player.inVehicle) l.push(v.obj);
  for (const b of buildingMeshes) l.push(b);
  return l;
}
function fireWeapon() {
  const w = WEAPONS[player.weapon];
  if (player.cooldown > 0) return;
  if (player.ammo[player.weapon] !== Infinity && player.ammo[player.weapon] <= 0) { toast('No ammo'); player.cooldown = 0.4; return; }
  player.cooldown = w.rate / 60;
  if (player.ammo[player.weapon] !== Infinity) { player.ammo[player.weapon]--; updateHUD(); }
  const origin = player.pos.clone(); origin.y = player.inVehicle ? 2 : 3;
  const baseDir = (player.inVehicle && player.inVehicle.cls !== 'air') ? V3(Math.sin(player.inVehicle.yaw), 0, Math.cos(player.inVehicle.yaw)) : cameraForward();
  if (!player.inVehicle || player.inVehicle.cls !== 'air') baseDir.y = clamp(baseDir.y, -0.2, 0.2);
  muzzleLight.position.copy(origin).add(baseDir.clone().multiplyScalar(2)); muzzleLight.intensity = 4;
  if (w.melee) { meleeHit(origin, baseDir, w.range, w.dmg); return; }
  const pellets = w.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    const dir = baseDir.clone();
    if (w.spread) { dir.x += rand(-w.spread, w.spread); dir.y += rand(-w.spread, w.spread) * 0.4; dir.z += rand(-w.spread, w.spread); dir.normalize(); }
    if (w.rocket) { spawnRocket(origin, dir); continue; }
    hitscan(origin, dir, w.range, w.dmg, w.tracer);
  }
  addHeat(w.rocket ? 8 : 2);
}
function hitscan(origin, dir, range, dmg, color) {
  raycaster.set(origin, dir); raycaster.far = range;
  const hits = raycaster.intersectObjects(collectTargets(), true);
  let end = origin.clone().add(dir.clone().multiplyScalar(range));
  if (hits.length) { const h = hits[0]; end = h.point.clone(); const e = getEntity(h.object); if (e) applyDamage(e, dmg, h.point); else spawnBurst(h.point, 0xcccccc, 5); }
  // tracer may also shove a prop it passes near
  shoveProps(end, dir.clone().multiplyScalar(6), 2.4, 6);
  spawnTracer(origin, end, color);
}
function meleeHit(origin, dir, range, dmg) {
  const target = origin.clone().add(dir.clone().multiplyScalar(range));
  for (const arr of [peds, cops, animals]) for (const e of arr) if (!e.dead && e.pos.distanceTo(target) < 3.5) applyDamage(e, dmg, e.pos.clone().setY(2));
  shoveProps(target, dir.clone().multiplyScalar(12), 3, 14);
  spawnBurst(target.setY(1.5), 0xffffff, 5);
}
function applyDamage(ent, dmg, point) {
  if (ent.kind && VEHICLE_DEFS[ent.kind]) { ent.hp -= dmg; spawnBurst(point, 0xffcc66, 5); if (ent.hp <= 0) destroyVehicle(ent); return; }
  ent.hp -= dmg; spawnBurst(point, 0xaa0000, 6);
  if (ent.etype === 'cop') { if (ent.hp <= 0) { killEntity(ent, cops, randi(90, 200)); addHeat(15); } else addHeat(2); }
  else if (ent.etype === 'animal') { ent.state = 'flee'; ent.panic = 6; if (ent.hp <= 0) { killEntity(ent, animals, randi(10, 40)); addHeat(10); } }
  else { ent.state = 'flee'; ent.panic = 5; if (ent.hp <= 0) { killEntity(ent, peds, randi(20, 120)); addHeat(20); floatWorld(ent.pos, 'WASTED', '#ff5555'); } else addHeat(3); }
}
function killEntity(ent, arr, cash) {
  ent.dead = true; if (player.stats) player.stats.kills++;
  spawnBurst(ent.pos.clone().setY(2), 0x990000, 16);
  spawnPickup(ent.pos.x, ent.pos.z, 'cash', cash);
  ent.obj.rotation.x = Math.PI / 2.2; ent.obj.position.y = ent.etype === 'animal' ? 0.4 : 0.6; ent.corpse = 5;
}
function spawnRocket(origin, dir) {
  const m = new THREE.Mesh(CYL, mat(0x333)); m.scale.set(0.4, 1.5, 0.4);
  m.position.copy(origin).add(dir.clone().multiplyScalar(3)); m.quaternion.setFromUnitVectors(V3(0, 1, 0), dir); scene.add(m);
  projectiles.push({ obj: m, pos: m.position.clone(), dir: dir.clone(), speed: 60, life: 5 });
}
function hurtPlayer(dmg) {
  if (player.god) return;
  if (player.armor > 0) { const a = Math.min(player.armor, dmg); player.armor -= a; dmg -= a; }
  player.hp -= dmg; player.hitFlash = 0.25; updateHUD();
  if (player.hp <= 0) playerDie();
}
let dead = false;
function playerDie() {
  if (dead) return; dead = true; player.hp = 0; centerTimer = 0;
  if (player.inVehicle) exitVehicle();
  centerMsg('WASTED', true);
  const loss = Math.floor(player.money * 0.1);
  setTimeout(() => respawn(loss), 2600);
}
function respawn(loss) {
  dead = false; player.hp = player.maxHp; player.armor = 0; player.vy = 0;
  if (player.inInterior) { for (const f of player.inInterior.floors) f.light.visible = false; player.inInterior = null; }
  player.money = Math.max(0, player.money - loss); setWanted(0); player.heat = 0;
  player.pos.set(TILE * 0.5, 0, TILE * 0.5);
  for (const c of cops.slice()) removeEntity(c, cops);
  hideCenter(); updateHUD();
}

// ---------------- effects ----------------
function spawnTracer(a, b, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color || 0xffee88, transparent: true, opacity: 0.9 }));
  scene.add(line); tracers.push({ obj: line, life: 0.08 });
}
function spawnBurst(pos, color, n) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(BOX, mat(color)); m.scale.setScalar(rand(0.2, 0.5)); m.position.copy(pos);
    const v = V3(rand(-1, 1), rand(0.2, 1.5), rand(-1, 1)).normalize().multiplyScalar(rand(4, 12));
    scene.add(m); effects.push({ obj: m, vel: v, life: rand(0.4, 0.9), grav: -18 });
  }
}
function explode(pos, big) {
  const r = big ? 16 : 10;
  const flash = new THREE.PointLight(0xffaa33, 8, r * 4, 2); flash.position.copy(pos); scene.add(flash);
  effects.push({ obj: flash, vel: V3(), life: 0.3, grav: 0, light: true });
  const ball = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.9 }));
  ball.position.copy(pos); ball.scale.setScalar(1); scene.add(ball);
  effects.push({ obj: ball, vel: V3(), life: 0.4, grav: 0, grow: r });
  spawnBurst(pos, 0xff7a1a, 26); spawnBurst(pos, 0xffd24a, 16);
  const flat = V3(pos.x, 0, pos.z);
  for (const arr of [peds, cops, animals]) for (const e of arr.slice()) if (!e.dead && V3(e.pos.x, 0, e.pos.z).distanceTo(flat) < r) applyDamage(e, big ? 200 : 120, e.pos.clone().setY(2));
  for (const v of vehicles.slice()) if (v !== player.inVehicle && V3(v.pos.x, 0, v.pos.z).distanceTo(flat) < r) applyDamage(v, big ? 200 : 120, v.pos.clone().setY(1));
  shoveProps(pos, V3(), r, 60);
  if (!player.god && V3(player.pos.x, 0, player.pos.z).distanceTo(flat) < r) hurtPlayer((r - V3(player.pos.x, 0, player.pos.z).distanceTo(flat)) * 12);
}

// ---------------- pickups ----------------
function spawnPickup(x, z, type, val) {
  const color = type === 'cash' ? 0x2ecc71 : type === 'health' ? 0xff5b6b : 0x5b9bff;
  const m = new THREE.Mesh(CYL, new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
  m.scale.set(1, 0.3, 1); m.position.set(x, 1.2, z); scene.add(m);
  pickups.push({ obj: m, pos: V3(x, 1.2, z), type, val, t: 0 });
}

// ---------------- enter / exit ----------------
function tryEnterExit() {
  if (dead || !started) return;
  if (player.inVehicle) { exitVehicle(); return; }
  let best = null, bd = 196;   // ~14u reach, forgiving for big vehicles
  for (const v of vehicles) { const d = v.pos.distanceToSquared(player.pos); if (d < bd) { bd = d; best = v; } }
  if (best) { player.inVehicle = best; player.obj.visible = false; toast('Enter ' + best.name); updateHUD(); }
}
function exitVehicle() {
  const v = player.inVehicle; if (!v) return;
  const side = V3(Math.cos(v.yaw), 0, -Math.sin(v.yaw)).multiplyScalar(5);
  player.pos.copy(v.pos).add(side);
  player.pos.y = v.cls === 'air' ? Math.max(0, v.pos.y) : 0; // hop out at altitude = skydive
  player.vy = v.cls === 'air' ? -2 : 0;
  player.obj.visible = true; v.speed *= 0.2; player.inVehicle = null; toast('Exit vehicle'); updateHUD();
}
function destroyVehicle(v) { explode(v.pos.clone().setY(1.5), true); if (player.inVehicle === v) exitVehicle(); removeEntity(v, vehicles); }
function removeEntity(ent, arr) { scene.remove(ent.obj); const i = arr.indexOf(ent); if (i > -1) arr.splice(i, 1); }

// ================================================================
//  UPDATE — player
// ================================================================
function updatePlayer(dt) {
  if (dead) return;
  if (player.inVehicle) { updateVehiclePlayer(dt); return; }

  player.obj.rotation.y = yaw;
  const f = V3(Math.sin(yaw), 0, Math.cos(yaw)), r = V3(Math.cos(yaw), 0, -Math.sin(yaw));
  const move = V3();
  if (keys['w'] || keys['arrowup']) move.add(f);
  if (keys['s'] || keys['arrowdown']) move.sub(f);
  if (keys['a'] || keys['arrowleft']) move.add(r);   // strafe left  (A)
  if (keys['d'] || keys['arrowright']) move.sub(r);  // strafe right (D)
  const moving = move.lengthSq() > 0;
  player.swimming = overWater(player.pos.x, player.pos.z);
  const sprinting = keys['Shift'] && !player.swimming && moving;   // W(+any dir) + Shift = run
  const spd = (player.swimming ? 6 : 12) * (sprinting ? 1.85 : 1);
  if (moving) {
    move.normalize().multiplyScalar(spd * dt);
    const nx = player.pos.x + move.x, nz = player.pos.z + move.z;
    if (!isSolidW(nx, player.pos.z)) player.pos.x = nx;
    if (!isSolidW(player.pos.x, nz)) player.pos.z = nz;
    player.pos.x = clamp(player.pos.x, -OCEAN_BOUND, OCEAN_BOUND); player.pos.z = clamp(player.pos.z, -OCEAN_BOUND, OCEAN_BOUND);
    player.phase += dt * (sprinting ? 19 : 12);
    shoveProps(player.pos, move.clone().multiplyScalar(60), 2.2, 6);
  }
  // jump (Space, edge-triggered) — only from the ground, not while swimming
  const jumpNow = keys[' '] && !player._spacePrev;
  player._spacePrev = keys[' '];
  if (jumpNow && player.onGround && !player.swimming) { player.vy = 15; player.onGround = false; }
  // vertical: gravity + ground/water — plant feet on the actual surface height
  player.vy += GRAVITY * dt; player.pos.y += player.vy * dt;
  const floorY = player.swimming ? WATER_Y - 0.3 : groundHeightAt(player.pos.x, player.pos.z);
  if (player.pos.y <= floorY) { player.pos.y = floorY; player.vy = 0; player.onGround = true; } else player.onGround = false;
  const bob = player.swimming ? Math.sin(clock.elapsedTime * 3) * 0.15 : 0;
  player.obj.position.set(player.pos.x, player.pos.y + bob, player.pos.z);
  animateHuman(player.obj, player.phase, moving && !player.swimming);

  const w = WEAPONS[player.weapon];
  if (firing && !player.swimming && (w.auto || w.melee || player.cooldown <= 0)) fireWeapon();
  if (player.cooldown > 0) player.cooldown -= dt;
  if (player.wanted === 0 && player.hp < player.maxHp) player.hp += dt * 2;
}

function updateVehiclePlayer(dt) {
  const v = player.inVehicle;
  if (v.cls === 'air') updateAir(v, dt);
  else if (v.cls === 'water') updateWater(v, dt);
  else updateGround(v, dt);
  // shared: firing from vehicle
  const w = WEAPONS[player.weapon];
  if (firing && (w.auto || player.cooldown <= 0)) fireWeapon();
  if (player.cooldown > 0) player.cooldown -= dt;
  player.pos.copy(v.pos);
}
function updateGround(v, dt) {
  const accel = v.accel * (turbo ? 2.2 : 1);
  const maxS = v.max * (turbo ? 1.8 : 1);
  if (keys['w'] || keys['arrowup']) v.speed += accel * dt;
  else if (keys['s'] || keys['arrowdown']) v.speed -= accel * 0.8 * dt;
  else v.speed *= (1 - 1.6 * dt);
  v.speed = clamp(v.speed, -maxS * 0.5, maxS);
  const steer = clamp(Math.abs(v.speed) / 8, 0, 1) * (v.speed >= 0 ? 1 : -1);
  const turnRate = (v.kind === 'bike' ? 2.4 : v.kind === 'cycle' ? 2.6 : 1.8);
  if (keys['a'] || keys['arrowleft']) v.yaw += turnRate * steer * dt;
  if (keys['d'] || keys['arrowright']) v.yaw -= turnRate * steer * dt;
  if (keys[' ']) v.speed *= (1 - 3 * dt);
  const dir = V3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
  const nx = v.pos.x + dir.x * v.speed * dt, nz = v.pos.z + dir.z * v.speed * dt;
  let hit = false;
  if (!isSolidW(nx, v.pos.z)) v.pos.x = nx; else hit = true;
  if (!isSolidW(v.pos.x, nz)) v.pos.z = nz; else hit = true;
  if (overWater(v.pos.x, v.pos.z)) { v.pos.y = lerp(v.pos.y, WATER_Y + 0.2, dt * 3); v.speed *= (1 - 2 * dt); } // bogs down in water
  else v.pos.y = lerp(v.pos.y, groundHeightAt(v.pos.x, v.pos.z) - 0.35, dt * 8);
  if (hit && Math.abs(v.speed) > 8) { v.hp -= Math.abs(v.speed); spawnBurst(v.pos.clone().setY(1.2), 0xffcf6b, 5); v.speed *= -0.3; }
  v.pos.x = clamp(v.pos.x, -OCEAN_BOUND, OCEAN_BOUND); v.pos.z = clamp(v.pos.z, -OCEAN_BOUND, OCEAN_BOUND);
  // lean for bikes
  const targetRoll = (v.kind === 'bike' || v.kind === 'cycle') ? -steer * 0.4 : 0;
  v.roll = lerp(v.roll, targetRoll, dt * 6);
  applyVehicleTransform(v);
  spinWheels(v, v.speed * dt);
  runOver(v, 4, 120);
  if (player.stats) player.stats.distance += Math.abs(v.speed) * dt;
  if (v.hp <= 0) destroyVehicle(v);
}
function updateWater(v, dt) {
  const onWater = overWater(v.pos.x, v.pos.z);
  const accel = v.accel * (turbo ? 1.8 : 1), maxS = v.max * (turbo ? 1.6 : 1);
  if (keys['w'] || keys['arrowup']) v.speed += accel * dt;
  else if (keys['s'] || keys['arrowdown']) v.speed -= accel * 0.7 * dt;
  else v.speed *= (1 - 0.8 * dt);
  v.speed = clamp(v.speed, -maxS * 0.4, maxS);
  if (!onWater) v.speed *= (1 - 4 * dt); // beached
  const steer = clamp(Math.abs(v.speed) / 6, 0, 1) * (v.speed >= 0 ? 1 : -1);
  if (keys['a'] || keys['arrowleft']) v.yaw += 1.2 * steer * dt;
  if (keys['d'] || keys['arrowright']) v.yaw -= 1.2 * steer * dt;
  const dir = V3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
  v.pos.x = clamp(v.pos.x + dir.x * v.speed * dt, -OCEAN_BOUND, OCEAN_BOUND);
  v.pos.z = clamp(v.pos.z + dir.z * v.speed * dt, -OCEAN_BOUND, OCEAN_BOUND);
  v.pos.y = WATER_Y + 0.3 + Math.sin(clock.elapsedTime * 2 + v.pos.x * 0.05) * 0.4;
  v.pitchLean = Math.sin(clock.elapsedTime * 1.6) * 0.05;
  applyVehicleTransform(v);
  if (v.hp <= 0) destroyVehicle(v);
}
function updateAir(v, dt) {
  const accel = v.accel, maxS = v.max * (turbo ? 1.6 : 1);
  if (keys['w'] || keys['arrowup']) v.speed += accel * dt;
  else if (keys['s'] || keys['arrowdown']) v.speed -= accel * dt;
  else v.speed *= (1 - (v.kind === 'plane' ? 0.2 : 1.2) * dt);
  const minS = v.kind === 'plane' ? 14 : 0;   // plane must keep moving
  v.speed = clamp(v.speed, minS, maxS);
  if (keys['a'] || keys['arrowleft']) v.yaw += 1.1 * dt;
  if (keys['d'] || keys['arrowright']) v.yaw -= 1.1 * dt;
  // altitude
  if (keys[' ']) v.vy += 26 * dt; else if (keys['Shift']) v.vy -= 26 * dt; else v.vy *= (1 - 2 * dt);
  v.vy = clamp(v.vy, -30, 30);
  const dir = V3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
  v.pos.x = clamp(v.pos.x + dir.x * v.speed * dt, -OCEAN_BOUND, OCEAN_BOUND);
  v.pos.z = clamp(v.pos.z + dir.z * v.speed * dt, -OCEAN_BOUND, OCEAN_BOUND);
  v.pos.y = clamp(v.pos.y + v.vy * dt, 0, 380);
  // banking & pitch visuals
  const bank = ((keys['a'] || keys['arrowleft']) ? 0.4 : (keys['d'] || keys['arrowright']) ? -0.4 : 0);
  v.roll = lerp(v.roll, v.kind === 'plane' ? bank : bank * 0.4, dt * 4);
  v.pitchLean = lerp(v.pitchLean, v.kind === 'plane' ? -clamp(v.vy / 40, -0.4, 0.4) : clamp(v.speed / 120, 0, 0.3) - clamp(v.vy / 60, -0.3, 0.3), dt * 4);
  v.spin += dt * 40;
  if (v.parts.rotor) v.parts.rotor.rotation.y = v.spin;
  if (v.parts.tailRotor) v.parts.tailRotor.rotation.x = v.spin;
  if (v.parts.prop) v.parts.prop.rotation.z = v.spin;
  applyVehicleTransform(v);
  // crash into ground while moving fast
  if (v.pos.y <= 0.5 && v.speed > 30) { destroyVehicle(v); }
}
function applyVehicleTransform(v) {
  v.obj.position.copy(v.pos);
  v.obj.rotation.set(v.pitchLean || 0, v.yaw, v.roll || 0, 'YXZ');
}
function spinWheels(v, amt) { if (v.parts.wheels) for (const w of v.parts.wheels) w.rotation.x += amt * 0.6; }
function runOver(v, reach, dmg) {
  if (Math.abs(v.speed) < 6) return;
  for (const arr of [peds, cops, animals]) for (const e of arr.slice()) if (!e.dead && e.pos.distanceTo(v.pos) < reach) { applyDamage(e, dmg, e.pos.clone().setY(2)); v.speed *= 0.92; }
  shoveProps(v.pos, V3(Math.sin(v.yaw) * v.speed, 0, Math.cos(v.yaw) * v.speed), reach + 1, Math.abs(v.speed) * 2.5);
}

// ================================================================
//  UPDATE — NPCs / animals / traffic
// ================================================================
function stepEntity(e, dx, dz) {
  const nx = e.pos.x + dx, nz = e.pos.z + dz; let ok = true;
  if (!isSolidW(nx, e.pos.z)) e.pos.x = nx; else ok = false;
  if (!isSolidW(e.pos.x, nz)) e.pos.z = nz; else ok = false;
  e.pos.x = clamp(e.pos.x, -HALF_W + 2, HALF_W - 2); e.pos.z = clamp(e.pos.z, -HALF_H + 2, HALF_H - 2);
  return ok;
}
function updatePeds(dt) {
  for (const p of peds.slice()) {
    if (p.corpse !== undefined) { p.corpse -= dt; if (p.corpse <= 0) removeEntity(p, peds); continue; }
    if (!p.isTarget && p.pos.distanceTo(player.pos) > 260) { removeEntity(p, peds); continue; }
    if (p.panic > 0) p.panic -= dt;
    if (p.state === 'flee' || p.panic > 0) {
      const away = p.pos.clone().sub(player.pos).setY(0).normalize();
      p.yaw = Math.atan2(away.x, away.z); stepEntity(p, away.x * p.speed * 1.5 * dt, away.z * p.speed * 1.5 * dt);
      if (p.panic <= 0) p.state = 'wander';
    } else {
      p.wanderT -= dt; if (p.wanderT <= 0) { p.yaw = rand(0, TAU); p.wanderT = rand(1.5, 4.5); }
      if (!stepEntity(p, Math.sin(p.yaw) * p.speed * 0.5 * dt, Math.cos(p.yaw) * p.speed * 0.5 * dt)) p.yaw = rand(0, TAU);
    }
    p.phase += dt * 10; p.obj.rotation.y = p.yaw; p.obj.position.set(p.pos.x, groundHeightAt(p.pos.x, p.pos.z), p.pos.z); animateHuman(p.obj, p.phase, true);
  }
  if (peds.length < 48) spawnPeds(48 - peds.length);
}
function updateAnimals(dt) {
  for (const a of animals.slice()) {
    if (a.corpse !== undefined) { a.corpse -= dt; if (a.corpse <= 0) removeEntity(a, animals); continue; }
    if (a.pos.distanceTo(player.pos) > 240) { removeEntity(a, animals); continue; }
    if (a.panic > 0) a.panic -= dt;
    let moving = true;
    if (a.state === 'flee' || a.panic > 0) {
      const away = a.pos.clone().sub(player.pos).setY(0).normalize();
      a.yaw = Math.atan2(away.x, away.z); stepEntity(a, away.x * a.speed * dt, away.z * a.speed * dt);
      if (a.panic <= 0) a.state = 'wander';
    } else {
      a.wanderT -= dt; if (a.wanderT <= 0) { a.yaw = rand(0, TAU); a.wanderT = rand(1, 3.5); }
      if (!stepEntity(a, Math.sin(a.yaw) * a.speed * 0.4 * dt, Math.cos(a.yaw) * a.speed * 0.4 * dt)) a.yaw = rand(0, TAU);
    }
    a.phase += dt * 12; a.obj.rotation.y = a.yaw; a.obj.position.set(a.pos.x, groundHeightAt(a.pos.x, a.pos.z), a.pos.z);
    const sw = Math.sin(a.phase) * 0.6; a.legs[0].rotation.x = sw; a.legs[3].rotation.x = sw; a.legs[1].rotation.x = -sw; a.legs[2].rotation.x = -sw;
  }
  if (animals.length < 8) { const p = nearPlayer(rand(40, 90)); if (inIsland(p.x, p.z) && !isSolidW(p.x, p.z)) makeDog(p.x, p.z); }
}
function updateBirds(dt) {
  for (const b of birds) {
    b.phase += dt * 8;
    b.wings.lw.rotation.z = Math.sin(b.phase) * 0.6; b.wings.rw.rotation.z = -Math.sin(b.phase) * 0.6;
    b.yaw += Math.sin(clock.elapsedTime * 0.3 + b.pos.x) * dt * 0.4;
    b.pos.x += Math.sin(b.yaw) * b.speed * dt; b.pos.z += Math.cos(b.yaw) * b.speed * dt;
    if (Math.abs(b.pos.x) > OCEAN_BOUND * 0.9) b.yaw += Math.PI; if (Math.abs(b.pos.z) > OCEAN_BOUND * 0.9) b.yaw += Math.PI;
    b.pos.y = 40 + Math.sin(clock.elapsedTime + b.pos.x * 0.02) * 8;
    b.obj.position.copy(b.pos); b.obj.rotation.y = b.yaw;
  }
}
function updateCops(dt) {
  const desired = player.wanted * 2;
  if (cops.length < desired && Math.random() < 0.03) {
    const a = rand(0, TAU), d = rand(60, 90);
    const x = clamp(player.pos.x + Math.cos(a) * d, -HALF_W + 3, HALF_W - 3), z = clamp(player.pos.z + Math.sin(a) * d, -HALF_H + 3, HALF_H - 3);
    if (!isSolidW(x, z) && inIsland(x, z)) makeCop(x, z);
  }
  for (const c of cops.slice()) {
    if (c.corpse !== undefined) { c.corpse -= dt; if (c.corpse <= 0) removeEntity(c, cops); continue; }
    const d = c.pos.distanceTo(player.pos); if (d > 220) { removeEntity(c, cops); continue; }
    const toP = player.pos.clone().sub(c.pos).setY(0).normalize(); c.yaw = Math.atan2(toP.x, toP.z);
    let moving = false;
    if (d > 14) { stepEntity(c, toP.x * c.speed * dt, toP.z * c.speed * dt); moving = true; c.phase += dt * 10; }
    c.obj.rotation.y = c.yaw; c.obj.position.set(c.pos.x, groundHeightAt(c.pos.x, c.pos.z), c.pos.z); animateHuman(c.obj, c.phase, moving);
    c.shootCd -= dt * 60;
    if (c.shootCd <= 0 && d < 65 && !dead) { copFire(c); c.shootCd = randi(45, 90) - player.wanted * 5; }
  }
  player.heat = Math.max(0, player.heat - dt * 1.5);
  const l = Math.min(5, Math.floor(player.heat / 20)); if (l < player.wanted) setWanted(l);
}
function copFire(cop) {
  const origin = cop.pos.clone().setY(2.5);
  const dir = player.pos.clone().setY(1.4).sub(origin).normalize();
  const end = origin.clone().add(dir.clone().multiplyScalar(70));
  const toPlayer = player.pos.clone().setY(1.4).sub(origin), proj = toPlayer.dot(dir);
  if (proj > 0 && proj < 70) { const closest = origin.clone().add(dir.clone().multiplyScalar(proj)); if (closest.distanceTo(player.pos.clone().setY(1.4)) < 1.8) hurtPlayer(9); }
  spawnTracer(origin, end, 0x88ffff);
}
function updateTraffic(dt) {
  for (const v of vehicles) {
    if (v === player.inVehicle || v.kind !== 'car' || v.racer) continue;
    v.wanderYaw += rand(-0.02, 0.02); v.speed = lerp(v.speed, 14, dt * 1.5);
    const dir = V3(Math.sin(v.wanderYaw), 0, Math.cos(v.wanderYaw));
    const nx = v.pos.x + dir.x * v.speed * dt, nz = v.pos.z + dir.z * v.speed * dt;
    if (!isSolidW(nx, v.pos.z) && tileAtWorld(nx, v.pos.z) === 0) v.pos.x = nx; else v.wanderYaw += Math.PI / 2 + rand(-0.5, 0.5);
    if (!isSolidW(v.pos.x, nz) && tileAtWorld(v.pos.x, nz) === 0) v.pos.z = nz; else v.wanderYaw += Math.PI / 2 + rand(-0.5, 0.5);
    v.yaw = v.wanderYaw; v.obj.position.copy(v.pos); v.obj.rotation.y = v.yaw; spinWheels(v, v.speed * dt);
    if (v.pos.distanceTo(player.pos) > 260) removeEntity(v, vehicles);
  }
  const carCount = vehicles.filter(v => v.kind === 'car').length;
  if (carCount < 10) spawnTraffic(10 - carCount);
}
function updateProjectiles(dt) {
  for (const p of projectiles.slice()) {
    p.pos.addScaledVector(p.dir, p.speed * dt); p.obj.position.copy(p.pos); p.life -= dt;
    let boom = p.life <= 0 || isSolidW(p.pos.x, p.pos.z) || p.pos.y < 0.3;
    if (!boom) for (const arr of [peds, cops, animals]) for (const e of arr) if (!e.dead && e.pos.distanceTo(p.pos) < 2.5) boom = true;
    if (!boom) for (const v of vehicles) if (v !== player.inVehicle && v.pos.distanceTo(p.pos) < 3.5) boom = true;
    if (boom) { explode(p.pos.clone(), true); scene.remove(p.obj); projectiles.splice(projectiles.indexOf(p), 1); }
  }
}
function updatePickups(dt) {
  for (const p of pickups.slice()) {
    p.t += dt; p.obj.rotation.y += dt * 3; p.obj.position.y = 1.2 + Math.sin(p.t * 3) * 0.2;
    if (p.pos.distanceTo(player.pos) < 3.5) {
      if (p.type === 'cash') { player.money += p.val; floatWorld(player.pos, '+$' + p.val, '#7CFC7C'); }
      else if (p.type === 'health') player.hp = Math.min(player.maxHp, player.hp + p.val);
      else player.armor = Math.min(player.maxArmor, player.armor + p.val);
      updateHUD(); scene.remove(p.obj); pickups.splice(pickups.indexOf(p), 1); continue;
    }
    if (p.t > 25) { scene.remove(p.obj); pickups.splice(pickups.indexOf(p), 1); }
  }
}
function updateEffects(dt) {
  for (const t of tracers.slice()) { t.life -= dt; t.obj.material.opacity = clamp(t.life / 0.08, 0, 1); if (t.life <= 0) { scene.remove(t.obj); tracers.splice(tracers.indexOf(t), 1); } }
  for (const e of effects.slice()) {
    e.life -= dt;
    if (e.light) e.obj.intensity = clamp(e.life / 0.3, 0, 1) * 8;
    else if (e.grow) { const s = lerp(1, e.grow, 1 - clamp(e.life / 0.4, 0, 1)); e.obj.scale.setScalar(s); e.obj.material.opacity = clamp(e.life / 0.4, 0, 1); }
    else { e.vel.y += e.grav * dt; e.obj.position.addScaledVector(e.vel, dt); }
    if (e.life <= 0) { scene.remove(e.obj); effects.splice(effects.indexOf(e), 1); }
  }
  if (muzzleLight.intensity > 0) muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 30);
  if (player.hitFlash > 0) player.hitFlash -= dt;
  if (cheatTimer > 0) { cheatTimer -= dt; if (cheatTimer <= 0) cheatMsgEl.classList.remove('show'); }
}

// ---------------- camera ----------------
let camSnap = false;   // set on interior enter/exit to teleport the camera instantly
function updateCamera(dt) {
  if (player.inInterior) { updateInteriorCamera(dt); return; }
  const v = player.inVehicle;
  const target = player.pos.clone();
  target.y += v ? (v.cls === 'air' ? 4 : 2.5) : 3;
  const dist = v ? (v.cls === 'air' ? 26 : v.cls === 'water' ? 22 : 15) : 10;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const desired = V3(target.x - Math.sin(yaw) * cp * dist, target.y + sp * dist + 2, target.z - Math.cos(yaw) * cp * dist);
  camera.position.lerp(desired, camSnap ? 1 : 1 - Math.pow(0.0015, dt));
  camera.lookAt(target); camSnap = false;
  sun.position.set(player.pos.x + 70, 130, player.pos.z + 50); sun.target.position.copy(player.pos);
}
// tight interior camera clamped inside the current room (never through walls/ceiling)
function updateInteriorCamera(dt) {
  const f = player.inInterior.floors[player.inInterior.currentFloor];
  const target = player.pos.clone(); target.y += 2.2;
  const dist = 5, cp = Math.cos(pitch), sp = Math.sin(pitch);
  const desired = V3(target.x - Math.sin(yaw) * cp * dist, target.y + sp * dist * 0.4 + 0.6, target.z - Math.cos(yaw) * cp * dist);
  desired.x = clamp(desired.x, f.cx - f.W / 2 + 0.6, f.cx + f.W / 2 - 0.6);
  desired.z = clamp(desired.z, f.cz - f.D / 2 + 0.6, f.cz + f.D / 2 - 0.6);
  desired.y = clamp(desired.y, f.y + 1.6, f.y + f.H - 0.6);
  camera.position.lerp(desired, camSnap ? 1 : 1 - Math.pow(0.0015, dt));
  camera.lookAt(target); camSnap = false;
  sun.position.set(player.pos.x + 70, 130, player.pos.z + 50); sun.target.position.copy(player.pos);
}

// ---------------- HUD ----------------
const hpEl = document.getElementById('hp'), arEl = document.getElementById('armor');
const moneyEl = document.getElementById('money'), wantedEl = document.getElementById('wanted');
const weaponEl = document.getElementById('weapon'), ammoEl = document.getElementById('ammo');
const pnameEl = document.getElementById('pname');
function updateHUD() {
  pnameEl.textContent = PLAYER_NAME;
  hpEl.style.width = clamp(player.hp / player.maxHp * 100, 0, 100) + '%';
  arEl.style.width = clamp(player.armor / player.maxArmor * 100, 0, 100) + '%';
  moneyEl.textContent = '$' + Math.floor(player.money).toLocaleString();
  let stars = ''; for (let i = 0; i < 5; i++) stars += `<span class="star ${i < player.wanted ? '' : 'off'}">★</span>`;
  wantedEl.innerHTML = stars;
  const inV = player.inVehicle;
  weaponEl.textContent = inV ? inV.name.toUpperCase() : WEAPONS[player.weapon].name;
  const a = player.ammo[player.weapon]; ammoEl.textContent = inV ? '❤ ' + Math.max(0, Math.floor(inV.hp)) : (a === Infinity ? '∞' : a);
}

// ---------------- minimap ----------------
const mm = document.getElementById('minimap'), mmx = mm.getContext('2d');
mm.width = 190; mm.height = 190;
function drawMinimap() {
  if (player.inInterior) { drawInteriorMinimap(); return; }
  const S = 190, view = 320, scale = S / view;
  mmx.save();
  mmx.beginPath(); mmx.arc(S / 2, S / 2, S / 2, 0, TAU); mmx.clip();
  mmx.fillStyle = night ? '#0a2038' : '#1d70b8'; mmx.fillRect(0, 0, S, S); // ocean base
  mmx.translate(S / 2, S / 2);
  const ox = player.pos.x, oz = player.pos.z;
  // coarse terrain (land vs sea) outside the city grid, so hills read as land
  if (ox < -HALF_W - 20 || ox > HALF_W + 20 || oz < -HALF_H - 20 || oz > HALF_H + 20 || Math.max(Math.abs(ox), Math.abs(oz)) > HALF_W - view / 2) {
    const stp = 16;
    for (let sx = -view / 2; sx < view / 2; sx += stp) for (let sz = -view / 2; sz < view / 2; sz += stp) {
      const wx = ox + sx, wz = oz + sz;
      if (inIsland(wx, wz)) continue;
      const ty = terrainY(wx, wz);
      if (ty <= WATER_Y + 0.3) continue;
      mmx.fillStyle = ty > 55 ? '#6d6d72' : ty > 20 ? '#7a6a4a' : '#3f7a3f';
      mmx.fillRect(sx * scale, sz * scale, stp * scale + 1, stp * scale + 1);
    }
  }
  const range = Math.ceil(view / TILE / 2) + 1;
  const ptx = Math.floor((ox + HALF_W) / TILE), pty = Math.floor((oz + HALF_H) / TILE);
  for (let ty = pty - range; ty <= pty + range; ty++) for (let tx = ptx - range; tx <= ptx + range; tx++) {
    if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) continue;
    const t = map[ty][tx]; const c = tileCenter(tx, ty);
    mmx.fillStyle = t === 0 ? '#3a3a40' : t === 1 ? '#20232a' : t === 2 ? '#2e7d34' : t === 4 ? '#d9c98a' : '#7a808a';
    mmx.fillRect((c.x - TILE / 2 - ox) * scale, (c.z - TILE / 2 - oz) * scale, TILE * scale + 1, TILE * scale + 1);
  }
  mmx.fillStyle = '#c8c8c8'; for (const v of vehicles) mmx.fillRect((v.pos.x - ox) * scale - 1.5, (v.pos.z - oz) * scale - 1.5, 3, 3);
  mmx.fillStyle = '#ff4a4a'; for (const p of peds) if (!p.corpse) mmx.fillRect((p.pos.x - ox) * scale - 1, (p.pos.z - oz) * scale - 1, 2, 2);
  mmx.fillStyle = '#c9a24a'; for (const a of animals) mmx.fillRect((a.pos.x - ox) * scale - 1, (a.pos.z - oz) * scale - 1, 2, 2);
  mmx.fillStyle = '#4aa3ff'; for (const c of cops) if (!c.corpse) mmx.fillRect((c.pos.x - ox) * scale - 2, (c.pos.z - oz) * scale - 2, 4, 4);
  // mission giver blips + active objective waypoint
  for (const g of missionGivers) { if (!g.beacon.g.visible) continue; mmx.fillStyle = hex6(MTYPE[g.type].color); mmx.beginPath(); mmx.arc((g.pos.x - ox) * scale, (g.pos.z - oz) * scale, 3.5, 0, TAU); mmx.fill(); }
  if (activeMission && activeMission.targetPos) { const tp = activeMission.targetPos; mmx.fillStyle = hex6(MTYPE[activeMission.type].color); mmx.beginPath(); mmx.arc((tp.x - ox) * scale, (tp.z - oz) * scale, 4.5, 0, TAU); mmx.fill(); mmx.strokeStyle = '#fff'; mmx.lineWidth = 1.5; mmx.stroke(); }
  mmx.fillStyle = '#ffcc00'; mmx.beginPath(); mmx.arc(0, 0, 4, 0, TAU); mmx.fill();
  const fy = player.inVehicle ? player.inVehicle.yaw : yaw;
  mmx.strokeStyle = '#ffcc00'; mmx.lineWidth = 2; mmx.beginPath(); mmx.moveTo(0, 0); mmx.lineTo(Math.sin(fy) * 10, Math.cos(fy) * 10); mmx.stroke();
  mmx.restore();
}

// ---------------- center / float text ----------------
const centerEl = document.getElementById('center-msg');
function centerMsg(t, bad) { centerEl.textContent = t; centerEl.classList.add('show'); centerEl.classList.toggle('bad', !!bad); }
function hideCenter() { centerEl.classList.remove('show'); }
const floatEls = [], _v = new THREE.Vector3();
function floatWorld(pos, txt, color) {
  const el = document.createElement('div'); el.textContent = txt;
  el.style.cssText = `position:absolute;color:${color};font:800 18px 'Segoe UI';text-shadow:0 2px 4px #000;pointer-events:none;z-index:6;transform:translate(-50%,-50%)`;
  document.getElementById('game-wrap').appendChild(el);
  floatEls.push({ el, pos: pos.clone().setY(4), life: 1.2 });
}
function updateFloatTexts() {
  for (const f of floatEls.slice()) {
    f.life -= clock.getDelta ? 0.016 : 0.016; f.pos.y += 0.03;
    _v.copy(f.pos).project(camera);
    if (_v.z > 1 || f.life <= 0) { f.el.remove(); floatEls.splice(floatEls.indexOf(f), 1); continue; }
    f.el.style.left = (_v.x * 0.5 + 0.5) * innerWidth + 'px'; f.el.style.top = (-_v.y * 0.5 + 0.5) * innerHeight + 'px';
    f.el.style.opacity = clamp(f.life, 0, 1);
  }
}
const flashDiv = document.createElement('div');
flashDiv.style.cssText = 'position:absolute;inset:0;background:red;opacity:0;pointer-events:none;z-index:4;mix-blend-mode:multiply';
document.getElementById('game-wrap').appendChild(flashDiv);

// ================================================================
//  MISSIONS  (Priority 1 — real gameplay loops)
//  A mission manager + taxi, delivery, hit and race jobs, started
//  from glowing beacons around the city with the E key.
// ================================================================
const RINGGEO = new THREE.TorusGeometry(3, 0.32, 8, 30);
const missionGivers = [];
let activeMission = null, nearGiver = null, centerTimer = 0;
player.stats = { missions: 0, kills: 0, distance: 0 };

const MTYPE = {
  taxi:     { color: 0xffd21e, icon: '🚕', title: 'Taxi' },
  delivery: { color: 0x28c76f, icon: '📦', title: 'Delivery' },
  hit:      { color: 0xff4a4a, icon: '🎯', title: 'Hit' },
  race:     { color: 0x2ea6ff, icon: '🏁', title: 'Race' },
};
const hex6 = c => '#' + c.toString(16).padStart(6, '0');

// mission HUD dom
const missionHud = document.getElementById('mission-hud');
const mIcon = document.getElementById('m-icon'), mTitle = document.getElementById('m-title');
const mObj = document.getElementById('m-obj'), mTimer = document.getElementById('m-timer');
const objMarker = document.getElementById('obj-marker'), objGlyph = document.getElementById('obj-glyph'), objDist = document.getElementById('obj-dist');
const interactPrompt = document.getElementById('interact-prompt');

// --- reusable beacon: soft light beam + pulsing ground ring ---
function makeBeacon(x, z, color, height = 55, radius = 3) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 22, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = height / 2;
  const ring = new THREE.Mesh(RINGGEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.6; ring.scale.setScalar(radius / 3);
  g.add(beam, ring); g.position.set(x, 0, z); scene.add(g);
  return { g, ring, beam, color, radius, t: 0 };
}
function animateBeacon(b, dt) {
  b.t += dt; b.ring.rotation.z += dt * 1.4;
  b.beam.material.opacity = 0.12 + Math.sin(b.t * 3) * 0.06;
  b.ring.scale.setScalar((b.radius / 3) * (1 + Math.sin(b.t * 3) * 0.08));
}
function removeBeacon(b) { if (b && b.g) scene.remove(b.g); }

// pick a random drivable tile (road/sidewalk) at least `minDist` from `ref`
function randomRoadSpot(minDist = 0, ref = player.pos) {
  for (let i = 0; i < 500; i++) {
    const tx = randi(2, COLS - 3), ty = randi(2, ROWS - 3), t = map[ty][tx];
    if (t === 0 || t === 3) {
      const c = tileCenter(tx, ty), p = V3(c.x, 0, c.z);
      if (p.distanceTo(ref) >= minDist) return p;
    }
  }
  return null;
}

// --- transient timed center banner (auto-hides, unlike centerMsg) ---
function bannerMsg(t, bad, dur = 1.8) { centerMsg(t, bad); centerTimer = dur; }

// --- placing the mission givers around the island ---
function placeMissionGivers() {
  for (const type of ['taxi', 'delivery', 'hit', 'race', 'taxi', 'delivery']) {
    const spot = randomRoadSpot(24);
    if (!spot) continue;
    const beacon = makeBeacon(spot.x, spot.z, MTYPE[type].color, 45, 2.6);
    missionGivers.push({ type, pos: spot, beacon });
  }
}
function nearestGiver(range) {
  let best = null, bd = range * range;
  for (const g of missionGivers) { const d = g.pos.distanceToSquared(player.pos); if (d < bd) { bd = d; best = g; } }
  return best;
}
function tryInteract() {
  if (dead || !started || paused) return;
  if (player.inInterior) { interiorInteract(); return; }
  if (player.inVehicle) return;                      // enter buildings on foot only
  const door = nearestDoor(6);
  if (door) { enterBuilding(door); return; }
  if (activeMission) { toast('Finish your current job first'); return; }
  const g = nearestGiver(9);
  if (g) startMission(g);
}
function startMission(giver) {
  const setup = { taxi: setupTaxi, delivery: setupDelivery, hit: setupHit, race: setupRace }[giver.type];
  activeMission = setup(giver);
  activeMission.type = giver.type;
  activeMission.giver = giver;
  giver.beacon.g.visible = false;            // hide the giver beacon while its job runs
  bannerMsg(MTYPE[giver.type].title.toUpperCase() + ' STARTED', false, 1.6);
  hidePrompt(); updateMissionHUD();
}

// ---------------- TAXI ----------------
function setupTaxi(giver) {
  const gp = giver.pos, passenger = makeHuman();
  passenger.position.set(gp.x, groundHeightAt(gp.x, gp.z), gp.z); scene.add(passenger);
  return {
    phase: 'pickup', passenger, passengerPos: gp.clone(), anim: 0,
    car: null, dest: null, destBeacon: null, timeLeft: 0, startTime: 1, fare: 0,
    objective: 'Get a car, then pull up to the passenger',
  };
}
function updateTaxi(m, dt) {
  if (m.phase === 'pickup') {
    m.anim += dt * 3; animateHuman(m.passenger, m.anim, false); m.passenger.rotation.y += dt * 0.5;
    m.targetPos = m.passengerPos.clone().setY(2);
    if (player.inVehicle && player.inVehicle.cls === 'ground' && player.pos.distanceTo(m.passengerPos) < 6.5) {
      m.car = player.inVehicle; m.passenger.visible = false;
      const dest = randomRoadSpot(70, m.passengerPos) || randomRoadSpot(40) || m.passengerPos.clone();
      m.dest = dest; m.destBeacon = makeBeacon(dest.x, dest.z, MTYPE.taxi.color, 55, 3);
      const dist = m.passengerPos.distanceTo(dest);
      m.fare = Math.round(120 + dist * 3);
      m.timeLeft = m.startTime = clamp(dist / 11 + 14, 22, 70);
      m.phase = 'drive'; m.objective = 'Drive the fare to the drop-off';
      bannerMsg('Passenger aboard — go!', false, 1.4);
    }
    return;
  }
  m.timeLeft -= dt; m.targetPos = m.dest.clone().setY(2);
  if (m.timeLeft <= 0) return failMission('Out of time — the fare bailed');
  if (!vehicles.includes(m.car)) return failMission('Your taxi was wrecked');
  if (player.inVehicle === m.car && player.pos.distanceTo(m.dest) < 7 && Math.abs(m.car.speed) < 14) {
    const tip = Math.round(m.fare * 0.5 * (m.timeLeft / m.startTime));
    completeMission(m.fare + tip, `Fare paid  +$${m.fare}` + (tip > 0 ? `  (tip $${tip})` : ''));
  }
}

// ---------------- DELIVERY ----------------
function setupDelivery(giver) {
  const gp = giver.pos, pkg = new THREE.Mesh(BOX, mat(0xb5651d));
  pkg.scale.set(2, 2, 2); pkg.position.set(gp.x, 1.4, gp.z); pkg.castShadow = true; scene.add(pkg);
  return {
    phase: 'pickup', pkg, pickupPos: gp.clone(), spin: 0,
    dest: null, destBeacon: null, timeLeft: 0, startTime: 1, reward: 0, lastHp: player.hp,
    objective: 'Grab the package',
  };
}
function updateDelivery(m, dt) {
  if (m.phase === 'pickup') {
    m.spin += dt; m.pkg.rotation.y += dt * 1.5; m.pkg.position.y = 1.4 + Math.sin(m.spin * 3) * 0.25;
    m.targetPos = m.pickupPos.clone().setY(2);
    if (player.pos.distanceTo(m.pickupPos) < 4.5) {
      m.pkg.visible = false;
      const dest = randomRoadSpot(80, m.pickupPos) || randomRoadSpot(40) || m.pickupPos.clone();
      m.dest = dest; m.destBeacon = makeBeacon(dest.x, dest.z, MTYPE.delivery.color, 55, 3);
      const dist = m.pickupPos.distanceTo(dest);
      m.timeLeft = m.startTime = clamp(dist / 12 + 12, 20, 60);
      m.reward = Math.round(300 + dist * 4); m.lastHp = player.hp;
      m.phase = 'deliver'; m.objective = "Deliver it — don't get wrecked!";
      bannerMsg('Package secured!', false, 1.4);
    }
    return;
  }
  m.timeLeft -= dt; m.targetPos = m.dest.clone().setY(2);
  if (player.hp < m.lastHp) m.reward = Math.max(120, m.reward - Math.round((m.lastHp - player.hp) * 12));
  m.lastHp = player.hp;
  if (m.timeLeft <= 0) return failMission('Delivery too late');
  if (player.pos.distanceTo(m.dest) < 6) completeMission(m.reward, `Delivered  +$${m.reward}`);
}

// ---------------- HIT ----------------
function makeTargetPed(x, z) {
  const p = makePed(x, z); p.isTarget = true; p.hp = 70; p.speed = rand(4.5, 6.5);
  const mk = new THREE.Mesh(CONE, new THREE.MeshBasicMaterial({ color: MTYPE.hit.color }));
  mk.scale.set(1.6, 2, 1.6); mk.rotation.x = Math.PI; mk.position.y = 12;
  p.obj.add(mk); p.marker = mk; return p;
}
function setupHit(giver) {
  const loc = randomRoadSpot(45, giver.pos) || giver.pos.clone(), n = randi(1, 3), targets = [];
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), r = rand(2, 7);
    let x = clamp(loc.x + Math.cos(a) * r, -HALF_W + 3, HALF_W - 3), z = clamp(loc.z + Math.sin(a) * r, -HALF_H + 3, HALF_H - 3);
    if (isSolidW(x, z)) { x = loc.x; z = loc.z; }
    targets.push(makeTargetPed(x, z));
  }
  return {
    phase: 'hunt', targets, loc: loc.clone(), areaBeacon: makeBeacon(loc.x, loc.z, MTYPE.hit.color, 60, 4),
    timeLeft: 100, startTime: 100, reward: 250 * n,
    objective: `Eliminate the target${n > 1 ? 's' : ''} (${n} left)`,
  };
}
function updateHit(m, dt) {
  m.timeLeft -= dt;
  const alive = m.targets.filter(t => !t.dead);
  if (alive.length) {
    let near = alive[0], nd = Infinity;
    for (const t of alive) { const d = t.pos.distanceToSquared(player.pos); if (d < nd) { nd = d; near = t; } t.marker.rotation.y += dt * 3; }
    m.targetPos = near.pos.clone().setY(4);
  }
  m.objective = `Eliminate the target${m.targets.length > 1 ? 's' : ''} (${alive.length} left)`;
  if (alive.length === 0) return completeMission(m.reward, `Contract complete  +$${m.reward}`);
  if (m.timeLeft <= 0) failMission('The targets got away');
}

// ---------------- RACE ----------------
function setupRace(giver) {
  const n = randi(4, 6), cps = []; let ref = giver.pos.clone();
  for (let i = 0; i < n; i++) { const s = randomRoadSpot(45, ref) || randomRoadSpot(30) || giver.pos.clone(); cps.push(s); ref = s; }
  const racer = makeVehicle('car', giver.pos.x, giver.pos.z); racer.racer = true; racer.cpIndex = 0; racer.speed = 0;
  const t = 20 + n * 12;
  return {
    phase: 'race', cps, cpIndex: 0, beacon: makeBeacon(cps[0].x, cps[0].z, MTYPE.race.color, 60, 4),
    racer, racerDone: false, timeLeft: t, startTime: t, reward: 200 + n * 120,
    objective: `Checkpoint 1 / ${n}`,
  };
}
function updateRace(m, dt) {
  m.timeLeft -= dt;
  const cp = m.cps[m.cpIndex]; m.targetPos = cp.clone().setY(3);
  const r = m.racer;   // simple AI opponent: steer toward its next checkpoint
  if (r && vehicles.includes(r) && player.inVehicle !== r && !m.racerDone) {
    const tcp = m.cps[r.cpIndex], to = V3(tcp.x - r.pos.x, 0, tcp.z - r.pos.z), dd = to.length();
    let dy = Math.atan2(to.x, to.z) - r.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
    r.yaw += clamp(dy, -2.2 * dt, 2.2 * dt); r.speed = lerp(r.speed, 30, dt * 1.2);
    const dir = V3(Math.sin(r.yaw), 0, Math.cos(r.yaw));
    r.pos.x = clamp(r.pos.x + dir.x * r.speed * dt, -HALF_W, HALF_W);
    r.pos.z = clamp(r.pos.z + dir.z * r.speed * dt, -HALF_H, HALF_H);
    r.pos.y = lerp(r.pos.y, groundHeightAt(r.pos.x, r.pos.z) - 0.35, dt * 8);
    r.obj.position.copy(r.pos); r.obj.rotation.y = r.yaw; spinWheels(r, r.speed * dt);
    if (dd < 9 && ++r.cpIndex >= m.cps.length) m.racerDone = true;
  }
  if (player.pos.distanceTo(cp) < 9) {
    if (++m.cpIndex >= m.cps.length) {
      const bonus = m.racerDone ? 0 : Math.round(m.reward * 0.5);
      return completeMission(m.reward + bonus, m.racerDone ? `Race finished  +$${m.reward}` : `1st place!  +$${m.reward + bonus}`);
    }
    removeBeacon(m.beacon);
    m.beacon = makeBeacon(m.cps[m.cpIndex].x, m.cps[m.cpIndex].z, MTYPE.race.color, 60, 4);
    m.objective = `Checkpoint ${m.cpIndex + 1} / ${m.cps.length}`;
    bannerMsg(`Checkpoint ${m.cpIndex}!`, false, 0.8);
  }
  if (m.timeLeft <= 0) failMission('Too slow — race over');
}

// ---------------- complete / fail / teardown ----------------
function completeMission(reward, msg) {
  player.money += reward; player.stats.missions++;
  floatWorld(player.pos, '+$' + reward, '#7CFC7C');
  bannerMsg(msg || 'MISSION COMPLETE', false, 2.4);
  cleanupMission(); updateHUD(); saveGame();
}
function failMission(reason) { bannerMsg(reason || 'MISSION FAILED', true, 2.2); cleanupMission(); }
function cleanupMission() {
  const m = activeMission; if (!m) return;
  if (m.giver && m.giver.beacon) m.giver.beacon.g.visible = true;
  if (m.passenger) scene.remove(m.passenger);
  if (m.pkg) scene.remove(m.pkg);
  if (m.destBeacon) removeBeacon(m.destBeacon);
  if (m.areaBeacon) removeBeacon(m.areaBeacon);
  if (m.beacon) removeBeacon(m.beacon);
  if (m.targets) for (const t of m.targets) if (!t.dead) removeEntity(t, peds);
  if (m.racer) { if (player.inVehicle === m.racer) exitVehicle(); if (vehicles.includes(m.racer)) removeEntity(m.racer, vehicles); }
  activeMission = null; hideMissionHUD(); updateObjMarker(null);
}

// ---------------- mission update pump ----------------
function updateMissions(dt) {
  for (const g of missionGivers) if (g.beacon.g.visible) animateBeacon(g.beacon, dt);
  if (centerTimer > 0) { centerTimer -= dt; if (centerTimer <= 0) hideCenter(); }
  if (activeMission) {
    const m = activeMission;
    if (m.destBeacon) animateBeacon(m.destBeacon, dt);
    if (m.areaBeacon) animateBeacon(m.areaBeacon, dt);
    if (m.beacon) animateBeacon(m.beacon, dt);
    if (dead) failMission('You got wasted');
    else ({ taxi: updateTaxi, delivery: updateDelivery, hit: updateHit, race: updateRace }[m.type])(m, dt);
    if (activeMission) { updateMissionHUD(); updateObjMarker(activeMission.targetPos); }
    else updateObjMarker(null);
  } else {
    updateObjMarker(null);
  }
}

// ---------------- mission HUD ----------------
function updateMissionHUD() {
  const m = activeMission; if (!m) return;
  missionHud.classList.remove('hidden');
  mIcon.textContent = MTYPE[m.type].icon; mTitle.textContent = MTYPE[m.type].title;
  mObj.textContent = m.objective || '';
  if (typeof m.timeLeft === 'number' && m.timeLeft > 0 && m.phase !== 'pickup') {
    const s = Math.max(0, Math.ceil(m.timeLeft));
    mTimer.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    mTimer.classList.toggle('warn', s <= 10); mTimer.style.display = '';
  } else mTimer.style.display = 'none';
}
function hideMissionHUD() { missionHud.classList.add('hidden'); }
function showPrompt(html) { interactPrompt.innerHTML = html; interactPrompt.classList.remove('hidden'); }
function hidePrompt() { interactPrompt.classList.add('hidden'); }

const _op = new THREE.Vector3();
function updateObjMarker(worldPos) {
  if (!worldPos || !started) { objMarker.classList.add('hidden'); return; }
  _op.copy(worldPos).project(camera);
  const behind = _op.z > 1, margin = 60;
  let sx = (_op.x * 0.5 + 0.5) * innerWidth, sy = (-_op.y * 0.5 + 0.5) * innerHeight;
  let clamped = behind;
  if (behind) { sx = clamp(innerWidth - sx, margin, innerWidth - margin); sy = innerHeight - margin; }
  else if (sx < margin || sx > innerWidth - margin || sy < margin || sy > innerHeight - margin) {
    sx = clamp(sx, margin, innerWidth - margin); sy = clamp(sy, margin, innerHeight - margin); clamped = true;
  }
  objMarker.classList.remove('hidden');
  objMarker.style.left = sx + 'px'; objMarker.style.top = sy + 'px';
  objGlyph.textContent = clamped ? '➤' : '◈';
  if (activeMission) objGlyph.style.color = hex6(MTYPE[activeMission.type].color);
  objDist.textContent = Math.round(player.pos.distanceTo(worldPos)) + 'm';
}

// ================================================================
//  BUILDING INTERIORS  (Part A — enterable buildings)
//  Interiors live in a far "pocket" region of the same scene; entering
//  teleports the player there and switches to an interior physics/render
//  path. Multi-floor rooms are stacked in Y and linked by stairs/elevator.
// ================================================================
player.inInterior = null;
const INT_ORIGIN = V3(0, 0, 6000);      // far from the island & beyond the camera far-plane
let interiorSlotN = 0;
function nextInteriorOrigin() { const o = INT_ORIGIN.clone(); o.x += interiorSlotN * 220; o.z += (interiorSlotN % 2) * 140; interiorSlotN++; return o; }

// generic enclosed room; returns a floor descriptor (bounds, colliders, spawn, light)
function addRoom(interior, floorIndex, W, D, H, wallColor) {
  const o = interior.origin, fy = o.y + floorIndex * (H + 2), cx = o.x, cz = o.z, g = interior.group;
  const wallMat = matStd(wallColor, { roughness: 0.96 }), floorMat = matStd(0x6a6a6a, { roughness: 0.9 }), ceilMat = matStd(0x24242a, { roughness: 1 });
  const fl = new THREE.Mesh(BOX, floorMat); fl.scale.set(W, 0.4, D); fl.position.set(cx, fy - 0.2, cz); fl.receiveShadow = true; g.add(fl);
  const cl = new THREE.Mesh(BOX, ceilMat); cl.scale.set(W, 0.4, D); cl.position.set(cx, fy + H, cz); g.add(cl);
  const t = 0.4, mkWall = (sx, sy, sz, px, py, pz) => { const m = new THREE.Mesh(BOX, wallMat); m.scale.set(sx, sy, sz); m.position.set(px, py, pz); m.receiveShadow = true; g.add(m); };
  mkWall(W, H, t, cx, fy + H / 2, cz - D / 2); mkWall(W, H, t, cx, fy + H / 2, cz + D / 2);
  mkWall(t, H, D, cx - W / 2, fy + H / 2, cz); mkWall(t, H, D, cx + W / 2, fy + H / 2, cz);
  const light = new THREE.PointLight(0xfff2d6, 0, 70, 2); light.position.set(cx, fy + H - 1, cz); light.visible = false; g.add(light);
  const floor = { index: floorIndex, y: fy, cx, cz, W, D, H, light,
    bounds: { minx: cx - W / 2 + 0.6, maxx: cx + W / 2 - 0.6, minz: cz - D / 2 + 0.6, maxz: cz + D / 2 - 0.6 },
    colliders: [], links: [], exit: null,
    spawn: V3(cx, fy, cz + D / 2 - 5) };
  interior.floors.push(floor); return floor;
}
function addSolid(interior, floor, mesh, w, d) { interior.group.add(mesh); floor.colliders.push({ minx: mesh.position.x - w / 2, maxx: mesh.position.x + w / 2, minz: mesh.position.z - d / 2, maxz: mesh.position.z + d / 2 }); }
function addDoorDeco(interior, floor, signColor) {
  const g = interior.group, cx = floor.cx, cz = floor.cz + floor.D / 2, fy = floor.y;
  const dw = new THREE.Mesh(BOX, matStd(0x161616, { roughness: 1 })); dw.scale.set(3, 4, 0.5); dw.position.set(cx, fy + 2, cz - 0.06); g.add(dw);
  const sign = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: signColor, emissive: signColor, emissiveIntensity: 0.8, roughness: 0.5 }));
  sign.scale.set(4.4, 0.9, 0.3); sign.position.set(cx, fy + 4.6, cz - 0.15); g.add(sign);
}
function addExitPad(interior, floor) {
  floor.exit = { pos: V3(floor.cx, floor.y, floor.cz + floor.D / 2 - 2) };
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.1, 22), new THREE.MeshStandardMaterial({ color: 0x27ff8a, emissive: 0x27ff8a, emissiveIntensity: 0.7, transparent: true, opacity: 0.7 }));
  pad.position.copy(floor.exit.pos).setY(floor.y + 0.08); interior.group.add(pad);
}
function addFloorLink(interior, floor, targetFloor, label, pos) {
  const panel = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: 0x1e2a44, emissive: 0x2a6cff, emissiveIntensity: 0.55, roughness: 0.5 }));
  panel.scale.set(1.2, 2, 0.3); panel.position.copy(pos).setY(floor.y + 1.2); interior.group.add(panel);
  floor.links.push({ pos: pos.clone().setY(floor.y + 1), targetFloor, label });
}

function buildStore(it) {
  const f = addRoom(it, 0, 22, 16, 6, 0xd9cbb2); addDoorDeco(it, f, INTERIOR_SIGN.store); addExitPad(it, f);
  const shelfMat = matStd(0x8a8f98, { roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const sx = f.cx - 6 + i * 6;
    const sh = new THREE.Mesh(BOX, shelfMat); sh.scale.set(1.4, 3, 9); sh.position.set(sx, f.y + 1.5, f.cz - 1); sh.castShadow = true; addSolid(it, f, sh, 1.4, 9);
    for (let k = 0; k < 6; k++) { const box = new THREE.Mesh(BOX, matStd(pick(BUILDING_COLORS))); box.scale.set(1, 0.8, 0.8); box.position.set(sx, f.y + 0.6 + (k % 3) * 1.05, f.cz - 4 + k * 1.5); it.group.add(box); }
  }
  const counter = new THREE.Mesh(BOX, matStd(0x5a4632)); counter.scale.set(7, 2, 1.4); counter.position.set(f.cx + 6, f.y + 1, f.cz - 6); counter.castShadow = true; addSolid(it, f, counter, 7, 1.4);
  const reg = new THREE.Mesh(BOX, matStd(0x222222)); reg.scale.set(1.2, 1, 1.2); reg.position.set(f.cx + 7, f.y + 2.2, f.cz - 6); it.group.add(reg);
  it.register = { pos: reg.position.clone(), robbed: false, floor: 0 };
  const keeper = makeHuman({ shirt: 0x2ecc71 }); keeper.position.set(f.cx + 6, f.y, f.cz - 7.2); it.group.add(keeper);
  it.npcs.push({ obj: keeper, phase: 0, floor: 0, role: 'keeper', panic: 0 });
}
function buildHome(it) {
  const f0 = addRoom(it, 0, 18, 14, 6, 0xc9b79c); addDoorDeco(it, f0, INTERIOR_SIGN.home); addExitPad(it, f0);
  const sofa = new THREE.Mesh(BOX, matStd(0x34557a)); sofa.scale.set(5, 1.6, 2); sofa.position.set(f0.cx - 4, f0.y + 0.8, f0.cz - 4); sofa.castShadow = true; addSolid(it, f0, sofa, 5, 2);
  const tv = new THREE.Mesh(BOX, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x224488, emissiveIntensity: 0.5 })); tv.scale.set(4, 2.4, 0.4); tv.position.set(f0.cx - 4, f0.y + 1.8, f0.cz - 6.6); it.group.add(tv);
  const table = new THREE.Mesh(BOX, matStd(0x6b4a2a)); table.scale.set(3, 1.4, 2); table.position.set(f0.cx + 3, f0.y + 0.7, f0.cz - 2); addSolid(it, f0, table, 3, 2);
  const stair = new THREE.Mesh(BOX, matStd(0x7a6a55)); stair.scale.set(2.6, 0.4, 5); stair.rotation.x = -0.5; stair.position.set(f0.cx + 7, f0.y + 2, f0.cz + 2); it.group.add(stair);
  const f1 = addRoom(it, 1, 18, 14, 6, 0xbfc4cc);
  const bed = new THREE.Mesh(BOX, matStd(0x8e3b46)); bed.scale.set(4, 1.2, 6); bed.position.set(f1.cx - 4, f1.y + 0.6, f1.cz - 3); bed.castShadow = true; addSolid(it, f1, bed, 4, 6);
  addFloorLink(it, f0, 1, 'Go upstairs', V3(f0.cx + 7, f0.y, f0.cz + 3.5));
  addFloorLink(it, f1, 0, 'Go downstairs', V3(f1.cx + 7, f1.y, f1.cz + 3.5));
  const res = makeHuman(); res.position.set(f1.cx + 3, f1.y, f1.cz - 4); it.group.add(res); it.npcs.push({ obj: res, phase: 0, floor: 1, role: 'idle', panic: 0 });
}
function buildOffice(it) {
  const f0 = addRoom(it, 0, 24, 18, 7, 0xcfd6de); addDoorDeco(it, f0, INTERIOR_SIGN.office); addExitPad(it, f0);
  const desk = new THREE.Mesh(BOX, matStd(0x2b3a55)); desk.scale.set(8, 2, 2.4); desk.position.set(f0.cx, f0.y + 1, f0.cz - 5); desk.castShadow = true; addSolid(it, f0, desk, 8, 2.4);
  for (let i = 0; i < 3; i++) { const ch = new THREE.Mesh(BOX, matStd(0x444444)); ch.scale.set(1.6, 1.4, 1.6); ch.position.set(f0.cx - 7 + i * 2.4, f0.y + 0.7, f0.cz + 4); addSolid(it, f0, ch, 1.6, 1.6); }
  const elev = new THREE.Mesh(BOX, matStd(0x9aa4b0, { metalness: 0.5, roughness: 0.35 })); elev.scale.set(4, 7, 3); elev.position.set(f0.cx + 9, f0.y + 3.5, f0.cz - 6); addSolid(it, f0, elev, 4, 3); it.group.add(elev);
  const f1 = addRoom(it, 1, 24, 18, 7, 0xd8dde3);
  const elev2 = new THREE.Mesh(BOX, matStd(0x9aa4b0, { metalness: 0.5, roughness: 0.35 })); elev2.scale.set(4, 7, 3); elev2.position.set(f1.cx + 9, f1.y + 3.5, f1.cz - 6); addSolid(it, f1, elev2, 4, 3); it.group.add(elev2);
  const desk2 = new THREE.Mesh(BOX, matStd(0x2b3a55)); desk2.scale.set(6, 1.4, 2); desk2.position.set(f1.cx - 4, f1.y + 0.7, f1.cz - 4); addSolid(it, f1, desk2, 6, 2);
  addFloorLink(it, f0, 1, 'Elevator ▲ Floor 2', V3(f0.cx + 9, f0.y, f0.cz - 3.5));
  addFloorLink(it, f1, 0, 'Elevator ▼ Lobby', V3(f1.cx + 9, f1.y, f1.cz - 3.5));
  const a = makeHuman(); a.position.set(f0.cx - 4, f0.y, f0.cz + 2); it.group.add(a); it.npcs.push({ obj: a, phase: 0, floor: 0, role: 'idle', panic: 0 });
  const b = makeHuman({ shirt: 0x9b59b6 }); b.position.set(f1.cx + 2, f1.y, f1.cz + 3); it.group.add(b); it.npcs.push({ obj: b, phase: 1, floor: 1, role: 'idle', panic: 0 });
}
function buildInterior(type, door) {
  const it = { type, group: new THREE.Group(), origin: nextInteriorOrigin(), floors: [], currentFloor: 0, npcs: [], register: null };
  scene.add(it.group);
  ({ store: buildStore, home: buildHome, office: buildOffice }[type])(it);
  return it;
}

function setInteriorFloor(it, idx) {
  it.currentFloor = idx;
  for (const f of it.floors) f.light.visible = false;
  const f = it.floors[idx]; f.light.visible = true; f.light.intensity = 1.3;
  for (const n of it.npcs) n.obj.visible = (n.floor === idx);
}
function enterBuilding(door) {
  if (!door.interior) door.interior = buildInterior(door.type, door);
  const it = door.interior;
  player.exteriorReturn = { pos: door.returnPos.clone(), yaw: door.returnYaw };
  player.inInterior = it;
  setInteriorFloor(it, 0);
  const sp = it.floors[0].spawn;
  player.pos.copy(sp); player.vy = 0; player.onGround = true; yaw = Math.PI;   // face into the room
  player.obj.visible = true; player.obj.position.copy(player.pos); camSnap = true;
  toast('Entered ' + INTERIOR_LABEL[it.type]); hidePrompt(); updateHUD();
}
function exitBuilding() {
  const it = player.inInterior; if (!it) return;
  for (const f of it.floors) f.light.visible = false;
  const r = player.exteriorReturn;
  player.inInterior = null;
  player.pos.set(r.pos.x, groundHeightAt(r.pos.x, r.pos.z), r.pos.z); player.vy = 0; player.onGround = true; yaw = r.yaw;
  player.obj.position.copy(player.pos); camSnap = true; toast('Back outside'); hidePrompt();
}
function changeFloor(it, idx) {
  setInteriorFloor(it, idx);
  const f = it.floors[idx];
  player.pos.set(f.cx + 7, f.y, f.cz - 3); player.vy = 0; player.onGround = true; player.obj.position.copy(player.pos); camSnap = true;
}
function robRegister(it) {
  const r = it.register;
  if (r.robbed) { toast('Register already emptied'); return; }
  r.robbed = true; const cash = randi(200, 650); player.money += cash;
  floatWorld(player.pos, '+$' + cash, '#7CFC7C'); addHeat(25); setWanted(Math.max(player.wanted, 1));
  for (const n of it.npcs) if (n.role === 'keeper') n.panic = 8;
  toast('Register robbed! +$' + cash); updateHUD();
}
function interiorInteract() {
  const it = player.inInterior, f = it.floors[it.currentFloor];
  if (f.exit && player.pos.distanceTo(f.exit.pos) < 2.8) return exitBuilding();
  for (const l of f.links) if (player.pos.distanceTo(l.pos) < 2.8) { changeFloor(it, l.targetFloor); toast(l.label); return; }
  if (it.register && it.currentFloor === it.register.floor && player.pos.distanceTo(it.register.pos) < 3.2) return robRegister(it);
  toast('Nothing to use here');
}
function nearestDoor(range) { let best = null, bd = range * range; for (const d of doors) { const dd = d.pos.distanceToSquared(player.pos); if (dd < bd) { bd = dd; best = d; } } return best; }

function interiorBlocked(f, x, z) { const r = 0.6; for (const c of f.colliders) if (x > c.minx - r && x < c.maxx + r && z > c.minz - r && z < c.maxz + r) return true; return false; }
function updatePlayerInterior(dt) {
  if (dead) return;
  const it = player.inInterior, f = it.floors[it.currentFloor];
  player.obj.rotation.y = yaw;
  const fwd = V3(Math.sin(yaw), 0, Math.cos(yaw)), rgt = V3(Math.cos(yaw), 0, -Math.sin(yaw)), move = V3();
  if (keys['w'] || keys['arrowup']) move.add(fwd);
  if (keys['s'] || keys['arrowdown']) move.sub(fwd);
  if (keys['a'] || keys['arrowleft']) move.add(rgt);
  if (keys['d'] || keys['arrowright']) move.sub(rgt);
  const moving = move.lengthSq() > 0, sprinting = keys['Shift'] && moving;
  if (moving) {
    move.normalize().multiplyScalar(10 * (sprinting ? 1.6 : 1) * dt);
    const nx = player.pos.x + move.x, nz = player.pos.z + move.z;
    if (!interiorBlocked(f, nx, player.pos.z)) player.pos.x = nx;
    if (!interiorBlocked(f, player.pos.x, nz)) player.pos.z = nz;
    player.pos.x = clamp(player.pos.x, f.bounds.minx, f.bounds.maxx);
    player.pos.z = clamp(player.pos.z, f.bounds.minz, f.bounds.maxz);
    player.phase += dt * (sprinting ? 18 : 12);
  }
  const jumpNow = keys[' '] && !player._spacePrev; player._spacePrev = keys[' '];
  if (jumpNow && player.onGround) { player.vy = 13; player.onGround = false; }
  player.vy += GRAVITY * dt; player.pos.y += player.vy * dt;
  if (player.pos.y <= f.y) { player.pos.y = f.y; player.vy = 0; player.onGround = true; } else player.onGround = false;
  player.obj.position.set(player.pos.x, player.pos.y, player.pos.z);
  animateHuman(player.obj, player.phase, moving);
  const w = WEAPONS[player.weapon];
  if (firing && (w.auto || w.melee || player.cooldown <= 0)) fireWeapon();
  if (player.cooldown > 0) player.cooldown -= dt;
  if (f.exit && player.onGround && player.pos.distanceTo(f.exit.pos) < 1.5) exitBuilding();   // step on pad to leave
}
function updateInteriorNPCs(dt) {
  const it = player.inInterior; if (!it) return;
  for (const n of it.npcs) {
    n.phase += dt * (n.panic > 0 ? 12 : 3);
    if (n.panic > 0) { n.panic -= dt; n.obj.rotation.y += dt * 6; animateHuman(n.obj, n.phase, true); }
    else { n.obj.rotation.y = Math.sin(n.phase * 0.3) * 0.5; animateHuman(n.obj, n.phase, false); }
  }
}
function drawInteriorMinimap() {
  const S = 190, sc = 6; mmx.save();
  mmx.beginPath(); mmx.arc(S / 2, S / 2, S / 2, 0, TAU); mmx.clip();
  mmx.fillStyle = '#15171c'; mmx.fillRect(0, 0, S, S); mmx.translate(S / 2, S / 2);
  const it = player.inInterior, f = it.floors[it.currentFloor], ox = player.pos.x, oz = player.pos.z;
  mmx.fillStyle = '#20242c'; mmx.fillRect((f.cx - f.W / 2 - ox) * sc, (f.cz - f.D / 2 - oz) * sc, f.W * sc, f.D * sc);
  mmx.strokeStyle = '#3a4150'; mmx.lineWidth = 2; mmx.strokeRect((f.cx - f.W / 2 - ox) * sc, (f.cz - f.D / 2 - oz) * sc, f.W * sc, f.D * sc);
  if (f.exit) { mmx.fillStyle = '#27ff8a'; mmx.beginPath(); mmx.arc((f.exit.pos.x - ox) * sc, (f.exit.pos.z - oz) * sc, 3, 0, TAU); mmx.fill(); }
  for (const l of f.links) { mmx.fillStyle = '#3a8cff'; mmx.beginPath(); mmx.arc((l.pos.x - ox) * sc, (l.pos.z - oz) * sc, 3, 0, TAU); mmx.fill(); }
  if (it.register && it.currentFloor === it.register.floor) { mmx.fillStyle = it.register.robbed ? '#888' : '#ffd21e'; mmx.beginPath(); mmx.arc((it.register.pos.x - ox) * sc, (it.register.pos.z - oz) * sc, 3, 0, TAU); mmx.fill(); }
  mmx.fillStyle = '#ffcc00'; mmx.beginPath(); mmx.arc(0, 0, 4, 0, TAU); mmx.fill();
  mmx.strokeStyle = '#ffcc00'; mmx.lineWidth = 2; mmx.beginPath(); mmx.moveTo(0, 0); mmx.lineTo(Math.sin(yaw) * 10, Math.cos(yaw) * 10); mmx.stroke();
  mmx.restore();
}
function updateInteractPrompt() {
  if (player.inInterior) {
    const it = player.inInterior, f = it.floors[it.currentFloor];
    if (f.exit && player.pos.distanceTo(f.exit.pos) < 3) return showPrompt('<b>E</b> Exit building');
    for (const l of f.links) if (player.pos.distanceTo(l.pos) < 3) return showPrompt('<b>E</b> ' + l.label);
    if (it.register && it.currentFloor === it.register.floor && player.pos.distanceTo(it.register.pos) < 3.4) return showPrompt(it.register.robbed ? '<b>E</b> Register (emptied)' : '<b>E</b> Rob register');
    return hidePrompt();
  }
  if (player.inVehicle) return hidePrompt();
  const door = nearestDoor(6);
  if (door) return showPrompt('<b>E</b> Enter ' + INTERIOR_LABEL[door.type]);
  if (!activeMission) { const g = nearestGiver(9); if (g) return showPrompt('<b>E</b> Start ' + MTYPE[g.type].title + ' mission'); }
  hidePrompt();
}

// ================================================================
//  MAIN LOOP
// ================================================================
const clock = new THREE.Clock();
let paused = false;
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  animateOcean(clock.elapsedTime);
  if (started && !paused) {
    if (player.inInterior) {
      updatePlayerInterior(dt); updateInteriorNPCs(dt);
      updateProjectiles(dt); updateEffects(dt);
    } else {
      updatePlayer(dt);
      updatePeds(dt); updateCops(dt); updateAnimals(dt); updateBirds(dt);
      updateTraffic(dt); updateProps(dt); updateProjectiles(dt); updatePickups(dt); updateEffects(dt);
      updateMissions(dt);
    }
    updateInteractPrompt();
    updateCamera(dt); updateFloatTexts();
    drawMinimap();
    flashDiv.style.opacity = clamp(player.hitFlash * 2, 0, 0.6);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ================================================================
//  SAVE / LOAD (browser cache) + MENU + PAUSE
// ================================================================
const SAVE_KEY = 'gat_liberty_save';
function saveGame() {
  const s = {
    name: PLAYER_NAME, money: player.money, hp: player.hp, armor: player.armor,
    wanted: player.wanted, heat: player.heat, weapon: player.weapon, ammo: { ...player.ammo },
    pos: { x: player.pos.x, z: player.pos.z }, god: player.god, bigHead: player.bigHead, night, turbo,
    stats: { ...player.stats }, t: Date.now(),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch (e) { return false; }
}
function loadSaveData() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }
function applySave(s) {
  PLAYER_NAME = s.name || 'Player';
  player.money = s.money || 0; player.hp = s.hp ?? 100; player.armor = s.armor || 0;
  player.weapon = s.weapon || 'pistol';
  if (s.ammo) for (const w in s.ammo) if (w in player.ammo) player.ammo[w] = s.ammo[w] == null ? Infinity : s.ammo[w];
  player.ammo.fist = Infinity;
  setWanted(s.wanted || 0); player.heat = s.heat || 0;
  player.god = !!s.god; player.bigHead = !!s.bigHead; setBigHead(player.obj, player.bigHead);
  night = !!s.night; applyNight(); turbo = !!s.turbo;
  if (s.stats) Object.assign(player.stats, s.stats);
  if (s.pos && !isSolidW(s.pos.x, s.pos.z) && inIsland(s.pos.x, s.pos.z)) {
    player.pos.set(s.pos.x, groundHeightAt(s.pos.x, s.pos.z), s.pos.z);
  }
}
function timeAgo(t) {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

const overlay = document.getElementById('overlay');
const pauseEl = document.getElementById('pause');
const nameInput = document.getElementById('player-name');
const continueBtn = document.getElementById('continue-btn');
const saveNote = document.getElementById('save-note');
const pauseNote = document.getElementById('pause-note');
const pauseInfo = document.getElementById('pause-info');

// populate menu from any existing save
(function initMenu() {
  const s = loadSaveData();
  if (s) {
    continueBtn.disabled = false;
    nameInput.value = s.name || '';
    saveNote.textContent = `Saved game found — ${s.name || 'Player'} · $${(s.money || 0).toLocaleString()} · ${timeAgo(s.t || Date.now())}`;
  }
})();

function beginWorld() {
  if (started) return;
  started = true;
  spawnPeds(52); spawnTraffic(12); spawnStarterVehicles(); scatterProps();
  for (let i = 0; i < 10; i++) { const p = nearPlayer(rand(30, 90)); if (inIsland(p.x, p.z) && !isSolidW(p.x, p.z)) makeDog(p.x, p.z); }
  for (let i = 0; i < 18; i++) makeBird(rand(-OCEAN_BOUND * 0.6, OCEAN_BOUND * 0.6), rand(-OCEAN_BOUND * 0.6, OCEAN_BOUND * 0.6));
  placeMissionGivers();
}
function startGame(save) {
  overlay.classList.add('hidden');
  const typed = nameInput.value.trim();
  if (save) applySave(save); else PLAYER_NAME = typed || 'Player';
  beginWorld();
  updateHUD();
  canvas.requestPointerLock();
}
document.getElementById('start-btn').addEventListener('click', () => startGame(null));
continueBtn.addEventListener('click', () => { const s = loadSaveData(); if (s) startGame(s); });

// pause menu
function showPause() {
  if (!started || dead) return;
  paused = true; pauseEl.classList.remove('hidden'); crosshair.classList.remove('show');
  pauseInfo.innerHTML = `<b>${PLAYER_NAME}</b><br>$${Math.floor(player.money).toLocaleString()} &nbsp;·&nbsp; ${player.wanted}★ wanted<br>HP ${Math.max(0, Math.floor(player.hp))} · Armor ${Math.floor(player.armor)}`
    + `<br><span style="opacity:.7;font-size:14px">Missions ${player.stats.missions} · Kills ${player.stats.kills} · ${(player.stats.distance / 1000).toFixed(2)} km driven</span>`;
  pauseNote.textContent = '';
}
function hidePause() { paused = false; pauseEl.classList.add('hidden'); }
document.getElementById('resume-btn').addEventListener('click', () => { hidePause(); canvas.requestPointerLock(); });
document.getElementById('save-btn').addEventListener('click', () => { pauseNote.textContent = saveGame() ? '✔ Game saved to this browser' : '✖ Could not save'; });
document.getElementById('quit-btn').addEventListener('click', () => { saveGame(); location.reload(); });

// Esc opens pause; clicking canvas resumes (re-locks pointer)
addEventListener('keydown', e => { if (e.key === 'Escape' && started && !dead) { if (paused) { hidePause(); canvas.requestPointerLock(); } else showPause(); } });
document.addEventListener('pointerlockchange', () => {
  if (started && !dead && document.pointerLockElement !== canvas && !paused) showPause();
  lockHint.classList.remove('show');
});

// auto-save every 20s while playing
setInterval(() => { if (started && !dead) saveGame(); }, 20000);

updateHUD();
loop();
