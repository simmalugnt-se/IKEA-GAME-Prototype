import { SCOREBOARD_SETTINGS } from '@/scoreboard/scoreBoardSettings'
import type { ScoreboardCurvePoint } from '@/scoreboard/scoreBoardSettings.types'

const LUT_SIZE = 256

const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;
out vec2 vUv;
const vec2 POSITIONS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

void main() {
  vec2 position = POSITIONS[gl_VertexID];
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const EDGE_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uSourceTex;
uniform vec2 uTexelSize;
uniform float uEdgeEnabled;
uniform float uDetectRange;
uniform float uCompressStrength;
uniform float uMidBandMin;
uniform float uMidBandMax;

float toCoverageLuma(vec4 src) {
  vec3 unpremultiplied = src.a > 0.0001 ? (src.rgb / src.a) : src.rgb;
  return dot(unpremultiplied, vec3(0.2126, 0.7152, 0.0722)) * src.a;
}

float sampleCoverageLuma(vec2 uv) {
  return toCoverageLuma(texture(uSourceTex, clamp(uv, vec2(0.0), vec2(1.0))));
}

void main() {
  float center = sampleCoverageLuma(vUv);
  if (uEdgeEnabled < 0.5) {
    outColor = vec4(center, center, center, 1.0);
    return;
  }

  float left = sampleCoverageLuma(vUv + vec2(-uTexelSize.x, 0.0));
  float right = sampleCoverageLuma(vUv + vec2(uTexelSize.x, 0.0));
  float up = sampleCoverageLuma(vUv + vec2(0.0, uTexelSize.y));
  float down = sampleCoverageLuma(vUv + vec2(0.0, -uTexelSize.y));

  float localMin = min(center, min(min(left, right), min(up, down)));
  float localMax = max(center, max(max(left, right), max(up, down)));
  float range = localMax - localMin;

  float isEdge = step(uDetectRange, range);
  float inMidBand = step(uMidBandMin, center) * step(center, uMidBandMax);

  float distToMin = abs(center - localMin);
  float distToMax = abs(localMax - center);
  float nearestExtreme = mix(localMax, localMin, step(distToMin, distToMax));

  float amount = uCompressStrength * isEdge * inMidBand;
  float compressed = mix(center, nearestExtreme, amount);
  outColor = vec4(compressed, compressed, compressed, 1.0);
}
`

const DMD_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uEdgeTex;
uniform sampler2D uLutTex;
uniform vec2 uGridSize;
uniform vec2 uViewportSizePx;
uniform vec2 uActiveOriginPx;
uniform vec2 uActiveSizePx;
uniform float uCellPitchPx;
uniform float uDotRadiusPx;
uniform vec3 uPalette0;
uniform vec3 uPalette1;
uniform vec3 uPalette2;
uniform vec3 uPalette3;
uniform vec3 uGapColor;

vec3 selectPaletteColor(float index) {
  if (index < 0.5) return uPalette0;
  if (index < 1.5) return uPalette1;
  if (index < 2.5) return uPalette2;
  return uPalette3;
}

void main() {
  vec2 fragPx = vUv * uViewportSizePx;
  vec2 relPx = fragPx - uActiveOriginPx;
  if (relPx.x < 0.0 || relPx.y < 0.0 || relPx.x >= uActiveSizePx.x || relPx.y >= uActiveSizePx.y) {
    outColor = vec4(uGapColor, 1.0);
    return;
  }

  vec2 cellCoord = relPx / uCellPitchPx;
  vec2 cellIndex = floor(cellCoord);
  if (cellIndex.x < 0.0 || cellIndex.y < 0.0 || cellIndex.x >= uGridSize.x || cellIndex.y >= uGridSize.y) {
    outColor = vec4(uGapColor, 1.0);
    return;
  }

  vec2 sampleUv = (cellIndex + 0.5) / uGridSize;
  float luminance = texture(uEdgeTex, sampleUv).r;
  float curved = texture(uLutTex, vec2(clamp(luminance, 0.0, 1.0), 0.5)).r;
  float quantized = min(3.0, floor(curved * 4.0));
  vec3 dotColor = selectPaletteColor(quantized);

  vec2 localPx = (fract(cellCoord) - 0.5) * uCellPitchPx;
  float dotMask = step(length(localPx), uDotRadiusPx);
  vec3 finalColor = mix(uGapColor, dotColor, dotMask);
  outColor = vec4(finalColor, 1.0);
}
`

type CurveSegmentData = {
  points: ScoreboardCurvePoint[]
  slopes: number[]
}

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function clampFinite(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return value
}

function hexToRgbNormalized(hex: string): [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  const normalized = clean.length === 3
    ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
    : clean

  const int = Number.parseInt(normalized, 16)
  if (!Number.isFinite(int)) return [0, 0, 0]

  const r = ((int >> 16) & 0xff) / 255
  const g = ((int >> 8) & 0xff) / 255
  const b = (int & 0xff) / 255
  return [r, g, b]
}

function normalizeCurvePoints(rawPoints: ScoreboardCurvePoint[]): ScoreboardCurvePoint[] {
  const sanitized: ScoreboardCurvePoint[] = []
  for (let i = 0; i < rawPoints.length; i += 1) {
    const p = rawPoints[i]
    const x = clamp01(clampFinite(p?.x, i / Math.max(1, rawPoints.length - 1)))
    const y = clamp01(clampFinite(p?.y, x))
    sanitized.push({ x, y })
  }

  if (sanitized.length < 2) {
    return [{ x: 0, y: 0 }, { x: 1, y: 1 }]
  }

  sanitized.sort((a, b) => a.x - b.x)
  sanitized[0] = { x: 0, y: 0 }
  sanitized[sanitized.length - 1] = { x: 1, y: 1 }

  const epsilon = 1e-4
  for (let i = 1; i < sanitized.length - 1; i += 1) {
    const prevX = sanitized[i - 1].x + epsilon
    const nextX = sanitized[i + 1].x - epsilon
    let x = sanitized[i].x
    if (x < prevX) x = prevX
    if (x > nextX) x = nextX
    sanitized[i] = { x, y: sanitized[i].y }
  }

  return sanitized
}

function buildMonotonicCurve(points: ScoreboardCurvePoint[]): CurveSegmentData {
  const n = points.length
  const slopes = new Array<number>(n).fill(0)
  const h = new Array<number>(n - 1).fill(0)
  const delta = new Array<number>(n - 1).fill(0)

  for (let i = 0; i < n - 1; i += 1) {
    const dx = Math.max(1e-6, points[i + 1].x - points[i].x)
    const dy = points[i + 1].y - points[i].y
    h[i] = dx
    delta[i] = dy / dx
  }

  slopes[0] = delta[0]
  slopes[n - 1] = delta[n - 2]

  for (let i = 1; i < n - 1; i += 1) {
    const a = delta[i - 1]
    const b = delta[i]
    if (a * b <= 0) {
      slopes[i] = 0
      continue
    }
    const w1 = 2 * h[i] + h[i - 1]
    const w2 = h[i] + 2 * h[i - 1]
    slopes[i] = (w1 + w2) / (w1 / a + w2 / b)
  }

  for (let i = 0; i < n - 1; i += 1) {
    if (Math.abs(delta[i]) < 1e-9) {
      slopes[i] = 0
      slopes[i + 1] = 0
      continue
    }
    const a = slopes[i] / delta[i]
    const b = slopes[i + 1] / delta[i]
    const sumSq = a * a + b * b
    if (sumSq <= 9) continue
    const t = 3 / Math.sqrt(sumSq)
    slopes[i] = t * a * delta[i]
    slopes[i + 1] = t * b * delta[i]
  }

  return { points, slopes }
}

function sampleMonotonicCurve(curve: CurveSegmentData, x: number): number {
  const clampedX = clamp01(x)
  const { points, slopes } = curve
  const count = points.length
  if (clampedX <= points[0].x) return clamp01(points[0].y)
  if (clampedX >= points[count - 1].x) return clamp01(points[count - 1].y)

  let i = 0
  while (i < count - 2 && clampedX > points[i + 1].x) i += 1

  const p0 = points[i]
  const p1 = points[i + 1]
  const h = Math.max(1e-6, p1.x - p0.x)
  const t = (clampedX - p0.x) / h
  const t2 = t * t
  const t3 = t2 * t

  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2

  const y = h00 * p0.y + h10 * h * slopes[i] + h01 * p1.y + h11 * h * slopes[i + 1]
  return clamp01(y)
}

function buildLutTextureData(): Uint8Array {
  const curveCfg = SCOREBOARD_SETTINGS.dmd.curve
  const antiAliasCrush = clamp01(curveCfg.antiAliasCrush)
  const curvePoints = normalizeCurvePoints(curveCfg.points)
  const curve = buildMonotonicCurve(curvePoints)

  const data = new Uint8Array(LUT_SIZE * 4)
  for (let i = 0; i < LUT_SIZE; i += 1) {
    const x = i / (LUT_SIZE - 1)
    const yLinear = sampleMonotonicCurve(curve, x)
    const nearestBucket = Math.round(yLinear * 3) / 3
    const y = Math.round(clamp01(yLinear * (1 - antiAliasCrush) + nearestBucket * antiAliasCrush) * 255)
    const offset = i * 4
    data[offset] = y
    data[offset + 1] = y
    data[offset + 2] = y
    data[offset + 3] = 255
  }
  return data
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('DMD renderer failed: unable to create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  const info = gl.getShaderInfoLog(shader) || 'unknown shader compile error'
  gl.deleteShader(shader)
  throw new Error(`DMD renderer failed: ${info}`)
}

function createProgram(gl: WebGL2RenderingContext, fragmentShaderSource: string): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    throw new Error('DMD renderer failed: unable to create shader program')
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program
  const info = gl.getProgramInfoLog(program) || 'unknown link error'
  gl.deleteProgram(program)
  throw new Error(`DMD renderer failed: ${info}`)
}

function createNearestTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture()
  if (!texture) throw new Error('DMD renderer failed: unable to create texture')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}

function createFramebuffer(gl: WebGL2RenderingContext, texture: WebGLTexture): WebGLFramebuffer {
  const framebuffer = gl.createFramebuffer()
  if (!framebuffer) throw new Error('DMD renderer failed: unable to create framebuffer')
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(framebuffer)
    throw new Error('DMD renderer failed: edge framebuffer is incomplete')
  }
  return framebuffer
}

export class ScoreboardDmdRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly sourceWidth: number
  private readonly sourceHeight: number
  private readonly vao: WebGLVertexArrayObject
  private readonly edgeProgram: WebGLProgram
  private readonly dmdProgram: WebGLProgram
  private readonly sourceTexture: WebGLTexture
  private readonly edgeTexture: WebGLTexture
  private readonly lutTexture: WebGLTexture
  private readonly edgeFramebuffer: WebGLFramebuffer

  private readonly uEdgeSourceTex: WebGLUniformLocation
  private readonly uEdgeTexelSize: WebGLUniformLocation
  private readonly uEdgeEnabled: WebGLUniformLocation
  private readonly uEdgeDetectRange: WebGLUniformLocation
  private readonly uEdgeCompressStrength: WebGLUniformLocation
  private readonly uEdgeMidBandMin: WebGLUniformLocation
  private readonly uEdgeMidBandMax: WebGLUniformLocation

  private readonly uDmdEdgeTex: WebGLUniformLocation
  private readonly uDmdLutTex: WebGLUniformLocation
  private readonly uDmdGridSize: WebGLUniformLocation
  private readonly uDmdViewportSizePx: WebGLUniformLocation
  private readonly uDmdActiveOriginPx: WebGLUniformLocation
  private readonly uDmdActiveSizePx: WebGLUniformLocation
  private readonly uDmdCellPitchPx: WebGLUniformLocation
  private readonly uDmdDotRadiusPx: WebGLUniformLocation
  private readonly uDmdPalette0: WebGLUniformLocation
  private readonly uDmdPalette1: WebGLUniformLocation
  private readonly uDmdPalette2: WebGLUniformLocation
  private readonly uDmdPalette3: WebGLUniformLocation
  private readonly uDmdGapColor: WebGLUniformLocation

  private disposed = false
  private viewportWidth = 0
  private viewportHeight = 0

  constructor(canvas: HTMLCanvasElement, sourceWidth: number, sourceHeight: number) {
    this.canvas = canvas
    this.sourceWidth = Math.max(1, Math.floor(sourceWidth))
    this.sourceHeight = Math.max(1, Math.floor(sourceHeight))
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    })
    if (!gl) throw new Error('DMD renderer failed: WebGL2 is unavailable')
    this.gl = gl

    this.edgeProgram = createProgram(gl, EDGE_FRAGMENT_SHADER_SOURCE)
    this.dmdProgram = createProgram(gl, DMD_FRAGMENT_SHADER_SOURCE)

    const vao = gl.createVertexArray()
    if (!vao) {
      gl.deleteProgram(this.edgeProgram)
      gl.deleteProgram(this.dmdProgram)
      throw new Error('DMD renderer failed: unable to create VAO')
    }
    this.vao = vao
    gl.bindVertexArray(this.vao)

    const uEdgeSourceTex = gl.getUniformLocation(this.edgeProgram, 'uSourceTex')
    const uEdgeTexelSize = gl.getUniformLocation(this.edgeProgram, 'uTexelSize')
    const uEdgeEnabled = gl.getUniformLocation(this.edgeProgram, 'uEdgeEnabled')
    const uEdgeDetectRange = gl.getUniformLocation(this.edgeProgram, 'uDetectRange')
    const uEdgeCompressStrength = gl.getUniformLocation(this.edgeProgram, 'uCompressStrength')
    const uEdgeMidBandMin = gl.getUniformLocation(this.edgeProgram, 'uMidBandMin')
    const uEdgeMidBandMax = gl.getUniformLocation(this.edgeProgram, 'uMidBandMax')

    const uDmdEdgeTex = gl.getUniformLocation(this.dmdProgram, 'uEdgeTex')
    const uDmdLutTex = gl.getUniformLocation(this.dmdProgram, 'uLutTex')
    const uDmdGridSize = gl.getUniformLocation(this.dmdProgram, 'uGridSize')
    const uDmdViewportSizePx = gl.getUniformLocation(this.dmdProgram, 'uViewportSizePx')
    const uDmdActiveOriginPx = gl.getUniformLocation(this.dmdProgram, 'uActiveOriginPx')
    const uDmdActiveSizePx = gl.getUniformLocation(this.dmdProgram, 'uActiveSizePx')
    const uDmdCellPitchPx = gl.getUniformLocation(this.dmdProgram, 'uCellPitchPx')
    const uDmdDotRadiusPx = gl.getUniformLocation(this.dmdProgram, 'uDotRadiusPx')
    const uDmdPalette0 = gl.getUniformLocation(this.dmdProgram, 'uPalette0')
    const uDmdPalette1 = gl.getUniformLocation(this.dmdProgram, 'uPalette1')
    const uDmdPalette2 = gl.getUniformLocation(this.dmdProgram, 'uPalette2')
    const uDmdPalette3 = gl.getUniformLocation(this.dmdProgram, 'uPalette3')
    const uDmdGapColor = gl.getUniformLocation(this.dmdProgram, 'uGapColor')

    if (
      !uEdgeSourceTex
      || !uEdgeTexelSize
      || !uEdgeEnabled
      || !uEdgeDetectRange
      || !uEdgeCompressStrength
      || !uEdgeMidBandMin
      || !uEdgeMidBandMax
      || !uDmdEdgeTex
      || !uDmdLutTex
      || !uDmdGridSize
      || !uDmdViewportSizePx
      || !uDmdActiveOriginPx
      || !uDmdActiveSizePx
      || !uDmdCellPitchPx
      || !uDmdDotRadiusPx
      || !uDmdPalette0
      || !uDmdPalette1
      || !uDmdPalette2
      || !uDmdPalette3
      || !uDmdGapColor
    ) {
      gl.deleteVertexArray(this.vao)
      gl.deleteProgram(this.edgeProgram)
      gl.deleteProgram(this.dmdProgram)
      throw new Error('DMD renderer failed: unable to resolve shader uniforms')
    }

    this.uEdgeSourceTex = uEdgeSourceTex
    this.uEdgeTexelSize = uEdgeTexelSize
    this.uEdgeEnabled = uEdgeEnabled
    this.uEdgeDetectRange = uEdgeDetectRange
    this.uEdgeCompressStrength = uEdgeCompressStrength
    this.uEdgeMidBandMin = uEdgeMidBandMin
    this.uEdgeMidBandMax = uEdgeMidBandMax

    this.uDmdEdgeTex = uDmdEdgeTex
    this.uDmdLutTex = uDmdLutTex
    this.uDmdGridSize = uDmdGridSize
    this.uDmdViewportSizePx = uDmdViewportSizePx
    this.uDmdActiveOriginPx = uDmdActiveOriginPx
    this.uDmdActiveSizePx = uDmdActiveSizePx
    this.uDmdCellPitchPx = uDmdCellPitchPx
    this.uDmdDotRadiusPx = uDmdDotRadiusPx
    this.uDmdPalette0 = uDmdPalette0
    this.uDmdPalette1 = uDmdPalette1
    this.uDmdPalette2 = uDmdPalette2
    this.uDmdPalette3 = uDmdPalette3
    this.uDmdGapColor = uDmdGapColor

    this.sourceTexture = createNearestTexture(gl)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.sourceWidth,
      this.sourceHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )

    this.edgeTexture = createNearestTexture(gl)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      this.sourceWidth,
      this.sourceHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )

    this.lutTexture = createNearestTexture(gl)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, LUT_SIZE, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, buildLutTextureData())

    this.edgeFramebuffer = createFramebuffer(gl, this.edgeTexture)

    this.syncFromSettings()
    gl.disable(gl.BLEND)
    this.ensureCanvasSize()
  }

  render(sourceCanvas: HTMLCanvasElement): void {
    if (this.disposed) return
    this.ensureCanvasSize()
    const gl = this.gl

    gl.bindVertexArray(this.vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas)

    gl.useProgram(this.edgeProgram)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.edgeFramebuffer)
    gl.viewport(0, 0, this.sourceWidth, this.sourceHeight)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    gl.useProgram(this.dmdProgram)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.viewportWidth, this.viewportHeight)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.edgeTexture)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  syncFromSettings(): void {
    if (this.disposed) return
    this.applyEdgeUniforms()
    this.applyPaletteAndCurveUniforms()
    this.applyLayoutUniforms(this.viewportWidth || 1, this.viewportHeight || 1)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const gl = this.gl
    gl.deleteTexture(this.sourceTexture)
    gl.deleteTexture(this.edgeTexture)
    gl.deleteTexture(this.lutTexture)
    gl.deleteFramebuffer(this.edgeFramebuffer)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.edgeProgram)
    gl.deleteProgram(this.dmdProgram)
  }

  private applyEdgeUniforms(): void {
    const gl = this.gl
    const edge = SCOREBOARD_SETTINGS.dmd.edge
    gl.useProgram(this.edgeProgram)
    gl.uniform1i(this.uEdgeSourceTex, 0)
    gl.uniform2f(this.uEdgeTexelSize, 1 / this.sourceWidth, 1 / this.sourceHeight)
    gl.uniform1f(this.uEdgeEnabled, edge.enabled ? 1 : 0)
    gl.uniform1f(this.uEdgeDetectRange, clamp01(edge.detectRange))
    gl.uniform1f(this.uEdgeCompressStrength, clamp01(edge.compressStrength))
    gl.uniform1f(this.uEdgeMidBandMin, clamp01(edge.midBandMin))
    gl.uniform1f(this.uEdgeMidBandMax, clamp01(edge.midBandMax))
  }

  private applyPaletteAndCurveUniforms(): void {
    const gl = this.gl
    const palette = SCOREBOARD_SETTINGS.dmd.palette

    // shader palette order is darkest -> lightest
    const darkFirst = [palette[3], palette[2], palette[1], palette[0]] as const
    const p0 = hexToRgbNormalized(darkFirst[0])
    const p1 = hexToRgbNormalized(darkFirst[1])
    const p2 = hexToRgbNormalized(darkFirst[2])
    const p3 = hexToRgbNormalized(darkFirst[3])

    gl.useProgram(this.dmdProgram)
    gl.uniform1i(this.uDmdEdgeTex, 0)
    gl.uniform1i(this.uDmdLutTex, 1)
    gl.uniform3f(this.uDmdPalette0, p0[0], p0[1], p0[2])
    gl.uniform3f(this.uDmdPalette1, p1[0], p1[1], p1[2])
    gl.uniform3f(this.uDmdPalette2, p2[0], p2[1], p2[2])
    gl.uniform3f(this.uDmdPalette3, p3[0], p3[1], p3[2])
    gl.uniform3f(this.uDmdGapColor, p0[0], p0[1], p0[2])

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LUT_SIZE, 1, gl.RGBA, gl.UNSIGNED_BYTE, buildLutTextureData())
  }

  private applyLayoutUniforms(width: number, height: number): void {
    const dotFill = clamp01(SCOREBOARD_SETTINGS.dmd.grid.dotFill)
    const resolutionMultiplier = Math.min(
      32,
      Math.max(0.25, clampFinite(SCOREBOARD_SETTINGS.dmd.grid.resolutionMultiplier, 1)),
    )
    const gridWidth = Math.max(1, Math.round(this.sourceWidth / resolutionMultiplier))
    const gridHeight = Math.max(1, Math.round(this.sourceHeight / resolutionMultiplier))
    const cellPitch = Math.max(0.0001, Math.min(width / gridWidth, height / gridHeight))
    const activeWidth = gridWidth * cellPitch
    const activeHeight = gridHeight * cellPitch
    const activeOriginX = (width - activeWidth) * 0.5
    const activeOriginY = (height - activeHeight) * 0.5
    const dotRadiusPx = Math.max(0.25, cellPitch * dotFill * 0.5)

    this.gl.useProgram(this.dmdProgram)
    this.gl.uniform2f(this.uDmdGridSize, gridWidth, gridHeight)
    this.gl.uniform2f(this.uDmdViewportSizePx, width, height)
    this.gl.uniform2f(this.uDmdActiveOriginPx, activeOriginX, activeOriginY)
    this.gl.uniform2f(this.uDmdActiveSizePx, activeWidth, activeHeight)
    this.gl.uniform1f(this.uDmdCellPitchPx, cellPitch)
    this.gl.uniform1f(this.uDmdDotRadiusPx, dotRadiusPx)
  }

  private ensureCanvasSize(): void {
    const dpr = window.devicePixelRatio || 1
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr))
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr))
    if (width === this.viewportWidth && height === this.viewportHeight) return
    this.viewportWidth = width
    this.viewportHeight = height
    this.canvas.width = width
    this.canvas.height = height
    this.applyLayoutUniforms(width, height)
  }
}
