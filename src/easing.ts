export const EASING_NAMES = [
  'linear',
  'smooth',
  'easeIn',
  'easeOut',
  'easeInOut',
  'easeInSine',
  'easeOutSine',
  'easeInOutSine',
  'easeInQuad',
  'easeOutQuad',
  'easeInOutQuad',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeInQuart',
  'easeOutQuart',
  'easeInOutQuart',
  'easeInQuint',
  'easeOutQuint',
  'easeInOutQuint',
  'easeInExpo',
  'easeOutExpo',
  'easeInOutExpo',
  'easeInCirc',
  'easeOutCirc',
  'easeInOutCirc',
  'easeInBack',
  'easeOutBack',
  'easeInOutBack',
  'easeInElastic',
  'easeOutElastic',
  'easeInOutElastic',
  'easeInBounce',
  'easeOutBounce',
  'easeInOutBounce',
] as const

export type EasingName = (typeof EASING_NAMES)[number]

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function easeOutBounce(x: number): number {
  const n1 = 7.5625
  const d1 = 2.75

  if (x < 1 / d1) return n1 * x * x
  if (x < 2 / d1) {
    const t = x - (1.5 / d1)
    return (n1 * t * t) + 0.75
  }
  if (x < 2.5 / d1) {
    const t = x - (2.25 / d1)
    return (n1 * t * t) + 0.9375
  }
  const t = x - (2.625 / d1)
  return (n1 * t * t) + 0.984375
}

export function applyEasing(value: number, easing: EasingName): number {
  const x = clamp01(value)

  // Legacy aliases kept for ergonomics in existing scene code.
  if (easing === 'smooth') return x * x * (3 - (2 * x))
  if (easing === 'easeIn') return x * x
  if (easing === 'easeOut') return 1 - ((1 - x) * (1 - x))
  if (easing === 'easeInOut') {
    if (x < 0.5) return 4 * x * x * x
    return 1 - (Math.pow(-2 * x + 2, 3) / 2)
  }

  if (easing === 'linear') return x

  if (easing === 'easeInSine') return 1 - Math.cos((x * Math.PI) / 2)
  if (easing === 'easeOutSine') return Math.sin((x * Math.PI) / 2)
  if (easing === 'easeInOutSine') return -(Math.cos(Math.PI * x) - 1) / 2

  if (easing === 'easeInQuad') return x * x
  if (easing === 'easeOutQuad') return 1 - ((1 - x) * (1 - x))
  if (easing === 'easeInOutQuad') {
    if (x < 0.5) return 2 * x * x
    return 1 - (Math.pow(-2 * x + 2, 2) / 2)
  }

  if (easing === 'easeInCubic') return x * x * x
  if (easing === 'easeOutCubic') return 1 - Math.pow(1 - x, 3)
  if (easing === 'easeInOutCubic') {
    if (x < 0.5) return 4 * x * x * x
    return 1 - (Math.pow(-2 * x + 2, 3) / 2)
  }

  if (easing === 'easeInQuart') return Math.pow(x, 4)
  if (easing === 'easeOutQuart') return 1 - Math.pow(1 - x, 4)
  if (easing === 'easeInOutQuart') {
    if (x < 0.5) return 8 * Math.pow(x, 4)
    return 1 - (Math.pow(-2 * x + 2, 4) / 2)
  }

  if (easing === 'easeInQuint') return Math.pow(x, 5)
  if (easing === 'easeOutQuint') return 1 - Math.pow(1 - x, 5)
  if (easing === 'easeInOutQuint') {
    if (x < 0.5) return 16 * Math.pow(x, 5)
    return 1 - (Math.pow(-2 * x + 2, 5) / 2)
  }

  if (easing === 'easeInExpo') return x === 0 ? 0 : Math.pow(2, 10 * x - 10)
  if (easing === 'easeOutExpo') return x === 1 ? 1 : 1 - Math.pow(2, -10 * x)
  if (easing === 'easeInOutExpo') {
    if (x === 0) return 0
    if (x === 1) return 1
    if (x < 0.5) return Math.pow(2, 20 * x - 10) / 2
    return (2 - Math.pow(2, -20 * x + 10)) / 2
  }

  if (easing === 'easeInCirc') return 1 - Math.sqrt(1 - (x * x))
  if (easing === 'easeOutCirc') return Math.sqrt(1 - Math.pow(x - 1, 2))
  if (easing === 'easeInOutCirc') {
    if (x < 0.5) return (1 - Math.sqrt(1 - Math.pow(2 * x, 2))) / 2
    return (Math.sqrt(1 - Math.pow(-2 * x + 2, 2)) + 1) / 2
  }

  const c1 = 1.70158
  if (easing === 'easeInBack') {
    const c3 = c1 + 1
    return (c3 * x * x * x) - (c1 * x * x)
  }
  if (easing === 'easeOutBack') {
    const c3 = c1 + 1
    return 1 + (c3 * Math.pow(x - 1, 3)) + (c1 * Math.pow(x - 1, 2))
  }
  if (easing === 'easeInOutBack') {
    const c2 = c1 * 1.525
    if (x < 0.5) {
      return (Math.pow(2 * x, 2) * (((c2 + 1) * 2 * x) - c2)) / 2
    }
    return (Math.pow(2 * x - 2, 2) * (((c2 + 1) * (x * 2 - 2)) + c2) + 2) / 2
  }

  if (easing === 'easeInElastic') {
    if (x === 0) return 0
    if (x === 1) return 1
    const c4 = (2 * Math.PI) / 3
    return -Math.pow(2, 10 * x - 10) * Math.sin((x * 10 - 10.75) * c4)
  }
  if (easing === 'easeOutElastic') {
    if (x === 0) return 0
    if (x === 1) return 1
    const c4 = (2 * Math.PI) / 3
    return (Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4)) + 1
  }
  if (easing === 'easeInOutElastic') {
    if (x === 0) return 0
    if (x === 1) return 1
    const c5 = (2 * Math.PI) / 4.5
    if (x < 0.5) {
      return -(Math.pow(2, 20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2
    }
    return (Math.pow(2, -20 * x + 10) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1
  }

  if (easing === 'easeInBounce') return 1 - easeOutBounce(1 - x)
  if (easing === 'easeOutBounce') return easeOutBounce(x)
  if (easing === 'easeInOutBounce') {
    if (x < 0.5) return (1 - easeOutBounce(1 - (2 * x))) / 2
    return (1 + easeOutBounce(2 * x - 1)) / 2
  }

  return x
}
