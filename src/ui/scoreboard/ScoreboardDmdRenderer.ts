const SOURCE_WIDTH = 240
const SOURCE_HEIGHT = 135
const LUT_SIZE = 256
const DOT_RADIUS = 0.38

const DMD_PALETTE_LIGHT_TO_DARK = ['#669E10', '#006B18', '#0E3420', '#141414'] as const

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

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uSourceTex;
uniform sampler2D uLutTex;
uniform vec2 uSourceSize;
uniform float uDotRadius;
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
  vec2 gridUv = vUv * uSourceSize;
  vec2 sampleUv = (floor(gridUv) + 0.5) / uSourceSize;
  vec4 src = texture(uSourceTex, sampleUv);
  vec3 unpremultiplied = src.a > 0.0001 ? (src.rgb / src.a) : src.rgb;
  float luminance = dot(unpremultiplied, vec3(0.2126, 0.7152, 0.0722)) * src.a;
  float curved = texture(uLutTex, vec2(clamp(luminance, 0.0, 1.0), 0.5)).r;
  float quantized = min(3.0, floor(curved * 4.0));
  vec3 dotColor = selectPaletteColor(quantized);

  vec2 cell = fract(gridUv) - 0.5;
  float dotMask = step(length(cell), uDotRadius);
  vec3 finalColor = mix(uGapColor, dotColor, dotMask);

  outColor = vec4(finalColor, 1.0);
}
`

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function buildLutTextureData(): Uint8Array {
  const data = new Uint8Array(LUT_SIZE * 4)
  for (let i = 0; i < LUT_SIZE; i += 1) {
    const x = i / (LUT_SIZE - 1)
    const shapedLow = x < 0.5
      ? 0.5 * Math.pow(x * 2, 0.85)
      : 1 - 0.5 * Math.pow((1 - x) * 2, 1.18)
    const y = Math.round(clamp01(shapedLow) * 255)
    const offset = i * 4
    data[offset] = y
    data[offset + 1] = y
    data[offset + 2] = y
    data[offset + 3] = 255
  }
  return data
}

function hexToRgbNormalized(hex: string): [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  const normalized = clean.length === 3
    ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
    : clean

  const int = Number.parseInt(normalized, 16)
  if (!Number.isFinite(int)) {
    return [0, 0, 0]
  }
  const r = ((int >> 16) & 0xff) / 255
  const g = ((int >> 8) & 0xff) / 255
  const b = (int & 0xff) / 255
  return [r, g, b]
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('DMD renderer failed: unable to create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return shader
  }
  const info = gl.getShaderInfoLog(shader) || 'unknown shader compile error'
  gl.deleteShader(shader)
  throw new Error(`DMD renderer failed: ${info}`)
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE)
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

  if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return program
  }

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

export class ScoreboardDmdRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly vao: WebGLVertexArrayObject
  private readonly sourceTexture: WebGLTexture
  private readonly lutTexture: WebGLTexture
  private readonly uSourceTex: WebGLUniformLocation
  private readonly uLutTex: WebGLUniformLocation
  private readonly uSourceSize: WebGLUniformLocation
  private readonly uDotRadius: WebGLUniformLocation
  private readonly uPalette0: WebGLUniformLocation
  private readonly uPalette1: WebGLUniformLocation
  private readonly uPalette2: WebGLUniformLocation
  private readonly uPalette3: WebGLUniformLocation
  private readonly uGapColor: WebGLUniformLocation
  private disposed = false
  private viewportWidth = 0
  private viewportHeight = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    })

    if (!gl) {
      throw new Error('DMD renderer failed: WebGL2 is unavailable')
    }

    this.gl = gl
    this.program = createProgram(gl)
    const vao = gl.createVertexArray()
    if (!vao) {
      gl.deleteProgram(this.program)
      throw new Error('DMD renderer failed: unable to create VAO')
    }
    this.vao = vao

    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)

    const uSourceTex = gl.getUniformLocation(this.program, 'uSourceTex')
    const uLutTex = gl.getUniformLocation(this.program, 'uLutTex')
    const uSourceSize = gl.getUniformLocation(this.program, 'uSourceSize')
    const uDotRadius = gl.getUniformLocation(this.program, 'uDotRadius')
    const uPalette0 = gl.getUniformLocation(this.program, 'uPalette0')
    const uPalette1 = gl.getUniformLocation(this.program, 'uPalette1')
    const uPalette2 = gl.getUniformLocation(this.program, 'uPalette2')
    const uPalette3 = gl.getUniformLocation(this.program, 'uPalette3')
    const uGapColor = gl.getUniformLocation(this.program, 'uGapColor')

    if (
      !uSourceTex
      || !uLutTex
      || !uSourceSize
      || !uDotRadius
      || !uPalette0
      || !uPalette1
      || !uPalette2
      || !uPalette3
      || !uGapColor
    ) {
      gl.deleteVertexArray(this.vao)
      gl.deleteProgram(this.program)
      throw new Error('DMD renderer failed: unable to resolve shader uniforms')
    }

    this.uSourceTex = uSourceTex
    this.uLutTex = uLutTex
    this.uSourceSize = uSourceSize
    this.uDotRadius = uDotRadius
    this.uPalette0 = uPalette0
    this.uPalette1 = uPalette1
    this.uPalette2 = uPalette2
    this.uPalette3 = uPalette3
    this.uGapColor = uGapColor

    this.sourceTexture = createNearestTexture(gl)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      SOURCE_WIDTH,
      SOURCE_HEIGHT,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )

    this.lutTexture = createNearestTexture(gl)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      LUT_SIZE,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      buildLutTextureData(),
    )

    const darkFirst = [
      DMD_PALETTE_LIGHT_TO_DARK[3],
      DMD_PALETTE_LIGHT_TO_DARK[2],
      DMD_PALETTE_LIGHT_TO_DARK[1],
      DMD_PALETTE_LIGHT_TO_DARK[0],
    ] as const

    const palette0 = hexToRgbNormalized(darkFirst[0])
    const palette1 = hexToRgbNormalized(darkFirst[1])
    const palette2 = hexToRgbNormalized(darkFirst[2])
    const palette3 = hexToRgbNormalized(darkFirst[3])
    const gapColor = palette0

    gl.uniform1i(this.uSourceTex, 0)
    gl.uniform1i(this.uLutTex, 1)
    gl.uniform2f(this.uSourceSize, SOURCE_WIDTH, SOURCE_HEIGHT)
    gl.uniform1f(this.uDotRadius, DOT_RADIUS)
    gl.uniform3f(this.uPalette0, palette0[0], palette0[1], palette0[2])
    gl.uniform3f(this.uPalette1, palette1[0], palette1[1], palette1[2])
    gl.uniform3f(this.uPalette2, palette2[0], palette2[1], palette2[2])
    gl.uniform3f(this.uPalette3, palette3[0], palette3[1], palette3[2])
    gl.uniform3f(this.uGapColor, gapColor[0], gapColor[1], gapColor[2])

    gl.disable(gl.BLEND)
    this.ensureCanvasSize()
  }

  render(sourceCanvas: HTMLCanvasElement): void {
    if (this.disposed) return
    this.ensureCanvasSize()

    const gl = this.gl
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      sourceCanvas,
    )

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.lutTexture)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const gl = this.gl
    gl.deleteTexture(this.sourceTexture)
    gl.deleteTexture(this.lutTexture)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.program)
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
    this.gl.viewport(0, 0, width, height)
  }
}
