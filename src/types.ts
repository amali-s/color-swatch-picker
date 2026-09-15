export interface Swatch {
  id: string;
  hex: string; // e.g. "D17A7A" (no leading #)
  /** Free-text note about how this color is used. Omitted when empty. */
  note?: string;
}
