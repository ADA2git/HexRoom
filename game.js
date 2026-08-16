"use strict";

/* Hexroom — core logic + rendering. Works in browser and Node (tests). */

const SQRT3 = Math.sqrt(3);
const RADIUS = 4;
const NEIGHBORS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

function hexKey(q, r) {
  return q + "," + r;
}

function parseKey(k) {
  const i = k.indexOf(",");
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))];
}

function hexRound(q, r) {
  let s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}

function axialToPixel(q, r, size) {
  const x = size * (SQRT3 * q + (SQRT3 / 2) * r);
  const y = size * (1.5 * r);
  return [x, y];
}

function pixelToAxial(x, y, size) {
  const q = ((SQRT3 / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return hexRound(q, r);
}

function rotate60(q, r) {
  return [-r, q + r];
}

function centroid(cells) {
  let q = 0;
  let r = 0;
  for (let i = 0; i < cells.length; i++) {
    q += cells[i][0];
    r += cells[i][1];
  }
  const n = cells.length || 1;
  return [q / n, r / n];
}

function rotateCells(cells) {
  const c = centroid(cells);
  const pq = hexRound(c[0], c[1]);
  const out = new Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const rel = rotate60(cells[i][0] - pq[0], cells[i][1] - pq[1]);
    out[i] = [rel[0] + pq[0], rel[1] + pq[1]];
  }
  return out;
}

function normalizeCells(cells) {
  const c = centroid(cells);
  const p = hexRound(c[0], c[1]);
  const out = new Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    out[i] = [cells[i][0] - p[0], cells[i][1] - p[1]];
  }
  return out;
}

function orientationKey(cells) {
  const n = normalizeCells(cells);
  const parts = new Array(n.length);
  for (let i = 0; i < n.length; i++) parts[i] = n[i][0] + ":" + n[i][1];
  parts.sort();
  return parts.join("|");
}

function uniqueOrientations(cells) {
  const seen = new Set();
  const orients = [];
  let cur = cells.map(function (c) { return [c[0], c[1]]; });
  for (let i = 0; i < 6; i++) {
    const k = orientationKey(cur);
    if (!seen.has(k)) {
      seen.add(k);
      orients.push(normalizeCells(cur));
    }
    cur = rotateCells(cur);
  }
  return orients;
}

function inBoard(q, r, radius) {
  const R = radius == null ? RADIUS : radius;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= R;
}

function allBoardCells(radius) {
  const R = radius == null ? RADIUS : radius;
  const cells = [];
  for (let q = -R; q <= R; q++) {
    for (let r = -R; r <= R; r++) {
      if (inBoard(q, r, R)) cells.push([q, r]);
    }
  }
  return cells;
}

function lineCells(axis, value, radius) {
  const cells = allBoardCells(radius);
  const out = [];
  for (let i = 0; i < cells.length; i++) {
    const q = cells[i][0];
    const r = cells[i][1];
    const s = -q - r;
    if (axis === "q" && q === value) out.push(cells[i]);
    else if (axis === "r" && r === value) out.push(cells[i]);
    else if (axis === "s" && s === value) out.push(cells[i]);
  }
  return out;
}

function allLines(radius) {
  const R = radius == null ? RADIUS : radius;
  const lines = [];
  for (let v = -R; v <= R; v++) {
    lines.push({ axis: "q", value: v, cells: lineCells("q", v, R) });
    lines.push({ axis: "r", value: v, cells: lineCells("r", v, R) });
    lines.push({ axis: "s", value: v, cells: lineCells("s", v, R) });
  }
  return lines;
}

const ALL_LINES = allLines(RADIUS);
const ALL_CELLS = allBoardCells(RADIUS);

function createBoard(radius) {
  const R = radius == null ? RADIUS : radius;
  const filled = new Map();
  const lines = R === RADIUS ? ALL_LINES : allLines(R);
  return {
    radius: R,
    filled: filled,
    isFilled: function (q, r) {
      return filled.has(hexKey(q, r));
    },
    isEmpty: function (q, r) {
      return inBoard(q, r, R) && !filled.has(hexKey(q, r));
    },
    set: function (q, r, color) {
      filled.set(hexKey(q, r), color);
    },
    get: function (q, r) {
      return filled.get(hexKey(q, r));
    },
    clear: function (q, r) {
      filled.delete(hexKey(q, r));
    },
    emptyCells: function () {
      const cells = R === RADIUS ? ALL_CELLS : allBoardCells(R);
      const out = [];
      for (let i = 0; i < cells.length; i++) {
        if (!filled.has(hexKey(cells[i][0], cells[i][1]))) out.push(cells[i]);
      }
      return out;
    },
    lines: lines,
  };
}

function canPlaceOnBoard(board, cells) {
  if (!cells || !cells.length) return false;
  const empties = board.emptyCells();
  const oq = cells[0][0];
  const or_ = cells[0][1];
  for (let e = 0; e < empties.length; e++) {
    const dq = empties[e][0] - oq;
    const dr = empties[e][1] - or_;
    let ok = true;
    for (let i = 0; i < cells.length; i++) {
      if (!board.isEmpty(cells[i][0] + dq, cells[i][1] + dr)) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function canPlaceAnyRotation(board, cells) {
  let cur = cells;
  for (let i = 0; i < 6; i++) {
    if (canPlaceOnBoard(board, cur)) return true;
    cur = rotateCells(cur);
  }
  return false;
}

function findFullLines(board) {
  const lines = board.lines;
  const full = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.cells;
    if (!cells.length) continue;
    let ok = true;
    for (let j = 0; j < cells.length; j++) {
      if (!board.isFilled(cells[j][0], cells[j][1])) {
        ok = false;
        break;
      }
    }
    if (ok) full.push(line);
  }
  return full;
}

function applyClear(board, lines) {
  const cleared = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].cells;
    for (let j = 0; j < cells.length; j++) {
      const k = hexKey(cells[j][0], cells[j][1]);
      if (!seen.has(k)) {
        seen.add(k);
        board.clear(cells[j][0], cells[j][1]);
        cleared.push([cells[j][0], cells[j][1]]);
      }
    }
  }
  return cleared;
}

function scorePlacement(cellCount, lines, streak) {
  const placeScore = cellCount * 10;
  let clearRaw = 0;
  for (let i = 0; i < lines.length; i++) {
    clearRaw += 100 * lines[i].cells.length;
  }
  if (lines.length > 1) {
    clearRaw += 50 * lines.length * lines.length;
  }
  const mult = 1 + streak * 0.25;
  const clearScore = Math.round(clearRaw * mult);
  return {
    placeScore: placeScore,
    clearScore: clearScore,
    multiplier: mult,
    total: placeScore + clearScore,
  };
}

function hex7Cells() {
  const cells = [];
  for (let q = -1; q <= 1; q++) {
    for (let r = -1; r <= 1; r++) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= 1) {
        cells.push([q, r]);
      }
    }
  }
  return cells;
}

const SHAPES = [
  { id: "mono", name: "Dot", cells: [[0, 0]], color: "#f5c542" },
  { id: "bar2", name: "Duo", cells: [[0, 0], [1, 0]], color: "#2ee6d6" },
  { id: "bar3", name: "Bar", cells: [[0, 0], [1, 0], [2, 0]], color: "#3dde7b" },
  { id: "bar4", name: "Long", cells: [[0, 0], [1, 0], [2, 0], [3, 0]], color: "#4d8eff" },
  { id: "bar5", name: "Lance", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], color: "#ff4d6d" },
  { id: "v3", name: "Chevron", cells: [[0, 0], [1, 0], [0, -1]], color: "#c44dff" },
  { id: "tri3", name: "Triad", cells: [[0, 0], [1, 0], [0, 1]], color: "#ff8c32" },
  { id: "diamond4", name: "Diamond", cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: "#ff4db8" },
  { id: "l4", name: "Hook", cells: [[0, 0], [1, 0], [2, 0], [0, 1]], color: "#a3e635" },
  { id: "p4", name: "Pebble", cells: [[0, 0], [1, 0], [2, 0], [1, -1]], color: "#22d3ee" },
  { id: "y4", name: "Branch", cells: [[0, 0], [1, 0], [-1, 1], [0, -1]], color: "#f472b6" },
  { id: "l5", name: "L-hex", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1]], color: "#fb7185" },
  { id: "p5", name: "P-hex", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]], color: "#818cf8" },
  { id: "hex7", name: "Jewel", cells: hex7Cells(), color: "#f0d78c" },
];

const SHAPE_BY_ID = {};
for (let i = 0; i < SHAPES.length; i++) {
  SHAPES[i].colorIndex = i;
  SHAPE_BY_ID[SHAPES[i].id] = SHAPES[i];
}

const POOL = [];
function addToPool(id, n) {
  const s = SHAPE_BY_ID[id];
  for (let i = 0; i < n; i++) POOL.push(s);
}
addToPool("mono", 3);
addToPool("bar2", 3);
addToPool("bar3", 3);
addToPool("v3", 2);
addToPool("tri3", 2);
addToPool("bar4", 2);
addToPool("diamond4", 2);
addToPool("l4", 2);
addToPool("p4", 2);
addToPool("y4", 1);
addToPool("bar5", 1);
addToPool("l5", 1);
addToPool("p5", 1);
addToPool("hex7", 1);

function cloneCells(cells) {
  const out = new Array(cells.length);
  for (let i = 0; i < cells.length; i++) out[i] = [cells[i][0], cells[i][1]];
  return out;
}

function makePiece(shape, id) {
  const colorIndex = shape.colorIndex != null ? shape.colorIndex : 0;
  return {
    id: id,
    shapeId: shape.id,
    cells: normalizeCells(cloneCells(shape.cells)),
    color: shape.color,
    colorIndex: colorIndex,
    placed: false,
  };
}

function pickShape(rng) {
  const i = Math.floor(rng() * POOL.length);
  return POOL[i];
}

function dealTrio(board, rng) {
  if (!rng) rng = Math.random;
  function roll() {
    return [
      makePiece(pickShape(rng), 0),
      makePiece(pickShape(rng), 1),
      makePiece(pickShape(rng), 2),
    ];
  }
  let trio = roll();
  const anyFits = function (pieces) {
    for (let i = 0; i < pieces.length; i++) {
      if (canPlaceAnyRotation(board, pieces[i].cells)) return true;
    }
    return false;
  };
  let rerolled = false;
  if (!anyFits(trio)) {
    trio = roll();
    rerolled = true;
  }
  return { pieces: trio, rerolled: rerolled, anyFits: anyFits(trio) };
}

function remainingCanFit(board, pieces) {
  for (let i = 0; i < pieces.length; i++) {
    if (!pieces[i].placed && canPlaceAnyRotation(board, pieces[i].cells)) {
      return true;
    }
  }
  return false;
}

function isGameOver(board, pieces) {
  const left = pieces.filter(function (p) { return !p.placed; });
  if (!left.length) return false;
  return !remainingCanFit(board, pieces);
}

function placePiece(board, cells, color) {
  for (let i = 0; i < cells.length; i++) {
    const q = cells[i][0];
    const r = cells[i][1];
    if (!board.isEmpty(q, r)) return false;
  }
  for (let i = 0; i < cells.length; i++) {
    board.set(cells[i][0], cells[i][1], color);
  }
  return true;
}

const HexBlast = {
  RADIUS: RADIUS,
  SQRT3: SQRT3,
  NEIGHBORS: NEIGHBORS,
  SHAPES: SHAPES,
  POOL: POOL,
  ALL_LINES: ALL_LINES,
  hexKey: hexKey,
  parseKey: parseKey,
  hexRound: hexRound,
  axialToPixel: axialToPixel,
  pixelToAxial: pixelToAxial,
  rotate60: rotate60,
  rotateCells: rotateCells,
  normalizeCells: normalizeCells,
  uniqueOrientations: uniqueOrientations,
  centroid: centroid,
  inBoard: inBoard,
  allBoardCells: allBoardCells,
  lineCells: lineCells,
  allLines: allLines,
  createBoard: createBoard,
  canPlaceOnBoard: canPlaceOnBoard,
  canPlaceAnyRotation: canPlaceAnyRotation,
  findFullLines: findFullLines,
  applyClear: applyClear,
  scorePlacement: scorePlacement,
  hex7Cells: hex7Cells,
  makePiece: makePiece,
  dealTrio: dealTrio,
  remainingCanFit: remainingCanFit,
  isGameOver: isGameOver,
  placePiece: placePiece,
  cloneCells: cloneCells,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = HexBlast;
} else if (typeof window !== "undefined") {
  window.HexBlast = HexBlast;
}

/* ===================== browser game ===================== */
if (typeof window !== "undefined" && typeof document !== "undefined") {
  // UI bootstrapped after DOM is ready — appended below
}


/* ===================== browser shell ===================== */
(function bootHexBlast() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const H = window.HexBlast;
  const BEST_KEY = "hexroom-best";
  const HINT_KEY = "hexroom-hinted";
  const PALETTE_KEY = "hexroom-palette";

  const PALETTES = [
    {
      id: "jewel",
      name: "Jewel",
      colors: [
        "#f5c542", "#2ee6d6", "#3dde7b", "#4d8eff",
        "#ff4d6d", "#c44dff", "#ff8c32", "#ff4db8",
        "#a3e635", "#22d3ee", "#f472b6", "#fb7185",
        "#818cf8", "#f0d78c",
      ],
    },
    {
      id: "purple",
      name: "Purple",
      colors: [
        "#f5d0fe", "#e9d5ff", "#d8b4fe", "#c084fc",
        "#e879f9", "#d946ef", "#a78bfa", "#8b5cf6",
        "#818cf8", "#7c3aed", "#6366f1", "#4f46e5",
        "#c026d3", "#6b21a8",
      ],
    },
    {
      id: "sunset",
      name: "Sunset",
      colors: [
        "#fde68a", "#f5c542", "#fbbf24", "#f59e0b",
        "#fb923c", "#ff8c32", "#f97316", "#ea580c",
        "#fb7185", "#f43f5e", "#ff6b4a", "#ef4444",
        "#e11d48", "#fda4af",
      ],
    },
    {
      id: "ice",
      name: "Ice",
      colors: [
        "#f8fafc", "#e0f2fe", "#bae6fd", "#7dd3fc",
        "#38bdf8", "#0ea5e9", "#22d3ee", "#06b6d4",
        "#67e8f9", "#99f6e4", "#5eead4", "#93c5fd",
        "#60a5fa", "#3b82f6",
      ],
    },
  ];

  let activePaletteId = "jewel";

  function paletteById(id) {
    for (let i = 0; i < PALETTES.length; i++) {
      if (PALETTES[i].id === id) return PALETTES[i];
    }
    return PALETTES[0];
  }

  function paletteColor(index) {
    const colors = paletteById(activePaletteId).colors;
    const n = colors.length;
    const i = ((index % n) + n) % n;
    return colors[i];
  }

  function indexFromStoredColor(hex) {
    if (!hex) return 0;
    const needle = String(hex).toLowerCase();
    for (let i = 0; i < H.SHAPES.length; i++) {
      if (H.SHAPES[i].color.toLowerCase() === needle) return H.SHAPES[i].colorIndex;
    }
    for (let p = 0; p < PALETTES.length; p++) {
      const colors = PALETTES[p].colors;
      for (let i = 0; i < colors.length; i++) {
        if (colors[i].toLowerCase() === needle) return i;
      }
    }
    return 0;
  }

  function cellColor(val) {
    if (!val) return null;
    if (typeof val === "string") return val;
    return val.color || null;
  }

  function cellIndex(val) {
    if (val && typeof val === "object" && typeof val.index === "number") return val.index;
    return indexFromStoredColor(typeof val === "string" ? val : (val && val.color));
  }

  function applyPaletteToPieces() {
    for (let i = 0; i < state.pieces.length; i++) {
      const piece = state.pieces[i];
      const idx = piece.colorIndex != null ? piece.colorIndex : 0;
      piece.colorIndex = idx;
      piece.color = paletteColor(idx);
    }
  }

  function applyPaletteToBoard() {
    if (!state.board) return;
    const filled = state.board.filled;
    filled.forEach(function (val, key) {
      const idx = cellIndex(val);
      filled.set(key, { color: paletteColor(idx), index: idx });
    });
  }

  function applyActivePalette() {
    applyPaletteToBoard();
    applyPaletteToPieces();
    paintSwatchIcon();
    syncPaletteSheet();
  }

  function setActivePalette(id, persist) {
    const pal = paletteById(id);
    activePaletteId = pal.id;
    if (persist !== false) storageSet(PALETTE_KEY, activePaletteId);
    applyActivePalette();
  }

  function storageGet(key, fallback) {
    try {
      let v = localStorage.getItem(key);
      if (v == null && key.indexOf("hexroom-") === 0) {
        v = localStorage.getItem("hexblast-" + key.slice(8));
      }
      return v == null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbStr(r, g, b, a) {
    if (a == null) return "rgb(" + r + "," + g + "," + b + ")";
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function mix(hex, t, toward) {
    const a = hexToRgb(hex);
    const b = toward || [255, 255, 255];
    return rgbStr(
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    );
  }
  function shade(hex, t) {
    return mix(hex, t, [8, 6, 20]);
  }

  let actx = null;
  function ensureAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq, dur, type, vol, delay) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function buzz(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) {}
  }

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  const elScore = document.getElementById("score");
  const elBest = document.getElementById("best");
  const elStreak = document.getElementById("streak");
  const elStreakN = document.getElementById("streak-n");
  const elStreakX = document.getElementById("streak-x");
  const elHint = document.getElementById("hint");
  const elOverlay = document.getElementById("overlay");
  const elOverScore = document.getElementById("over-score");
  const elOverBest = document.getElementById("over-best");
  const elNewBest = document.getElementById("new-best");
  const elAgain = document.getElementById("again");
  const elPaletteBtn = document.getElementById("palette-btn");
  const elPaletteSheet = document.getElementById("palette-sheet");
  const elPaletteBackdrop = document.getElementById("palette-backdrop");
  const elPaletteList = document.getElementById("palette-list");
  const safeProbe = document.getElementById("safe-probe");

  const layout = {
    w: 0,
    h: 0,
    dpr: 1,
    safeTop: 0,
    safeBottom: 0,
    hudH: 64,
    dockH: 150,
    boardX: 0,
    boardY: 0,
    hexSize: 22,
    dock: { x: 12, y: 0, w: 0, h: 130, r: 28 },
    slots: [],
  };

  const state = {
    board: null,
    pieces: [],
    score: 0,
    shownScore: 0,
    best: 0,
    streak: 0,
    setCleared: false,
    over: false,
    overShown: false,
    hintOn: false,
    nextId: 1,
  };

  const fx = {
    particles: [],
    floaters: [],
    pops: [],
    clearing: [],
    shake: 0,
    flash: 0,
    combo: null,
    time: 0,
  };

  const input = {
    pointerId: null,
    sx: 0,
    sy: 0,
    x: 0,
    y: 0,
    piece: null,
    dragging: false,
    ghost: null,
    lift: 0,
  };

  function readSafe() {
    const cs = getComputedStyle(safeProbe);
    layout.safeTop = parseFloat(cs.paddingTop) || 0;
    layout.safeBottom = parseFloat(cs.paddingBottom) || 0;
  }

  function resize() {
    readSafe();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    layout.w = w;
    layout.h = h;
    layout.dpr = dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    layout.hudH = 56 + layout.safeTop;
    layout.dockH = 142 + layout.safeBottom;
    const top = layout.hudH + 6;
    const bot = h - layout.dockH - 4;
    const availH = Math.max(160, bot - top);
    const availW = w - 28;
    const sizeByW = availW / (9 * H.SQRT3);
    const sizeByH = availH / 14;
    layout.hexSize = Math.max(11.5, Math.min(sizeByW, sizeByH, 28));
    layout.boardX = w * 0.5;
    layout.boardY = top + availH * 0.5;

    const dockH = 128;
    layout.dock = {
      x: 12,
      y: h - layout.safeBottom - dockH - 10,
      w: w - 24,
      h: dockH,
      r: 30,
    };
    const slotW = layout.dock.w / 3;
    layout.slots = [0, 1, 2].map(function (i) {
      return {
        i: i,
        x: layout.dock.x + slotW * i + slotW * 0.5,
        y: layout.dock.y + layout.dock.h * 0.5 - 4,
        w: slotW,
        h: layout.dock.h,
      };
    });
  }

  function boardPixel(q, r) {
    const p = H.axialToPixel(q, r, layout.hexSize);
    return [layout.boardX + p[0], layout.boardY + p[1]];
  }

  function hexPath(c, x, y, size) {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i - 30);
      const px = x + size * Math.cos(a);
      const py = y + size * Math.sin(a);
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
  }

  function drawJewelHex(c, x, y, size, color, opts) {
    opts = opts || {};
    const glow = opts.glow !== false;
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    c.save();
    c.globalAlpha *= alpha;
    if (glow) {
      c.save();
      c.shadowColor = mix(color, 0.15);
      c.shadowBlur = size * 0.7;
      hexPath(c, x, y, size);
      c.fillStyle = color;
      c.fill();
      c.restore();
    }
    hexPath(c, x, y, size);
    const g = c.createLinearGradient(x, y - size, x, y + size);
    g.addColorStop(0, mix(color, 0.42));
    g.addColorStop(0.45, color);
    g.addColorStop(1, shade(color, 0.38));
    c.fillStyle = g;
    c.fill();
    c.lineWidth = Math.max(1, size * 0.075);
    c.strokeStyle = mix(color, 0.28);
    c.stroke();
    c.beginPath();
    c.ellipse(x, y - size * 0.28, size * 0.34, size * 0.15, 0, 0, Math.PI * 2);
    c.fillStyle = "rgba(255,255,255,0.26)";
    c.fill();
    c.restore();
  }

  function drawEmptyHex(c, x, y, size) {
    hexPath(c, x, y, size);
    c.fillStyle = "rgba(22, 20, 48, 0.92)";
    c.fill();
    c.lineWidth = Math.max(1, size * 0.06);
    c.strokeStyle = "rgba(90, 80, 150, 0.38)";
    c.stroke();
    hexPath(c, x, y, size * 0.72);
    c.strokeStyle = "rgba(255,255,255,0.035)";
    c.lineWidth = 1;
    c.stroke();
  }

  function pieceBounds(cells, size) {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (let i = 0; i < cells.length; i++) {
      const p = H.axialToPixel(cells[i][0], cells[i][1], size);
      minX = Math.min(minX, p[0] - size);
      maxX = Math.max(maxX, p[0] + size);
      minY = Math.min(minY, p[1] - size);
      maxY = Math.max(maxY, p[1] + size);
    }
    return {
      minX: minX, minY: minY, maxX: maxX, maxY: maxY,
      w: maxX - minX, h: maxY - minY,
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    };
  }

  function trayScaleFor(cells) {
    const slot = layout.slots[0];
    const maxW = slot.w * 0.78;
    const maxH = layout.dock.h * 0.62;
    const probe = 16;
    const b = pieceBounds(cells, probe);
    const s = Math.min(maxW / b.w, maxH / b.h, 1) * probe;
    return Math.max(8.5, Math.min(s, 15.5));
  }

  function drawRotateHint(c, x, y, s) {
    c.save();
    c.translate(x, y);
    c.strokeStyle = "rgba(244, 232, 255, 0.7)";
    c.fillStyle = "rgba(244, 232, 255, 0.7)";
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(0, 0, s, 0.55, Math.PI * 1.55);
    c.stroke();
    c.beginPath();
    c.moveTo(s * 0.15, -s * 0.95);
    c.lineTo(s * 0.85, -s * 0.35);
    c.lineTo(s * 0.05, -s * 0.25);
    c.closePath();
    c.fill();
    c.restore();
  }

  function spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 180;
      fx.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: 0.35 + Math.random() * 0.45,
        max: 0.55 + Math.random() * 0.4,
        color: color,
        size: 1.6 + Math.random() * 2.6,
      });
    }
  }

  function addFloater(x, y, text, color, scale) {
    fx.floaters.push({
      x: x, y: y, text: text, color: color || "#fff6c8",
      life: 0.9, max: 0.9, scale: scale || 1,
    });
  }

  function updateHud() {
    elScore.textContent = String(Math.round(state.shownScore));
    elBest.textContent = String(state.best);
    if (state.streak > 0) {
      elStreak.classList.remove("hidden");
      elStreakN.textContent = String(state.streak);
      const mult = 1 + state.streak * 0.25;
      elStreakX.textContent = (mult % 1 ? mult.toFixed(2) : mult.toFixed(0)) + "×";
    } else {
      elStreak.classList.add("hidden");
    }
  }

  function persistBest() {
    if (state.score > state.best) {
      state.best = state.score;
      storageSet(BEST_KEY, String(state.best));
      return true;
    }
    return false;
  }

  function dealFresh() {
    const dealt = H.dealTrio(state.board);
    state.pieces = dealt.pieces;
    applyPaletteToPieces();
    state.setCleared = false;
    if (!dealt.anyFits) {
      state.over = true;
    }
  }

  function resetGame() {
    state.board = H.createBoard(4);
    state.score = 0;
    state.shownScore = 0;
    state.streak = 0;
    state.setCleared = false;
    state.over = false;
    state.overShown = false;
    fx.particles.length = 0;
    fx.floaters.length = 0;
    fx.pops.length = 0;
    fx.clearing.length = 0;
    fx.shake = 0;
    fx.flash = 0;
    fx.combo = null;
    elOverlay.classList.add("hidden");
    elNewBest.classList.add("hidden");
    dealFresh();
    updateHud();
  }

  function showGameOver() {
    if (state.overShown) return;
    state.overShown = true;
    const beat = state.score > 0 && state.score >= state.best;
    persistBest();
    if (window.HexroomRooms && typeof window.HexroomRooms.submitRun === "function") {
      try { window.HexroomRooms.submitRun(state.score); } catch (err) {}
    }
    elOverScore.textContent = String(state.score);
    elOverBest.textContent = String(state.best);
    if (beat) {
      elNewBest.classList.remove("hidden");
    } else {
      elNewBest.classList.add("hidden");
    }
    elOverlay.classList.remove("hidden");
    tone(220, 0.18, "sine", 0.05, 0);
    tone(164, 0.28, "triangle", 0.045, 0.12);
    tone(110, 0.4, "sine", 0.04, 0.26);
  }

  function finishSetIfNeeded() {
    const left = state.pieces.filter(function (p) { return !p.placed; });
    if (left.length) {
      if (H.isGameOver(state.board, state.pieces)) state.over = true;
      return;
    }
    if (state.setCleared) state.streak += 1;
    else state.streak = 0;
    dealFresh();
  }

  function applyPlacement(piece, cells) {
    const idx = piece.colorIndex != null ? piece.colorIndex : 0;
    if (!H.placePiece(state.board, cells, { color: piece.color, index: idx })) return false;
    piece.placed = true;
    const lines = H.findFullLines(state.board);
    const scored = H.scorePlacement(cells.length, lines, state.streak);
    state.score += scored.total;
    persistBest();

    for (let i = 0; i < cells.length; i++) {
      const p = boardPixel(cells[i][0], cells[i][1]);
      fx.pops.push({ q: cells[i][0], r: cells[i][1], color: piece.color, t: 0 });
    }

    if (lines.length) {
      state.setCleared = true;
      const cleared = H.applyClear(state.board, lines);
      let sx = 0, sy = 0;
      for (let i = 0; i < cleared.length; i++) {
        const p = boardPixel(cleared[i][0], cleared[i][1]);
        const col = piece.color;
        fx.clearing.push({ x: p[0], y: p[1], color: col, t: 0 });
        spawnParticles(p[0], p[1], col, 10);
        sx += p[0];
        sy += p[1];
      }
      sx /= cleared.length;
      sy /= cleared.length;
      addFloater(sx, sy - 8, "+" + scored.clearScore, "#ffe8a3", 1.15);
      if (lines.length === 2) fx.combo = { text: "DOUBLE", t: 0 };
      else if (lines.length === 3) fx.combo = { text: "TRIPLE", t: 0 };
      else if (lines.length >= 4) fx.combo = { text: "HEX STORM", t: 0 };
      fx.shake = Math.min(16, 5 + lines.length * 3);
      fx.flash = 0.18;
      tone(520, 0.08, "triangle", 0.05, 0);
      tone(720, 0.12, "sine", 0.045, 0.06);
      if (lines.length > 1) tone(880, 0.16, "sine", 0.05, 0.12);
      if (lines.length >= 4) buzz([18, 40, 18, 40, 32]);
      else if (lines.length === 3) buzz([16, 30, 26]);
      else if (lines.length === 2) buzz([14, 24, 20]);
      else buzz(18);
    } else {
      addFloater(
        boardPixel(cells[0][0], cells[0][1])[0],
        boardPixel(cells[0][0], cells[0][1])[1] - 18,
        "+" + scored.placeScore,
        "#d8c4ff",
        0.85
      );
      tone(380, 0.07, "sine", 0.04, 0);
    }

    if (state.hintOn) {
      state.hintOn = false;
      elHint.classList.add("hidden");
      storageSet(HINT_KEY, "1");
    }

    finishSetIfNeeded();
    updateHud();
    if (state.over) {
      setTimeout(showGameOver, lines.length ? 420 : 180);
    }
    return true;
  }

  function ghostFromPointer(piece, px, py) {
    const size = layout.hexSize;
    const localX = px - layout.boardX;
    const localY = py - layout.boardY;
    const fracQ = ((H.SQRT3 / 3) * localX - (1 / 3) * localY) / size;
    const fracR = ((2 / 3) * localY) / size;
    const c = H.centroid(piece.cells);
    const t = H.hexRound(fracQ - c[0], fracR - c[1]);
    const cells = piece.cells.map(function (cell) {
      return [cell[0] + t[0], cell[1] + t[1]];
    });
    let valid = true;
    for (let i = 0; i < cells.length; i++) {
      if (!state.board.isEmpty(cells[i][0], cells[i][1])) {
        valid = false;
        break;
      }
    }
    return { cells: cells, valid: valid, dq: t[0], dr: t[1] };
  }

  function hitTray(x, y) {
    for (let i = 0; i < state.pieces.length; i++) {
      const p = state.pieces[i];
      if (p.placed) continue;
      const slot = layout.slots[i];
      const dx = x - slot.x;
      const dy = y - slot.y;
      if (Math.abs(dx) <= slot.w * 0.46 && Math.abs(dy) <= layout.dock.h * 0.46) {
        return p;
      }
    }
    return null;
  }

  function onDown(e) {
    if (state.over) return;
    if (input.pointerId != null) return;
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;
    const piece = hitTray(x, y);
    if (!piece) return;
    ensureAudio();
    input.pointerId = e.pointerId;
    input.sx = x;
    input.sy = y;
    input.x = x;
    input.y = y;
    input.piece = piece;
    input.dragging = false;
    input.ghost = null;
    input.lift = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function onMove(e) {
    if (input.pointerId !== e.pointerId) return;
    e.preventDefault();
    input.x = e.clientX;
    input.y = e.clientY;
    const dx = input.x - input.sx;
    const dy = input.y - input.sy;
    if (!input.dragging && dx * dx + dy * dy > 100) {
      input.dragging = true;
    }
    if (input.dragging && input.piece) {
      const gx = input.x;
      const gy = input.y - 46;
      input.ghost = ghostFromPointer(input.piece, gx, gy);
    }
  }

  function onUp(e) {
    if (input.pointerId !== e.pointerId) return;
    e.preventDefault();
    const piece = input.piece;
    const wasDrag = input.dragging;
    const ghost = input.ghost;
    input.pointerId = null;
    input.piece = null;
    input.dragging = false;
    input.ghost = null;
    if (!piece || piece.placed || state.over) return;
    if (wasDrag) {
      if (ghost && ghost.valid) {
        applyPlacement(piece, ghost.cells);
      }
      return;
    }
    piece.cells = H.normalizeCells(H.rotateCells(piece.cells));
    piece.spin = 1;
    tone(300, 0.05, "triangle", 0.03, 0);
  }

  function drawBoardShadow(c) {
    const s = layout.hexSize;
    c.save();
    const g = c.createRadialGradient(
      layout.boardX, layout.boardY + s * 1.2, s * 1.5,
      layout.boardX, layout.boardY + s * 1.6, s * 8.2
    );
    g.addColorStop(0, "rgba(0,0,0,0.5)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(layout.boardX, layout.boardY + s * 1.4, s * 7.2, s * 6.4, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawWordmark(c) {
    c.save();
    c.font = "700 11px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
    c.fillStyle = "rgba(196, 181, 253, 0.38)";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.letterSpacing = "0.28em";
    const y = layout.boardY - layout.hexSize * 7.15;
    if (y > layout.hudH + 8) {
      c.fillText("HEXROOM", layout.boardX, y);
    }
    c.restore();
  }

  function drawDock(c) {
    const d = layout.dock;
    c.save();
    c.beginPath();
    const r = d.r;
    c.moveTo(d.x + r, d.y);
    c.arcTo(d.x + d.w, d.y, d.x + d.w, d.y + d.h, r);
    c.arcTo(d.x + d.w, d.y + d.h, d.x, d.y + d.h, r);
    c.arcTo(d.x, d.y + d.h, d.x, d.y, r);
    c.arcTo(d.x, d.y, d.x + d.w, d.y, r);
    c.closePath();
    const g = c.createLinearGradient(0, d.y, 0, d.y + d.h);
    g.addColorStop(0, "rgba(28, 22, 62, 0.88)");
    g.addColorStop(1, "rgba(12, 8, 30, 0.92)");
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = "rgba(216, 180, 254, 0.16)";
    c.lineWidth = 1.2;
    c.stroke();
    c.restore();
  }

  function drawTrayPiece(c, piece, index, t) {
    if (piece.placed) return;
    if (input.piece === piece && input.dragging) return;
    const slot = layout.slots[index];
    const size = trayScaleFor(piece.cells);
    const b = pieceBounds(piece.cells, size);
    const pulse = 1 + 0.038 * Math.sin(t * 2.15 + index * 1.15);
    const spin = piece.spin ? (1 - piece.spin) * (Math.PI / 3) : 0;
    c.save();
    c.translate(slot.x, slot.y);
    c.scale(pulse, pulse);
    if (spin) c.rotate(spin);
    c.translate(-b.cx, -b.cy);
    for (let i = 0; i < piece.cells.length; i++) {
      const p = H.axialToPixel(piece.cells[i][0], piece.cells[i][1], size);
      drawJewelHex(c, p[0], p[1], size * 0.94, piece.color);
    }
    c.restore();
    drawRotateHint(c, slot.x + slot.w * 0.28, slot.y + 36, 6);
  }

  function drawDrag(c) {
    if (!input.piece || !input.dragging) return;
    const piece = input.piece;
    const gx = input.x;
    const gy = input.y - 46;
    if (input.ghost) {
      const g = input.ghost;
      for (let i = 0; i < g.cells.length; i++) {
        const p = boardPixel(g.cells[i][0], g.cells[i][1]);
        if (g.valid) {
          drawJewelHex(c, p[0], p[1], layout.hexSize * 0.96, piece.color, { alpha: 0.48 });
        } else {
          drawJewelHex(c, p[0], p[1], layout.hexSize * 0.96, "#ff4d6d", { alpha: 0.42, glow: false });
        }
      }
    }
    const size = layout.hexSize * 0.92;
    const b = pieceBounds(piece.cells, size);
    c.save();
    c.globalAlpha = 0.96;
    c.translate(gx - b.cx, gy - b.cy);
    for (let i = 0; i < piece.cells.length; i++) {
      const p = H.axialToPixel(piece.cells[i][0], piece.cells[i][1], size);
      drawJewelHex(c, p[0], p[1], size * 0.94, piece.color);
    }
    c.restore();
  }

  function drawFx(c, dt) {
    for (let i = fx.clearing.length - 1; i >= 0; i--) {
      const cl = fx.clearing[i];
      cl.t += dt / 0.28;
      if (cl.t >= 1) { fx.clearing.splice(i, 1); continue; }
      const s = (1 - cl.t) * (1 - cl.t);
      c.save();
      c.translate(cl.x, cl.y);
      c.scale(s * 1.15, s * 1.15);
      c.rotate(cl.t * 0.4);
      drawJewelHex(c, 0, 0, layout.hexSize * 0.95, cl.color, { alpha: 1 - cl.t });
      c.restore();
    }
    for (let i = fx.pops.length - 1; i >= 0; i--) {
      const p = fx.pops[i];
      p.t += dt / 0.18;
      if (p.t >= 1) { fx.pops.splice(i, 1); continue; }
    }
    for (let i = fx.particles.length - 1; i >= 0; i--) {
      const p = fx.particles[i];
      p.life -= dt;
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) { fx.particles.splice(i, 1); continue; }
      const a = Math.max(0, p.life / p.max);
      c.beginPath();
      c.fillStyle = mix(p.color, 0.25);
      c.globalAlpha = a;
      c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
    for (let i = fx.floaters.length - 1; i >= 0; i--) {
      const f = fx.floaters[i];
      f.life -= dt;
      if (f.life <= 0) { fx.floaters.splice(i, 1); continue; }
      const u = 1 - f.life / f.max;
      c.save();
      c.globalAlpha = 1 - u * u;
      c.font = "800 " + Math.round(18 * f.scale) + "px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
      c.fillStyle = f.color;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.shadowColor = "rgba(0,0,0,0.45)";
      c.shadowBlur = 8;
      c.fillText(f.text, f.x, f.y - u * 36);
      c.restore();
    }
    if (fx.combo) {
      fx.combo.t += dt;
      if (fx.combo.t > 0.85) fx.combo = null;
      else {
        const u = fx.combo.t / 0.85;
        const a = u < 0.2 ? u / 0.2 : 1 - (u - 0.2) / 0.8;
        c.save();
        c.globalAlpha = Math.max(0, a);
        c.font = "800 28px -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
        c.fillStyle = "#ffe8a3";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.shadowColor = "rgba(255, 180, 80, 0.6)";
        c.shadowBlur = 18;
        const cy = Math.max(layout.hudH + 28, layout.boardY - layout.hexSize * 6.2);
        c.fillText(fx.combo.text, layout.boardX, cy);
        c.restore();
      }
    }
  }

  function frame(ts) {
    const t = ts * 0.001;
    const dt = Math.min(0.034, t - (fx.time || t));
    fx.time = t;

    if (state.shownScore < state.score) {
      const d = state.score - state.shownScore;
      state.shownScore += Math.max(1, d * Math.min(1, dt * 8));
      if (state.shownScore > state.score) state.shownScore = state.score;
      elScore.textContent = String(Math.round(state.shownScore));
    }

    for (let i = 0; i < state.pieces.length; i++) {
      const p = state.pieces[i];
      if (p.spin) {
        p.spin -= dt * 5.5;
        if (p.spin < 0) p.spin = 0;
      }
    }

    if (fx.shake > 0.15) fx.shake *= Math.pow(0.0008, dt);
    else fx.shake = 0;
    if (fx.flash > 0) fx.flash = Math.max(0, fx.flash - dt);

    const w = layout.w;
    const h = layout.h;
    ctx.clearRect(0, 0, w, h);

    if (fx.flash > 0) {
      ctx.fillStyle = "rgba(255, 230, 180," + (fx.flash * 0.12) + ")";
      ctx.fillRect(0, 0, w, h);
    }

    const ox = fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
    const oy = fx.shake ? (Math.random() - 0.5) * fx.shake : 0;
    ctx.save();
    ctx.translate(ox, oy);

    drawBoardShadow(ctx);
    drawWordmark(ctx);

    const cells = H.allBoardCells(4);
    const size = layout.hexSize * 0.96;
    for (let i = 0; i < cells.length; i++) {
      const q = cells[i][0];
      const r = cells[i][1];
      const p = boardPixel(q, r);
      const col = cellColor(state.board.get(q, r));
      if (col) {
        let pop = 1;
        for (let k = 0; k < fx.pops.length; k++) {
          if (fx.pops[k].q === q && fx.pops[k].r === r) {
            const u = fx.pops[k].t;
            pop = 0.82 + 0.28 * Math.sin(u * Math.PI);
          }
        }
        ctx.save();
        ctx.translate(p[0], p[1]);
        ctx.scale(pop, pop);
        drawJewelHex(ctx, 0, 0, size, col);
        ctx.restore();
      } else {
        drawEmptyHex(ctx, p[0], p[1], size);
      }
    }

    drawFx(ctx, dt);
    ctx.restore();

    drawDock(ctx);
    for (let i = 0; i < 3; i++) {
      const slot = layout.slots[i];
      const piece = state.pieces[i];
      const empty = !piece || piece.placed || (input.piece === piece && input.dragging);
      if (empty) {
        ctx.save();
        hexPath(ctx, slot.x, slot.y, 16);
        ctx.strokeStyle = "rgba(196, 181, 253, 0.12)";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.restore();
      }
    }
    for (let i = 0; i < state.pieces.length; i++) {
      drawTrayPiece(ctx, state.pieces[i], i, t);
    }
    drawDrag(ctx);

    requestAnimationFrame(frame);
  }

  function preventChrome(e) { e.preventDefault(); }

  function paintSwatchIcon() {
    if (!elPaletteBtn) return;
    const dots = elPaletteBtn.querySelectorAll(".swatch-icon i");
    const colors = paletteById(activePaletteId).colors;
    for (let i = 0; i < dots.length; i++) {
      dots[i].style.background = colors[i] || colors[0];
    }
  }

  function syncPaletteSheet() {
    if (!elPaletteList) return;
    const rows = elPaletteList.querySelectorAll(".palette-row");
    for (let i = 0; i < rows.length; i++) {
      const on = rows[i].getAttribute("data-id") === activePaletteId;
      rows[i].classList.toggle("selected", on);
      rows[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function buildPaletteSheet() {
    if (!elPaletteList) return;
    elPaletteList.textContent = "";
    for (let i = 0; i < PALETTES.length; i++) {
      const pal = PALETTES[i];
      const row = document.createElement("button");
      row.type = "button";
      row.className = "palette-row";
      row.setAttribute("data-id", pal.id);
      row.setAttribute("aria-pressed", pal.id === activePaletteId ? "true" : "false");
      const dots = document.createElement("span");
      dots.className = "palette-dots";
      dots.setAttribute("aria-hidden", "true");
      for (let d = 0; d < 4; d++) {
        const dot = document.createElement("i");
        dot.style.background = pal.colors[d];
        dots.appendChild(dot);
      }
      const name = document.createElement("span");
      name.className = "palette-name";
      name.textContent = pal.name;
      row.appendChild(dots);
      row.appendChild(name);
      if (pal.id === activePaletteId) row.classList.add("selected");
      row.addEventListener("click", function () {
        setActivePalette(pal.id, true);
        closePaletteSheet();
      });
      elPaletteList.appendChild(row);
    }
  }

  function openPaletteSheet() {
    if (!elPaletteSheet) return;
    syncPaletteSheet();
    elPaletteSheet.classList.remove("hidden");
    if (elPaletteBtn) elPaletteBtn.setAttribute("aria-expanded", "true");
  }

  function closePaletteSheet() {
    if (!elPaletteSheet) return;
    elPaletteSheet.classList.add("hidden");
    if (elPaletteBtn) elPaletteBtn.setAttribute("aria-expanded", "false");
  }

  function start() {
    const savedPal = storageGet(PALETTE_KEY, "jewel");
    activePaletteId = paletteById(savedPal).id;
    buildPaletteSheet();
    paintSwatchIcon();

    state.best = parseInt(storageGet(BEST_KEY, "0"), 10) || 0;
    state.hintOn = storageGet(HINT_KEY, "") !== "1";
    if (state.hintOn) elHint.classList.remove("hidden");
    resize();
    resetGame();
    updateHud();

    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", function () {
      setTimeout(resize, 80);
    });

    canvas.addEventListener("contextmenu", preventChrome);
    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove, { passive: false });
    canvas.addEventListener("pointerup", onUp, { passive: false });
    canvas.addEventListener("pointercancel", onUp, { passive: false });

    document.addEventListener("touchmove", preventChrome, { passive: false });
    document.addEventListener("gesturestart", preventChrome);
    document.addEventListener("gesturechange", preventChrome);
    document.addEventListener("dblclick", preventChrome);

    elAgain.addEventListener("click", function () {
      ensureAudio();
      tone(440, 0.08, "sine", 0.04, 0);
      resetGame();
    });

    if (elPaletteBtn) {
      elPaletteBtn.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
      });
      elPaletteBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (elPaletteSheet && !elPaletteSheet.classList.contains("hidden")) closePaletteSheet();
        else openPaletteSheet();
      });
    }
    if (elPaletteBackdrop) {
      elPaletteBackdrop.addEventListener("click", function () {
        closePaletteSheet();
      });
    }
    if (elPaletteSheet) {
      elPaletteSheet.addEventListener("pointerdown", function (e) {
        e.stopPropagation();
      });
    }

    if (location.protocol === "http:" || location.protocol === "https:") {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("sw.js").catch(function () {});
      }
    }

    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
