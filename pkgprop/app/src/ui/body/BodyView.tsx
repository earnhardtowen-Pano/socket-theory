import type { SolveResult } from '@pkgprop/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildCarBody, partsOf } from '../../model/body.js';
import type { FeatureMap } from '../../model/features.js';
import type { DrawingState, RenderState } from '../../state/lines.js';
import type { Action } from '../../state/store.js';
import { studioEnvironment } from './studio.js';
import {
  checkMaterial,
  clayMaterial,
  glassMaterial,
  paintMaterial,
  trimMaterial,
  zebraMaterial,
} from './materials.js';
import { buildWheel } from './wheel.js';

/**
 * BODY — the car as surface, in a studio.
 *
 * Four ways to look at it, because a designer never judges a form one way.
 * CLAY is the default for the same reason a studio reviews in clay: colour and
 * reflection flatter, matte grey does not, and surface flow is what you are
 * actually looking at. PAINT is the beauty shot. ZEBRA and CHECK are the
 * clap-back to Class-A — stripes read continuity, curvature colour reads where
 * the surface accelerates.
 */

/** Millimetres are the project's unit; three.js is happier near unity. */
const MM = 0.001;

export type Look = 'CLAY' | 'PAINT' | 'ZEBRA' | 'CHECK';

const LOOKS: readonly { id: Look; hint: string }[] = [
  { id: 'CLAY', hint: 'matte grey, the way a studio reviews a model' },
  { id: 'PAINT', hint: 'paint over clearcoat, glass in the greenhouse' },
  { id: 'ZEBRA', hint: 'stripes that kink mark a curvature break' },
  { id: 'CHECK', hint: 'blue is calm, red is where the surface accelerates' },
];

/**
 * What each panel is made of.
 *
 * Order matters: it is the material-index order the geometry's draw groups
 * refer to. Pillars are their own slot because on almost every car they are
 * blacked out — a body-colour A-pillar is a 1950s look and, more to the point,
 * a pillar that is the same colour as the glass beside it does not read as a
 * pillar at all, which is most of why the cabin looked like a balloon.
 */
const MATERIAL_SLOTS = ['body', 'glass', 'pillar'] as const;
type MaterialSlot = (typeof MATERIAL_SLOTS)[number];

const slotOf = (group: string): MaterialSlot =>
  group === 'glass' ? 'glass' : group === 'pillar' ? 'pillar' : 'body';

interface Studio {
  scene: THREE.Scene;
  /** Panel group per draw group, parallel to the geometry's groups. */
  panels: string[];
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  body: THREE.Mesh;
  glass: THREE.Mesh;
  wheels: THREE.Group;
  parts: THREE.Group;
  env: THREE.Texture;
  key: THREE.DirectionalLight;
  dispose: () => void;
}

function materialFor(look: Look, render: RenderState, env: THREE.Texture): THREE.Material {
  switch (look) {
    case 'CLAY':
      return clayMaterial(env);
    case 'ZEBRA':
      return zebraMaterial();
    case 'CHECK':
      return checkMaterial();
    case 'PAINT':
      return paintMaterial(render, env);
  }
}

export function BodyView({
  result,
  drawing,
  features,
  render,
  dispatch,
}: {
  result: SolveResult;
  drawing: DrawingState;
  features: FeatureMap;
  render: RenderState;
  dispatch: React.Dispatch<Action>;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const studioRef = useRef<Studio | null>(null);
  const [look, setLook] = useState<Look>('CLAY');
  const [failed, setFailed] = useState<string | null>(null);
  const orbit = useRef({ az: -0.9, el: 0.16, dist: 9.2, dragging: false, lx: 0, ly: 0 });

  const build = useMemo(() => {
    try {
      return { ok: buildCarBody(result, drawing, features), err: null as string | null };
    } catch (e) {
      return { ok: null, err: e instanceof Error ? e.message : 'The body would not loft.' };
    }
  }, [result, drawing, features]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed('This browser would not give us a WebGL context.');
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const env = studioEnvironment(renderer);
    scene.environment = env;
    // A studio has walls. Without a background the car floated on a black void
    // above a grey disc, with the disc's rim reading as a hard horizon line —
    // the single cue that says "this is a 3D viewport" rather than "this is a
    // photograph of a model", which is the whole point of the panel.
    scene.background = new THREE.Color(0x24272c);
    scene.fog = new THREE.Fog(0x24272c, 16, 46);

    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 400);

    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0009;
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xe6ecf4, 0x2c2f34, 0.75));

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 96).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x2e3136, roughness: 0.62, metalness: 0.05 }),
    );
    ground.receiveShadow = true;
    scene.add(ground);

    const body = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    body.castShadow = true;
    scene.add(body);
    const glass = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    glass.castShadow = true;
    scene.add(glass);
    const wheels = new THREE.Group();
    const parts = new THREE.Group();
    scene.add(wheels, parts);

    studioRef.current = {
      scene, camera, renderer, body, glass, wheels, parts, env, key, panels: [],
      dispose: () => {
        renderer.dispose();
        env.dispose();
        if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      },
    };

    let raf = 0;
    const frame = (): void => {
      const s = studioRef.current;
      if (s) {
        const w = host.clientWidth;
        const h = Math.max(340, Math.round(w * 0.5));
        if (s.renderer.domElement.width !== w || s.renderer.domElement.height !== h) {
          s.renderer.setSize(w, h, false);
          s.camera.aspect = w / Math.max(1, h);
          s.camera.updateProjectionMatrix();
        }
        const o = orbit.current;
        s.camera.position.set(
          Math.cos(o.az) * Math.cos(o.el) * o.dist,
          Math.sin(o.el) * o.dist + 0.45,
          Math.sin(o.az) * Math.cos(o.el) * o.dist,
        );
        s.camera.lookAt(0, 0.52, 0);
        s.renderer.render(s.scene, s.camera);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      studioRef.current?.dispose();
      studioRef.current = null;
    };
  }, []);

  // Re-loft on any change to the package, the drawing, or the parts.
  useEffect(() => {
    const s = studioRef.current;
    if (!s) return;
    if (!build.ok) {
      setFailed(build.err);
      return;
    }
    setFailed(null);
    const g = result.geometry;
    const shift = -(g.wheelbase / 2) * MM;

    const toGeo = (m: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(m.positions.slice(), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(m.normals.slice(), 3));
      geo.setIndex(new THREE.BufferAttribute(m.indices.slice(), 1));
      geo.scale(MM, MM, MM);
      geo.translate(shift, 0, 0);
      // Project axes are x aft, y outboard, z up; three.js wants y up.
      geo.rotateX(-Math.PI / 2);
      return geo;
    };

    // The panelled surface when it built, the loft when it did not.
    //
    // This is the change the owner can see. A loft has one material because it
    // is one thing; a network knows that this run of triangles is a windscreen
    // and that one is a C-pillar, so the glass can be glass and the pillar can
    // be blacked out. A cabin whose glass and whose pillars are all one colour
    // is a bubble canopy no matter how good the surface underneath it is.
    const net = build.ok.network;
    s.body.geometry.dispose();
    s.body.geometry = toGeo(net ? net.mesh : build.ok.car.body);
    s.panels = net ? net.mesh.groups.map((g) => g.group) : [];
    if (net) {
      for (const g of net.mesh.groups) {
        s.body.geometry.addGroup(g.start, g.count, MATERIAL_SLOTS.indexOf(slotOf(g.group)));
      }
    }
    s.glass.geometry.dispose();
    // The network carries its own glass as panels, so the second mesh is only
    // needed while the loft is what is on screen.
    s.glass.visible = !net && build.ok.car.greenhouse !== null;
    s.glass.geometry =
      !net && build.ok.car.greenhouse ? toGeo(build.ok.car.greenhouse) : new THREE.BufferGeometry();

    // Wheels. The cylinder's own axis is Y, and the car's lateral axis is Z
    // after the body rotation above — so the tire rotates about X. Rotating
    // about Z instead pointed every wheel down the length of the car, which
    // is exactly as wrong as it looked.
    s.wheels.clear();
    for (const w of build.ok.wheels) {
      const wheel = buildWheel(w.radius * MM, w.section * MM);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(w.x * MM + shift, w.radius * MM, -w.y * MM);
      s.wheels.add(wheel);
    }

    // Appendages: wings and splitters as real slabs on the car.
    s.parts.clear();
    const { wings, splitters } = partsOf(features);
    const partMat = new THREE.MeshPhysicalMaterial({
      color: 0x14151a, roughness: 0.35, metalness: 0.2, clearcoat: 0.6, envMap: s.env,
    });
    for (const f of wings) {
      const chord = (f.params.chord ?? 260) * MM;
      const span = (f.params.span ?? 1500) * MM;
      const th = (f.params.thickness ?? 26) * MM;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(chord, th, span), partMat);
      blade.castShadow = true;
      blade.rotation.z = ((f.params.angle ?? -8) * Math.PI) / 180;
      blade.position.set((f.params.station ?? 3900) * MM + shift, (f.params.height ?? 1150) * MM, 0);
      s.parts.add(blade);
      // Endplates, because a wing floating on nothing reads as a mistake.
      for (const side of [1, -1]) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(chord * 1.1, chord * 0.5, th * 0.6), partMat);
        plate.castShadow = true;
        plate.position.set(
          (f.params.station ?? 3900) * MM + shift,
          (f.params.height ?? 1150) * MM,
          (side * span) / 2,
        );
        s.parts.add(plate);
      }
    }
    for (const f of splitters) {
      const reach = (f.params.reach ?? 190) * MM;
      const span = (f.params.span ?? 1700) * MM;
      const th = (f.params.thickness ?? 16) * MM;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(reach * 1.6, th, span), partMat);
      blade.castShadow = true;
      blade.position.set((f.params.station ?? -700) * MM + shift, (f.params.height ?? 105) * MM, 0);
      s.parts.add(blade);
    }
  }, [build, features, result]);

  // Look and light.
  useEffect(() => {
    const s = studioRef.current;
    if (!s) return;
    const old = s.body.material;
    if (Array.isArray(old)) for (const m of old) m.dispose();
    else old.dispose();

    // One material per slot, in MATERIAL_SLOTS order. In PAINT the glass is
    // glass and the pillars are blacked out; every analysis look puts the
    // whole car in one material, because a stripe that stops at the cabin
    // tells you nothing about whether the join is fair.
    s.body.material = s.panels.length
      ? MATERIAL_SLOTS.map((slot) => {
          if (look !== 'PAINT') return materialFor(look, render, s.env);
          if (slot === 'glass') return glassMaterial(render, s.env);
          if (slot === 'pillar') return trimMaterial(s.env);
          return paintMaterial(render, s.env);
        })
      : materialFor(look, render, s.env);

    (s.glass.material as THREE.Material).dispose();
    s.glass.material = look === 'PAINT' ? glassMaterial(render, s.env) : materialFor(look, render, s.env);

    const el = 0.16 + render.sunEl * 1.2;
    const az = render.sunAz * 1.4;
    s.key.position.set(Math.sin(az) * 8 * Math.cos(el), Math.sin(el) * 9 + 1.2, Math.cos(az) * 8 * Math.cos(el));
  }, [look, render]);

  const onPointerDown = (e: React.PointerEvent): void => {
    orbit.current.dragging = true;
    orbit.current.lx = e.clientX;
    orbit.current.ly = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    const o = orbit.current;
    if (!o.dragging) return;
    o.az -= (e.clientX - o.lx) * 0.006;
    o.el = Math.max(-0.15, Math.min(1.25, o.el + (e.clientY - o.ly) * 0.005));
    o.lx = e.clientX;
    o.ly = e.clientY;
  };
  const endDrag = (): void => {
    orbit.current.dragging = false;
  };
  const onWheel = (e: React.WheelEvent): void => {
    orbit.current.dist = Math.max(3.4, Math.min(24, orbit.current.dist * Math.exp(e.deltaY * 0.0011)));
  };
  const view = (az: number, el: number) => () => {
    orbit.current.az = az;
    orbit.current.el = el;
  };

  const hint = LOOKS.find((l) => l.id === look)?.hint ?? '';

  return (
    <div className="view-block" data-testid="body-view">
      <div className="view-title">
        <span>BODY</span>
        <span className="mode-chips">
          {LOOKS.map((l) => (
            <button
              key={l.id}
              className={`chip ${look === l.id ? 'active' : ''}`}
              data-testid={`look-${l.id}`}
              onClick={() => setLook(l.id)}
            >
              {l.id}
            </button>
          ))}
        </span>
        <span className="mode-chips">
          <button className="chip" data-testid="view-front34" onClick={view(-0.9, 0.16)}>F¾</button>
          <button className="chip" data-testid="view-rear34" onClick={view(2.25, 0.2)}>R¾</button>
          <button className="chip" data-testid="view-side" onClick={view(Math.PI / 2, 0.03)}>SIDE</button>
          <button className="chip" data-testid="view-top" onClick={view(Math.PI / 2, 1.2)}>TOP</button>
        </span>
        <span className="view-note">{hint}</span>
      </div>
      {failed ? (
        <div className="roadmap-card">
          <h2>BODY</h2>
          <p>{failed}</p>
        </div>
      ) : (
        <div
          ref={hostRef}
          className="body-host"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onWheel={onWheel}
        />
      )}
      <div className="body-foot">
        <span>drag to orbit · wheel zooms</span>
        <span>
          {build.ok
            ? `${(build.ok.car.body.triangleCount + (build.ok.car.greenhouse?.triangleCount ?? 0)).toLocaleString()} triangles`
            : ''}
        </span>
        <button className="chip" onClick={() => dispatch({ type: 'panel', id: 'SIDE' })}>
          back to drawing
        </button>
      </div>
    </div>
  );
}
