// Oakridge Product Suite — 15s motion sequence.
// Everything is a pure function of time t (seconds): window.renderAt(t)
// draws one frame, so frames can be captured deterministically.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";

const W = 1920, H = 1080;

/* ---------------- easing ---------------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eout = (x) => 1 - Math.pow(1 - x, 3);
const ein = (x) => x * x * x;
const expo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const back = (x) => { const c1 = 1.6, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

const PINK = new THREE.Color("#ff8fa8");
const MAROON = new THREE.Color("#894554");
const GREEN = new THREE.Color("#34c77b");

/* ---------------- renderer / scene ---------------- */
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x12080b, 0.035);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// Screen-space backdrop: deep maroon radial glow.
{
  const c = document.createElement("canvas");
  c.width = 960; c.height = 540;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(480, 250, 20, 480, 270, 620);
  grad.addColorStop(0, "#3a1820");
  grad.addColorStop(0.45, "#1d0c11");
  grad.addColorStop(1, "#0a0406");
  g.fillStyle = grad;
  g.fillRect(0, 0, 960, 540);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

const camera = new THREE.PerspectiveCamera(36, W / H, 0.05, 200);

scene.add(new THREE.AmbientLight(0xffffff, 0.35));
const key = new THREE.DirectionalLight(0xfff1f4, 2.2);
key.position.set(3, 5, 6);
scene.add(key);
const rim = new THREE.PointLight(0xff6f8f, 40, 30, 2);
rim.position.set(-4, 2, -3);
scene.add(rim);
const rim2 = new THREE.PointLight(0x5fe0a0, 0, 30, 2);
rim2.position.set(6, 3, -2);
scene.add(rim2);

/* ---------------- textures ---------------- */
const loader = new THREE.TextureLoader();
const texPromises = [];
function tex(path) {
  const t = loader.load(path);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  texPromises.push(new Promise((res) => {
    const check = () => (t.image && t.image.complete ? res() : setTimeout(check, 20));
    check();
  }));
  return t;
}
const T = {
  home: tex("assets/home-01-overview.png"),
  counts: tex("assets/cnt-01-top.png"),
  floor: tex("assets/flr-01-check.png"),
  recv: tex("assets/rec-01-top.png"),
  exceptions: tex("assets/home-03-exceptions.png"),
  detail: tex("assets/cat-03-detail.png"),
  logo: tex("assets/icon-512.png"),
};

// Labels are drawn to canvases; they're redrawn once the web fonts have
// loaded (see window.ready) so they never render in a fallback font.
const labelRedraws = [];
function textTexture(lines, opts = {}) {
  const c = document.createElement("canvas");
  const t = new THREE.CanvasTexture(c);
  const draw = () => { drawText(c, lines, opts); t.needsUpdate = true; };
  draw();
  labelRedraws.push(draw);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function drawText(c, lines, { w = 1024, h = 256, bg = null, pad = 40 } = {}) {
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  if (bg) {
    g.fillStyle = bg;
    const r = 40;
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, r);
    g.fill();
  }
  let y = pad;
  for (const l of lines) {
    g.font = l.font;
    g.fillStyle = l.color;
    g.textBaseline = "top";
    g.textAlign = l.align || "center";
    if (l.spacing) g.letterSpacing = l.spacing;
    g.fillText(l.text, l.align === "left" ? pad : w / 2, y);
    y += l.size * 1.25;
  }
}

function label(lines, scale, opts) {
  const mat = new THREE.SpriteMaterial({ map: textTexture(lines, opts), transparent: true, depthWrite: false, toneMapped: false });
  const s = new THREE.Sprite(mat);
  const w = (opts && opts.w) || 1024, h = (opts && opts.h) || 256;
  s.scale.set(scale, (scale * h) / w, 1);
  return s;
}

/* ---------------- particles ---------------- */
const particles = (() => {
  const n = 1600;
  const pos = new Float32Array(n * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (rnd() - 0.5) * 34;
    pos[i * 3 + 1] = (rnd() - 0.5) * 18;
    pos[i * 3 + 2] = (rnd() - 0.5) * 26 - 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dot = document.createElement("canvas");
  dot.width = dot.height = 64;
  const g = dot.getContext("2d");
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, "rgba(255,255,255,1)");
  rg.addColorStop(0.3, "rgba(255,200,215,0.6)");
  rg.addColorStop(1, "rgba(255,150,180,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  const mat = new THREE.PointsMaterial({
    size: 0.07, map: new THREE.CanvasTexture(dot), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, color: 0xffb3c4, opacity: 0.7, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return pts;
})();

// Glowing sprite used for packets, cores and the logo halo.
const glowTex = (() => {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, "rgba(255,255,255,1)");
  rg.addColorStop(0.25, "rgba(255,255,255,0.55)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
function glow(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size);
  return s;
}

/* ---------------- floor grid ---------------- */
const grid = (() => {
  const g = new THREE.GridHelper(80, 80, 0x7a3445, 0x4a1f29);
  g.material.transparent = true;
  g.material.opacity = 0.0;
  g.material.depthWrite = false;
  g.position.y = -2.4;
  scene.add(g);
  return g;
})();

/* ---------------- phone ---------------- */
const SCREEN_W = 0.96, SCREEN_H = 0.96 * (2110 / 975);
const screenShader = {
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D a; uniform sampler2D b; uniform float mixv; uniform float bright; uniform float opacity;
    varying vec2 vUv;
    void main(){
      // vertical wipe with a soft glowing edge, like a swipe between screens
      float edge = smoothstep(mixv - 0.04, mixv + 0.04, 1.0 - vUv.y);
      vec2 shiftA = vUv + vec2(0.0, -mixv * 0.12);
      vec2 shiftB = vUv + vec2(0.0, (1.0 - mixv) * 0.12);
      vec3 ca = texture2D(a, clamp(shiftA, 0.0, 1.0)).rgb;
      vec3 cb = texture2D(b, clamp(shiftB, 0.0, 1.0)).rgb;
      vec3 col = mix(cb, ca, edge);
      float line = (1.0 - smoothstep(0.0, 0.015, abs((1.0 - vUv.y) - mixv))) * step(0.001, mixv) * step(mixv, 0.999);
      col += vec3(1.0, 0.55, 0.65) * line * 0.8;
      gl_FragColor = vec4(col * bright, opacity);
      #include <colorspace_fragment>
    }`,
};
function makePhone(texA) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new RoundedBoxGeometry(1.08, 2.24, 0.11, 6, 0.13),
    new THREE.MeshStandardMaterial({ color: 0x241418, metalness: 0.85, roughness: 0.25, transparent: true })
  );
  group.add(body);
  const mat = new THREE.ShaderMaterial({
    uniforms: { a: { value: texA }, b: { value: texA }, mixv: { value: 0 }, bright: { value: 1 }, opacity: { value: 1 } },
    ...screenShader, transparent: true, toneMapped: false,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), mat);
  screen.position.z = 0.0575;
  group.add(screen);
  const halo = glow(PINK, 3.4);
  halo.position.z = -0.3;
  halo.material.opacity = 0.35;
  group.add(halo);
  group.userData = { body, screen, mat, halo };
  scene.add(group);
  return group;
}
// Screen transition helper: from texture A to B as m goes 0→1.
function setScreen(phone, a, b, m) {
  const u = phone.userData.mat.uniforms;
  u.a.value = a; u.b.value = b; u.mixv.value = m;
}
function setPhoneOpacity(phone, o) {
  phone.visible = o > 0.001;
  phone.userData.body.material.opacity = o;
  phone.userData.mat.uniforms.opacity.value = o;
  phone.userData.halo.material.opacity = 0.35 * o;
}

const phoneA = makePhone(T.home);
const orbitPhones = [makePhone(T.counts), makePhone(T.floor), makePhone(T.recv)];

/* ---------------- morphing outline: ring → phone ---------------- */
const N = 240;
function roundedRectPoints(w, h, r) {
  // sample a rounded rectangle by arc length, starting at top-centre, clockwise
  const segs = [];
  const hw = w / 2, hh = h / 2;
  const pts = [];
  const add = (x, y) => pts.push(new THREE.Vector2(x, y));
  const steps = 400;
  // build a dense path
  const path = new THREE.Shape();
  path.moveTo(0, hh);
  path.lineTo(hw - r, hh);
  path.quadraticCurveTo(hw, hh, hw, hh - r);
  path.lineTo(hw, -hh + r);
  path.quadraticCurveTo(hw, -hh, hw - r, -hh);
  path.lineTo(-hw + r, -hh);
  path.quadraticCurveTo(-hw, -hh, -hw, -hh + r);
  path.lineTo(-hw, hh - r);
  path.quadraticCurveTo(-hw, hh, -hw + r, hh);
  path.lineTo(0, hh);
  return path.getSpacedPoints(N - 1);
}
const rectPts = roundedRectPoints(1.2, 2.36, 0.18);
const circlePts = Array.from({ length: N }, (_, i) => {
  const a = Math.PI / 2 - (i / (N - 1)) * Math.PI * 2;
  return new THREE.Vector2(Math.cos(a) * 1.25, Math.sin(a) * 1.25);
});
const morphGeo = new LineGeometry();
const morphMat = new LineMaterial({ color: 0xff8fa8, linewidth: 5, transparent: true, worldUnits: false, toneMapped: false, depthTest: false, depthWrite: false });
morphMat.resolution.set(W, H);
const morphLine = new Line2(morphGeo, morphMat);
scene.add(morphLine);
const morphPos = new Float32Array(N * 3);
function updateMorph(m, draw, spin) {
  for (let i = 0; i < N; i++) {
    const c = circlePts[i], r = rectPts[i];
    const x = lerp(c.x, r.x, m), y = lerp(c.y, r.y, m);
    const ca = Math.cos(spin), sa = Math.sin(spin);
    morphPos[i * 3] = x * ca - y * sa;
    morphPos[i * 3 + 1] = x * sa + y * ca;
    morphPos[i * 3 + 2] = 0;
  }
  morphGeo.setPositions(morphPos);
  morphGeo.instanceCount = Math.max(1, Math.floor((N - 1) * draw));
}
// Second, thinner orbiting ring for depth
const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.006, 8, 160), new THREE.MeshBasicMaterial({ color: 0xff8fa8, transparent: true, toneMapped: false }));
scene.add(ring2);

/* ---------------- floating UI cards (lift off the screen) ---------------- */
function card(texture, w) {
  const img = texture.image;
  const h = w * (img.height / img.width);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, side: THREE.DoubleSide })
  );
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.04, h * 1.04), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
  shadow.position.set(0.03, -0.04, -0.02);
  m.add(shadow);
  scene.add(m);
  return m;
}
let cardExceptions, cardDetail;

/* ---------------- back end: Apps Script node ---------------- */
const NODE_POS = v3(0.2, 0.35, 0);
const node = new THREE.Group();
{
  const ico = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.62, 1)),
    new THREE.LineBasicMaterial({ color: 0xff8fa8, transparent: true, toneMapped: false })
  );
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 2), new THREE.MeshStandardMaterial({ color: 0x3a1620, emissive: 0xff5c80, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.4 }));
  const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.008, 8, 140), new THREE.MeshBasicMaterial({ color: 0xffc2d0, transparent: true, toneMapped: false }));
  orbit.rotation.x = Math.PI / 2.4;
  const halo = glow(new THREE.Color("#ff5c80"), 2.6);
  halo.material.opacity = 0.5;
  const lab = label([
    { text: "APPS SCRIPT", font: "700 92px Grotesk", color: "#ffffff", size: 92, spacing: "14px" },
    { text: "access key checked on every request", font: "500 44px Grotesk", color: "#f0b9c6", size: 44 },
  ], 2.1, { w: 1024, h: 256, pad: 30 });
  lab.position.set(0, -1.2, 0);
  node.add(ico, core, orbit, halo, lab);
  node.userData = { ico, core, orbit, halo, lab };
  scene.add(node);
}

/* ---------------- back end: the Google Sheet ---------------- */
const SHEET_POS = v3(3.7, -0.05, 0);
const sheet = new THREE.Group();
const COLS = 8, ROWS = 7, TW = 0.34, TH = 0.16, GAP = 0.03;
const rowMats = [];
const tiles = [];
{
  const gw = COLS * (TW + GAP), gh = ROWS * (TH + GAP);
  const panel = new THREE.Mesh(
    new RoundedBoxGeometry(gw + 0.3, gh + 0.62, 0.06, 4, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x1a1d1b, metalness: 0.6, roughness: 0.35 })
  );
  panel.position.set(0, -0.12, -0.04);
  sheet.add(panel);
  sheet.userData.panel = panel;
  for (let r = 0; r < ROWS; r++) {
    const mat = new THREE.MeshStandardMaterial({
      color: r === 0 ? 0x188038 : 0xf4f1f2, roughness: 0.55, metalness: 0.05,
      emissive: r === 0 ? 0x0f5a28 : 0x000000, emissiveIntensity: 1,
    });
    rowMats.push(mat);
    for (let c = 0; c < COLS; c++) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(TW, TH, 0.035), mat);
      tile.position.set(-gw / 2 + c * (TW + GAP) + TW / 2, gh / 2 - r * (TH + GAP) - TH / 2, 0.01);
      tile.userData = { r, c, base: tile.position.clone() };
      sheet.add(tile);
      tiles.push(tile);
    }
  }
  // tab strip
  const tabs = ["ProductMaster", "AuditLog", "ConsolLog", "ReceivingLog", "FloorRestock"];
  sheet.userData.tabs = tabs.map((name, i) => {
    const s = label([{ text: name, font: "600 64px Inter", color: "#ffffff", size: 64 }], 0.62, { w: 512, h: 128, bg: "rgba(24,128,56,0.0)", pad: 30 });
    s.position.set(-gw / 2 + 0.33 + i * (gw - 0.66) / 4, -gh / 2 - 0.27, 0.05);
    sheet.add(s);
    return s;
  });
  const title = label([
    { text: "GOOGLE SHEET", font: "700 92px Grotesk", color: "#ffffff", size: 92, spacing: "14px" },
    { text: "one source of truth for every device", font: "500 44px Grotesk", color: "#9fe8bf", size: 44 },
  ], 2.3, { w: 1024, h: 256, pad: 30 });
  title.position.set(0, gh / 2 + 0.55, 0.05);
  sheet.add(title);
  sheet.userData.title = title;
  const halo = glow(GREEN, 6);
  halo.position.z = -0.6;
  halo.material.opacity = 0.25;
  sheet.add(halo);
  sheet.userData.halo = halo;
  scene.add(sheet);
}

/* ---------------- logo badge (finale) ---------------- */
const LOGO_POS = v3(3.7, 0.45, 0.6);
const logo = new THREE.Group();
{
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 96), new THREE.MeshBasicMaterial({ map: T.logo, transparent: true, toneMapped: false }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.018, 16, 160), new THREE.MeshStandardMaterial({ color: 0xffc2d0, metalness: 0.9, roughness: 0.2, emissive: 0x5a1a28 }));
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.006, 8, 160), new THREE.MeshBasicMaterial({ color: 0xff8fa8, transparent: true, toneMapped: false }));
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.004, 8, 160), new THREE.MeshBasicMaterial({ color: 0xffc2d0, transparent: true, toneMapped: false }));
  const halo = glow(PINK, 4.2);
  halo.position.z = -0.2;
  logo.add(halo, disc, rim, ringA, ringB);
  logo.userData = { disc, rim, ringA, ringB, halo };
  logo.position.copy(LOGO_POS);
  scene.add(logo);
}

/* ---------------- data packets ---------------- */
const PHONE_A_BACKEND = v3(-3.7, 0, 0);
function arc(a, b, lift) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y += lift;
  mid.z += 0.6;
  return new THREE.QuadraticBezierCurve3(a, mid, b);
}
const curveA = arc(PHONE_A_BACKEND.clone().add(v3(0.6, 0.2, 0.1)), NODE_POS.clone(), 1.1);
const curveB = arc(NODE_POS.clone(), SHEET_POS.clone().add(v3(-1.2, 0.2, 0.1)), 1.0);

// Faint guide tubes along the two paths
function pathTube(curve, color) {
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.006, 6, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
  scene.add(m);
  return m;
}
const tubeA = pathTube(curveA, 0xff8fa8);
const tubeB = pathTube(curveB, 0x7fe0a8);

const TRAIL = 7;
const packetPool = [];
function getPacket(i) {
  if (!packetPool[i]) {
    const g = new THREE.Group();
    const parts = [];
    for (let k = 0; k < TRAIL; k++) {
      const s = glow(PINK, 0.32 * (1 - k / TRAIL) + 0.06);
      g.add(s);
      parts.push(s);
    }
    g.userData.parts = parts;
    scene.add(g);
    packetPool[i] = g;
  }
  return packetPool[i];
}
// Upload packets: phone → Apps Script → sheet row
const uploads = [6.7, 6.95, 7.2, 7.5, 7.75, 8.05, 8.3, 8.6, 8.85, 9.15, 9.4, 9.7, 9.95].map((t0, i) => ({ t0, row: 1 + (i % (ROWS - 1)), tab: i % 5 }));
const LEG = 0.75;

/* ---------------- camera path ---------------- */
const camKeys = [
  [0.0, [0, 0, 10.5], [0, 0, 0]],
  [1.9, [0, 0.05, 7.6], [0, 0, 0]],
  [3.0, [0.3, 0.25, 4.9], [-0.55, 0, 0]],
  [4.3, [-1.5, 0.35, 4.5], [-0.5, 0.05, 0]],
  [5.6, [0.2, 0.55, 5.0], [-0.55, 0, 0]],
  [6.8, [-1.2, 1.3, 8.8], [-0.7, 0.1, 0]],
  [8.6, [0.9, 1.7, 11.4], [0.8, 0.35, 0]],
  [10.3, [3.0, 2.4, 9.2], [2.8, 0.3, 0]],
  [11.7, [7.6, 4.2, 6.9], [3.7, 0.45, 0]],
  [12.9, [5.4, 1.7, 7.6], [3.7, 0.5, 0]],
  [14.0, [3.75, 0.4, 6.5], [3.7, 0.05, 0]],
  [15.0, [3.7, 0.25, 5.7], [3.7, 0.0, 0]],
];
const camPosCurve = new THREE.CatmullRomCurve3(camKeys.map((k) => v3(...k[1])), false, "centripetal");
const camTgtCurve = new THREE.CatmullRomCurve3(camKeys.map((k) => v3(...k[2])), false, "centripetal");
// Monotone (Fritsch–Carlson) map from time to curve parameter, so the
// camera's speed changes smoothly across keyframes instead of jerking.
const kt = camKeys.map((k) => k[0]);
const ku = camKeys.map((_, i) => i / (camKeys.length - 1));
const slopes = (() => {
  const n = kt.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((ku[i + 1] - ku[i]) / (kt[i + 1] - kt[i]));
  m[0] = d[0] * 0.2; m[n - 1] = d[n - 2] * 0.6;
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return m;
})();
function timeToU(t) {
  if (t <= kt[0]) return 0;
  if (t >= kt[kt.length - 1]) return 1;
  let i = 0;
  while (t > kt[i + 1]) i++;
  const h = kt[i + 1] - kt[i], s = (t - kt[i]) / h;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
  return h00 * ku[i] + h10 * h * slopes[i] + h01 * ku[i + 1] + h11 * h * slopes[i + 1];
}

/* ---------------- kinetic typography ---------------- */
const typeRoot = document.getElementById("type");
const beats = [];
function beat({ lines, x, y, align = "left", start, end, style = "rise", stagger = 0.022, inDur = 0.55, outDur = 0.35, drift = 30, unit = "char" }) {
  const el = document.createElement("div");
  el.className = "beat";
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.style.textAlign = align;
  if (align === "center") el.style.transform = "translateX(-50%)";
  el.style.perspective = "900px";
  const pieces = [];
  for (const line of lines) {
    const ld = document.createElement("div");
    ld.className = line.cls || "";
    if (line.style) Object.assign(ld.style, line.style);
    const tokens = unit === "word" ? line.text.split(/(\s+)/) : [...line.text];
    for (const tok of tokens) {
      const sp = document.createElement("span");
      sp.className = "ch";
      if (/^\s+$/.test(tok)) { sp.innerHTML = "&nbsp;"; sp.dataset.space = "1"; }
      else sp.textContent = tok;
      if (line.spanCls) sp.classList.add(...line.spanCls.split(" "));
      ld.appendChild(sp);
      if (!sp.dataset.space) pieces.push(sp);
    }
    el.appendChild(ld);
  }
  typeRoot.appendChild(el);
  beats.push({ el, pieces, start, end, style, stagger, inDur, outDur, drift, align });
}
function renderBeats(t) {
  for (const b of beats) {
    const visible = t >= b.start - 0.05 && t <= b.end + 0.05;
    b.el.style.display = visible ? "block" : "none";
    if (!visible) continue;
    const life = prog(t, b.start, b.end);
    const dx = lerp(0, b.drift, life);
    b.el.style.transform = (b.align === "center" ? "translateX(-50%) " : "") + `translateX(${dx}px)`;
    const n = b.pieces.length;
    b.pieces.forEach((sp, i) => {
      const s0 = b.start + i * b.stagger;
      const pin = prog(t, s0, s0 + b.inDur);
      // exit ripples across at most ~0.25s, however long the line is
      const outStep = Math.min(b.stagger * 0.4, 0.25 / Math.max(1, n));
      const o0 = b.end - b.outDur - (n - 1 - i) * outStep;
      const pout = prog(t, o0, o0 + b.outDur);
      let tr = "", op = 1, blur = 0;
      if (b.style === "rise") {
        const e = expo(pin), o = ein(pout);
        tr = `translateY(${(1 - e) * 90 - o * 50}px) rotateX(${(1 - e) * -80}deg)`;
        op = e * (1 - o); blur = (1 - e) * 14 + o * 10;
      } else if (b.style === "slam") {
        const e = back(clamp(pin)), o = ein(pout);
        tr = `scale(${lerp(2.4, 1, e) + o * 0.5}) translateZ(0)`;
        op = clamp(pin * 2.5) * (1 - o); blur = (1 - clamp(pin * 1.4)) * 22 + o * 16;
      } else if (b.style === "slide") {
        const e = expo(pin), o = ein(pout);
        tr = `translateX(${(1 - e) * -120 + o * 80}px)`;
        op = e * (1 - o); blur = (1 - e) * 10 + o * 8;
      } else if (b.style === "flip") {
        const e = eout(pin), o = ein(pout);
        tr = `rotateY(${(1 - e) * 90}deg) translateY(${-o * 40}px)`;
        op = e * (1 - o); blur = o * 8;
      }
      sp.style.transform = tr;
      sp.style.opacity = op.toFixed(3);
      sp.style.filter = blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : "none";
    });
  }
}

// Act 1 — kinetic intro
beat({ lines: [{ text: "SCAN.", cls: "mega" }], x: 960, y: 395, align: "center", start: 0.15, end: 1.0, style: "slam", stagger: 0.05, inDur: 0.45, outDur: 0.18, drift: 0 });
beat({ lines: [{ text: "COUNT.", cls: "mega stroke" }], x: 960, y: 395, align: "center", start: 0.95, end: 1.8, style: "slam", stagger: 0.05, inDur: 0.45, outDur: 0.18, drift: 0 });
beat({ lines: [{ text: "RESTOCK.", cls: "mega accent" }], x: 960, y: 395, align: "center", start: 1.75, end: 2.6, style: "slam", stagger: 0.045, inDur: 0.45, outDur: 0.22, drift: 0 });
beat({ lines: [{ text: "One app for the whole floor", cls: "kicker" }], x: 960, y: 935, align: "center", start: 2.3, end: 3.4, style: "rise", stagger: 0.018, drift: 0 });
// Act 2 — the app
beat({ lines: [{ text: "01 — Home", cls: "kicker" }, { text: "What needs", cls: "big" }, { text: "attention.", cls: "big accent" }, { text: "Exceptions first, the rest one tap away.", cls: "small", style: { marginTop: "18px" } }], x: 150, y: 360, start: 3.0, end: 4.15, stagger: 0.016 });
beat({ lines: [{ text: "02 — Counts", cls: "kicker" }, { text: "Scan. Count.", cls: "big" }, { text: "Flag what's off.", cls: "big accent" }, { text: "Outside ±2 or 5%? It's flagged for a recount.", cls: "small", style: { marginTop: "18px" } }], x: 150, y: 360, start: 4.1, end: 5.15, stagger: 0.016 });
beat({ lines: [{ text: "03 — Floor Stock", cls: "kicker" }, { text: "Needed. Picked.", cls: "big" }, { text: "Restocked.", cls: "big accent" }, { text: "One line per style — check it, pick it, 86 it.", cls: "small", style: { marginTop: "18px" } }], x: 150, y: 360, start: 5.1, end: 6.25, stagger: 0.016 });
// Act 3 — the back end
beat({ lines: [{ text: "Under the hood", cls: "kicker" }, { text: "Every tap lands in", cls: "mid" }, { text: "one shared Google Sheet.", cls: "mid green" }], x: 140, y: 110, start: 6.5, end: 8.5, style: "slide", stagger: 0.012 });
beat({ lines: [{ text: "Apps Script", cls: "kicker" }, { text: "Checks the access key.", cls: "mid" }, { text: "Writes the row.", cls: "mid accent" }], x: 140, y: 110, start: 8.45, end: 10.5, style: "slide", stagger: 0.012 });
// Act 4 — sync
beat({ lines: [{ text: "Every device.", cls: "big" }, { text: "Same live data.", cls: "big green" }, { text: "Works offline  ·  syncs on update  ·  flags what MAO hasn't seen", cls: "small", style: { marginTop: "20px" } }], x: 140, y: 105, start: 10.8, end: 13.15, stagger: 0.02, style: "rise" });
// Act 5 — title
beat({ lines: [{ text: "Oakridge Park  ·  Arc'teryx", cls: "kicker" }], x: 960, y: 690, align: "center", start: 13.75, end: 15.4, stagger: 0.02, drift: 0 });
beat({ lines: [{ text: "Oakridge Product Suite", cls: "big" }], x: 960, y: 735, align: "center", start: 13.85, end: 15.4, style: "flip", stagger: 0.03, inDur: 0.5, drift: 0 });
beat({ lines: [{ text: "v2 — rebuilt for the floor", cls: "small" }], x: 960, y: 850, align: "center", start: 14.3, end: 15.4, stagger: 0.02, drift: 0 });

/* ---------------- grain ---------------- */
const grainCanvas = document.getElementById("grain");
const gctx = grainCanvas.getContext("2d");
const grainImg = gctx.createImageData(480, 270);
function renderGrain(frameSeed) {
  let s = (frameSeed * 9301 + 49297) % 233280 || 1;
  const d = grainImg.data;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const v = (s & 255);
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  gctx.putImageData(grainImg, 0, 0);
}

/* ---------------- the timeline ---------------- */
function render(t) {
  // camera
  const u = timeToU(t);
  const cp = camPosCurve.getPoint(u), ct = camTgtCurve.getPoint(u);
  cp.x += Math.sin(t * 1.3) * 0.025; cp.y += Math.sin(t * 0.9 + 1) * 0.02; // handheld drift
  camera.position.copy(cp);
  camera.lookAt(ct);
  camera.fov = lerp(36, 30, eio(prog(t, 12.8, 15)));
  camera.updateProjectionMatrix();

  particles.rotation.y = t * 0.02;
  particles.position.y = Math.sin(t * 0.4) * 0.15;
  grid.material.opacity = 0.22 * eout(prog(t, 5.8, 7.2)) * (1 - ein(prog(t, 13.2, 14.2)));

  // ---- Act 1: ring draws, spins, morphs into the phone outline ----
  const draw = expo(prog(t, 0.05, 1.1));
  const m = eio(prog(t, 1.7, 2.55));
  updateMorph(m, draw, (1 - m) * (t * 1.6));
  const morphOut = 1 - eout(prog(t, 2.75, 3.2));
  morphMat.opacity = morphOut;
  morphLine.visible = morphOut > 0.01;
  morphLine.position.set(0, 0, 0.1);
  morphLine.scale.setScalar(lerp(1, 1.0, m));
  ring2.visible = t < 3.2;
  ring2.material.opacity = 0.6 * eout(prog(t, 0.2, 1.0)) * (1 - eout(prog(t, 1.9, 2.6)));
  ring2.rotation.set(1.1 + t * 0.4, t * 0.7, 0);
  ring2.scale.setScalar(lerp(0.6, 1.25, eout(prog(t, 0, 2.4))));

  // ---- Phone A ----
  const appear = back(prog(t, 2.35, 3.05));
  let pa = v3(0, 0, 0);
  pa.lerp(PHONE_A_BACKEND, eio(prog(t, 6.0, 7.3)));
  // Act 4: phone A joins the orbit around the sheet
  const orbitIn = eio(prog(t, 10.6, 11.8));
  const orbitAngle = (k) => k * (Math.PI * 2 / 4) + 0.6 + (t - 10.6) * 0.55;
  const orbitPos = (k) => {
    const a = orbitAngle(k);
    return SHEET_POS.clone().add(v3(Math.cos(a) * 3.3, 0.25 + Math.sin(a * 2 + k) * 0.25, Math.sin(a) * 3.3));
  };
  if (t > 10.6) pa.lerp(orbitPos(0), orbitIn);
  // Act 5: collapse into the logo
  const collapse = ein(prog(t, 13.0, 13.6));
  pa.lerp(LOGO_POS, collapse);
  phoneA.position.copy(pa);
  phoneA.position.y += Math.sin(t * 1.4) * 0.04;
  const sA = Math.max(0.0001, appear * (1 - collapse));
  phoneA.scale.setScalar(sA);
  setPhoneOpacity(phoneA, clamp(prog(t, 2.35, 2.7)) * (1 - collapse));
  let ry = lerp(-0.55, 0.0, eout(prog(t, 2.4, 3.3)));
  ry += Math.sin((t - 3) * 0.9) * 0.28 * clamp(prog(t, 3.0, 3.6)) * (1 - prog(t, 5.6, 6.2));
  ry = lerp(ry, 0.55, eio(prog(t, 6.0, 7.2)));
  phoneA.rotation.set(Math.sin(t * 0.8) * 0.05, ry, lerp(0, 0.04, prog(t, 6, 7)));
  if (t > 10.6) {
    phoneA.lookAt(camera.position.x, phoneA.position.y, camera.position.z);
  }
  // screen sequence: Home → Counts → Floor Stock → Receiving
  if (t < 4.0) setScreen(phoneA, T.home, T.counts, eio(prog(t, 3.75, 4.2)));
  else if (t < 5.0) setScreen(phoneA, T.counts, T.floor, eio(prog(t, 4.8, 5.25)));
  else setScreen(phoneA, T.floor, T.recv, eio(prog(t, 6.6, 7.1)));
  phoneA.userData.mat.uniforms.bright.value = lerp(0.2, 1, eout(prog(t, 2.5, 3.1)));

  // ---- floating cards lift off the screen ----
  {
    const lift = eout(prog(t, 3.25, 3.95)), away = ein(prog(t, 4.5, 5.0));
    cardExceptions.visible = lift > 0.001 && away < 0.999;
    cardExceptions.position.set(lerp(0, 1.2, lift) + away * 2.2, lerp(-0.1, 0.22, lift), lerp(0.06, 0.55, lift) + away * 0.6);
    cardExceptions.rotation.set(0, lerp(0, -0.38, lift) - away * 0.6, lerp(0, 0.03, lift));
    cardExceptions.material.opacity = clamp(lift * 2) * (1 - away);
    cardExceptions.children[0].material.opacity = 0.35 * cardExceptions.material.opacity;

    const l2 = eout(prog(t, 4.55, 5.2)), a2 = ein(prog(t, 5.75, 6.2));
    cardDetail.visible = l2 > 0.001 && a2 < 0.999;
    cardDetail.position.set(lerp(0, 1.2, l2) + a2 * 2.2, lerp(0, 0.15, l2), lerp(0.06, 0.55, l2) + a2 * 0.6);
    cardDetail.rotation.set(0, lerp(0, -0.38, l2) - a2 * 0.5, 0);
    cardDetail.material.opacity = clamp(l2 * 2) * (1 - a2);
    cardDetail.children[0].material.opacity = 0.35 * cardDetail.material.opacity;
  }

  // ---- Act 3: back end appears ----
  const nodeIn = back(prog(t, 6.3, 7.0));
  const nodeToTop = eio(prog(t, 10.4, 11.6));
  const nodePos = NODE_POS.clone().lerp(SHEET_POS.clone().add(v3(0, 2.15, 0)), nodeToTop).lerp(LOGO_POS, collapse);
  node.position.copy(nodePos);
  node.scale.setScalar(Math.max(0.0001, nodeIn * lerp(1, 0.6, nodeToTop) * (1 - collapse)));
  node.visible = nodeIn > 0.001 && collapse < 0.999;
  node.userData.ico.rotation.set(t * 0.5, t * 0.7, 0);
  node.userData.orbit.rotation.z = t * 1.2;
  node.userData.lab.material.opacity = clamp(prog(t, 6.8, 7.3)) * (1 - prog(t, 10.4, 10.9));
  let pulse = 0;
  for (const up of uploads) {
    const dt = t - (up.t0 + LEG);
    if (dt > 0 && dt < 0.35) pulse = Math.max(pulse, 1 - dt / 0.35);
  }
  node.userData.core.material.emissiveIntensity = 1.2 + pulse * 2.5;
  node.userData.halo.material.opacity = 0.45 + pulse * 0.4;

  const sheetIn = prog(t, 6.6, 7.6);
  sheet.position.copy(SHEET_POS).lerp(LOGO_POS, collapse);
  sheet.scale.setScalar(Math.max(0.0001, (1 - collapse)));
  sheet.visible = sheetIn > 0 && collapse < 0.999;
  sheet.rotation.set(-0.08, lerp(-0.42, 0.0, eio(prog(t, 9.5, 12.6))), 0);
  sheet.userData.panel.scale.setScalar(Math.max(0.0001, back(prog(t, 6.6, 7.2))));
  for (const tile of tiles) {
    const { r, c, base } = tile.userData;
    const d = 6.85 + (r + c) * 0.035;
    const k = back(prog(t, d, d + 0.45));
    tile.scale.setScalar(Math.max(0.0001, k));
    tile.position.set(base.x, base.y, base.z + (1 - eout(prog(t, d, d + 0.45))) * 1.2);
  }
  sheet.userData.title.material.opacity = clamp(prog(t, 7.4, 7.9));
  sheet.userData.halo.material.opacity = 0.25 * clamp(prog(t, 7, 8));
  // row glow from arriving packets, active tab highlight
  const rowGlow = new Array(ROWS).fill(0);
  const tabGlow = new Array(5).fill(0);
  for (const up of uploads) {
    const dt = t - (up.t0 + 2 * LEG);
    if (dt > 0) {
      const g = Math.exp(-dt * 2.6);
      rowGlow[up.row] = Math.max(rowGlow[up.row], g);
      tabGlow[up.tab] = Math.max(tabGlow[up.tab], g);
    }
  }
  // Act 4 sync waves ripple through every row
  const wave = t > 10.8 ? (Math.sin((t - 10.8) * 5) * 0.5 + 0.5) : 0;
  for (let r = 1; r < ROWS; r++) {
    const w = t > 10.8 && t < 13 ? 0.35 * Math.max(0, Math.sin((t - 10.8) * 4 - r * 0.6)) : 0;
    const g = Math.max(rowGlow[r], w);
    rowMats[r].emissive.setRGB(0.25 * g, 1.5 * g, 0.75 * g);
    rowMats[r].color.setRGB(lerp(0.955, 0.75, g), lerp(0.945, 1.0, g), lerp(0.95, 0.82, g));
  }
  rowMats[0].emissiveIntensity = 1 + wave * 0.3;
  sheet.userData.tabs.forEach((s, i) => {
    s.material.opacity = clamp(prog(t, 7.6 + i * 0.08, 8.0 + i * 0.08)) * (0.55 + 0.45 * tabGlow[i]);
    s.scale.set(0.62 * (1 + tabGlow[i] * 0.12), 0.155 * (1 + tabGlow[i] * 0.12), 1);
  });
  rim2.intensity = 30 * clamp(prog(t, 6.8, 8.0)) * (1 - collapse);

  tubeA.material.opacity = 0.35 * clamp(prog(t, 6.5, 7.0)) * (1 - prog(t, 10.4, 10.9));
  tubeB.material.opacity = 0.35 * clamp(prog(t, 6.7, 7.2)) * (1 - prog(t, 10.4, 10.9));
  tubeA.visible = tubeA.material.opacity > 0.002;
  tubeB.visible = tubeB.material.opacity > 0.002;

  // ---- packets ----
  let pi = 0;
  const placePacket = (curve, p, color, scale = 1) => {
    const pk = getPacket(pi++);
    pk.visible = true;
    pk.userData.parts.forEach((s, k) => {
      const pp = clamp(p - k * 0.025);
      s.position.copy(curve.getPoint(pp));
      s.material.color.copy(color);
      s.material.opacity = (1 - k / TRAIL) * clamp(p * 6) * clamp((1 - p) * 8 + 0.3);
      s.scale.setScalar((0.34 * (1 - k / TRAIL) + 0.05) * scale);
    });
  };
  for (const up of uploads) {
    const p1 = prog(t, up.t0, up.t0 + LEG);
    const p2 = prog(t, up.t0 + LEG, up.t0 + 2 * LEG);
    if (t > up.t0 && t < up.t0 + LEG) placePacket(curveA, eio(p1), PINK);
    else if (t >= up.t0 + LEG && t < up.t0 + 2 * LEG) placePacket(curveB, eio(p2), GREEN);
  }
  // ---- Act 4: orbiting phones + two-way sync packets ----
  orbitPhones.forEach((ph, k) => {
    const kk = k + 1;
    const inn = back(prog(t, 10.7 + k * 0.15, 11.3 + k * 0.15));
    const pos = orbitPos(kk).lerp(LOGO_POS, collapse);
    ph.position.copy(pos);
    ph.scale.setScalar(Math.max(0.0001, inn * 0.85 * (1 - collapse)));
    setPhoneOpacity(ph, clamp(prog(t, 10.7 + k * 0.15, 11.0 + k * 0.15)) * (1 - collapse));
    ph.lookAt(camera.position.x, ph.position.y, camera.position.z);
    setScreen(ph, ph.userData.mat.uniforms.a.value, ph.userData.mat.uniforms.a.value, 0);
  });
  if (t > 11.0 && t < 13.1) {
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j < 3; j++) {
        const t0 = 11.0 + k * 0.17 + j * 0.62;
        const p = prog(t, t0, t0 + 0.6);
        if (p <= 0 || p >= 1) continue;
        const target = k === 0 ? phoneA.position.clone() : orbitPhones[k - 1].position.clone();
        const from = SHEET_POS.clone().add(v3(0, 0.2, 0));
        const toPhone = (j % 2 === 0);
        const curve = toPhone ? arc(from, target, 0.8) : arc(target, from, 0.8);
        placePacket(curve, eio(p), toPhone ? GREEN : PINK, 0.8);
      }
    }
  }
  for (let i = pi; i < packetPool.length; i++) packetPool[i].visible = false;

  // ---- Act 5: logo ----
  const lg = back(prog(t, 13.45, 14.25));
  logo.visible = lg > 0.001;
  logo.scale.setScalar(Math.max(0.0001, lg * 0.72));
  logo.rotation.y = lerp(-0.9, 0, eout(prog(t, 13.45, 14.6))) + Math.sin(t * 1.2) * 0.03;
  logo.userData.ringA.rotation.set(1.2 + t * 0.9, t * 0.5, 0);
  logo.userData.ringB.rotation.set(t * 0.6, 1.1 + t * 0.4, 0);
  logo.userData.ringA.material.opacity = 0.8 * clamp(prog(t, 13.8, 14.3));
  logo.userData.ringB.material.opacity = 0.6 * clamp(prog(t, 13.9, 14.4));
  logo.userData.halo.material.opacity = 0.5 + 0.3 * Math.exp(-Math.max(0, t - 13.5) * 3);

  // overlays
  renderBeats(t);
  const flash = Math.max(0, 1 - Math.abs(t - 13.5) / 0.22);
  document.getElementById("flash").style.opacity = (0.22 * flash * flash).toFixed(3);
  document.getElementById("bars").style.setProperty("--bar", `${Math.round(62 * eout(prog(t, 0, 0.7)))}px`);
  const fadeIn = eout(prog(t, 0, 0.35)), fadeOut = prog(t, 14.75, 15.0);
  document.getElementById("stage").style.filter = `brightness(${(fadeIn * (1 - 0.85 * fadeOut)).toFixed(3)})`;
  renderGrain(Math.round(t * 60));

  renderer.render(scene, camera);
}

const fontLoads = ["400 40px Inter", "600 64px Inter", "800 90px Inter", "900 200px Inter", "500 40px Grotesk", "700 92px Grotesk"].map((f) => document.fonts.load(f));
window.ready = Promise.all([...texPromises, ...fontLoads]).then(() => document.fonts.ready).then(() => {
  labelRedraws.forEach((d) => d());
  cardExceptions = card(T.exceptions, 1.05);
  cardDetail = card(T.detail, 1.0);
  render(0);
  return true;
});
window.renderAt = (t) => { render(t); return new Promise((r) => requestAnimationFrame(() => r(true))); };
