import * as THREE from "three";
import body from "./body.json";

const params = new URLSearchParams(location.search);
const view = params.get("view") ?? "persp";
/** Skin lenses (charge §9 and the curvature companion): read-only overlays. */
const lens = params.get("lens") ?? "";
/** Zebra on the true per-patch normals rather than the crease-split shaded ones. */
const analytic = params.get("normals") === "analytic";

const tag = document.getElementById("tag")!;
const line = (t: string) => t;
if (view === "side") {
  tag.innerHTML =
    line(`PANORAMIC · FRAME INSTRUMENT<span class="accent"> ●</span> SIDE ELEVATION`) + "\n" +
    line(`SHARED CURVES ${body.curves.length} — CREASES IN ACCENT — ENGINE-CUT ARCHES`) + "\n" +
    line(`MM GRID · ${body.stats.verbs} VERBS IN HISTORY`);
} else if (lens === "cp") {
  const cp = body.cp;
  tag.innerHTML =
    line(`PANORAMIC · AERO LENS<span class="accent"> ●</span> PRESSURE COEFFICIENT`) + "\n" +
    line(`${cp.panels} SOURCE PANELS · Cp ${cp.p02.toFixed(2)} TO ${cp.p98.toFixed(2)} SHOWN (${cp.min.toFixed(2)}/${cp.max.toFixed(2)} FULL) · FRONTAL ${cp.frontalAreaM2.toFixed(2)} M²`) + "\n" +
    line(`POTENTIAL FLOW — NO WAKE, NO DRAG. THIS MAP IS NOT A FORCE.`);
} else if (lens === "curvature") {
  tag.innerHTML =
    line(`PANORAMIC · CURVATURE LENS<span class="accent"> ●</span> MEAN CURVATURE`) + "\n" +
    line(`COTANGENT LAPLACE-BELTRAMI ON THE PRINT MESH`) + "\n" +
    line(`RANGE ±${(body.curvature.p98 * 1000).toFixed(2)} × 10⁻³ /MM (98TH PCT) · ${body.curvature.degenerate} COLLAPSED CORNERS UNMEASURABLE`);
} else if (lens === "zebra") {
  const a = body.analytic;
  tag.innerHTML = analytic
    ? line(`PANORAMIC · ZEBRA<span class="accent"> ●</span> ANALYTIC SURFACE NORMALS`) + "\n" +
      line(`PER-PATCH COONS NORMALS, NO CREASE SPLITTING — A BROKEN STRIPE IS A BROKEN SURFACE`) + "\n" +
      line(`G1 ${a.g1Joins}/${a.joins} JOINS · MEDIAN ${a.medianDeg.toFixed(2)}° · WORST ${a.worstDeg.toFixed(2)}°`)
    : line(`PANORAMIC · ZEBRA<span class="accent"> ●</span> SHADED NORMALS`) + "\n" +
      line(`CREASE-SPLIT AT 48° — AN AUTHORED EDGE BREAKS A STRIPE TOO`) + "\n" +
      line(`ADD &normals=analytic TO SEE THE SURFACE ITSELF`);
} else {
  tag.innerHTML =
    line(`PANORAMIC · FRAME INSTRUMENT<span class="accent"> ●</span> WORKED BODY`) + "\n" +
    line(`VERB-SCULPTED QUILT + OCCT BOOLEAN ARCHES`) + "\n" +
    line(`CELLS ${body.stats.cells} · TRIS ${body.stats.upperTris + body.stats.slabTris} · CLOSED ${String(body.stats.upperClosed && body.stats.slabClosed).toUpperCase()}`);
}

// --- lens colour ramps -----------------------------------------------------
// Blue is high pressure, red is low: the convention every tunnel plot uses,
// so nobody has to learn a new one to read this.
function ramp(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  const stops: [number, number, number][] = [
    [0.13, 0.20, 0.55], [0.20, 0.60, 0.75], [0.85, 0.87, 0.83],
    [0.92, 0.55, 0.25], [0.78, 0.16, 0.12],
  ];
  const f = x * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  const u = f - i;
  const a = stops[i]!, b = stops[i + 1]!;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

const ZEBRA_VERT = `
varying vec3 vN;
void main() {
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const ZEBRA_FRAG = `
varying vec3 vN;
void main() {
  float band = fract(dot(normalize(vN), normalize(vec3(1.0, 1.0, 0.35))) * 9.0);
  float s = step(0.5, band);
  vec3 c = mix(vec3(0.09, 0.09, 0.10), vec3(0.88, 0.88, 0.86), s);
  gl_FragColor = vec4(c, 1.0);
}`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0c);

const w = window.innerWidth, h = window.innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);

function meshOf(data: { positions: number[]; normals: number[]; indices: number[] }, color: number): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(Float32Array.from(data.positions), 3));
  geo.setIndex(new THREE.Uint32BufferAttribute(Uint32Array.from(data.indices), 1));
  // Smoothing groups, baked by creaseNormals in the render script: normals are
  // averaged across a panel and split at every hard edge. computeVertexNormals
  // would average ALL of them and melt the car; flat shading would show every
  // tessellation facet. Neither is how a body reads.
  if (data.normals.length === data.positions.length) {
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(Float32Array.from(data.normals), 3));
  } else {
    geo.computeVertexNormals();
  }
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, metalness: 0.08, roughness: 0.42, flatShading: false }));
}

const upper = meshOf(body.upper, 0xd8d8d2);
const slab = meshOf(body.slab, 0xb9b9b4);

if (view === "side") {
  // The instrument's native view: hairline curves on the mm grid, no fill.
  // GridHelper lies in XZ — exactly the side-elevation plane; park it behind
  // the body relative to the -Y camera.
  const grid = new THREE.GridHelper(12000, 120, 0x232328, 0x17171b);
  grid.position.set(2100, 400, 560);
  scene.add(grid);

  for (const c of body.curves) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < c.pts.length; i += 3) pts.push(new THREE.Vector3(c.pts[i], c.pts[i + 1], c.pts[i + 2]));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: c.crease ? 0xff5533 : 0xc9c9c2 });
    scene.add(new THREE.Line(geo, mat));
  }
  const slabEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(slab.geometry, 8),
    new THREE.LineBasicMaterial({ color: 0xc9c9c2 }),
  );
  scene.add(slabEdges);

  // Symmetric frustum centered on the body's midpoint — the camera sits on
  // the car's left; if the nose reads right, the +Y camera flips it.
  const cam = new THREE.OrthographicCamera(-2450, 2450, 1400, -1400, 10, 20000);
  cam.up.set(0, 0, 1);
  cam.position.set(2100, -8000, 560);
  cam.lookAt(2100, 0, 560);
  cam.updateProjectionMatrix();
  renderer.render(scene, cam);
} else {
  const grid = new THREE.GridHelper(12000, 60, 0x26262b, 0x1a1a1f);
  grid.rotation.x = Math.PI / 2;
  grid.position.set(2100, 0, 0);
  scene.add(grid);

  if (lens === "zebra") {
    if (analytic) {
      // Swap in the analytic surface entirely: per-patch vertices, per-patch
      // normals, nothing shared across a join. Two patches that disagree show
      // it here and cannot show it in the shaded view.
      const a = body.analytic;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(Float32Array.from(a.positions), 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(Float32Array.from(a.normals), 3));
      g.setIndex(new THREE.Uint32BufferAttribute(Uint32Array.from(a.indices), 1));
      upper.geometry = g;
    }
    upper.material = new THREE.ShaderMaterial({ vertexShader: ZEBRA_VERT, fragmentShader: ZEBRA_FRAG });
  } else if (lens === "cp") {
    // Cp is per TRIANGLE, so the geometry is de-indexed: three coloured
    // corners per face. The shape is identical; only the buffer is wider.
    const src = upper.geometry;
    const pos = src.getAttribute("position");
    const nrm = src.getAttribute("normal");
    const idx = src.getIndex()!;
    const n = idx.count;
    const p = new Float32Array(n * 3), q = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const cpv = body.cp.perTriangle as number[];
    const lo = body.cp.p02 as number, hi = body.cp.p98 as number;
    for (let k = 0; k < n; k++) {
      const v = idx.getX(k);
      p[k * 3] = pos.getX(v); p[k * 3 + 1] = pos.getY(v); p[k * 3 + 2] = pos.getZ(v);
      q[k * 3] = nrm.getX(v); q[k * 3 + 1] = nrm.getY(v); q[k * 3 + 2] = nrm.getZ(v);
      // Reversed: Cp high (stagnation) reads blue, Cp low (suction) reads red.
      const c = ramp(1 - (cpv[Math.floor(k / 3)]! - lo) / Math.max(1e-9, hi - lo));
      col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(q, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    upper.geometry = g;
    upper.material = new THREE.MeshBasicMaterial({ vertexColors: true });
  } else if (lens === "curvature") {
    // Curvature is per PRINT vertex; sourceOf maps each render vertex back to
    // the print vertex it was split from, so no re-derivation is needed.
    const mean = body.curvature.mean as number[];
    const ok = body.curvature.valid as number[];
    const src = body.curvature.sourceOf as number[];
    const scale = Math.max(1e-9, body.curvature.p98 as number);
    const n = upper.geometry.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    for (let v = 0; v < n; v++) {
      const p = src[v] ?? v;
      // A collapsed corner gets the neutral middle of the ramp, not a colour
      // that would read as a curvature reading it does not have.
      const c = ok[p] === 1
        ? ramp(0.5 + 0.5 * Math.max(-1, Math.min(1, (mean[p] ?? 0) / scale)))
        : [0.55, 0.55, 0.55] as [number, number, number];
      col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2];
    }
    upper.geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    upper.material = new THREE.MeshBasicMaterial({ vertexColors: true });
  }

  scene.add(upper, slab);
  // No edge overlay on the body. With split normals the hard edges draw
  // themselves in shading, the way they do on a real panel; a wireframe pass
  // could only re-trace tessellation seams on top of that.

  // creased door lines in accent
  for (const c of body.curves.filter((k: { crease: boolean }) => k.crease)) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i + 2 < c.pts.length; i += 3) {
      pts.push(new THREE.Vector3(c.pts[i] ?? 0, (c.pts[i + 1] ?? 0) * 1.001, c.pts[i + 2] ?? 0));
    }
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xff5533 })));
  }

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-4000, -6000, 7000);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8899ff, 0.5);
  rim.position.set(6000, 4000, 2000);
  scene.add(rim);

  const which = new URLSearchParams(location.search).get("cam") ?? "front34";
  const rigs: Record<string, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
    front34: { pos: [-3400, -5200, 2100], look: [2100, 0, 480], fov: 30 },
    rear34: { pos: [7600, -5000, 2300], look: [2200, 0, 500], fov: 30 },
    low: { pos: [-2600, -4200, 700], look: [2300, 0, 620], fov: 34 },
    plan: { pos: [2200, -10, 9000], look: [2200, 0, 0], fov: 26 },
    front: { pos: [-9000, 0, 900], look: [2200, 0, 700], fov: 22 },
    rear: { pos: [13000, 0, 1100], look: [2200, 0, 700], fov: 22 },
    // Long lens from the side: near-orthographic, which is how a profile is
    // judged. The wireframe "side" view draws curves; this one draws the body.
    profile: { pos: [2150, -26000, 640], look: [2150, 0, 640], fov: 11 },
  };
  const rig = rigs[which] ?? rigs["front34"]!;
  const cam = new THREE.PerspectiveCamera(rig.fov, w / h, 10, 60000);
  cam.up.set(0, 0, 1);
  cam.position.set(rig.pos[0], rig.pos[1], rig.pos[2]);
  cam.lookAt(rig.look[0], rig.look[1], rig.look[2]);
  renderer.render(scene, cam);
}

document.title = "ready";
