import * as THREE from 'three';
import type { RenderState } from '../../state/lines.js';

/**
 * The four ways a designer looks at a surface.
 *
 * A studio reviews in clay, not in colour, because paint and saturation
 * flatter a form and matte grey does not. Paint is the beauty shot. Zebra and
 * curvature are the analysis pair — one reads continuity, the other reads
 * where the surface accelerates — and between them they are what separates a
 * shape that survives Class-A from one that does not.
 */

/**
 * CLAY. Real styling clay is a warm brown-grey; sprayed for review it reads
 * as a neutral grey with a waxy sheen, which is what picks up the soft
 * speculars that show surface flow. Metalness stays at zero — clay is not
 * metal, and faking metal here hides exactly what you came to look at.
 */
export function clayMaterial(env: THREE.Texture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#9a9187'),
    roughness: 0.52,
    metalness: 0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.5,
    envMap: env,
    envMapIntensity: 1.1,
  });
}

/** PAINT. Metallic base under a clearcoat — the second, sharper reflection
 *  sitting on top of the flake is what separates car paint from painted metal. */
export function paintMaterial(render: RenderState, env: THREE.Texture): THREE.MeshPhysicalMaterial {
  const color = new THREE.Color().setHSL(render.hue / 360, Math.min(1, render.sat * 1.6), 0.4);
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.72,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMap: env,
    envMapIntensity: 1.2,
  });
}

/** Glass for the greenhouse: dark, transmissive, and never lighter than the
 *  body — tinted glass is what makes a cabin read as a void rather than a lid. */
export function glassMaterial(render: RenderState, env: THREE.Texture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setHSL(0.58, 0.18, 0.06 + (1 - render.tint) * 0.16),
    metalness: 0.1,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMap: env,
    envMapIntensity: 1.5,
    transparent: true,
    opacity: 0.62 + render.tint * 0.3,
  });
}

/**
 * ZEBRA. Stripes reflected off the surface: the oldest surface-inspection
 * trick there is. Smooth stripes are a fair surface, kinked ones mark a
 * curvature break you cannot see under paint.
 */
export function zebraMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
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
        // Antialias by the band's own screen-space rate of change, or the
        // stripes alias into moire the moment the car gets small.
        float w = fwidth(s) * 1.2;
        float band = smoothstep(-w, w, s);
        vec3 c = mix(vec3(0.06), vec3(0.95), band);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/**
 * CHECK — curvature analysis, the Class-A convention.
 *
 * Screen-space derivatives of the normal give a cheap, honest measure of how
 * fast the surface is turning. Blue is calm, green is moderate, red is a
 * knuckle. What you want on a body side is broad blue with the accelerations
 * exactly where you put them, and no red where you did not.
 */
export function checkMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uGain: { value: 26 } },
    vertexShader: `
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vPosW = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform float uGain;
      varying vec3 vNormalW;
      varying vec3 vPosW;
      void main() {
        vec3 n = normalize(vNormalW);
        // How much the normal swings per unit of surface travelled: the
        // discrete stand-in for curvature, and it needs no second pass.
        float dn = length(fwidth(n));
        float dp = max(length(fwidth(vPosW)), 1e-5);
        float k = clamp(dn / dp / uGain, 0.0, 1.0);
        vec3 calm = vec3(0.11, 0.34, 0.72);
        vec3 mid  = vec3(0.15, 0.72, 0.36);
        vec3 hot  = vec3(0.92, 0.19, 0.12);
        vec3 c = k < 0.5 ? mix(calm, mid, k * 2.0) : mix(mid, hot, (k - 0.5) * 2.0);
        // A touch of shading so the form is still readable under the ramp.
        float lam = 0.72 + 0.28 * clamp(n.y, 0.0, 1.0);
        gl_FragColor = vec4(c * lam, 1.0);
      }`,
  });
}

/**
 * Blackout trim — pillars, and anything else that is not painted metal.
 *
 * Almost every car built since the seventies blacks out its pillars, and the
 * reason is exactly the one that matters here: a pillar the same colour as the
 * glass on either side of it disappears, and the greenhouse stops reading as a
 * cabin with structure and starts reading as a single tinted dome. Satin
 * rather than gloss, because a gloss pillar competes with the glass beside it
 * for the same highlight and the eye cannot tell where one stops.
 */
export function trimMaterial(env: THREE.Texture): THREE.Material {
  return new THREE.MeshPhysicalMaterial({
    color: 0x15171b,
    roughness: 0.42,
    metalness: 0.1,
    clearcoat: 0.25,
    clearcoatRoughness: 0.4,
    envMap: env,
    envMapIntensity: 0.7,
  });
}
