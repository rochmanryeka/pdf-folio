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
};
