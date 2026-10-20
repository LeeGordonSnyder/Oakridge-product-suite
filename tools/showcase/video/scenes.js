"use strict";

/* Oakridge Product Suite: staff-meeting showcase, first cut (no narration).

   Every frame is a pure function of time: renderAt(t) lays out the whole
   stage for second t, so render.js can draw any frame in any order.
   Scenes are laid end to end on one timeline; each owns its elements and
   an update(localTime) that positions them. */

const W = 1920, H = 1080;
const PW = 433, PH = 892, SX = 20, SY = 74; // iPhone drawing: size, and where the app's screenshot starts inside it
const RECTS = window.RECTS || {};
const SHOT = (name) => `../screens/${name}.png`;
const SHEET = "../frames/sheets/deployment-full.png";

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const ease = {
  io: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  out: (x) => 1 - Math.pow(1 - x, 3),
  in: (x) => x * x * x,
  soft: (x) => 0.5 - Math.cos(Math.PI * x) / 2,
};
const fade = (lt, dur, a = 0.6, b = 0.6) => Math.min(ease.soft(prog(lt, 0, a)), ease.soft(1 - prog(lt, dur - b, dur)));

const stage = document.getElementById("stage");
function el(tag, cls, html, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
function style(e, s) { Object.assign(e.style, s); return e; }

/* ---------- building blocks ---------- */

// An iPhone with two stacked screenshots, so screens can crossfade.
function phone(parent) {
  const root = el("div", "iphone", `<div class="screen"><div class="island"></div><div class="status"><span>9:41</span><span class="bat"><i></i></span></div><div class="shots"><img><img></div><div class="off"></div><div class="home-bar"></div></div>`, parent);
  const [a, b] = root.querySelectorAll(".shots img");
  const off = root.querySelector(".off");
  return {
    root, off,
    show(from, to, mix) {
      if (a.dataset.src !== from) { a.src = SHOT(from); a.dataset.src = from; }
      if (b.dataset.src !== to) { b.src = SHOT(to); b.dataset.src = to; }
      b.style.opacity = mix;
    },
    dark(v) { off.style.opacity = v; },
  };
}

// Lines of text that rise in one after another and fade out together.
function text(parent, { x, y, w = 900, align = "left", lines }) {
  const box = style(el("div", "abs", "", parent), { left: x + "px", top: y + "px", width: w + "px", textAlign: align });
  if (align === "center") box.style.transform = "translateX(-50%)";
  const els = lines.map(([cls, html, extra]) => style(el("div", "line " + cls, html, box), extra || {}));
  return {
    box,
    at(lt, tIn, tOut, stagger = 0.18) {
      els.forEach((e, i) => {
        const p = ease.out(prog(lt, tIn + i * stagger, tIn + i * stagger + 0.8));
        const q = 1 - ease.soft(prog(lt, tOut, tOut + 0.5));
        e.style.opacity = p * q;
        e.style.transform = `translateY(${(1 - p) * 26}px)`;
      });
    },
  };
}

const SCENES = [];
let T = 0;
function scene(dur, build, overlap = 0) {
  const root = el("div", "scene", "", stage);
  const s = { start: T - overlap, dur, root };
  s.update = build(root, dur);
  SCENES.push(s);
  T = s.start + dur;
}

/* ---------- grey line drawings for the old ways (design box 1200 × 640) ---------- */

const G = { ink: "#636366", mid: "#8e8e93", light: "#c7c7cc", faint: "#d1d1d6" };
const ART = {
  wall: () => `
    <g id="sheets">${[0, 1, 2].map((i) => `
      <g transform="translate(${170 + i * 200} ${40 + (i % 2) * 14}) rotate(${[-3, 2, -1][i]})">
        <rect width="160" height="210" rx="3" fill="#fff" stroke="${G.mid}" stroke-width="2"/>
        <rect x="55" y="-10" width="50" height="20" fill="${G.faint}" opacity=".9"/>
        <line x1="18" y1="28" x2="110" y2="28" stroke="${G.mid}" stroke-width="5" stroke-linecap="round"/>
        ${[60, 85, 110, 135, 160, 185].map((yy) => `<line x1="18" y1="${yy}" x2="${100 + (yy % 40)}" y2="${yy}" stroke="${G.light}" stroke-width="5" stroke-linecap="round"/>`).join("")}
      </g>`).join("")}
    </g>
    <g id="jacket" transform="translate(800 70)" fill="none" stroke="${G.ink}" stroke-width="3" stroke-linejoin="round">
      <path d="M110 60 Q160 -10 210 60"/>
      <path d="M100 60 L50 90 L18 300 L50 306 L72 170 L74 380 L246 380 L248 170 L270 306 L302 300 L270 90 L220 60 Z"/>
      <line x1="160" y1="62" x2="160" y2="380"/>
      <rect x="98" y="250" width="40" height="44" rx="4"/><rect x="182" y="250" width="40" height="44" rx="4"/>
    </g>
    <g id="tagA" transform="translate(1012 210)"><path d="M0 0 h30 l12 14 l-12 14 h-30 z" fill="#fff" stroke="${G.ink}" stroke-width="3"/><circle cx="8" cy="14" r="3.5" fill="${G.ink}"/></g>
    <g id="tagB" transform="translate(940 92)"><path d="M0 0 h30 l12 14 l-12 14 h-30 z" fill="#fff" stroke="${G.ink}" stroke-width="3"/><circle cx="8" cy="14" r="3.5" fill="${G.ink}"/></g>
    <g id="cross" transform="translate(1050 70)" stroke="${G.ink}" stroke-width="5" stroke-linecap="round"><line x1="0" y1="0" x2="34" y2="34"/><line x1="34" y1="0" x2="0" y2="34"/></g>
    <text id="q" x="1120" y="200" font-family="Inter Display" font-size="110" font-weight="700" fill="${G.mid}">?</text>`,
  clipboard: () => `
    <g id="board" transform="translate(420 20)">
      <rect width="360" height="500" rx="18" fill="#fff" stroke="${G.ink}" stroke-width="3"/>
      <rect x="120" y="-18" width="120" height="44" rx="10" fill="#fff" stroke="${G.ink}" stroke-width="3"/>
      <rect x="30" y="50" width="300" height="420" rx="3" fill="#fff" stroke="${G.mid}" stroke-width="2"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `<line x1="50" y1="${90 + i * 36}" x2="310" y2="${90 + i * 36}" stroke="${G.light}" stroke-width="2"/>
        <line x1="58" y1="${80 + i * 36}" x2="${150 + (i * 37) % 90}" y2="${80 + i * 36}" stroke="${G.faint}" stroke-width="6" stroke-linecap="round"/>`).join("")}
      <g id="marks" stroke="${G.ink}" stroke-width="3" fill="none" stroke-linecap="round">
        <path d="M250 80 q10 -14 22 0"/><path d="M262 116 l8 8 l18 -20"/><path d="M248 188 q20 -16 34 4 q-14 10 -30 -4"/><path d="M256 260 l30 0"/><path d="M262 330 l8 8 l18 -20"/>
      </g>
    </g>
    <text id="q" x="840" y="320" font-family="Inter Display" font-size="140" font-weight="700" fill="${G.mid}">?</text>`,
  consol: () => {
    const sheet = (marks) => `
      <rect width="300" height="400" rx="4" fill="#fff" stroke="${G.mid}" stroke-width="2"/>
      <line x1="22" y1="36" x2="190" y2="36" stroke="${G.mid}" stroke-width="5" stroke-linecap="round"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<line x1="22" y1="${72 + i * 40}" x2="278" y2="${72 + i * 40}" stroke="${G.light}" stroke-width="2"/><line x1="30" y1="${90 + i * 40}" x2="${150 + (i * 29) % 70}" y2="${90 + i * 40}" stroke="${G.faint}" stroke-width="6" stroke-linecap="round"/>`).join("")}
      ${marks}`;
    return `
      <g id="s1" transform="translate(190 120) rotate(-9)">${sheet(`<g stroke="${G.ink}" stroke-width="3" fill="none" stroke-linecap="round"><path d="M220 84 l10 10 l20 -22"/><path d="M220 164 l10 10 l20 -22"/><path d="M214 124 l30 14 M214 138 l30 -14"/><path d="M220 284 l10 10 l20 -22"/></g>`)}</g>
      <g id="s2" transform="translate(470 80) rotate(3)">${sheet(`<g stroke="#3a3a3c" stroke-width="3" fill="none" stroke-dasharray="7 6"><ellipse cx="236" cy="130" rx="32" ry="15"/><ellipse cx="236" cy="250" rx="32" ry="15"/><path d="M22 205 C 90 198, 170 214, 282 202"/></g><text x="214" y="350" font-family="Inter" font-size="28" font-weight="700" fill="#48484a">2?</text>`)}</g>
      <g id="s3" transform="translate(760 130) rotate(11)">${sheet(`<g stroke="${G.mid}" stroke-width="4" fill="none" stroke-linecap="round"><path d="M220 90 h36"/><path d="M220 170 h36"/><path d="M220 210 h36"/><path d="M220 330 h36"/></g><text x="212" y="288" font-family="Inter" font-size="24" font-weight="600" font-style="italic" fill="${G.ink}">BOH</text>`)}</g>`;
  },
  receiving: () => {
    const icons = [
      `<rect x="-60" y="-80" width="120" height="160" rx="8" fill="#fff" stroke="currentColor" stroke-width="3"/>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => `<rect x="${-44 + i * 8}" y="20" width="${i % 3 ? 3 : 5}" height="40" fill="currentColor"/>`).join("")}<line x1="-44" y1="-50" x2="30" y2="-50" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><line x1="-44" y1="-28" x2="10" y2="-28" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>`,
      `<rect x="-70" y="-46" width="140" height="96" rx="14" fill="#fff" stroke="currentColor" stroke-width="3"/><rect x="-26" y="-62" width="52" height="18" rx="5" fill="#fff" stroke="currentColor" stroke-width="3"/><circle r="30" fill="none" stroke="currentColor" stroke-width="3"/><circle r="14" fill="none" stroke="currentColor" stroke-width="3"/>`,
      `<rect x="-90" y="-26" width="180" height="52" rx="26" fill="#fff" stroke="currentColor" stroke-width="3"/><circle cx="-56" cy="-4" r="11" fill="none" stroke="currentColor" stroke-width="3"/><line x1="-48" y1="4" x2="-40" y2="12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><line x1="-26" y1="0" x2="56" y2="0" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity=".4"/>`,
      `<rect x="-40" y="-40" width="80" height="80" rx="12" fill="#fff" stroke="currentColor" stroke-width="3"/><path d="M-20 0 l14 14 l28 -30" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<circle r="46" fill="#fff" stroke="currentColor" stroke-width="3"/><text y="14" text-anchor="middle" font-family="Inter Display" font-size="38" font-weight="700" fill="currentColor">LS</text>`,
    ];
    const labels = ["Label", "Photo", "Search", "Tick", "Initial"];
    return icons.map((ic, i) => `
      <g class="ri" transform="translate(${180 + i * 210} 260)" style="color:${G.mid}">${ic}
        <text y="130" text-anchor="middle" font-family="Inter" font-size="24" font-weight="600" fill="${G.mid}">${labels[i]}</text></g>
      ${i < 4 ? `<path d="M${180 + i * 210 + 90} 260 h30 m-10 -9 l10 9 l-10 9" fill="none" stroke="${G.light}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` : ""}`).join("") +
      `<g id="times" transform="translate(1110 120)"><circle r="54" fill="#fff" stroke="${G.ink}" stroke-width="3"/><text y="16" text-anchor="middle" font-family="Inter Display" font-size="44" font-weight="700" fill="${G.ink}">×2</text></g>`;
  },
  replen: () => `
    <g id="print" transform="translate(170 70) rotate(-4)">
      <rect width="300" height="420" rx="3" fill="#fff" stroke="${G.mid}" stroke-width="2"/>
      ${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<line x1="24" y1="${50 + i * 40}" x2="${170 + (i * 31) % 60}" y2="${50 + i * 40}" stroke="${G.faint}" stroke-width="6" stroke-linecap="round"/>`).join("")}
      <g stroke="${G.ink}" stroke-width="3" fill="none" stroke-linecap="round">${[0, 1, 3, 4, 6].map((i) => `<path d="M240 ${44 + i * 40} l8 8 l18 -20"/>`).join("")}</g>
    </g>
    <g id="wb" transform="translate(560 60)">
      <rect width="520" height="380" rx="10" fill="#fff" stroke="${G.ink}" stroke-width="3"/>
      <rect x="140" y="384" width="240" height="14" rx="4" fill="${G.faint}"/>
      <text x="36" y="76" font-family="Inter Display" font-size="56" font-weight="700" fill="${G.ink}">86</text>
      ${[0, 1, 2, 3].map((i) => `<path class="wl" d="M40 ${130 + i * 58} q60 -10 120 0 t120 0 t${100 + i * 20} 0" fill="none" stroke="${G.mid}" stroke-width="5" stroke-linecap="round"/>`).join("")}
      <ellipse id="wipe" cx="0" cy="210" rx="90" ry="70" fill="#fff" opacity=".95"/>
    </g>`,
  stopwatch: (r = 190) => `
    <g fill="none" stroke="${G.mid}" stroke-width="5"><circle r="${r}"/><rect x="-28" y="${-r - 60}" width="56" height="34" rx="8"/><line x1="0" y1="${-r - 26}" x2="0" y2="${-r}"/>
      <line x1="${r * 0.71}" y1="${-r * 0.84}" x2="${r * 0.84}" y2="${-r * 0.97}" stroke-linecap="round"/><circle r="${r - 22}" stroke="${G.faint}" stroke-width="2"/></g>`,
};
const art = (parent, key, { x, y, w, h }) => {
  const s = el("div", "abs", `<svg viewBox="0 0 1200 640" width="${w}" height="${h}" overflow="visible">${ART[key]()}</svg>`, parent);
  return style(s, { left: x + "px", top: y + "px" });
};
const q = (root, sel) => root.querySelector(sel);
const qa = (root, sel) => [...root.querySelectorAll(sel)];
const pop = (e, p, from = 0.6) => { e.style.opacity = p; e.style.transformBox = "fill-box"; e.style.transformOrigin = "center"; e.style.scale = lerp(from, 1, ease.out(p)); };

/* ============================ ACT 1 · the reveal ============================ */

scene(36, (root, dur) => {
  const glow = style(el("div", "abs", "", root), { inset: 0, background: "radial-gradient(ellipse at 50% 64%, #f5f5f7 0%, #fff 62%)" });
  const mods = ["Product Catalog", "Counts", "Consolidations", "Receiving", "Floor Stock"];
  const cards = mods.map((name, i) => el("div", "card", `<div class="n">0${i + 1}</div><div class="t display">${name}</div>`, root));
  const ph = phone(root);
  ph.root.style.transformOrigin = "50% 50%";
  ph.show("01-home", "01-home", 0);
  const t1 = text(root, { x: 960, y: 90, w: 1500, align: "center", lines: [["sub", "Every day, our floor runs on a dozen small jobs.", { color: "var(--ink)", fontSize: "42px" }]] });
  const words = ["Tags.", "Counts.", "Consols.", "Boxes.", "Replen."];
  const t2 = text(root, { x: 960, y: 84, w: 1500, align: "center", lines: [["h3 display", words.map((w) => `<span class="wd" style="display:inline-block;margin:0 14px">${w}</span>`).join("")]] });
  const wds = qa(t2.box, ".wd");
  const t3 = text(root, { x: 960, y: 70, w: 1600, align: "center", lines: [["sub", "Until now, each one had its own paper, its own wall, its own whiteboard.", { color: "var(--ink)", fontSize: "40px" }]] });
  const t4 = text(root, { x: 960, y: 720, w: 1600, align: "center", lines: [["h1 display", "Oakridge Product Suite"], ["sub", "Rebuilt for the floor.", { fontSize: "38px", marginTop: "18px" }]] });
  return (lt) => {
    root.style.opacity = fade(lt, dur, 0.01, 1.2);
    // the phone: top-down, slowly turning; sinks while the cards rise; stands up for the title
    const intro = ease.io(prog(lt, 1.5, 18));
    let r = lerp(-18, -6, intro), sc = lerp(0.8, 0.92, intro), cx = 960, cy = 600;
    const sink = ease.io(prog(lt, 18, 20.5));
    sc = lerp(sc, 0.74, sink); cy = lerp(cy, 690, sink);
    const up = ease.io(prog(lt, 26.5, 29.5));
    r = lerp(r, 0, up); sc = lerp(sc, 0.62, up); cy = lerp(cy, 400, up);
    style(ph.root, { left: cx - PW / 2 + "px", top: cy - PH / 2 + "px", transform: `rotate(${r}deg) scale(${sc})`, opacity: ease.soft(prog(lt, 1.5, 3.5)) });
    ph.dark(1 - ease.soft(prog(lt, 9, 10.2)));
    glow.style.opacity = 1 - up;
    // the five cards fan out of the phone, then fold back in
    cards.forEach((c, i) => {
      const k = i - 2;
      const out = ease.out(prog(lt, 18.6 + i * 0.22, 19.9 + i * 0.22));
      const back = ease.in(prog(lt, 26 + i * 0.1, 27.1 + i * 0.1));
      const p = out * (1 - back);
      const x = lerp(cx, 960 + k * 300, p), y = lerp(cy, 250 + Math.abs(k) * 46, p);
      style(c, { left: x - 130 + "px", top: y - 70 + "px", opacity: Math.min(1, p * 1.6), transform: `rotate(${k * 5 * p}deg) scale(${lerp(0.3, 1, p)})` });
    });
    t1.at(lt, 4, 9.4);
    t2.at(lt, 10.4, 17.2, 0);
    wds.forEach((w, i) => { const p = ease.out(prog(lt, 10.6 + i * 0.5, 11.3 + i * 0.5)); w.style.opacity = p; w.style.transform = `translateY(${(1 - p) * 20}px)`; });
    t3.at(lt, 20.6, 25.4);
    t4.at(lt, 29.6, dur - 1.4, 0.5);
  };
});

/* ============================ ACT 2 · the old ways ============================ */

function oldWay(dur, { key, kicker, title, sub, animate }) {
  scene(dur, (root) => {
    const a = art(root, key, { x: 150, y: 175, w: 1560, h: 832 });
    const k = text(root, { x: 160, y: 96, lines: [["kicker grey", kicker]] });
    const tx = text(root, { x: 960, y: 812, w: 1700, align: "center", lines: [["h2 display", title, { color: "#3a3a3c" }], ["sub", sub, { marginTop: "12px" }]] });
    return (lt) => {
      root.style.opacity = fade(lt, dur);
      a.style.opacity = ease.soft(prog(lt, 0.2, 1.2));
      a.style.transform = `translateY(${(1 - ease.out(prog(lt, 0.2, 1.4))) * 30}px)`;
      animate(a, lt);
      k.at(lt, 0.4, dur - 0.7);
      tx.at(lt, 1.6, dur - 0.7, 0.35);
    };
  });
}
oldWay(9.5, {
  key: "wall", kicker: "Tag look-up · the old way", title: "Rules on a wall.",
  sub: "Exceptions spread by word of mouth. A wrong guess meant retagging, or damaged product.",
  animate: (a, lt) => {
    qa(a, "#sheets > g").forEach((g, i) => pop(g, ease.out(prog(lt, 0.4 + i * 0.25, 1.2 + i * 0.25)), 0.9));
    pop(q(a, "#jacket"), ease.out(prog(lt, 1.2, 2)), 0.95);
    pop(q(a, "#tagA"), ease.out(prog(lt, 2.6, 3.1)));
    pop(q(a, "#tagB"), ease.out(prog(lt, 3.6, 4.1)));
    pop(q(a, "#q"), ease.out(prog(lt, 4.4, 4.9)));
    pop(q(a, "#cross"), ease.out(prog(lt, 5.6, 6.1)));
  },
});
oldWay(9, {
  key: "clipboard", kicker: "Inventory audits · the old way", title: "Counts on paper.",
  sub: "Or from memory. Lose the sheet, and nobody knows when it was last counted.",
  animate: (a, lt) => {
    qa(a, "#marks path").forEach((p, i) => (p.style.opacity = prog(lt, 1.6 + i * 0.4, 2 + i * 0.4)));
    const lost = ease.io(prog(lt, 5, 6.2));
    q(a, "#board").style.opacity = 1 - 0.75 * lost;
    q(a, "#board").style.transform = `translate(420px, ${20 + lost * 30}px) rotate(${lost * 8}deg)`;
    pop(q(a, "#q"), ease.out(prog(lt, 5.8, 6.4)));
  },
});
oldWay(9.5, {
  key: "consol", kicker: "Consolidations · the old way", title: "Three paper copies.",
  sub: "None of them update each other. Lose one, and you check it all over again.",
  animate: (a, lt) => ["#s1", "#s2", "#s3"].forEach((s, i) => (q(a, s).style.opacity = ease.out(prog(lt, 0.4 + i * 0.6, 1.2 + i * 0.6)))),
});
oldWay(9.5, {
  key: "receiving", kicker: "Receiving · the old way", title: "Every box, by hand. Twice.",
  sub: "Copy each barcode in. Then photograph, scan, search, tick and initial, and again for MAO.",
  animate: (a, lt) => {
    const ri = qa(a, ".ri");
    const step = Math.floor(Math.max(0, lt - 1.2) / 0.5) % 5;
    ri.forEach((g, i) => (g.style.color = lt > 1.2 && i === step ? "#1d1d1f" : G.mid));
    pop(q(a, "#times"), ease.out(prog(lt, 4.6, 5.2)));
  },
});
oldWay(9, {
  key: "replen", kicker: "Floor replen & the 86 board · the old way", title: "Printouts and a whiteboard.",
  sub: "The 86 board sits out of sight in the back, and things get wiped off it.",
  animate: (a, lt) => {
    const w = prog(lt, 4.6, 6.4);
    q(a, "#wipe").setAttribute("cx", lerp(-120, 640, ease.io(w)));
    q(a, "#wipe").style.opacity = w > 0 && w < 1 ? 0.95 : 0;
    qa(a, ".wl").forEach((l, i) => (l.style.opacity = i === 1 || i === 2 ? 1 - 0.85 * ease.soft(prog(lt, 5 + i * 0.25, 5.8 + i * 0.25)) : 1));
  },
});
scene(5.5, (root, dur) => {
  const keys = ["wall", "clipboard", "consol", "receiving", "replen"];
  const minis = keys.map((k) => art(root, k, { x: 0, y: 0, w: 520, h: 277 }));
  const tx = text(root, { x: 960, y: 640, w: 1500, align: "center", lines: [["h2 display", "It got done. The hard way.", { color: "#3a3a3c" }]] });
  return (lt) => {
    root.style.opacity = fade(lt, dur, 0.5, 0.8);
    const g = ease.io(prog(lt, 0.6, 2.2));
    minis.forEach((m, i) => {
      const k = i - 2;
      const x = lerp(960 + k * 360, 960 + k * 40, g) - 260, y = lerp(330, 360 + Math.abs(k) * 8, g) - 138;
      style(m, { left: x + "px", top: y + "px", opacity: lerp(1, 0.8, g), transform: `scale(${lerp(0.72, 0.9, g)}) rotate(${k * 6 * g}deg)` });
    });
    tx.at(lt, 2.2, dur - 0.8);
  };
});

/* ============================ ACT 3 · before / now ============================ */

function versus(dur, { key, before, now, screen, line, special }) {
  scene(dur, (root) => {
    const left = style(el("div", "abs", "", root), { left: 0, top: 0, width: "960px", height: "1080px", background: "var(--paper)" });
    const a = key ? art(left, key, { x: 20, y: 250, w: 920, h: 491 }) : null;
    const cb = text(root, { x: 480, y: 96, w: 900, align: "center", lines: [["caption", "Before"], ["sub", before, { marginTop: "8px" }]] });
    const cn = text(root, { x: 1440, y: 96, w: 900, align: "center", lines: [["caption", "Now", { color: "var(--accent)" }], ["sub", now, { marginTop: "8px" }]] });
    const ph = phone(root);
    ph.show(screen, screen, 0);
    ph.dark(0);
    const bottom = line ? text(root, { x: 960, y: 950, w: 1800, align: "center", lines: [["h3 display", line, { fontSize: "54px" }]] }) : null;
    const sp = special ? special(root, left) : null;
    return (lt) => {
      root.style.opacity = fade(lt, dur);
      const li = ease.out(prog(lt, 0, 0.9));
      left.style.transform = `translateX(${(li - 1) * 120}px)`;
      if (a) a.style.opacity = lerp(1, 0.5, ease.soft(prog(lt, 2.6, 3.4)));
      const pi = ease.out(prog(lt, 0.6, 1.7));
      const s = 0.8;
      style(ph.root, { left: 1440 - (PW * s) / 2 + "px", top: lerp(260, 200, pi) + "px", transform: `scale(${s})`, opacity: pi });
      cb.at(lt, 0.3, dur - 0.7);
      cn.at(lt, 1, dur - 0.7);
      if (bottom) bottom.at(lt, 2.4, dur - 0.7);
      if (sp) sp(lt, ph);
    };
  });
}
versus(7.5, { key: "wall", before: "Rules on a wall, and word of mouth.", now: "Scan it. The tag spot is right there.", screen: "04-catalog-detail", line: "One answer, for everyone." });
versus(7.5, { key: "clipboard", before: "Paper lists that get lost.", now: "Every count logged, with who and when.", screen: "08-counts-list", line: "Every count, on record." });
versus(7.5, { key: "consol", before: "Three copies that never match.", now: "One list everyone shares, live.", screen: "09-consol-list", line: "One list. Always current." });
versus(17, {
  key: null, before: "Copy, find, tick, initial. Box by box.", now: "Paste once. Scan the boxes.", screen: "14-receiving-scan",
  special: (root, left) => {
    const sw = el("div", "abs", `<svg width="600" height="600" viewBox="-300 -300 600 600" overflow="visible">${ART.stopwatch()}</svg>`, left);
    style(sw, { left: "180px", top: "260px" });
    const lnum = style(el("div", "abs stopwatch-num", "0:00", left), { left: "180px", top: "500px", width: "600px", textAlign: "center", fontSize: "120px", color: "#636366" });
    const rnum = style(el("div", "abs stopwatch-num", "0:00", root), { left: "1500px", top: "470px", width: "380px", textAlign: "center", fontSize: "140px", color: "var(--ink)" });
    const units = style(el("div", "abs", "min : sec", root), { left: "1500px", top: "640px", width: "380px", textAlign: "center", fontSize: "26px", fontWeight: 500, color: "var(--ink-2)" });
    const tx = text(root, { x: 960, y: 916, w: 1800, align: "center", lines: [["h2 display", `Same 5 boxes. <span style="color:var(--accent)">68% less time.</span>`, { fontSize: "64px" }], ["caption", "In testing · expected list + physically received", { marginTop: "14px" }]] });
    const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    return (lt, ph) => {
      // both clocks start together; 8 seconds of screen time stand for 3:25
      const k = prog(lt, 2, 10) * 205;
      lnum.textContent = mmss(k);
      rnum.textContent = mmss(Math.min(k, 66));
      const done = ease.out(prog(lt, 2 + (8 * 66) / 205, 2.6 + (8 * 66) / 205));
      rnum.style.color = done > 0 ? "var(--accent)" : "var(--ink)";
      rnum.style.transform = `scale(${1 + 0.08 * Math.sin(done * Math.PI)})`;
      units.style.opacity = rnum.style.opacity = ease.soft(prog(lt, 1.2, 2));
      style(ph.root, { left: "1010px", top: lerp(260, 200, ease.out(prog(lt, 0.6, 1.7))) + "px", transform: "scale(.74)" });
      tx.at(lt, 10.6, 16.3, 0.5);
    };
  },
});
versus(7.5, { key: "replen", before: "A whiteboard in the back.", now: "The 86 Board, on every phone.", screen: "20-floor-86", line: "Nothing gets wiped off." });
scene(8.5, (root, dur) => {
  const tx = text(root, { x: 960, y: 300, w: 1800, align: "center", lines: [
    ["caption", "In testing"],
    ["h2 display", `~41s per box &nbsp;→&nbsp; <span style="color:var(--accent)">~13s per box</span>`, { marginTop: "22px" }],
    ["sub", "On a 60-box shipment, that's about", { marginTop: "54px" }],
    ["h1 display", "28 minutes saved", { marginTop: "6px" }],
    ["sub", "per store, per shipment, before counting the MAO step.", { marginTop: "14px" }],
  ] });
  return (lt) => { root.style.opacity = fade(lt, dur); tx.at(lt, 0.3, dur - 0.8, 0.45); };
});

/* ============================ ACT 4 · each function, up close ============================ */

function sectionCard(num, title) {
  scene(3.4, (root, dur) => {
    const tx = text(root, { x: 960, y: 420, w: 1600, align: "center", lines: [["kicker", num, { fontSize: "30px", letterSpacing: ".1em" }], ["h1 display", title, { marginTop: "12px" }]] });
    return (lt) => { root.style.opacity = fade(lt, dur, 0.4, 0.5); tx.at(lt, 0.1, dur - 0.7, 0.15); };
  });
}

// Camera on an iPhone at the left: each step shows a screen, either whole or
// zoomed onto its focus box (sharp) with the rest blurred, and a text panel
// on the right. The camera eases from one step's framing to the next.
const HOME_CENTER = { x: 640, y: 540 };
function framing(step) {
  if (!step.focus) return { z: 1, px: PW / 2, py: PH / 2, clip: [0, 0, 0, 0], blur: 0 };
  const r = RECTS[step.screen] || { x: 16, y: 200, w: 361, h: 200 };
  const pad = 12;
  const z = clamp(Math.min(860 / (r.w + 40), 720 / (r.h + 40)), 1.3, 2.5);
  const x0 = SX + r.x - pad, y0 = SY + r.y - pad, x1 = SX + r.x + r.w + pad, y1 = SY + Math.min(r.y + r.h, 852 - 54) + pad;
  return { z, px: (x0 + x1) / 2, py: (y0 + y1) / 2, clip: [(y0 / PH) * 100, (1 - x1 / PW) * 100, (1 - y1 / PH) * 100, (x0 / PW) * 100], blur: 7 };
}
function deepDive(steps) {
  const dur = steps.reduce((n, s) => n + s.dur, 0);
  scene(dur, (root) => {
    const rig = style(el("div", "abs", "", root), { left: 0, top: 0, transformOrigin: "0 0" });
    const soft = phone(rig), sharp = phone(rig);
    soft.dark(0); sharp.dark(0);
    sharp.root.style.boxShadow = "none";
    const texts = [];
    steps.forEach((s, i) => {
      const prev = texts[texts.length - 1];
      if (prev && prev.key === s.text) { prev.end += s.dur; return; }
      const t0 = steps.slice(0, i).reduce((n, x) => n + x.dur, 0);
      texts.push({ key: s.text, start: t0, end: t0 + s.dur, t: text(root, { x: 1180, y: 330, w: 640, lines: [["kicker", s.text[0]], ["h3 display", s.text[1], { marginTop: "18px" }], ["sub", s.text[2], { marginTop: "24px" }]] }) });
    });
    const starts = steps.map((_, i) => steps.slice(0, i).reduce((n, x) => n + x.dur, 0));
    return (lt) => {
      root.style.opacity = fade(lt, dur, 0.5, 0.6);
      let i = starts.findIndex((st, k) => lt >= st && lt < st + steps[k].dur);
      if (i < 0) i = steps.length - 1;
      const s = steps[i], prev = steps[Math.max(0, i - 1)];
      const l = lt - starts[i];
      const A = i === 0 ? { ...framing(s), z: 0.9 } : framing(prev), B = framing(s);
      const p = ease.io(prog(l, 0, i === 0 ? 1.4 : 1.3));
      const z = lerp(A.z, B.z, p), px = lerp(A.px, B.px, p), py = lerp(A.py, B.py, p), blur = lerp(A.blur, B.blur, p);
      const clip = A.clip.map((v, k) => lerp(v, B.clip[k], p));
      rig.style.transform = `translate(${HOME_CENTER.x - px * z}px, ${HOME_CENTER.y - py * z}px) scale(${z})`;
      const from = i === 0 ? s.screen : prev.screen, mix = from === s.screen ? 1 : ease.soft(prog(l, 0.05, 0.35));
      soft.show(from, s.screen, mix); sharp.show(from, s.screen, mix);
      soft.root.style.filter = `blur(${blur}px) saturate(${1 - blur / 18})`;
      soft.root.style.opacity = blur > 0.05 ? lerp(1, 0.55, blur / 7) : 1;
      sharp.root.style.clipPath = `inset(${clip[0]}% ${clip[1]}% ${clip[2]}% ${clip[3]}% round ${lerp(68, 30, blur / 7) / z}px)`;
      sharp.root.style.visibility = blur > 0.05 ? "visible" : "hidden";
      texts.forEach((x) => x.t.at(lt, x.start + 0.5, x.end - (x.end >= dur - 0.01 ? 0.9 : 0.5)));
    };
  });
}

sectionCard("", "Home");
deepDive([
  { screen: "01-home", focus: false, dur: 5.5, text: ["Home", "What needs attention, first.", "It opens on the day's exceptions and this week's numbers, not a menu."] },
  { screen: "02-home-exceptions", focus: true, dur: 8, text: ["Home", "Problems find you.", "Boxes not yet in MAO, counts outside tolerance, replen that's stalled, each with a button to fix it."] },
]);

sectionCard("01", "Product Catalog");
deepDive([
  { screen: "03-catalog-search", focus: false, dur: 6, text: ["Product Catalog", "Scan or search anything.", "Every product, every size, from one search."] },
  { screen: "04-catalog-detail", focus: true, dur: 9, text: ["Product Catalog", "Where the tag goes.", "The hard-tag spot for every product, so nobody has to guess."] },
  { screen: "05-catalog-assign", focus: true, dur: 9, text: ["Product Catalog", "Decided once. Shared instantly.", "When a product breaks the rules, a lead picks the spot, and every phone shows it. No retagging."] },
]);

sectionCard("02", "Counts");
deepDive([
  { screen: "06-count-active", focus: true, dur: 8.5, text: ["Counts", "Scan. Count. Done.", "Confirm what's expected, enter what's there."] },
  { screen: "07-counts-flagged", focus: true, dur: 8, text: ["Counts", "Off counts stand out.", "More than 2 units or 5% off is flagged until it's recounted."] },
  { screen: "08-counts-list", focus: true, dur: 8, text: ["Counts", "Every count, on record.", "Who counted, when, and what they found, saved to the sheet."] },
]);

sectionCard("03", "Consolidations");
scene(10, (root, dur) => {
  const phones = [0, 1, 2].map(() => { const p = phone(root); p.show("09-consol-list", "09-consol-list", 0); p.dark(0); return p; });
  const rings = phones.map(() => style(el("div", "abs", "", root), { border: "4px solid var(--accent)", borderRadius: "14px" }));
  const tx = text(root, { x: 960, y: 900, w: 1700, align: "center", lines: [["h3 display", "Floor and back of house, on one list."], ["sub", "Count a line on one phone, and it updates on the others.", { marginTop: "14px" }]] });
  const r = RECTS["09-consol-list"] || { x: 16, y: 325, w: 361, h: 113 };
  const s = 0.68;
  return (lt) => {
    root.style.opacity = fade(lt, dur);
    phones.forEach((p, i) => {
      const k = i - 1, rise = ease.out(prog(lt, 0.2 + i * 0.2, 1.3 + i * 0.2));
      const x = 960 + k * 480 - (PW * s) / 2, y = lerp(120, 60, rise);
      style(p.root, { left: x + "px", top: y + "px", transform: `scale(${s})`, opacity: rise });
      const pulse = prog(lt, 2.6 + i * 0.45, 3.4 + i * 0.45), on = Math.sin(pulse * Math.PI);
      style(rings[i], { left: x + (SX + r.x - 6) * s + "px", top: y + (SY + r.y - 6) * s + "px", width: (r.w + 12) * s + "px", height: (r.h + 12) * s + "px", opacity: lt > 2.6 + i * 0.45 ? Math.max(on, prog(lt, 4.6, 5)) * (1 - prog(lt, dur - 1, dur - 0.5)) : 0 });
    });
    tx.at(lt, 1.6, dur - 0.7, 0.35);
  };
});
deepDive([
  { screen: "09-consol-list", focus: true, dur: 8.5, text: ["Consolidations", "Count as you pull.", "Tap + for every piece. Finished lines go to Holding, then one tap updates the sheet."] },
  { screen: "11-consol-mao", focus: true, dur: 8.5, text: ["Consolidations", "Close the box, everywhere.", "Every closed box is logged, with a reminder to close it in MAO too."] },
]);

sectionCard("04", "Receiving");
deepDive([
  { screen: "13-receiving-paste", focus: true, dur: 8.5, text: ["Receiving", "Paste the whole shipment.", "Copy MAO's Receive Inventory page and paste. Every box, already under its PO."] },
  { screen: "14-receiving-scan", focus: false, dur: 7.5, text: ["Receiving", "Scan the boxes as they land.", "Each label scanned is a box held, ready to mark physically received."] },
  { screen: "16-receiving-awaiting", focus: true, dur: 9, text: ["Receiving", "Nothing slips through.", "Boxes on the shelf but not yet in MAO stay on screen until they are. Hold all, mark them in one tap."] },
]);
scene(6.5, (root, dur) => {
  const tx = text(root, { x: 960, y: 360, w: 1800, align: "center", lines: [["caption", "In testing"], ["h1 display", `3:25 &nbsp;→&nbsp; <span style="color:var(--accent)">1:06</span>`, { marginTop: "18px", fontVariantNumeric: "tabular-nums" }], ["sub", "Same five boxes, logged as expected and physically received.", { marginTop: "20px" }]] });
  return (lt) => { root.style.opacity = fade(lt, dur); tx.at(lt, 0.3, dur - 0.8, 0.35); };
});

sectionCard("05", "Floor Stock");
deepDive([
  { screen: "17-floor-check", focus: true, dur: 8.5, text: ["Floor Stock", "One line per style.", "Check the floor for each style and colour that sold. Not every size, one line."] },
  { screen: "18-floor-sizes", focus: true, dur: 8, text: ["Floor Stock", "Pick the missing sizes.", "Tap what's needed, and it lands on the pick list."] },
  { screen: "19-floor-replen", focus: true, dur: 8, text: ["Floor Stock", "Picked, or out of stock.", "Pull it from the back, or send it to the 86 Board."] },
  { screen: "20-floor-86", focus: true, dur: 8, text: ["Floor Stock", "An 86 Board everyone sees.", "Out of stock lives on every phone, not a whiteboard in the back."] },
]);

/* ============================ ACT 5 · behind it all ============================ */

scene(19, (root, dur) => {
  const mon = el("div", "monitor", `<div class="panel"><div class="glass"><img src="${SHEET}"></div></div><div class="neck"></div><div class="foot"></div>`, root);
  const shade = style(el("div", "abs", "", root), { left: 0, right: 0, bottom: 0, height: "260px", background: "linear-gradient(rgba(255,255,255,0), #fff 55%)" });
  const cap = text(root, { x: 960, y: 40, w: 1200, align: "center", lines: [["caption", "Behind it all"]] });
  const t1 = text(root, { x: 960, y: 940, w: 1800, align: "center", lines: [["sub", "One shared Google Sheet, on any computer.", { color: "var(--ink)", fontSize: "40px" }]] });
  const t2 = text(root, { x: 960, y: 940, w: 1800, align: "center", lines: [["sub", "For managers: the day's deployment builds itself from When I Work.", { color: "var(--ink)", fontSize: "40px" }]] });
  const t3 = text(root, { x: 960, y: 940, w: 1800, align: "center", lines: [["sub", "Paste the MAO sales report, and the Hourly Tracker fills itself in.", { color: "var(--ink)", fontSize: "40px" }]] });
  // the glass: 1164 px wide showing a 1920 × 1200 screenshot
  const G0 = { x: 18, y: 18, k: 1164 / 1920 };
  const look = (ix, iy, z) => ({ z, tx: 960 - (G0.x + ix * G0.k) * z, ty: 470 - (G0.y + iy * G0.k) * z });
  const shots = [{ z: 0.9, tx: 420, ty: 104 }, look(900, 320, 1.75), look(860, 700, 1.6)];
  return (lt) => {
    root.style.opacity = fade(lt, dur);
    const a = ease.io(prog(lt, 5.5, 7.5)), b = ease.io(prog(lt, 12, 14));
    const k = (f) => lerp(lerp(shots[0][f], shots[1][f], a), shots[2][f], b);
    const rise = ease.out(prog(lt, 0.2, 1.6));
    mon.style.transform = `translate(${k("tx")}px, ${k("ty") + (1 - rise) * 40}px) scale(${k("z")})`;
    mon.style.opacity = rise;
    shade.style.opacity = a;
    cap.at(lt, 0.6, 5.2);
    t1.at(lt, 1.2, 5.3);
    t2.at(lt, 7.4, 11.8);
    t3.at(lt, 14, dur - 0.8);
  };
});
deepDive([
  { screen: "01-home", focus: false, dur: 4, text: ["Your shift", "Your day, on your phone.", "Built from When I Work every morning."] },
  { screen: "01-home", focus: true, dur: 9, text: ["Your shift", "Roles, breaks, and when you're done.", "Your whole shift at a glance, with a marker for right now. If a lead moves your break, your phone shows it."] },
]);

/* ============================ ACT 6 · close ============================ */

scene(16, (root, dur) => {
  const ph = phone(root);
  ph.root.style.transformOrigin = "50% 50%";
  ph.show("01-home", "01-home", 0); ph.dark(0);
  const tx = text(root, { x: 960, y: 760, w: 1600, align: "center", lines: [["h1 display", "Oakridge Product Suite"], ["sub", "Rebuilt for the floor.", { fontSize: "38px", marginTop: "18px" }]] });
  return (lt) => {
    root.style.opacity = fade(lt, dur, 0.8, 2);
    const p = ease.io(prog(lt, 0, 7));
    style(ph.root, { left: 960 - PW / 2 + "px", top: lerp(560, 400, p) - PH / 2 + "px", transform: `rotate(${lerp(-10, 0, p)}deg) scale(${lerp(0.95, 0.62, p)})` });
    tx.at(lt, 5.5, dur + 5, 0.5);
  };
});

window.DURATION = T;
window.renderAt = function (t) {
  for (const s of SCENES) {
    const on = t >= s.start && t < s.start + s.dur;
    s.root.style.display = on ? "block" : "none";
    if (on) s.update(t - s.start);
  }
};
window.ready = Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]);
renderAt(0);
