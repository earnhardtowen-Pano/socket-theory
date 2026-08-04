import type { SolveResult } from '@pkgprop/core';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildCarBody } from '../../model/body.js';
import type { FeatureMap } from '../../model/features.js';
import type { DrawingState, RenderState } from '../../state/lines.js';

/**
 * BODY — the drawn car as a surface, under light.
 *
 * The 2D render paints bands on a silhouette, and no amount of tuning makes
 * that read as a car, because what tells you a surface is metal is the way a
 * highlight bends as curvature changes. That needs normals, which needs the
 * loft. This is where the two meet.
 *
 * The environment is doing most of the work. A car body is almost entirely
 * reflection: the studio here is a gradient sky over a floor with a horizon
 * between them, and the horizon sweeping across the flank as you orbit is the
 * single strongest cue that the shape is three-dimensional and smooth.
 */

/** Millimetres are the project's unit; three.js is happier near unity. */
const MM = 0.001;

interface Studio {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  body: THREE.Mesh;
  wheels: THREE.Group;
  env: THREE.Texture;
  dispose: () => void;
}

/**
 * A studio in a texture: sky, horizon, floor, and one soft overhead bank.
 *
 * Built rather than loaded — an HDRI would be megabytes and a network fetch,
 * and a car needs a horizon far more than it needs a real room.
 */
function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, size * 0.52);
  sky.addColorStop(0, '#f6f7f9');
  sky.addColorStop(0.72, '#c9cfd8');
  sky.addColorStop(1, '#8d949e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, size, size * 0.52);

  // The horizon is a hard edge on purpose. A soft one reads as fog and takes
  // the snap out of every reflection running along the body side.
  const floor = ctx.createLinearGradient(0, size * 0.52, 0, size);
  floor.addColorStop(0, '#3a3d42');
  floor.addColorStop(1, '#15171a');
  ctx.fillStyle = floor;
  ctx.fillRect(0, size * 0.52, size, size * 0.48);

  // One overhead softbox, the light that draws the length of the roof.
  const box = ctx.createRadialGradient(size * 0.5, size * 0.1, 0, size * 0.5, size * 0.1, size * 0.42);
  box.addColorStop(0, 'rgba(255,255,255,0.95)');
  box.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = box;
  ctx.fillRect(0, 0, size, size * 0.52);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  tex.dispose();
  return target.texture;
}

/**
 * Zebra: evenly spaced stripes reflected off the surface.
 *
 * The oldest surface-inspection trick there is. Stripes that run smoothly are
 * a fair surface; stripes that kink or bunch mark a curvature break you cannot
 * see in a paint render. Honesty about the surface, not decoration.
 */
function zebraMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // Band count is a real choice: too many and the stripes read as moire
    // instead of a diagnostic, too few and a local kink hides between them.
    // Nine across the reflected hemisphere is about what a physical stripe
    // wall gives you.
    uniforms: { uBands: { value: 9 } },
    vertexShader: `
      varying vec3 vNormalW;
      varying vec3 vViewW;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewW = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform float uBands;
      varying vec3 vNormalW;
      varying vec3 vViewW;
      void main() {
        vec3 r = reflect(-vViewW, normalize(vNormalW));
        float s = sin(asin(clamp(r.y, -1.0, 1.0)) * uBands);
        // Antialias the band edge by its own screen-space rate of change, or
        // the stripes alias into moire the moment the car gets small.
        float w = fwidth(s) * 1.2;
        float band = smoothstep(-w, w, s);
        vec3 c = mix(vec3(0.07), vec3(0.94), band);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function paintMaterial(render: RenderState, env: THREE.Texture): THREE.MeshPhysicalMaterial {
  // The 2D render mixes its own marker palette; here the same hue and
  // saturation drive a physical paint, held darker than the marker so the
  // environment has somewhere to reflect into. A light body under a light sky
  // is where metallic paint stops reading as metal.
  const color = new THREE.Color().setHSL(render.hue / 360, Math.min(1, render.sat * 1.6), 0.42);
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.62,
    roughness: 0.28,
    // Clearcoat is what separates automotive paint from painted metal: a
    // second, sharper reflection sitting on top of the flake.
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMap: env,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
  });
}

export function BodyView({
  result,
  drawing,
  features,
  render,
}: {
  result: SolveResult;
  drawing: DrawingState;
  features: FeatureMap;
  render: RenderState;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const studioRef = useRef<Studio | null>(null);
  const [zebra, setZebra] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const orbit = useRef({ az: -0.85, el: 0.22, dist: 9.5, dragging: false, lx: 0, ly: 0 });
  const keyRef = useRef<THREE.DirectionalLight | null>(null);

  // One-time scene setup. The geometry is replaced on every solve; the studio,
  // the lights and the floor are built once and kept.
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
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const env = studioEnvironment(renderer);
    scene.environment = env;

    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 400);

    // A key light for the contact shadow. The environment already carries the
    // ambient, so this one is here to put the car on the ground.
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(4, 7, 5);
    keyRef.current = key;
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.bias = -0.0008;
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xdfe6ef, 0x2a2c30, 0.5));

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(26, 96).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.55, metalness: 0.1 }),
    );
    ground.receiveShadow = true;
    scene.add(ground);

    const body = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    body.castShadow = true;
    scene.add(body);

    const wheels = new THREE.Group();
    scene.add(wheels);

    studioRef.current = {
      scene,
      camera,
      renderer,
      body,
      wheels,
      env,
      dispose: () => {
        renderer.dispose();
        env.dispose();
        host.removeChild(renderer.domElement);
      },
    };

    let raf = 0;
    const frame = (): void => {
      const s = studioRef.current;
      if (s) {
        const w = host.clientWidth;
        const h = Math.max(320, Math.round(w * 0.52));
        if (s.renderer.domElement.width !== w || s.renderer.domElement.height !== h) {
          s.renderer.setSize(w, h, false);
          s.camera.aspect = w / Math.max(1, h);
          s.camera.updateProjectionMatrix();
        }
        const o = orbit.current;
        s.camera.position.set(
          Math.cos(o.az) * Math.cos(o.el) * o.dist,
          Math.sin(o.el) * o.dist + 0.55,
          Math.sin(o.az) * Math.cos(o.el) * o.dist,
        );
        s.camera.lookAt(0, 0.6, 0);
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

  // Re-loft whenever the package or the drawing moves.
  useEffect(() => {
    const s = studioRef.current;
    if (!s) return;
    let build;
    try {
      build = buildCarBody(result, drawing, features);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'The body would not loft.');
      return;
    }
    setFailed(null);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(build.mesh.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(build.mesh.normals, 3));
    geo.setIndex(new THREE.BufferAttribute(build.mesh.indices, 1));
    // Millimetres to metres, and the car centred on its own wheelbase so it
    // orbits about itself rather than swinging around the front axle.
    geo.scale(MM, MM, MM);
    geo.translate(-(result.geometry.wheelbase / 2) * MM, 0, 0);
    // Project axes are x aft, y outboard, z up; three.js wants y up.
    geo.rotateX(-Math.PI / 2);

    s.body.geometry.dispose();
    s.body.geometry = geo;

    s.wheels.clear();
    const tireGeo = new THREE.CylinderGeometry(1, 1, 1, 40);
    for (const w of build.wheels) {
      const tire = new THREE.Mesh(
        tireGeo,
        new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.85, metalness: 0 }),
      );
      const r = w.radius * MM;
      tire.scale.set(r, result.geometry.tireRadius * 0.62 * MM, r);
      tire.rotation.z = Math.PI / 2;
      tire.position.set((w.x - result.geometry.wheelbase / 2) * MM, r, -w.y * MM);
      tire.castShadow = true;
      s.wheels.add(tire);
    }
  }, [result, drawing, features]);

  // Paint and zebra swap the material without touching the geometry.
  useEffect(() => {
    const s = studioRef.current;
    if (!s) return;
    const old = s.body.material as THREE.Material;
    s.body.material = zebra ? zebraMaterial() : paintMaterial(render, s.env);
    old.dispose();
    // The sun is one light across both views. Dragging it in RENDER swings the
    // shadow here, so the two are describing the same afternoon.
    const key = keyRef.current;
    if (key) {
      const el = 0.15 + render.sunEl * 1.25;
      const az = render.sunAz * 1.4;
      key.position.set(Math.sin(az) * 8 * Math.cos(el), Math.sin(el) * 9 + 1, Math.cos(az) * 8 * Math.cos(el));
    }
  }, [zebra, render]);

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
    o.el = Math.max(-0.18, Math.min(1.25, o.el + (e.clientY - o.ly) * 0.005));
    o.lx = e.clientX;
    o.ly = e.clientY;
  };
  const endDrag = (): void => {
    orbit.current.dragging = false;
  };

  const view = (az: number, el: number) => () => {
    orbit.current.az = az;
    orbit.current.el = el;
  };

  return (
    <div className="view-block" data-testid="body-view">
      <div className="view-title">
        <span>BODY</span>
        <span className="mode-chips">
          <button className="chip" data-testid="view-front34" onClick={view(-0.85, 0.22)}>
            FRONT ¾
          </button>
          <button className="chip" data-testid="view-rear34" onClick={view(2.3, 0.24)}>
            REAR ¾
          </button>
          <button className="chip" data-testid="view-side" onClick={view(Math.PI / 2, 0.05)}>
            SIDE
          </button>
          <button
            className={`chip ${zebra ? 'active' : ''}`}
            data-testid="zebra-toggle"
            onClick={() => setZebra((z) => !z)}
          >
            ZEBRA
          </button>
        </span>
        <span className="view-note">
          {zebra ? 'stripes that kink mark a curvature break' : 'drag to orbit · the horizon shows the surface'}
        </span>
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
        />
      )}
    </div>
  );
}
