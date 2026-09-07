/** RGB triple, 0–255. OKLab centroids are converted to float sRGB; reported colors are rounded. */
export type RGB = [number, number, number]

/** Normalized image-space position, both axes in [0, 1]. */
export interface Point {
  x: number
  y: number
}

export interface Cluster {
  /**
   * The reported color: blob-core median of the surface the chip sits on
   * (OKLab component-wise median of the eroded largest blob, snapped to the
   * nearest actual core pixel). If the cluster has no contiguous region,
   * this is the OKLab median of its sparse samples instead. k-means still
   * owns membership, count, proportion, and ranking, after near-duplicate
   * OKLab centers are collapsed so hex/chips match colors the user can tell
   * apart; the mean centroid is not what the user sees.
   */
  rgb: RGB
  hex: string
  /** Sparse samples assigned to this cluster (post-merge). */
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
  /** 2-D grid stride used for the k-means sampling pass. */
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
  /**
   * Clusters ranked largest → smallest by merged k-means count. Near-duplicate
   * OKLab centers are collapsed before dense labeling, so the list is colors
   * the user can tell apart (never more than 6).
   */
  clusters: Cluster[]
  meta: PaletteMeta
}
