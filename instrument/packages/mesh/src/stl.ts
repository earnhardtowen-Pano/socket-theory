/**
 * writeStlBinary — export surface only. The model stays Float64; binary STL
 * mandates little-endian Float32, so the downcast happens here and nowhere
 * else. Identical input bytes out for identical input meshes: the writer walks
 * triangles in index order, computes facet normals in Float64 (nsqrt), and
 * lets DataView's IEEE round-to-nearest produce the Float32s.
 *
 * Layout: 80-byte name header (ASCII, zero-padded) · uint32 LE triangle count ·
 * per triangle: normal f32x3, vertices f32x9, uint16 attribute = 0.
 */

import { nsqrt } from "@car/num";

export interface StlMesh {
  readonly positions: Float64Array;
  readonly indices: Uint32Array;
}

const HEADER_BYTES = 80;
const COUNT_BYTES = 4;
const TRI_BYTES = 50;

export function writeStlBinary(mesh: StlMesh, name: string): Uint8Array {
  const triCount = Math.floor(mesh.indices.length / 3);
  const bytes = new Uint8Array(HEADER_BYTES + COUNT_BYTES + TRI_BYTES * triCount);
  const view = new DataView(bytes.buffer);

  for (let i = 0; i < Math.min(name.length, HEADER_BYTES); i++) {
    bytes[i] = name.charCodeAt(i) & 0x7f; // ASCII-clamped, deterministic
  }
  view.setUint32(HEADER_BYTES, triCount, true);

  let off = HEADER_BYTES + COUNT_BYTES;
  const p = mesh.positions;
  for (let t = 0; t < triCount; t++) {
    const ia = 3 * mesh.indices[3 * t]!;
    const ib = 3 * mesh.indices[3 * t + 1]!;
    const ic = 3 * mesh.indices[3 * t + 2]!;
    const ax = p[ia]!, ay = p[ia + 1]!, az = p[ia + 2]!;
    const bx = p[ib]!, by = p[ib + 1]!, bz = p[ib + 2]!;
    const cx = p[ic]!, cy = p[ic + 1]!, cz = p[ic + 2]!;
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = nsqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len; ny /= len; nz /= len;
    } else {
      nx = 0; ny = 0; nz = 0; // zero-area facet: normal left null, no NaN
    }
    view.setFloat32(off, nx, true);
    view.setFloat32(off + 4, ny, true);
    view.setFloat32(off + 8, nz, true);
    const verts = [ax, ay, az, bx, by, bz, cx, cy, cz];
    for (let k = 0; k < 9; k++) {
      view.setFloat32(off + 12 + 4 * k, verts[k]!, true);
    }
    view.setUint16(off + 48, 0, true);
    off += TRI_BYTES;
  }
  return bytes;
}
