export type OverlayKind =
  | "image"
  | "signature"
  | "text"
  | "line"
  | "arrow"
  | "rectangle"
  | "circle"
  | "highlight";

export type Overlay = {
  id: string;
  pageIndex: number;
  kind: OverlayKind;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl?: string;
  text?: string;
  color?: string;
  fill?: string;
  fontSize?: number;
  fontFamily?: "sans" | "serif" | "mono";
  bold?: boolean;
  italic?: boolean;
  strokeWidth?: number;
  opacity?: number;
  /** Text inset in PDF points. Defaults to 6 points. */
  textPadding?: number;
  /** Manual endpoints for line/arrow, normalized within the overlay box. */
  start?: { x: number; y: number };
  end?: { x: number; y: number };
};
