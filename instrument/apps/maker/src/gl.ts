/**
 * The maker's viewport.
 *
 * Deliberately NOT the photograph renderer. A clearcoat is a mirror, and a
 * mirror is the right material to JUDGE a finished surface in and the wrong
 * one to SHAPE in — the highlight is so loud you stop seeing the form under
 * it. Every studio in the world shapes in clay for the same reason, so this
 * is clay: matte, one warm key, one cool fill, a rim to hold the silhouette
 * off the ground, and nothing that sparkles.
 *
 * Three things draw, in this order: the body, the curve network over it, and
 * the control points of whatever is selected. The network and the points are
 * pulled a hair toward the eye in clip space rather than offset in world
 * space, so a line never sinks into the panel it belongs to and never floats
 * off it either.
 */

export interface Cam {
  yaw: number;
  pitch: number;
  dist: number;
  fov: number;
  centre: [number, number, number];
}

const SURF_VS = `#version 300 es
in vec3 aPos; in vec3 aNrm; in float aMat;
uniform mat4 uMVP;
out vec3 vN; out vec3 vW; flat out int vMat;
void main(){ vN = aNrm; vW = aPos; vMat = int(aMat + 0.5); gl_Position = uMVP * vec4(aPos, 1.0); }`;

const SURF_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; flat in int vMat;
uniform vec3 uEye;
uniform vec3 uTint[16];
uniform float uPaint;      // 0 = one clay, 1 = the car's own materials
uniform vec3 uClay;
out vec4 o;

const vec3 KEY  = vec3(-0.42, 0.52, 0.74);
const vec3 FILL = vec3( 0.68,-0.38, 0.30);

void main(){
  vec3 n = normalize(vN);
  vec3 v = normalize(uEye - vW);
  if (!gl_FrontFacing) n = -n;
  vec3 base = mix(uClay, uTint[vMat], uPaint);

  float up = n.z * 0.5 + 0.5;
  vec3 amb = mix(vec3(0.075, 0.080, 0.095), vec3(0.30, 0.315, 0.345), up);
  vec3 k = normalize(KEY), f = normalize(FILL);
  float dk = max(0.0, dot(n, k)), df = max(0.0, dot(n, f));
  vec3 c = base * (amb + dk * 0.62 * vec3(1.00, 0.975, 0.940)
                       + df * 0.22 * vec3(0.80, 0.865, 1.000));
  // A single tight highlight. Enough to read a crown; not enough to hide one.
  vec3 h = normalize(k + v);
  c += vec3(0.11) * pow(max(0.0, dot(n, h)), 46.0);
  // Rim, so the silhouette does not dissolve into the ground.
  c += vec3(0.10, 0.11, 0.13) * pow(1.0 - max(0.0, dot(n, v)), 3.2);

  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);   // ACES-ish
  o = vec4(pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}`;

const LINE_VS = `#version 300 es
in vec3 aPos; in vec3 aCol;
uniform mat4 uMVP; uniform float uLift;
out vec3 vCol;
void main(){
  vCol = aCol;
  vec4 p = uMVP * vec4(aPos, 1.0);
  p.z -= uLift * p.w;      // toward the eye, in clip space: no world-space bias
  gl_Position = p;
}`;

const LINE_FS = `#version 300 es
precision highp float;
in vec3 vCol; out vec4 o;
void main(){ o = vec4(vCol, 1.0); }`;

const PT_VS = `#version 300 es
in vec3 aPos; in vec3 aCol;
uniform mat4 uMVP; uniform float uSize;
out vec3 vCol;
void main(){
  vCol = aCol;
  vec4 p = uMVP * vec4(aPos, 1.0);
  p.z -= 0.004 * p.w;
  gl_Position = p;
  gl_PointSize = uSize;
}`;

const PT_FS = `#version 300 es
precision highp float;
in vec3 vCol; out vec4 o;
void main(){
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  if (r > 1.0) discard;
  o = vec4(mix(vCol, vec3(0.04), smoothstep(0.62, 0.94, r)), 1.0);
}`;

const FLOOR_VS = `#version 300 es
in vec2 aXY;
uniform mat4 uMVP; uniform vec2 uLo; uniform vec2 uHi;
out vec3 vW;
void main(){
  vec3 p = vec3(mix(uLo.x, uHi.x, aXY.x), mix(uLo.y, uHi.y, aXY.y), 0.0);
  vW = p;
  gl_Position = uMVP * vec4(p, 1.0);
}`;

const FLOOR_FS = `#version 300 es
precision highp float;
in vec3 vW; out vec4 o;
uniform vec3 uEye; uniform vec2 uCentre; uniform float uSpan; uniform vec3 uGround;
float line(float x, float pitch, float w){
  float f = abs(fract(x / pitch - 0.5) - 0.5) * pitch;
  return 1.0 - smoothstep(0.0, w, f);
}
void main(){
  float d = length(vW.xy - uCentre) / uSpan;
  float fade = 1.0 - smoothstep(0.25, 1.0, d);
  // 100 mm paper, 500 mm heavier: the grid a body is dimensioned on.
  float w = max(2.0, length(uEye - vW) * 0.0016);
  float fine = max(line(vW.x, 100.0, w), line(vW.y, 100.0, w)) * 0.22;
  float bold = max(line(vW.x, 500.0, w * 1.6), line(vW.y, 500.0, w * 1.6)) * 0.42;
  float axis = line(vW.y, 1e9, w * 2.2) * 0.55;
  float g = max(max(fine, bold), axis) * fade;
  o = vec4(mix(uGround, uGround + vec3(0.20, 0.21, 0.24), g), fade);
}`;

function compile(gl: WebGL2RenderingContext, src: string, type: number): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}
function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, vs, gl.VERTEX_SHADER));
  gl.attachShader(p, compile(gl, fs, gl.FRAGMENT_SHADER));
  // Fixed slots, so one vertex array can serve more than one program.
  gl.bindAttribLocation(p, 0, "aPos");
  gl.bindAttribLocation(p, 0, "aXY");
  gl.bindAttribLocation(p, 1, "aNrm");
  gl.bindAttribLocation(p, 1, "aCol");
  gl.bindAttribLocation(p, 2, "aMat");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}

export class Viewport {
  readonly gl: WebGL2RenderingContext;
  readonly cam: Cam = { yaw: -0.66, pitch: 0.16, dist: 12000, fov: 0.36, centre: [2000, 0, 500] };
  radius = 2500;
  paint = 0;
  clay: [number, number, number] = [0.55, 0.535, 0.515];
  ground: [number, number, number] = [0.085, 0.090, 0.100];
  private tint = new Float32Array(16 * 3);
  private surfProg: WebGLProgram;
  private lineProg: WebGLProgram;
  private ptProg: WebGLProgram;
  private floorProg: WebGLProgram;
  private bPos: WebGLBuffer; private bNrm: WebGLBuffer; private bMat: WebGLBuffer; private bIdx: WebGLBuffer;
  private surfVao: WebGLVertexArrayObject;
  private lPos: WebGLBuffer; private lCol: WebGLBuffer; private lineVao: WebGLVertexArrayObject;
  private pPos: WebGLBuffer; private pCol: WebGLBuffer; private ptVao: WebGLVertexArrayObject;
  private floorVao: WebGLVertexArrayObject;
  private nIdx = 0; private nLine = 0; private nPt = 0;
  private mvpM: Float32Array<ArrayBuffer> = new Float32Array(16);
  private eye: [number, number, number] = [0, 0, 0];

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) throw new Error("this browser has no WebGL2");
    this.gl = gl;
    this.surfProg = program(gl, SURF_VS, SURF_FS);
    this.lineProg = program(gl, LINE_VS, LINE_FS);
    this.ptProg = program(gl, PT_VS, PT_FS);
    this.floorProg = program(gl, FLOOR_VS, FLOOR_FS);
    const buf = (): WebGLBuffer => gl.createBuffer()!;
    this.bPos = buf(); this.bNrm = buf(); this.bMat = buf(); this.bIdx = buf();
    this.lPos = buf(); this.lCol = buf(); this.pPos = buf(); this.pCol = buf();

    this.surfVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.surfVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bPos);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bNrm);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bMat);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bIdx);
    gl.bindVertexArray(null);

    this.lineVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lPos);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lCol);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.ptVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.ptVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pPos);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pCol);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const fq = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, fq);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    this.floorVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.floorVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, fq);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  setPalette(cols: readonly (readonly [number, number, number])[]): void {
    for (let i = 0; i < 16; i++) {
      const c = cols[Math.min(i, cols.length - 1)] ?? [0.6, 0.6, 0.6];
      for (let k = 0; k < 3; k++) this.tint[i * 3 + k] = Math.pow(c[k]!, 2.2);
    }
  }

  setSurface(pos: Float32Array, nrm: Float32Array, mat: Float32Array, idx: Uint32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bPos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bNrm); gl.bufferData(gl.ARRAY_BUFFER, nrm, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bMat); gl.bufferData(gl.ARRAY_BUFFER, mat, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.bIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);
    this.nIdx = idx.length;
  }

  setLines(pos: Float32Array, col: Float32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lPos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lCol); gl.bufferData(gl.ARRAY_BUFFER, col, gl.DYNAMIC_DRAW);
    this.nLine = pos.length / 3;
  }

  setPoints(pos: Float32Array, col: Float32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pPos); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pCol); gl.bufferData(gl.ARRAY_BUFFER, col, gl.DYNAMIC_DRAW);
    this.nPt = pos.length / 3;
  }

  private pending: { lo: readonly number[]; hi: readonly number[] } | null = null;

  /**
   * Frame the car — by FITTING it, not by a rule of thumb.
   *
   * A multiple of the bounding radius is the usual shortcut and it crops a car
   * on a phone: the binding constraint on a wide screen is the height and on a
   * narrow one the length, and the two differ by a factor of three. So push the
   * eight corners of the box through the actual projection and bisect for the
   * closest distance that still holds all of them inside. Forty matrix builds,
   * run when you press FRAME, and right on every screen.
   */
  frame(lo: readonly number[], hi: readonly number[]): void {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) { this.pending = { lo, hi }; return; }
    this.pending = null;
    this.cam.centre = [(lo[0]! + hi[0]!) / 2, 0, (lo[2]! + hi[2]!) / 2];
    this.radius = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) / 2;
    const corners: number[][] = [];
    for (let i = 0; i < 8; i++)
      corners.push([i & 1 ? hi[0]! : lo[0]!, i & 2 ? hi[1]! : lo[1]!, i & 4 ? hi[2]! : lo[2]!]);
    const fits = (d: number): boolean => {
      this.cam.dist = d;
      const { mvp } = this.view();
      for (const p of corners) {
        const w = mvp[3]! * p[0]! + mvp[7]! * p[1]! + mvp[11]! * p[2]! + mvp[15]!;
        if (w <= 1e-6) return false;
        const x = (mvp[0]! * p[0]! + mvp[4]! * p[1]! + mvp[8]! * p[2]! + mvp[12]!) / w;
        const y = (mvp[1]! * p[0]! + mvp[5]! * p[1]! + mvp[9]! * p[2]! + mvp[13]!) / w;
        if (Math.abs(x) > 0.92 || Math.abs(y) > 0.92) return false;
      }
      return true;
    };
    let near = this.radius * 1.2, far = this.radius * 40;
    for (let i = 0; i < 40; i++) {
      const mid = (near + far) / 2;
      if (fits(mid)) far = mid; else near = mid;
    }
    this.cam.dist = far;
  }

  private view(): { mvp: Float32Array<ArrayBuffer>; eye: [number, number, number] } {
    const c = this.cam;
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    const dir: [number, number, number] = [cp * cy, cp * sy, sp];
    const eye: [number, number, number] = [
      c.centre[0] + dir[0] * c.dist, c.centre[1] + dir[1] * c.dist, c.centre[2] + dir[2] * c.dist,
    ];
    const f = [-dir[0], -dir[1], -dir[2]];
    let sx = [f[1]! * 1 - 0, 0 - f[0]! * 1, 0];
    sx = [f[1]!, -f[0]!, 0];
    const sl = Math.hypot(sx[0]!, sx[1]!, sx[2]!) || 1;
    sx = sx.map((x) => x / sl);
    const u = [
      sx[1]! * f[2]! - sx[2]! * f[1]!,
      sx[2]! * f[0]! - sx[0]! * f[2]!,
      sx[0]! * f[1]! - sx[1]! * f[0]!,
    ];
    const view = [
      sx[0]!, u[0]!, -f[0]!, 0,
      sx[1]!, u[1]!, -f[1]!, 0,
      sx[2]!, u[2]!, -f[2]!, 0,
      -(sx[0]! * eye[0] + sx[1]! * eye[1] + sx[2]! * eye[2]),
      -(u[0]! * eye[0] + u[1]! * eye[1] + u[2]! * eye[2]),
      (f[0]! * eye[0] + f[1]! * eye[1] + f[2]! * eye[2]), 1,
    ];
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const near = this.radius * 0.04, far = this.radius * 60;
    const tf = 1 / Math.tan(c.fov / 2);
    const proj = [tf / aspect, 0, 0, 0, 0, tf, 0, 0, 0, 0, (far + near) / (near - far), -1,
      0, 0, (2 * far * near) / (near - far), 0];
    const out: Float32Array<ArrayBuffer> = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += proj[k * 4 + j]! * view[i * 4 + k]!;
      out[i * 4 + j] = v;
    }
    return { mvp: out, eye };
  }

  /** Where a world point lands on the canvas, in CSS pixels. Null behind the eye. */
  project(p: readonly number[]): [number, number] | null {
    const m = this.mvpM;
    const w = m[3]! * p[0]! + m[7]! * p[1]! + m[11]! * p[2]! + m[15]!;
    if (w <= 1e-6) return null;
    const x = (m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!) / w;
    const y = (m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!) / w;
    const r = this.canvas.getBoundingClientRect();
    return [(x * 0.5 + 0.5) * r.width, (0.5 - y * 0.5) * r.height];
  }

  /** How many millimetres one CSS pixel spans at a given world point. */
  mmPerPixel(at: readonly number[]): number {
    const d = Math.hypot(at[0]! - this.eye[0], at[1]! - this.eye[1], at[2]! - this.eye[2]);
    const r = this.canvas.getBoundingClientRect();
    return (2 * Math.tan(this.cam.fov / 2) * d) / Math.max(1, r.height);
  }

  /** The two screen-aligned world axes, for dragging in the picture plane. */
  screenAxes(): { right: [number, number, number]; up: [number, number, number] } {
    const c = this.cam;
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    return { right: [-sy, cy, 0], up: [-sp * cy, -sp * sy, cp] };
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  draw(): void {
    const gl = this.gl;
    this.resize();
    if (this.pending) { const p = this.pending; this.pending = null; this.frame(p.lo, p.hi); }
    const { mvp, eye } = this.view();
    this.mvpM = mvp; this.eye = eye;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(this.ground[0], this.ground[1], this.ground[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    // floor
    gl.useProgram(this.floorProg);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const span = this.radius * 22;
    gl.uniformMatrix4fv(gl.getUniformLocation(this.floorProg, "uMVP"), false, mvp);
    gl.uniform3fv(gl.getUniformLocation(this.floorProg, "uEye"), new Float32Array(eye));
    gl.uniform2f(gl.getUniformLocation(this.floorProg, "uLo"), this.cam.centre[0] - span, -span);
    gl.uniform2f(gl.getUniformLocation(this.floorProg, "uHi"), this.cam.centre[0] + span, span);
    gl.uniform2f(gl.getUniformLocation(this.floorProg, "uCentre"), this.cam.centre[0], 0);
    gl.uniform1f(gl.getUniformLocation(this.floorProg, "uSpan"), span);
    gl.uniform3fv(gl.getUniformLocation(this.floorProg, "uGround"), new Float32Array(this.ground));
    gl.bindVertexArray(this.floorVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);

    // body
    if (this.nIdx > 0) {
      gl.useProgram(this.surfProg);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.surfProg, "uMVP"), false, mvp);
      gl.uniform3fv(gl.getUniformLocation(this.surfProg, "uEye"), new Float32Array(eye));
      gl.uniform3fv(gl.getUniformLocation(this.surfProg, "uTint"), this.tint);
      gl.uniform1f(gl.getUniformLocation(this.surfProg, "uPaint"), this.paint);
      gl.uniform3fv(gl.getUniformLocation(this.surfProg, "uClay"), new Float32Array(this.clay));
      gl.bindVertexArray(this.surfVao);
      gl.drawElements(gl.TRIANGLES, this.nIdx, gl.UNSIGNED_INT, 0);
      gl.disable(gl.CULL_FACE);
    }

    // network
    if (this.nLine > 0) {
      gl.useProgram(this.lineProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, "uMVP"), false, mvp);
      gl.uniform1f(gl.getUniformLocation(this.lineProg, "uLift"), 0.0016);
      gl.bindVertexArray(this.lineVao);
      gl.drawArrays(gl.LINES, 0, this.nLine);
    }

    // handles
    if (this.nPt > 0) {
      gl.useProgram(this.ptProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.ptProg, "uMVP"), false, mvp);
      gl.uniform1f(gl.getUniformLocation(this.ptProg, "uSize"), 13 * Math.min(window.devicePixelRatio || 1, 2));
      gl.bindVertexArray(this.ptVao);
      gl.drawArrays(gl.POINTS, 0, this.nPt);
    }
    gl.bindVertexArray(null);
  }
}
