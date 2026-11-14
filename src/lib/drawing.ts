import type { Overlay, OverlayKind } from "./overlay-types";

export type Point = { x: number; y: number };
type DirectionalOverlay = Overlay & {
  start?: Point;
  end?: Point;
};

/** Convert stage-space drag endpoints into a normalized, export-ready overlay. */
export function createDrawingOverlay(
  kind: Extract<
    OverlayKind,
    "line" | "arrow" | "rectangle" | "circle" | "highlight"
  >,
  pageIndex: number,
  from: Point,
  to: Point,
  pageWidth: number,
  pageHeight: number,
  id: string,
): DirectionalOverlay {
  const x1 = clamp(from.x, 0, pageWidth);
  const y1 = clamp(from.y, 0, pageHeight);
  const x2 = clamp(to.x, 0, pageWidth);
  const y2 = clamp(to.y, 0, pageHeight);
  const rawWidth = Math.abs(x2 - x1);
  const rawHeight = Math.abs(y2 - y1);
  const width = Math.max(
    rawWidth,
    kind === "line" || kind === "arrow" ? 24 : 0.01,
  );
  const height = Math.max(
    rawHeight,
    kind === "line" || kind === "arrow" ? 12 : 0.01,
  );
  const left = clamp(
    Math.min(x1, x2) - (width - rawWidth) / 2,
    0,
    pageWidth - width,
  );
  const top = clamp(
    Math.min(y1, y2) - (height - rawHeight) / 2,
    0,
    pageHeight - height,
  );
  const overlay: DirectionalOverlay = {
    id,
    pageIndex,
    kind,
    x: left / pageWidth,
    y: top / pageHeight,
    width: width / pageWidth,
    height: height / pageHeight,
    color: kind === "highlight" ? "#facc15" : "#162c4d",
    fill: kind === "highlight" ? "#facc15" : "none",
    strokeWidth: 2,
    opacity: kind === "highlight" ? 0.3 : 1,
  };
  if (kind === "line" || kind === "arrow") {
    overlay.start = {
      x: (x1 - left) / width || 0,
      y: (y1 - top) / height || 0,
    };
    overlay.end = {
      x: (x2 - left) / width || 0,
      y: (y2 - top) / height || 0,
    };
  }
  return overlay;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
