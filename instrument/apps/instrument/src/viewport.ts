/**
 * Viewport — three.js plumbing only. It renders whatever RenderFeed the port
 * serves and never touches the model; GPU floats can never reach the hashed
 * path. Ortho views share one canvas; INSPECT is a perspective orbit with
 * the zebra shader, and it never edits.
 */

import * as THREE from "three";
import { creaseNormals, DEFAULT_CREASE_ANGLE } from "@car/mesh";
import type { Id, OrthoView, Pt2, RenderFeed } from "@car/schema";
import { eyeSign, inPlaneAxes, viewNormal, type CamState, type ScreenSize } from "./view";
import type { Ghost } from "./tools";
import { viewToWorld } from "./view";

const BG = 0x0a0a0c;
const SURFACE = 0xd8d8d2;
const EDGE = 0x55555c;
const LINE = 0xc9c9c2;
const ACCENT = 0xff5533;
/** A gap curve. Cool against the crease's hot, because they are different
 *  marks and a body reads wrong if you cannot tell them apart at a glance. */
const GAPLINE = 0x4db8c8;
const GRID_MAJOR = 0x232328;
const GRID_MINOR = 0x17171b;

const ZEBRA_VERT = `
varying vec3 vNormalView;
void main() {
  vNormalView = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const ZEBRA_FRAG = `
varying vec3 vNormalView;
void main() {
  float band = fract(dot(normalize(vNormalView), normalize(vec3(1.0, 1.0, 0.35))) * 9.0);
  float s = step(0.5, band);
  vec3 c = mix(vec3(0.10, 0.10, 0.11), vec3(0.86, 0.86, 0.84), s);
  gl_FragColor = vec4(c, 1.0);
}`;

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly feedGroup = new THREE.Group();
  private readonly ghostGroup = new THREE.Group();
  private readonly gridGroup = new THREE.Group();
  private readonly orbitCam: THREE.PerspectiveCamera;
  private orbit = { theta: -2.3, phi: 1.15, dist: 9000, target: new THREE.Vector3(2100, 0, 500) };
  private zebraMat: THREE.ShaderMaterial;
  private surfaceMat: THREE.MeshStandardMaterial;
  private smoothMat: THREE.MeshStandardMaterial;
  private readonly handleGroup = new THREE.Group();
  zebra = false;
  /**
   * SMOOTH is a shading switch, not a shape switch. On: smoothing groups —
   * normals average across a panel and split at anything sharper than the
   * crease angle, which is how a body reads. Off: flat, every facet visible —
   * the honest "as blocked" view. Neither moves a vertex, so what the STL
   * carries is the same either way.
   */
  smooth = false;
  /**
   * Paint each cell in the material it was ASSIGNED, rather than one clay
   * grey. Off by default and it must stay that way: clay is the working view,
   * because a shape reads best undecorated and a colour can hide a hollow.
   * On, it answers the one question clay cannot — which panel is glass, which
   * is trim, which nobody has said anything about yet.
   */
  materials = false;
  creaseAngle = DEFAULT_CREASE_ANGLE;
  private materialMat: THREE.MeshStandardMaterial;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(BG);
    this.scene.add(this.feedGroup, this.ghostGroup, this.gridGroup);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(-4000, -6000, 7000);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8899ff, 0.45);
    rim.position.set(6000, 4000, 2000);
    this.scene.add(rim);
    this.orbitCam = new THREE.PerspectiveCamera(32, 1, 10, 80000);
    this.orbitCam.up.set(0, 0, 1);
    this.zebraMat = new THREE.ShaderMaterial({ vertexShader: ZEBRA_VERT, fragmentShader: ZEBRA_FRAG });
    this.surfaceMat = new THREE.MeshStandardMaterial({
      color: SURFACE, metalness: 0.05, roughness: 0.62, flatShading: true,
    });
    this.smoothMat = new THREE.MeshStandardMaterial({
      color: SURFACE, metalness: 0.08, roughness: 0.42, flatShading: false,
    });
    // Vertex colours rather than one material per cell: the feed is a single
    // indexed buffer and splitting it into 106 draw calls to say six things
    // would be paying for the wrong abstraction.
    this.materialMat = new THREE.MeshStandardMaterial({
      vertexColors: true, metalness: 0.10, roughness: 0.48, flatShading: false,
    });
    this.scene.add(this.handleGroup);
  }

  /** Accent handles for the pinch gesture — the selected curve's control net. */
  setHandles(points: readonly (readonly [number, number, number])[]): void {
    for (const child of [...this.handleGroup.children]) {
      this.handleGroup.remove(child);
      (child as THREE.Points).geometry?.dispose?.();
    }
    if (points.length === 0) return;
    const flat = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      flat[i * 3] = p[0]; flat[i * 3 + 1] = p[1]; flat[i * 3 + 2] = p[2];
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(flat, 3));
    this.handleGroup.add(new THREE.Points(g, new THREE.PointsMaterial({
      color: ACCENT, size: 9, sizeAttenuation: false,
    })));
  }

  /**
   * Rebuild scene content from the feed. Creased ranges draw in accent, gap
   * ranges in the cool line — and a curve carrying BOTH draws as a gap, since
   * a shutline that also happens to be a character line is still somewhere you
   * can see through.
   */
  setFeed(
    feed: RenderFeed,
    creases: ReadonlySet<Id>,
    gaps: ReadonlySet<Id> = new Set(),
    materials: ReadonlyMap<Id, { name: string; color: string }> = new Map(),
  ): void {
    for (const child of [...this.feedGroup.children]) {
      this.feedGroup.remove(child);
      (child as THREE.Mesh).geometry?.dispose?.();
    }
    const shaded = this.smooth
      ? creaseNormals(
          { positions: feed.surfaces.positions, indices: feed.surfaces.indices },
          this.creaseAngle,
        )
      : null;
    const sgeo = new THREE.BufferGeometry();
    const positions = shaded ? shaded.positions : feed.surfaces.positions;
    const normals = shaded ? shaded.normals : feed.surfaces.normals;
    const indices = shaded ? shaded.indices : feed.surfaces.indices;
    sgeo.setAttribute("position", new THREE.Float32BufferAttribute(Float32Array.from(positions), 3));
    sgeo.setAttribute("normal", new THREE.Float32BufferAttribute(Float32Array.from(normals), 3));
    sgeo.setIndex(new THREE.Uint32BufferAttribute(Uint32Array.from(indices), 1));
    // Material view: one colour per vertex, joined to the cells through the
    // feed's own ranges. A cell nobody has assigned draws in the clay grey, so
    // "not yet decided" is visible as itself rather than as a default paint.
    const wantMaterials = this.materials && !this.zebra && materials.size > 0;
    if (wantMaterials) {
      const colors = new Float32Array((positions.length / 3) * 3);
      const clay = new THREE.Color(SURFACE);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = clay.r; colors[i + 1] = clay.g; colors[i + 2] = clay.b;
      }
      const c = new THREE.Color();
      for (const r of feed.surfaces.ranges) {
        const m = materials.get(r.id);
        if (!m) continue;
        c.set(m.color);
        for (let t = r.start; t < r.start + r.count; t++) {
          // The SHADED index buffer, not the feed's: smoothing groups split
          // vertices, so the same triangle names different vertices in each.
          // Triangle order is preserved, which is what makes a range still
          // mean the same cell.
          const v = indices[t]! * 3;
          colors[v] = c.r; colors[v + 1] = c.g; colors[v + 2] = c.b;
        }
      }
      sgeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    }
    const mesh = new THREE.Mesh(
      sgeo,
      this.zebra ? this.zebraMat
        : wantMaterials ? this.materialMat
        : shaded ? this.smoothMat : this.surfaceMat,
    );
    this.feedGroup.add(mesh);
    // The overlay belongs to the blocked view only. Under smoothing groups the
    // hard edges already draw themselves in shading, and a wireframe pass on
    // top of that just re-traces tessellation seams as wrinkles.
    if (!shaded) {
      this.feedGroup.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(sgeo, 25),
        new THREE.LineBasicMaterial({ color: EDGE }),
      ));
    }

    const plain: number[] = [];
    const accent: number[] = [];
    const gapped: number[] = [];
    const pos = feed.lines.positions;
    for (const r of feed.lines.ranges) {
      const bucket = gaps.has(r.id) ? gapped : creases.has(r.id) ? accent : plain;
      for (let i = r.start; i < r.start + r.count; i++) bucket.push(pos[i]!);
    }
    const addLines = (data: number[], color: number): void => {
      if (data.length === 0) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(Float32Array.from(data), 3));
      this.feedGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color })));
    };
    addLines(plain, LINE);
    addLines(accent, ACCENT);
    addLines(gapped, GAPLINE);
  }

  setGhost(ghost: Ghost | null, view: OrthoView, at: number): void {
    for (const child of [...this.ghostGroup.children]) {
      this.ghostGroup.remove(child);
      (child as THREE.Line).geometry?.dispose?.();
    }
    if (!ghost) return;
    const mat = new THREE.LineBasicMaterial({ color: ACCENT });
    const w = (p: Pt2) => {
      const q = viewToWorld(view, p, at);
      return new THREE.Vector3(q[0], q[1], q[2]);
    };
    if (ghost.kind === "rect") {
      const [ax, ay] = ghost.a;
      const [bx, by] = ghost.b;
      const pts = [w([ax, ay]), w([bx, ay]), w([bx, by]), w([ax, by]), w([ax, ay])];
      this.ghostGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    } else {
      this.ghostGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([w(ghost.a), w(ghost.b)]), mat));
    }
  }

  private rebuildGrid(view: OrthoView | null): void {
    for (const child of [...this.gridGroup.children]) this.gridGroup.remove(child);
    const grid = new THREE.GridHelper(16000, 160, GRID_MAJOR, GRID_MINOR);
    if (view === null) {
      grid.position.set(2100, 0, 0);
      grid.rotation.x = Math.PI / 2; // inspect ground plane (XY at z=0)
    } else if (view.kind === "side" || view.kind === "section" || view.kind === "front") {
      // XZ plane faces a Y-axis camera (GridHelper's native plane).
      const n = viewNormal(view);
      grid.position.set(2100 + n[0] * -50, n[1] * 400, 560);
      if (view.kind === "front" || view.kind === "section") grid.rotation.y = Math.PI / 2;
    } else {
      grid.rotation.x = Math.PI / 2;
      grid.position.set(2100, 0, -10);
    }
    this.gridGroup.add(grid);
  }

  resize(size: ScreenSize): void {
    this.renderer.setSize(size.w, size.h, false);
  }

  renderOrtho(view: OrthoView, cam: CamState, size: ScreenSize): void {
    this.rebuildGrid(view);
    const halfW = (size.w / 2) * cam.mmPerPx;
    const halfH = (size.h / 2) * cam.mmPerPx;
    const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 10, 40000);
    const n = viewNormal(view);
    const { x, y } = inPlaneAxes(view);
    const es = eyeSign(view);
    const c = cam.center;
    const world = [
      x[0] * c[0] + y[0] * c[1],
      x[1] * c[0] + y[1] * c[1],
      x[2] * c[0] + y[2] * c[1],
    ] as const;
    camera.up.set(y[0], y[1], y[2]);
    camera.position.set(world[0] + n[0] * es * 15000, world[1] + n[1] * es * 15000, world[2] + n[2] * es * 15000);
    camera.lookAt(world[0], world[1], world[2]);
    camera.updateProjectionMatrix();
    this.renderer.render(this.scene, camera);
  }

  renderInspect(size: ScreenSize): void {
    this.rebuildGrid(null);
    const { theta, phi, dist, target } = this.orbit;
    this.orbitCam.aspect = size.w / size.h;
    this.orbitCam.position.set(
      target.x + dist * Math.sin(phi) * Math.cos(theta),
      target.y + dist * Math.sin(phi) * Math.sin(theta),
      target.z + dist * Math.cos(phi),
    );
    this.orbitCam.lookAt(target);
    this.orbitCam.updateProjectionMatrix();
    this.renderer.render(this.scene, this.orbitCam);
  }

  orbitBy(dTheta: number, dPhi: number): void {
    this.orbit.theta += dTheta;
    this.orbit.phi = Math.min(Math.max(this.orbit.phi + dPhi, 0.12), Math.PI - 0.12);
  }

  zoomOrbit(factor: number): void {
    this.orbit.dist = Math.min(Math.max(this.orbit.dist * factor, 800), 40000);
  }
}
