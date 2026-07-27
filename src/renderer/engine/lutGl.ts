import type { ParsedLut } from './lut';

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = (aPosition + 1.0) * 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Looks up the 3D LUT via a 2D texture packed as `size` side-by-side tiles
// (one per blue slice, each `size`x`size`). Hardware LINEAR filtering
// provides the red/green interpolation; the blue axis is interpolated
// manually across the two nearest slices. This can bleed very slightly at
// tile edges (no padding between slices) - an accepted limitation of a live
// preview approximation. Accurate grading happens via FFmpeg's `lut3d`
// filter at export time (Phase 9).
const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D uSource;
uniform sampler2D uLut;
uniform float uSize;
uniform float uIntensity;
varying vec2 vUv;

void main() {
  vec4 src = texture2D(uSource, vUv);
  float size = uSize;
  float maxIndex = size - 1.0;
  vec3 scaled = clamp(src.rgb, 0.0, 1.0) * maxIndex;
  float bLow = floor(scaled.b);
  float bFrac = scaled.b - bLow;
  float bHigh = min(bLow + 1.0, maxIndex);

  vec2 uvLow = vec2((bLow * size + scaled.r + 0.5) / (size * size), (scaled.g + 0.5) / size);
  vec2 uvHigh = vec2((bHigh * size + scaled.r + 0.5) / (size * size), (scaled.g + 0.5) / size);

  vec3 colorLow = texture2D(uLut, uvLow).rgb;
  vec3 colorHigh = texture2D(uLut, uvHigh).rgb;
  vec3 graded = mix(colorLow, colorHigh, bFrac);

  gl_FragColor = vec4(mix(src.rgb, graded, uIntensity), src.a);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`LUT shader compile error: ${info ?? 'unknown'}`);
  }
  return shader;
}

// GPU-accelerated 3D LUT preview approximation (Section 5.7). Not
// unit-testable (WebGL + canvas drawing) - covered by the manual test
// checklist instead, same as the rest of PreviewPlayer's draw path.
export class LutGlProcessor {
  private canvas = document.createElement('canvas');
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private sourceTexture: WebGLTexture;
  private lutTexture: WebGLTexture;
  private lutKey: string | null = null;
  private uSize: WebGLUniformLocation;
  private uIntensity: WebGLUniformLocation;

  constructor() {
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL is not available for LUT preview');
    this.gl = gl;

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create WebGL program');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`LUT shader link error: ${gl.getProgramInfoLog(program) ?? 'unknown'}`);
    }
    this.program = program;
    gl.useProgram(program);

    // A single triangle that overflows the clip space on two sides - cheaper
    // than a quad (no second triangle, no diagonal seam) and standard for a
    // full-screen fragment pass.
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPosition = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const sourceTexture = gl.createTexture();
    const lutTexture = gl.createTexture();
    if (!sourceTexture || !lutTexture) throw new Error('Failed to create WebGL textures');
    this.sourceTexture = sourceTexture;
    this.lutTexture = lutTexture;
    for (const tex of [this.sourceTexture, this.lutTexture]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    const uSize = gl.getUniformLocation(program, 'uSize');
    const uIntensity = gl.getUniformLocation(program, 'uIntensity');
    if (!uSize || !uIntensity) throw new Error('Failed to locate LUT shader uniforms');
    this.uSize = uSize;
    this.uIntensity = uIntensity;

    gl.uniform1i(gl.getUniformLocation(program, 'uSource'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'uLut'), 1);
  }

  private uploadLut(lut: ParsedLut, key: string): void {
    if (this.lutKey === key) return;
    const { gl } = this;
    const { size, data } = lut;
    const width = size * size;
    const height = size;
    const rgba = new Uint8Array(width * height * 4);
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const srcIdx = (b * size * size + g * size + r) * 3;
          const dstIdx = (g * width + (b * size + r)) * 4;
          rgba[dstIdx] = Math.round(Math.min(1, Math.max(0, data[srcIdx])) * 255);
          rgba[dstIdx + 1] = Math.round(Math.min(1, Math.max(0, data[srcIdx + 1])) * 255);
          rgba[dstIdx + 2] = Math.round(Math.min(1, Math.max(0, data[srcIdx + 2])) * 255);
          rgba[dstIdx + 3] = 255;
        }
      }
    }
    // This is raw packed LUT data, not an on-screen image - it must not be
    // flipped the way the source frame below needs to be.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    this.lutKey = key;
  }

  // Renders `source` through the LUT and returns this processor's own canvas
  // (owned by the instance, overwritten on each call) - callers must finish
  // drawing from it before calling process() again.
  process(
    source: TexImageSource,
    width: number,
    height: number,
    lut: ParsedLut,
    lutKey: string,
    intensity: number,
  ): HTMLCanvasElement {
    const { gl } = this;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    gl.viewport(0, 0, width, height);

    this.uploadLut(lut, lutKey);

    // Video/image sources are top-down; WebGL textures are bottom-up, so this
    // one does need the flip (unlike the raw LUT data above).
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

    gl.useProgram(this.program);
    gl.uniform1f(this.uSize, lut.size);
    gl.uniform1f(this.uIntensity, Math.max(0, Math.min(1, intensity)));

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }
}
