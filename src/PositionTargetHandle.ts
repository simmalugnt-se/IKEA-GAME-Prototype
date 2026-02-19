export type PositionTargetHandle = {
  getPosition: () => { x: number; y: number; z: number } | undefined
}
