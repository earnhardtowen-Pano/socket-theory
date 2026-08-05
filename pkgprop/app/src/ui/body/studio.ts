import * as THREE from 'three';

/**
 * The studio, in a texture.
 *
 * Long thin stripe lights, not softboxes. This is the single biggest thing
 * that makes a reflection read as automotive: a stripe stretches into a
 * continuous highlight that travels the length of the body and reveals whether
 * the surface is continuous, while a softbox gives one blobby hotspot that
 * reveals nothing. Real studios hang fluorescent banks running the length of
 * the car for exactly this reason.
 *
 * Built rather than loaded — an HDRI is megabytes and a network fetch, and the
 * page has to be one self-contained file.
 */

const W = 1024;
const H = 512;

/** Above 1.0 matters: PMREM carries the overbright into the reflection. */
function stripe(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  w: number,
  h: number,
  intensity: number,
): void {
  const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  const a = Math.min(1, intensity);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, `rgba(255,255,255,${a})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  // Soft ends so a stripe does not terminate in a hard bar across the flank.
  ctx.save();
  const fade = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.12, 'rgba(0,0,0,1)');
  fade.addColorStop(0.88, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = fade;
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Dark room. A bright room floods the body and there is nothing left for a
  // highlight to be brighter than.
  ctx.fillStyle = '#3a3e44';
  ctx.fillRect(0, 0, W, H);

  // Floor: dark, with a soft bounce near the horizon.
  const floor = ctx.createLinearGradient(0, H * 0.5, 0, H);
  floor.addColorStop(0, '#4b5057');
  floor.addColorStop(1, '#191b1e');
  ctx.fillStyle = floor;
  ctx.fillRect(0, H * 0.5, W, H * 0.5);

  // The overhead banks — four long stripes at ceiling elevations. These are
  // what draw the length of the roof and the shoulder.
  const strips = new THREE.Color();
  void strips;
  stripe(ctx, W * 0.5, H * 0.09, W * 0.92, H * 0.05, 1);
  stripe(ctx, W * 0.32, H * 0.2, W * 0.5, H * 0.035, 0.85);
  stripe(ctx, W * 0.72, H * 0.2, W * 0.46, H * 0.035, 0.85);
  stripe(ctx, W * 0.5, H * 0.31, W * 0.8, H * 0.028, 0.6);

  // A thin bright band right on the horizon: the classic automotive cue,
  // the line that runs the whole flank and snaps as the section changes.
  stripe(ctx, W * 0.5, H * 0.497, W, H * 0.014, 0.95);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  tex.dispose();
  return target.texture;
}
