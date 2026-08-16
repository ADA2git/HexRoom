"use strict";

const H = require("./game.js");
let passed = 0;
let failed = 0;
const errors = [];

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log("  ok  " + msg);
  } else {
    failed++;
    errors.push(msg);
    console.log("  FAIL  " + msg);
  }
}

function eq(a, b, msg) {
  assert(a === b, msg + " (got " + a + ", expected " + b + ")");
}

console.log("Hex Blast logic tests\n");

console.log("Board");
const cells = H.allBoardCells(4);
eq(cells.length, 61, "radius-4 board has 61 cells");
assert(H.inBoard(0, 0, 4), "center is on board");
assert(H.inBoard(4, 0, 4), "q=4 is on board");
assert(H.inBoard(0, 4, 4), "r=4 is on board");
assert(H.inBoard(-4, 4, 4), "s=0 corner on board");
assert(!H.inBoard(5, 0, 4), "q=5 is off board");
assert(!H.inBoard(3, 3, 4), "(3,3) s=-6 is off board");

const board = H.createBoard(4);
eq(board.emptyCells().length, 61, "empty board has 61 empties");

console.log("\nPlace pieces");
assert(H.placePiece(board, [[0, 0], [1, 0]], "#3dde7b"), "place bar2 at origin");
assert(board.isFilled(0, 0) && board.isFilled(1, 0), "placed cells are filled");
assert(!H.placePiece(board, [[0, 0]], "#fff"), "cannot place on occupied cell");
assert(H.placePiece(board, [[2, 0]], "#fff"), "can place adjacent empty");

console.log("\nLine detection — three axes");
function fillLine(b, axis, value, color) {
  const line = H.lineCells(axis, value, 4);
  for (const [q, r] of line) b.set(q, r, color || "#4d8eff");
  return line;
}

const bq = H.createBoard(4);
const qLine = fillLine(bq, "q", 0);
eq(qLine.length, 9, "q=0 line has 9 cells");
let full = H.findFullLines(bq);
eq(full.length, 1, "only the q=0 line is full");
eq(full[0].axis, "q", "detected axis is q");
eq(full[0].value, 0, "detected value is 0");

const br = H.createBoard(4);
const rLine = fillLine(br, "r", 2);
eq(rLine.length, 7, "r=2 line has 7 cells");
full = H.findFullLines(br);
eq(full.length, 1, "only the r=2 line is full");
eq(full[0].axis, "r", "detected axis is r");
eq(full[0].value, 2, "detected r value is 2");

const bs = H.createBoard(4);
const sLine = fillLine(bs, "s", -1);
assert(sLine.length >= 5, "s=-1 line has at least 5 cells (" + sLine.length + ")");
full = H.findFullLines(bs);
eq(full.length, 1, "only the s=-1 line is full");
eq(full[0].axis, "s", "detected axis is s");
eq(full[0].value, -1, "detected s value is -1");

// Corner line lengths
eq(H.lineCells("q", 4, 4).length, 5, "q=4 edge line has 5 cells");
eq(H.lineCells("q", -4, 4).length, 5, "q=-4 edge line has 5 cells");
eq(H.lineCells("s", 0, 4).length, 9, "s=0 long line has 9 cells");

console.log("\nMulti-line combo + clear");
const bc = H.createBoard(4);
// Fill q=0 except (0,0), and r=0 except (0,0). Then place (0,0) to complete both.
for (const [q, r] of H.lineCells("q", 0, 4)) {
  if (!(q === 0 && r === 0)) bc.set(q, r, "#c44dff");
}
for (const [q, r] of H.lineCells("r", 0, 4)) {
  if (!(q === 0 && r === 0)) bc.set(q, r, "#c44dff");
}
assert(!H.findFullLines(bc).length, "neither line full before the last cell");
assert(H.placePiece(bc, [[0, 0]], "#f5c542"), "place the intersection cell");
full = H.findFullLines(bc);
assert(full.length >= 2, "completing the intersection clears at least 2 lines (got " + full.length + ")");
assert(full.some((l) => l.axis === "q" && l.value === 0), "q=0 is among cleared");
assert(full.some((l) => l.axis === "r" && l.value === 0), "r=0 is among cleared");
const cleared = H.applyClear(bc, full);
assert(cleared.length >= 9, "cleared at least the long line's unique cells");
assert(!bc.isFilled(0, 0), "intersection cell was cleared");
assert(!bc.isFilled(0, 1), "q=0 cell was cleared");
assert(!bc.isFilled(1, 0), "r=0 cell was cleared");

console.log("\nScoring");
const sc1 = H.scorePlacement(3, [{ cells: new Array(9) }], 0);
eq(sc1.placeScore, 30, "3 cells placed = 30");
eq(sc1.clearScore, 900, "9-cell line = 900 at 1x");
eq(sc1.total, 930, "placement + clear");

const sc2 = H.scorePlacement(1, [{ cells: new Array(9) }, { cells: new Array(9) }], 0);
eq(sc2.placeScore, 10, "1 cell placed = 10");
eq(sc2.clearScore, 1800 + 200, "two 9-cell lines + 50*2^2 combo");

const sc3 = H.scorePlacement(1, [{ cells: new Array(5) }], 2);
eq(sc3.clearScore, Math.round(500 * 1.5), "streak 2 applies 1.5x to clears");
eq(sc3.placeScore, 10, "multiplier does not apply to placement");

console.log("\nRotation — bar of 3 has 3 unique orientations");
const bar3 = [[0, 0], [1, 0], [2, 0]];
const orients = H.uniqueOrientations(bar3);
eq(orients.length, 3, "bar of 3 has 3 unique orientations");

// Each orientation should be 3 colinear hexes along a different axis
function axisOf(cells) {
  const n = H.normalizeCells(cells);
  const qs = new Set(n.map((c) => c[0]));
  const rs = new Set(n.map((c) => c[1]));
  const ss = new Set(n.map((c) => -c[0] - c[1]));
  if (qs.size === 1) return "q";
  if (rs.size === 1) return "r";
  if (ss.size === 1) return "s";
  return "?";
}
const axes = new Set(orients.map(axisOf));
assert(axes.has("q") && axes.has("r") && axes.has("s"), "bar visits all 3 axes");

const rot = H.rotate60(1, 0);
assert(rot[0] === 0 && rot[1] === 1, "(1,0) rotates to (0,1)");

const hex7 = H.hex7Cells();
eq(hex7.length, 7, "big piece is 7 cells");
eq(H.uniqueOrientations(hex7).length, 1, "hex7 has 1 unique orientation");

const mono = H.uniqueOrientations([[0, 0]]);
eq(mono.length, 1, "monomino has 1 orientation");

console.log("\nGame-over detection");
const fullBoard = H.createBoard(4);
for (const [q, r] of H.allBoardCells(4)) fullBoard.set(q, r, "#333");
const leftover = [H.makePiece(H.SHAPES.find((s) => s.id === "mono"), 0)];
assert(H.isGameOver(fullBoard, leftover), "full board + any piece is game over");

const oneHole = H.createBoard(4);
for (const [q, r] of H.allBoardCells(4)) {
  if (!(q === 0 && r === 0)) oneHole.set(q, r, "#333");
}
const bar2 = [H.makePiece(H.SHAPES.find((s) => s.id === "bar2"), 0)];
assert(H.isGameOver(oneHole, bar2), "single hole cannot fit a bar of 2");
const dot = [H.makePiece(H.SHAPES.find((s) => s.id === "mono"), 0)];
assert(!H.isGameOver(oneHole, dot), "single hole can fit a monomino");

const empty = H.createBoard(4);
const trio = [
  H.makePiece(H.SHAPES.find((s) => s.id === "hex7"), 0),
  H.makePiece(H.SHAPES.find((s) => s.id === "bar5"), 1),
  H.makePiece(H.SHAPES.find((s) => s.id === "l5"), 2),
];
assert(!H.isGameOver(empty, trio), "empty board can fit large pieces");

// After placing 1 of a set, remaining that cannot fit
const almost = H.createBoard(4);
for (const [q, r] of H.allBoardCells(4)) {
  if (Math.abs(q) + Math.abs(r) + Math.abs(-q - r) > 0) {
    // leave only (0,0) empty — actually fill all but (0,0)
  }
}
for (const [q, r] of H.allBoardCells(4)) {
  if (!(q === 0 && r === 0)) almost.set(q, r, "#333");
}
const midSet = [
  H.makePiece(H.SHAPES.find((s) => s.id === "mono"), 0),
  H.makePiece(H.SHAPES.find((s) => s.id === "bar3"), 1),
];
midSet[0].placed = true;
assert(H.isGameOver(almost, midSet), "after placing 1, remaining bar3 cannot fit");

console.log("\nDeal trio reroll");
const packed = H.createBoard(4);
for (const [q, r] of H.allBoardCells(4)) packed.set(q, r, "#333");
const dealt = H.dealTrio(packed, function () { return 0.99; });
assert(dealt.rerolled, "rerolls once when nothing fits");
assert(!dealt.anyFits, "still nothing fits on a full board");

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed) {
  console.log("Failures:\n - " + errors.join("\n - "));
  process.exit(1);
}
