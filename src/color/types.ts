/** RGB triple, 0–255. Centroids are floats mid-computation; reported colors are rounded. */
export type RGB = [number, number, number]

/** Normalized image-space position, both axes in [0, 1]. */
export interface Point {
  x: number
  y: number
}

export interface Cluster {
  /**
   * The reported color: the k-means centroid of the sparse full-frame sample.
   * This is an aggregate of the color wherever it appears across the frame —
   * it is produced entirely by the clustering pass and is never touched by the
   * blob/positioning pass, so tooltip anchoring can't shift the displayed value.
   */
  rgb: RGB
  hex: string
  /** Sparse samples assigned to this cluster. */
  count: number
  /** Fraction of the sparse sample assigned to this cluster, 0–1. */
  proportion: number
  /**
   * Where to anchor this color's tooltip: the centroid of its single largest
   * contiguous region, in normalized image coords. `null` when the color has
   * no contiguous region in the dense sample (absent or fully scattered) — the
   * caller should then skip the marker rather than point at empty space.
   */
  anchor: Point | null
  /** Size of the anchor blob in dense-grid cells; 0 when `anchor` is null. */
  blobCells: number
}

export interface PaletteMeta {
  width: number
  height: number
  /** 1-D pixel stride used for the k-means sampling pass. */
  kmeansStep: number
  /** 2-D pixel stride used for the dense blob-detection pass. */
  denseStep: number
  iterations: number
  /** Number of pixels fed to k-means. */
  sparseSamples: number
  /** Number of cells in the dense blob grid. */
  denseCells: number
  seed: number
  /** Wall-clock ms for the k-means (clustering) pass. */
  kmeansMs: number
  /** Wall-clock ms for the dense sampling + connected-component pass. */
  blobMs: number
  /** Wall-clock ms for the whole pipeline. */
  totalMs: number
}

export interface PaletteResult {
  /** Clusters ranked largest → smallest by pixel count. */
  clusters: Cluster[]
  meta: PaletteMeta
}
