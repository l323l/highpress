// gifenc에는 타입 선언이 없어서 쓰는 부분만 선언한다.
declare module 'gifenc' {
  export type Palette = number[][]

  export interface FrameOptions {
    palette?: Palette
    delay?: number
    repeat?: number
  }

  export interface Encoder {
    writeFrame(index: Uint8Array, width: number, height: number, options?: FrameOptions): void
    finish(): void
    bytes(): Uint8Array<ArrayBuffer>
  }

  export function GIFEncoder(): Encoder
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette): Uint8Array
}
