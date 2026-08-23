import * as THREE from "three";
import body from "./body.json";

const view = new URLSearchParams(location.search).get("view") ?? "persp";

const tag = document.getElementById("tag")!;
const line = (t: string) => t;
if (view === "side") {
  tag.innerHTML =
    line(`PANORAMIC · FRAME INSTRUMENT<span class="accent"> ●</span> SIDE ELEVATION`) + "\n" +
    line(`SHARED CURVES ${body.curves.length} — CREASES IN ACCENT — ENGINE-CUT ARCHES`) + "\n" +
    line(`MM GRID · ${body.stats.verbs} VERBS IN HISTORY`);
} else {
  tag.innerHTML =
    line(`PANORAMIC · FRAME INSTRUMENT<span class="accent"> ●</span> WORKED BODY`) + "\n" +
    line(`VERB-SCULPTED QUILT + OCCT BOOLEAN ARCHES`) + "\n" +
    line(`CELLS ${body.stats.cells} · TRIS ${body.stats.upperTris + body.stats.slabTris} · CLOSED ${String(body.stats.upperClosed && body.stats.slabClosed).toUpperCase()}`);
}

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
  };
  const rig = rigs[which] ?? rigs["front34"]!;
  const cam = new THREE.PerspectiveCamera(rig.fov, w / h, 10, 60000);
  cam.up.set(0, 0, 1);
  cam.position.set(rig.pos[0], rig.pos[1], rig.pos[2]);
  cam.lookAt(rig.look[0], rig.look[1], rig.look[2]);
  renderer.render(scene, cam);
}

document.title = "ready";
