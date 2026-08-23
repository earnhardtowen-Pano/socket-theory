/**
 * The instrument shell. One viewport on grid paper; the verb strip on the
 * left; the site tree on the right; the ledger along the bottom. Everything
 * the shell does goes through the ModelPort seam — render the feed, propose
 * verbs, repaint on change.
 */

import type { CarDocument, Id, OrthoView, Pt2 } from "@car/schema";
import { computeQuilt } from "@car/frame";
import { closedMeshCheck, meshQuilt, writeStlBinary } from "@car/mesh";
import { makeSessionPort, openSessionPort, type SessionPort } from "./sessionPort";
import p1Doc from "./cars/panoramic-p1.json";
import { Viewport } from "./viewport";
import { pickAt } from "./pick";
import { gridCandidate, snapResolve, type SnapCandidate } from "./snap";
import { gridPitchFor, orthoViewOf, screenToView, worldToView, type CamState, type OrthoName, type ViewName } from "./view";
import {
  creaseAt, fairCorners, gapAt, selectAt, PinchTool, PushPullTool, TapeBoxTool, TapeLineTool,
  type DepthSetting, type ToolName, type ToolResult,
} from "./tools";

const STORE_KEY = "panoramic.car";
const LOAD_FLAG = "panoramic.load";

function bootPort(): SessionPort {
  // ?car=p1 opens the Panoramic P1 straight away — a shareable link to a car.
  if (new URLSearchParams(location.search).get("car") === "p1") {
    return openSessionPort(p1Doc as unknown as CarDocument);
  }
  // Storage can be absent or throwing (private mode, sandboxed thumbnails):
  // every touch is guarded, and a broken saved document falls back to fresh.
  try {
    if (localStorage.getItem(LOAD_FLAG) === "1") {
      localStorage.removeItem(LOAD_FLAG);
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return openSessionPort(JSON.parse(raw) as CarDocument);
    }
  } catch {
    // fall through to a fresh site
  }
  return makeSessionPort(true);
}

const port = bootPort();
const app = document.getElementById("app")!;
app.innerHTML = `
  <header id="tabs">
    <span class="brand">PANORAMIC<span class="accent"> ●</span> FRAME INSTRUMENT</span>
    <nav id="viewtabs"></nav>
    <span id="modes">
      <button id="undoBtn" class="toggle">UNDO</button>
      <button id="saveBtn" class="toggle">SAVE</button>
      <button id="openBtn" class="toggle">OPEN</button>
      <button id="newBtn" class="toggle">NEW</button>
      <button id="p1Btn" class="toggle">P1</button>
      <button id="printBtn" class="toggle">PRINT</button>
      <button id="smooth" class="toggle">SMOOTH</button>
      <button id="zebraBtn" class="toggle">ZEBRA</button>
    </span>
  </header>
  <aside id="verbs"></aside>
  <main id="stage"><canvas id="canvas"></canvas></main>
  <aside id="tree"><div class="railtitle">SITE</div><div id="treelist"></div></aside>
  <footer id="ledger">
    <span id="ledgerline">ready — the site is open</span>
    <span id="depthbox">AT <input id="atInput" value="-750" size="5"> DEPTH <input id="depthInput" value="1500" size="5"> MM</span>
    <span id="pitch"></span>
  </footer>
`;

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const viewport = new Viewport(canvas);
const ledgerLine = document.getElementById("ledgerline")!;
const pitchEl = document.getElementById("pitch")!;

const VIEWS: ViewName[] = ["side", "plan", "front", "section", "inspect"];
const TOOLS: ToolName[] = ["select", "tape-box", "tape-line", "push-pull", "pinch", "crease", "gap", "fair"];

const startView = new URLSearchParams(location.search).get("view") as ViewName | null;
let currentView: ViewName = startView && (VIEWS as string[]).includes(startView) ? startView : "side";
let tool: ToolName = "select";
let sketchClass: "tape" | "sketch" = "tape";
let selection: Id | null = null;
let sectionX = 2100;

interface MutableCam { center: Pt2; mmPerPx: number }
const cams: Record<OrthoName, MutableCam> = {
  side: { center: [2100, 700], mmPerPx: 4 },
  plan: { center: [2100, 0], mmPerPx: 4 },
  front: { center: [0, 700], mmPerPx: 4 },
  section: { center: [0, 700], mmPerPx: 4 },
};

const tapeBox = new TapeBoxTool();
const tapeLine = new TapeLineTool();
const pushPull = new PushPullTool();
const pinch = new PinchTool();

function orthoView(): OrthoView {
  return orthoViewOf(currentView === "inspect" ? "side" : (currentView as OrthoName), sectionX);
}

function size() {
  const r = canvas.getBoundingClientRect();
  return { w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) };
}

function depthSetting(): DepthSetting {
  const at = Number((document.getElementById("atInput") as HTMLInputElement).value);
  const depth = Number((document.getElementById("depthInput") as HTMLInputElement).value);
  return { at: Number.isFinite(at) ? at : 0, depth: Number.isFinite(depth) ? depth : 100 };
}

// --- snapping: grid + curve endpoints ---------------------------------------
function snapPoint(pv: Pt2): Pt2 {
  const view = orthoView();
  const cam = cams[currentView === "inspect" ? "side" : (currentView as OrthoName)];
  const pitch = gridPitchFor(cam.mmPerPx);
  const feed = port.feed();
  const candidates: SnapCandidate[] = [gridCandidate(pv, pitch)];
  const pos = feed.lines.positions;
  for (const r of feed.lines.ranges) {
    for (const i of [r.start, r.start + r.count - 3]) {
      const w = [pos[i]!, pos[i + 1]!, pos[i + 2]!] as const;
      candidates.push({ at: worldToView(view, w), kind: "vertex", id: r.id });
    }
  }
  const tolMm = 8 * cam.mmPerPx;
  return snapResolve(pv, candidates, tolMm)?.at ?? pv;
}

function targetsCrossed(a: Pt2, b: Pt2): Id[] {
  const view = orthoView();
  const feed = port.feed();
  const ids = new Set<Id>();
  for (let t = 0.1; t <= 0.9; t += 0.2) {
    const p: Pt2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const hit = pickAt(feed, view, p, 2);
    if (hit && hit.kind === "cell") ids.add(hit.id);
  }
  return [...ids].sort();
}

// --- rendering ---------------------------------------------------------------
function paint(): void {
  viewport.resize(size());
  viewport.setFeed(port.feed(), port.creaseIds(), port.gapIds());
  if (currentView === "inspect") viewport.renderInspect(size());
  else {
    const cam = cams[currentView as OrthoName];
    viewport.renderOrtho(orthoView(), cam, size());
    pitchEl.textContent = `GRID ${gridPitchFor(cam.mmPerPx)} MM`;
  }
}

function repaintSoon(): void {
  requestAnimationFrame(paint);
}

function ledger(text: string): void {
  ledgerLine.textContent = text;
}

function applyResult(r: ToolResult): void {
  if (r.ghost !== undefined) viewport.setGhost(r.ghost ?? null, orthoView(), depthSetting().at);
  if (r.proposal) {
    port.propose(r.proposal.verb, r.proposal.args);
    viewport.setGhost(null, orthoView(), 0);
    const err = port.lastError();
    ledger(err ? `rejected — ${err}` : `${r.proposal.verb} recorded · ${port.session.log.length} verbs in history`);
  }
  if (r.selection !== undefined) {
    selection = r.selection;
    if (selection) ledger(port.describe(selection));
  }
  if (r.status) ledger(r.status);
  refreshTree();
  repaintSoon();
}

// --- DOM: tabs, verbs, tree ---------------------------------------------------
const viewtabs = document.getElementById("viewtabs")!;
for (const v of VIEWS) {
  const b = document.createElement("button");
  b.textContent = v.toUpperCase();
  b.dataset["view"] = v;
  b.onclick = () => {
    currentView = v;
    for (const el of viewtabs.children) el.classList.toggle("on", (el as HTMLElement).dataset["view"] === v);
    repaintSoon();
  };
  viewtabs.appendChild(b);
}
for (const el of viewtabs.children) {
  el.classList.toggle("on", (el as HTMLElement).dataset["view"] === currentView);
}
if (new URLSearchParams(location.search).get("zebra") === "1") viewport.zebra = true;

const verbsEl = document.getElementById("verbs")!;
for (const t of TOOLS) {
  const b = document.createElement("button");
  b.textContent = t.toUpperCase().replace("-", " ");
  b.dataset["tool"] = t;
  b.onclick = () => {
    tool = t;
    tapeLine.cancel();
    for (const el of verbsEl.children) el.classList.toggle("on", (el as HTMLElement).dataset["tool"] === t);
    const hints: Partial<Record<ToolName, string>> = {
      "tape-line": "two clicks; hold S for sketch class",
      "push-pull": "drag a face or curve; hold N for the view normal",
      "pinch": "grab a curve near a contact point and move it; hold N for the view normal",
    };
    ledger(`${t} — ${hints[t] ?? "ready"}`);
  };
  verbsEl.appendChild(b);
}
(verbsEl.children[0] as HTMLElement).classList.add("on");

function refreshTree(): void {
  const t = port.tree();
  const el = document.getElementById("treelist")!;
  const row = (id: string) =>
    `<div class="node${selection === id ? " sel" : ""}" data-id="${id}">${id}</div>`;
  el.innerHTML =
    `<div class="sect">CELLS ${t.cells.length}</div>${t.cells.slice(0, 40).map(row).join("")}` +
    `<div class="sect">GROUPS ${t.groups.length}</div>${t.groups.map(row).join("")}` +
    `<div class="sect">DATUMS ${t.datums.length}</div>${t.datums.map(row).join("")}`;
  for (const node of el.querySelectorAll<HTMLElement>(".node")) {
    node.onclick = () => {
      selection = node.dataset["id"] as Id;
      ledger(port.describe(selection));
      refreshTree();
    };
  }
}

// --- pointer plumbing ---------------------------------------------------------
let nHeld = false;
let sHeld = false;
window.addEventListener("keydown", (e) => {
  if (e.key === "n" || e.key === "N") nHeld = true;
  if (e.key === "s" || e.key === "S") sHeld = true;
});
window.addEventListener("keyup", (e) => {
  if (e.key === "n" || e.key === "N") nHeld = false;
  if (e.key === "s" || e.key === "S") sHeld = false;
});

let panning = false;
let lastScreen: Pt2 = [0, 0];

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  lastScreen = [e.offsetX, e.offsetY];
  if (e.button === 1 || currentView === "inspect") {
    panning = e.button === 1;
    return;
  }
  const cam = cams[currentView as OrthoName];
  const pv = snapPoint(screenToView(orthoView(), cam, size(), [e.offsetX, e.offsetY]));
  if (tool === "tape-box") applyResult(tapeBox.down(pv));
  else if (tool === "push-pull") {
    const hit = pickAt(port.feed(), orthoView(), pv, 6 * cam.mmPerPx);
    applyResult(pushPull.down(pv, hit));
  } else if (tool === "pinch") {
    const hit = pickAt(port.feed(), orthoView(), pv, 8 * cam.mmPerPx);
    const view = orthoView();
    applyResult(pinch.down(pv, hit, (id) => port.curveControls?.(id) ?? [], (w) => worldToView(view, w)));
    if (hit?.kind === "curve") {
      viewport.setHandles((port.curveControls?.(hit.id) ?? []).map((c) => c.at));
    }
  }
});

canvas.addEventListener("pointermove", (e) => {
  const cur: Pt2 = [e.offsetX, e.offsetY];
  if (currentView === "inspect") {
    if (e.buttons & 1) {
      viewport.orbitBy((cur[0] - lastScreen[0]) * -0.005, (cur[1] - lastScreen[1]) * -0.005);
      repaintSoon();
    }
    lastScreen = cur;
    return;
  }
  const cam = cams[currentView as OrthoName];
  if (panning && (e.buttons & 4)) {
    cam.center = [
      cam.center[0] - (cur[0] - lastScreen[0]) * cam.mmPerPx,
      cam.center[1] + (cur[1] - lastScreen[1]) * cam.mmPerPx,
    ];
    lastScreen = cur;
    repaintSoon();
    return;
  }
  lastScreen = cur;
  const pv = snapPoint(screenToView(orthoView(), cam, size(), cur));
  if (tool === "tape-box") applyResult(tapeBox.move(pv));
  else if (tool === "tape-line") applyResult(tapeLine.move(pv));
  else if (tool === "push-pull") applyResult(pushPull.move(pv));
  else if (tool === "pinch") applyResult(pinch.move(pv));
});

canvas.addEventListener("pointerup", (e) => {
  panning = false;
  if (currentView === "inspect") return;
  const cam = cams[currentView as OrthoName];
  const pv = snapPoint(screenToView(orthoView(), cam, size(), [e.offsetX, e.offsetY]));
  const view = orthoView();
  if (tool === "tape-box") applyResult(tapeBox.up(pv, view, depthSetting()));
  else if (tool === "tape-line") applyResult(tapeLine.click(pv, view, sHeld ? "sketch" : "tape", targetsCrossed));
  else if (tool === "push-pull") applyResult(pushPull.up(pv, view, nHeld));
  else if (tool === "pinch") {
    applyResult(pinch.up(pv, view, nHeld));
    if (selection) viewport.setHandles((port.curveControls?.(selection) ?? []).map((c) => c.at));
  }
  else if (tool === "select") applyResult(selectAt(pickAt(port.feed(), view, pv, 6 * cam.mmPerPx)));
  else if (tool === "crease") applyResult(creaseAt(pickAt(port.feed(), view, pv, 6 * cam.mmPerPx)));
  else if (tool === "gap") applyResult(gapAt(pickAt(port.feed(), view, pv, 6 * cam.mmPerPx)));
  // FAIR acts on the whole network, so any click in the viewport runs it —
  // there is no "this corner" to pick, and pretending otherwise would teach
  // the wrong model of what it does.
  else if (tool === "fair") applyResult(fairCorners(viewport.creaseAngle));
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (currentView === "inspect") {
    viewport.zoomOrbit(e.deltaY > 0 ? 1.12 : 0.9);
  } else {
    const cam = cams[currentView as OrthoName];
    cam.mmPerPx = Math.min(Math.max(cam.mmPerPx * (e.deltaY > 0 ? 1.12 : 0.9), 0.2), 40);
  }
  repaintSoon();
}, { passive: false });

/**
 * Offer a generated file to the viewer: the artifact host mediates it through
 * the downloads capability (viewer confirms); local dev falls back to a plain
 * blob download. Never silent, never guaranteed — outcomes land in the ledger.
 */
async function offerFile(filename: string, data: string | ArrayBuffer, okNote: string): Promise<void> {
  const use = (window as { claude?: { use?: (n: string) => Promise<unknown> } }).claude?.use;
  if (use) {
    try {
      const downloads = (await use("downloads")) as
        | { save: (r: { filename: string; data: string | ArrayBuffer }) => Promise<unknown> }
        | null;
      if (downloads) {
        await downloads.save({ filename, data });
        ledger(okNote);
        return;
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      ledger(code === "declined" ? "save declined" : `save failed — ${code ?? String(e)}`);
      return;
    }
  }
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data as BlobPart]));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    ledger(okNote);
  } catch {
    ledger("save — downloads unavailable in this context");
  }
}

document.getElementById("undoBtn")!.addEventListener("click", () => {
  ledger(port.undo()
    ? `undone — ${port.session.log.length} verbs in history`
    : "undo — at the floor: the site never opens on empty space");
  refreshTree();
  repaintSoon();
});

document.getElementById("saveBtn")!.addEventListener("click", () => {
  const doc = port.saveDocument();
  const json = JSON.stringify(doc);
  let stored = false;
  try {
    localStorage.setItem(STORE_KEY, json);
    stored = true;
  } catch { /* storage unavailable here */ }
  const note = stored
    ? `saved — ${doc.verbs.length} verbs; OPEN restores it on this device`
    : `saved as a file — ${doc.verbs.length} verbs (device storage unavailable here)`;
  void offerFile(`${doc.title.replace(/\s+/g, "-")}.car.json`, json, note);
});

document.getElementById("openBtn")!.addEventListener("click", () => {
  try {
    if (!localStorage.getItem(STORE_KEY)) {
      ledger("open — nothing saved on this device yet");
      return;
    }
    localStorage.setItem(LOAD_FLAG, "1");
    location.reload();
  } catch {
    ledger("open — storage unavailable in this context");
  }
});

document.getElementById("newBtn")!.addEventListener("click", () => {
  try { localStorage.removeItem(LOAD_FLAG); } catch { /* fine */ }
  location.reload();
});

document.getElementById("p1Btn")!.addEventListener("click", () => {
  // The P1 is a document like any other: 46 verbs of history, replayed live.
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p1Doc));
    localStorage.setItem(LOAD_FLAG, "1");
    location.reload();
  } catch {
    ledger("P1 — storage unavailable here; run locally to open the car");
  }
});

document.getElementById("printBtn")!.addEventListener("click", () => {
  const quilt = computeQuilt(port.session.state);
  const mesh = meshQuilt(quilt, {});
  const report = closedMeshCheck(mesh);
  const tris = mesh.indices.length / 3;
  const verdict = `print — closed mesh ${String(report.closed).toUpperCase()} · ${tris} triangles · ${port.session.log.length} verbs of history`;
  if (!report.closed) {
    ledger(`${verdict} · ${report.violations.length} violations — not printable yet`);
    return;
  }
  const stl = writeStlBinary(mesh, "panoramic-v1");
  // The host's download allowlist has no .stl — ship the bytes as .stl.txt;
  // rename after saving and every slicer reads it.
  void offerFile(
    "panoramic-v1.stl.txt",
    stl.buffer.slice(0) as ArrayBuffer,
    `${verdict} · STL saved as .stl.txt — rename to .stl for the slicer`,
  );
});

document.getElementById("smooth")!.addEventListener("click", (e) => {
  viewport.smooth = !viewport.smooth;
  (e.currentTarget as HTMLElement).classList.toggle("on", viewport.smooth);
  ledger(viewport.smooth
    ? `smooth — ${viewport.creaseAngle}\u00b0 smoothing groups: panels read continuous, feature lines stay hard`
    : "crude — as blocked, every facet flat; same geometry either way, only the shading differs");
  repaintSoon();
});
document.getElementById("zebraBtn")!.addEventListener("click", (e) => {
  viewport.zebra = !viewport.zebra;
  (e.currentTarget as HTMLElement).classList.toggle("on", viewport.zebra);
  repaintSoon();
});

port.onChange(repaintSoon);
window.addEventListener("resize", repaintSoon);
refreshTree();
paint();
ledger(`the site is open — ${port.tree().cells.length} cells on the rolling chassis (one rail authored; the mirror law renders its twin)`);
