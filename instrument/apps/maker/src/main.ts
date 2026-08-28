/**
 * PANORAMIC MAKER — the instrument you can actually shape a car in.
 *
 * The difference between this and the viewer next door is that here the
 * document is LIVE: every gesture is a verb, every verb goes through the same
 * @car/history session the build scripts drive, and the surface you are
 * looking at is re-evaluated from the curve network rather than replayed from
 * a file. Undo is a replay of history without the last verb, which is why it
 * cannot drift.
 *
 * THE THREE FIDELITIES, and why the tool says which one you are in.
 *
 * Evaluating a body has three costs, measured on the F1 (620 cells, 726
 * curves) in node:
 *
 *   bare Coons blend        82 ms      G0 exact. Watertight. No tangent field.
 *   + tangent field, G1    550 ms      the field that makes seams invisible
 *   + curvature field, G2  5700 ms     the second-order correction
 *
 * A five-second pause on every drag would make the tool unusable, and hiding
 * the difference would make it dishonest — you would be shaping against a
 * surface nobody built. So the fidelity is a state you can see: DRAG is the
 * bare blend, RELEASE settles to G1, and SOLVE is the full G2 body the build
 * scripts print. The badge in the corner always says which one is on screen.
 */

import type { CarDocument, CurveChain, Id, Pt3, QuiltSpec } from "@car/schema";
import { openSessionPort, type SessionPort } from "../../instrument/src/sessionPort";
import { computeQuilt } from "@car/frame";
import { tessellateQuilt, tangentField, continuityProbe } from "@car/surface";
import { meshQuilt, closedMeshCheck } from "@car/mesh";
import { evalChain } from "@car/num";
import { finishOf } from "@car/skin";
import { Viewport } from "./gl";

import p1Doc from "../../../cars/panoramic-p1.car.json";
import f1Doc from "../../../cars/mclaren-f1.car.json";
import etypeDoc from "../../../cars/etype-s1-fhc.car.json";
import mx5Doc from "../../../cars/mx5-na.car.json";
import e90Doc from "../../../cars/e90-m3.car.json";

const CARS = [
  { key: "p1", label: "P1", note: "80 cells · the quickest to shape", doc: p1Doc },
  { key: "mx5", label: "MX-5", note: "484 cells", doc: mx5Doc },
  { key: "etype", label: "E-Type", note: "572 cells", doc: etypeDoc },
  { key: "f1", label: "F1", note: "620 cells", doc: f1Doc },
  { key: "e90", label: "M3", note: "the sedan · four doors, two rows", doc: e90Doc },
] as const;

const RES = 14;
/** Under this, a drag was a click. Millimetres. */
const DRAG_MIN_MM = 2;
/** Screen distance, CSS pixels, inside which a pick counts. */
const PICK_PX = 12;
const HANDLE_PX = 16;

// ── line colours ───────────────────────────────────────────────────────────
// The network is not decoration: a line's colour is what the document says
// about it, so you can see at a glance which edges are marked and which are
// still just seams.
const C_PLAIN: [number, number, number] = [0.50, 0.53, 0.58];
const C_CREASE: [number, number, number] = [0.92, 0.93, 0.95];
const C_GAP: [number, number, number] = [0.36, 0.66, 0.92];
const C_SOFT: [number, number, number] = [0.35, 0.82, 0.62];
const C_SEL: [number, number, number] = [0.98, 0.52, 0.13];
const C_MIRROR: [number, number, number] = [0.30, 0.32, 0.35];

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const masterOf = (id: string): Id => (id.endsWith("~m") ? id.slice(0, -2) : id) as Id;
const hexToRgb = (h: string): [number, number, number] => {
  const v = parseInt(h.replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

type Level = 0 | 1 | 2;
const LEVEL_NAME = ["BLEND · G0", "FIELD · G1", "SOLVED · G2"];

const canvas = $("gl") as HTMLCanvasElement;
const vp = new Viewport(canvas);

let port: SessionPort;
let quilt: QuiltSpec;
let level: Level = 1;
let carIx = 0;
let selected: Id | null = null;
let handles: { seg: number; idx: 0 | 1 | 2 | 3; at: Pt3 }[] = [];
/** Sampled polyline per curve, for picking and for drawing. */
let polys = new Map<Id, Pt3[]>();
let bbox: { lo: number[]; hi: number[] } = { lo: [0, 0, 0], hi: [1, 1, 1] };
let matSlots = new Map<Id, number>();
let busy = false;
/**
 * How much of the network to draw. A 620-cell body carries eleven hundred
 * curves, and at a framing zoom that is a cage you cannot see the car through
 * — so this is not a preference, it is a working necessity on a big car.
 *   NET   every curve
 *   MARKS only the ones the document says something about, plus the selection
 *   OFF   the body alone
 */
let lineMode: 0 | 1 | 2 = 0;
const LINE_MODE = ["LINES · NET", "LINES · MARKS", "LINES · OFF"];

// ── evaluation ─────────────────────────────────────────────────────────────

function palette(): void {
  const st = port.session.state;
  const cols: [number, number, number][] = [[0.62, 0.60, 0.575]];
  const slotOf = new Map<string, number>();
  matSlots = new Map();
  for (const [id, cell] of st.cells) {
    const mat = cell.materialId === undefined ? undefined : st.materials.get(cell.materialId);
    if (!mat) continue;
    const key = `${mat.name}|${mat.color}`;
    let slot = slotOf.get(key);
    if (slot === undefined && cols.length < 16) {
      slot = cols.length;
      cols.push(hexToRgb(mat.color));
      slotOf.set(key, slot);
    }
    if (slot !== undefined) matSlots.set(id, slot);
  }
  vp.setPalette(cols);
  const legend = [...slotOf.keys()].map((k) => k.split("|")[0]!);
  $("legend").textContent = legend.length ? legend.join(" · ") : "no materials assigned";
}

function evaluate(lvl: Level): void {
  quilt = computeQuilt(port.session.state);
  const cross = lvl === 0 ? undefined : tangentField(quilt, { order: lvl });
  const mesh = tessellateQuilt(quilt, RES, cross);

  const pos = Float32Array.from(mesh.positions);
  const nrm = Float32Array.from(mesh.normals);
  const idx = Uint32Array.from(mesh.indices);
  const vertsPerCell = (RES + 1) * (RES + 1);
  const mat = new Float32Array(pos.length / 3);
  for (let ci = 0; ci < mesh.ranges.length; ci++) {
    const slot = matSlots.get(masterOf(mesh.ranges[ci]!.id)) ?? 0;
    if (slot) mat.fill(slot, ci * vertsPerCell, (ci + 1) * vertsPerCell);
  }
  vp.setSurface(pos, nrm, mat, idx);

  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k]!, pos[i + k]!); hi[k] = Math.max(hi[k]!, pos[i + k]!);
  }
  bbox = { lo, hi };
  level = lvl;
  network();
  readouts();
}

/** The curve network, sampled once and kept — picking reads the same points. */
function network(previewOf?: { id: Id; pts: Pt3[] }): void {
  polys = new Map();
  const N = 18;
  for (const [id, chain] of quilt.curves) {
    const pts: Pt3[] = [];
    const n = Math.max(N, chain.segs.length * 6);
    for (let i = 0; i <= n; i++) pts.push(evalChain(chain, i / n));
    polys.set(id, pts);
  }
  if (previewOf) polys.set(previewOf.id, previewOf.pts);

  const segs: number[] = [], cols: number[] = [];
  for (const [id, pts] of polys) {
    const master = masterOf(id);
    const mirror = master !== id;
    const mine = id === selected || (selected !== null && master === selected);
    const marked = quilt.gaps.has(id) || quilt.softening.has(id);
    if (lineMode === 2 && !mine) continue;
    if (lineMode === 1 && !mine && !marked) continue;
    let c: [number, number, number];
    if (mine) c = C_SEL;
    else if (mirror) c = C_MIRROR;
    else if (quilt.gaps.has(id)) c = C_GAP;
    else if (quilt.softening.has(id)) c = C_SOFT;
    else if (quilt.creases.has(id)) c = C_CREASE;
    else c = C_PLAIN;
    for (let i = 0; i + 1 < pts.length; i++) {
      segs.push(...pts[i]!, ...pts[i + 1]!);
      cols.push(...c, ...c);
    }
  }
  vp.setLines(Float32Array.from(segs), Float32Array.from(cols));
  points();
}

function points(): void {
  const pos: number[] = [], col: number[] = [];
  for (const h of handles) {
    pos.push(...h.at);
    col.push(0.99, 0.62, 0.20);
  }
  vp.setPoints(Float32Array.from(pos), Float32Array.from(col));
}

function refreshHandles(): void {
  handles = selected && port.curveControls ? [...port.curveControls(selected)] : [];
  points();
}

// ── the numbers, live ──────────────────────────────────────────────────────

function readouts(): void {
  const st = port.session.state;
  const d = [bbox.hi[0]! - bbox.lo[0]!, bbox.hi[1]! - bbox.lo[1]!, bbox.hi[2]! - bbox.lo[2]!];
  // The quilt counts, not the authored ones: the mirror law makes a twin of
  // every left-hand cell, and the build reports say 80 where the document says
  // 68. A tool that disagreed with its own build report would be lying.
  $("rCells").textContent = String(quilt.cells.length);
  $("rCurves").textContent = String(quilt.curves.size);
  $("rVerbs").textContent = String(port.session.save().verbs.length);
  $("rDims").textContent = d.map((v) => Math.round(v)).join(" × ");
  $("badge").textContent = LEVEL_NAME[level]!;
  $("badge").dataset.lvl = String(level);
  const marks = { crease: quilt.creases.size, gap: quilt.gaps.size, soft: quilt.softening.size };
  $("rMarks").textContent = `${marks.crease} creased · ${marks.gap} gapped · ${marks.soft} softened`;
}

function say(text: string, bad = false): void {
  const el = $("ledger");
  el.textContent = text;
  el.dataset.bad = String(bad);
}

// ── driving the session ────────────────────────────────────────────────────

function propose(verb: string, args: unknown, what: string): void {
  const wasCells = quilt.cells.length;
  port.propose(verb, args);
  const err = port.lastError();
  if (err) { say(err, true); return; }
  withBusy(() => {
    palette();
    evaluate(1);
    refreshHandles();
    // A move can change the TOPOLOGY, not just the shape, and silently: drag a
    // centreline curve sideways and the two cells that were their own mirror
    // stop being symmetric, so the mirror law starts emitting twins for them.
    // That is the law working, and it is exactly the kind of thing a tool must
    // not let happen behind your back.
    const now = quilt.cells.length;
    say(now === wasCells ? what : `${what} · topology changed: ${wasCells} → ${now} cells`);
  });
}

function withBusy(work: () => void): void {
  if (busy) return;
  busy = true;
  document.body.dataset.busy = "1";
  // Let the browser paint the busy state before a synchronous solve blocks it.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { work(); } catch (e) { say(e instanceof Error ? e.message : String(e), true); }
    busy = false;
    document.body.dataset.busy = "0";
    draw();
  }));
}

// ── picking ────────────────────────────────────────────────────────────────

function distToSeg(px: number, py: number, a: [number, number], b: [number, number]): number {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const L = vx * vx + vy * vy;
  const t = L > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * vx + (py - a[1]) * vy) / L)) : 0;
  return Math.hypot(px - (a[0] + vx * t), py - (a[1] + vy * t));
}

function pickHandle(x: number, y: number): number {
  let best = -1, bd = HANDLE_PX;
  for (let i = 0; i < handles.length; i++) {
    const s = vp.project(handles[i]!.at);
    if (!s) continue;
    const d = Math.hypot(s[0] - x, s[1] - y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function pickCurve(x: number, y: number): Id | null {
  let best: Id | null = null, bd = PICK_PX;
  for (const [id, pts] of polys) {
    if (masterOf(id) !== id) continue;      // the mirror is not authored; edit the master
    let prev = vp.project(pts[0]!);
    for (let i = 1; i < pts.length; i++) {
      const cur = vp.project(pts[i]!);
      if (prev && cur) {
        const d = distToSeg(x, y, prev, cur);
        if (d < bd) { bd = d; best = id; }
      }
      prev = cur;
    }
  }
  return best;
}

// ── the hand ───────────────────────────────────────────────────────────────

let drag: null | {
  mode: "orbit" | "handle";
  x: number; y: number;
  h?: number | undefined;
  base?: Pt3 | undefined;
  mmpp?: number | undefined;
  chain?: CurveChain | undefined;
  delta: Pt3;
} = null;
const pointers = new Map<number, { x: number; y: number }>();
let pinch = 0;

function localPt(e: PointerEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

/** The selected chain with one control point moved — a preview, not a verb. */
function previewChain(chain: CurveChain, seg: number, idx: number, d: Pt3): Pt3[] {
  const key = (["p0", "p1", "p2", "p3"] as const)[idx]!;
  const segs = chain.segs.map((s, i) => {
    if (i !== seg) return s;
    const p = s[key];
    return { ...s, [key]: [p[0] + d[0], p[1] + d[1], p[2] + d[2]] as Pt3 };
  });
  const moved = { segs } as CurveChain;
  const pts: Pt3[] = [];
  const n = Math.max(18, segs.length * 6);
  for (let i = 0; i <= n; i++) pts.push(evalChain(moved, i / n));
  return pts;
}

canvas.addEventListener("pointerdown", (e) => {
  if (busy) return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size > 1) { drag = null; return; }
  const [x, y] = localPt(e);
  const h = pickHandle(x, y);
  if (h >= 0 && selected) {
    const chain = quilt.curves.get(selected);
    drag = {
      mode: "handle", x, y, h, base: handles[h]!.at, mmpp: vp.mmPerPixel(handles[h]!.at),
      chain, delta: [0, 0, 0],
    };
    say(`pinch · ${selected} seg ${handles[h]!.seg} point ${handles[h]!.idx}`);
    return;
  }
  const c = pickCurve(x, y);
  if (c) {
    selected = c;
    refreshHandles();
    network();
    describe();
    draw();
    drag = { mode: "orbit", x, y, delta: [0, 0, 0] };
    return;
  }
  drag = { mode: "orbit", x, y, delta: [0, 0, 0] };
});

canvas.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    if (pinch > 0 && d > 0) zoom(pinch / d);
    pinch = d;
    draw();
    return;
  }
  if (!drag) return;
  if (drag.mode === "orbit") {
    vp.cam.yaw -= dx * 0.007;
    vp.cam.pitch = Math.max(-0.35, Math.min(1.35, vp.cam.pitch + dy * 0.005));
    draw();
    return;
  }
  // Dragging a control point: move it in the picture plane, which is the only
  // plane a single pointer can address without inventing a depth.
  const [x, y] = localPt(e);
  const ax = vp.screenAxes();
  const sx = (x - drag.x) * drag.mmpp!, sy = -(y - drag.y) * drag.mmpp!;
  drag.delta = [
    ax.right[0] * sx + ax.up[0] * sy,
    ax.right[1] * sx + ax.up[1] * sy,
    ax.right[2] * sx + ax.up[2] * sy,
  ];
  const b = drag.base!;
  handles[drag.h!] = { ...handles[drag.h!]!, at: [b[0] + drag.delta[0], b[1] + drag.delta[1], b[2] + drag.delta[2]] };
  if (drag.chain && selected) {
    network({ id: selected, pts: previewChain(drag.chain, handles[drag.h!]!.seg, handles[drag.h!]!.idx, drag.delta) });
  }
  say(`pinch · ${drag.delta.map((v) => Math.round(v)).join(", ")} mm`);
  draw();
});

function endPointer(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = 0;
  const d = drag;
  drag = null;
  if (!d || d.mode !== "handle" || !selected) return;
  const mag = Math.abs(d.delta[0]) + Math.abs(d.delta[1]) + Math.abs(d.delta[2]);
  if (mag < DRAG_MIN_MM) { refreshHandles(); network(); draw(); return; }
  const h = handles[d.h!]!;
  propose("push-pull",
    { target: { kind: "ctrl", id: selected, seg: h.seg, idx: h.idx }, delta: d.delta },
    `pushed ${selected} by ${d.delta.map((v) => Math.round(v)).join(", ")} mm`);
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

function zoom(f: number): void {
  vp.cam.dist = Math.max(vp.radius * 0.5, Math.min(vp.radius * 14, vp.cam.dist * f));
}
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoom(Math.exp(e.deltaY * 0.0012));
  draw();
}, { passive: false });

// ── the strip ──────────────────────────────────────────────────────────────

function describe(): void {
  const el = $("sel");
  if (!selected) { el.textContent = "nothing selected — tap a line"; return; }
  const marks: string[] = [];
  if (quilt.creases.has(selected)) marks.push("creased");
  if (quilt.gaps.has(selected)) marks.push("gapped");
  const s = quilt.softening.get(selected);
  if (s) marks.push(s.end === undefined ? `R${s.start}` : `R${s.start}→${s.end}`);
  el.textContent = `${selected} · ${handles.length} control points${marks.length ? " · " + marks.join(" · ") : ""}`;
}

function needSel(): boolean {
  if (selected) return true;
  say("pick a line first", true);
  return false;
}

$("bCrease").onclick = () => { if (needSel()) propose("crease", { curveId: selected }, `creased ${selected}`); };
$("bGap").onclick = () => { if (needSel()) propose("gap", { curveId: selected }, `gapped ${selected}`); };
$("bSoften").onclick = () => {
  if (!needSel()) return;
  const r = Number(($("rad") as HTMLInputElement).value);
  const e = ($("radEnd") as HTMLInputElement).value.trim();
  const args: Record<string, unknown> = { curveId: selected, radius: r };
  if (e !== "") args.endRadius = Number(e);
  propose("soften", args, `softened ${selected} to R${r}${e ? `→${e}` : ""}`);
};
$("bSplit").onclick = () => {
  if (!needSel()) return;
  const ts = port.curveSplitPoints ? port.curveSplitPoints(selected!) : [];
  if (!ts.length) { say("nothing crosses this curve, so there is no place to split it", true); return; }
  const t = ts[Math.floor(ts.length / 2)]!;
  propose("split-curve", { curveId: selected, t }, `split ${selected} at t=${t.toFixed(3)}`);
};
$("bFuller").onclick = () => fullness(1.25);
$("bFlatter").onclick = () => fullness(0.8);
function fullness(f: number): void {
  if (!needSel()) return;
  const owners = quilt.cells.filter((c) => c.sides.some((s) => s.curveId === selected)).map((c) => masterOf(c.id));
  const ids = [...new Set(owners)];
  if (!ids.length) { say("no cell owns that curve", true); return; }
  const now = quilt.fullness.get(ids[0]!) ?? 1;
  propose("fullness", { cellIds: ids, amount: Math.max(0.2, Math.min(3, now * f)) },
    `fullness ${(now * f).toFixed(2)} on ${ids.length} cell${ids.length > 1 ? "s" : ""}`);
}
$("bFair").onclick = () => propose("fair-corners", { maxBreakDeg: 12 }, "faired the corners under 12°");
$("bUndo").onclick = () => {
  if (!port.undo()) { say("nothing left to undo — the seed stays", true); return; }
  selected = null; handles = [];
  say("undone");
  withBusy(() => { palette(); evaluate(1); describe(); });
};
$("bSolve").onclick = () => { say("solving the curvature field…"); withBusy(() => evaluate(2)); };
$("bFrame").onclick = () => { vp.frame(bbox.lo, bbox.hi); draw(); };
$("bLines").onclick = () => {
  lineMode = ((lineMode + 1) % 3) as 0 | 1 | 2;
  $("bLines").textContent = LINE_MODE[lineMode]!;
  network();
  draw();
};
$("bPaint").onclick = () => {
  vp.paint = vp.paint > 0.5 ? 0 : 1;
  ($("bPaint") as HTMLButtonElement).setAttribute("aria-pressed", String(vp.paint > 0.5));
  draw();
};

$("bMeasure").onclick = () => {
  say("measuring…");
  withBusy(() => {
    const cross = tangentField(quilt, { order: 2 });
    const g1 = continuityProbe(quilt, { cross });
    const closed = closedMeshCheck(meshQuilt(quilt, { cross }));
    $("rG1").textContent = `${g1.g1Joins}/${g1.joins} · worst ${g1.worstDeg.toFixed(3)}°`;
    $("rClosed").textContent = closed.closed ? "closed" : `OPEN · ${closed.violations.length}`;
    ($("rClosed") as HTMLElement).dataset.bad = String(!closed.closed);
    level = 2;
    say(`measured: G1 ${g1.g1Joins} of ${g1.joins} joins, worst ${g1.worstDeg.toFixed(3)}°`);
    readouts();
  });
};

// ── boot ───────────────────────────────────────────────────────────────────

function boot(i: number): void {
  carIx = i;
  say(`opening ${CARS[i]!.label}…`);
  withBusy(() => {
    port = openSessionPort(CARS[i]!.doc as unknown as CarDocument);
    selected = null; handles = [];
    palette();
    evaluate(1);
    vp.frame(bbox.lo, bbox.hi);
    describe();
    $("rG1").textContent = "—";
    $("rClosed").textContent = "—";
    ($("rClosed") as HTMLElement).dataset.bad = "false";
    say(`${CARS[i]!.label} open · ${CARS[i]!.note}`);
  });
}

const tabs = $("cartabs");
CARS.forEach((c, i) => {
  const b = document.createElement("button");
  b.textContent = c.label;
  b.setAttribute("aria-pressed", String(i === 0));
  b.onclick = () => {
    if (busy) return;
    for (const s of tabs.children) s.setAttribute("aria-pressed", String(s === b));
    boot(i);
  };
  tabs.appendChild(b);
});

let queued = false;
function draw(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; vp.draw(); });
}
new ResizeObserver(draw).observe(canvas);

// A test hook, and the only one. Handles are drawn by the GPU, so nothing
// outside this module can find them on screen — which would leave the one
// gesture that MATTERS (drag a control point, get a verb) untestable except
// by eye. It reads state and changes none.
(window as unknown as { makerHandles?: () => unknown }).makerHandles = () =>
  handles.map((h) => ({ seg: h.seg, idx: h.idx, at: h.at, screen: vp.project(h.at) }));

boot(0);
