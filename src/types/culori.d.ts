declare module 'culori' {
  export type CuloriColor = {
    mode: string
    [channel: string]: number | string | undefined
  }

  export type OklchColor = {
    mode: 'oklch'
    l?: number
    c?: number
    h?: number
    alpha?: number
  }

  export function converter(mode: 'oklch'): (color: string | CuloriColor) => OklchColor | undefined
  export function formatHex(color: CuloriColor): string
}
