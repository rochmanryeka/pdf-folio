import { TextOverlayPreview } from "@/components/TextOverlayPreview";
import type { Overlay } from "@/lib/overlay-types";
/** Draw in displayed PDF-point units so preview/export have the same stroke geometry. */
export function OverlayVisual({
  overlay: o,
  width,
  height,
}: {
  overlay: Overlay;
  width: number;
  height: number;
}) {
  if (o.kind === "image" || o.kind === "signature")
    return (
      <img
        src={o.dataUrl}
        alt={o.kind === "signature" ? "Added signature" : "Added image"}
        draggable={false}
      />
    );
  const color = o.color || "#162c4d",
    stroke = o.strokeWidth || 2,
    opacity = o.opacity ?? 1;
  const fill = o.fill && o.fill !== "none" ? o.fill : "none";
  if(o.kind === "text")return <TextOverlayPreview overlay={o} width={width} height={height}/>;
  const line = o.kind === "line" || o.kind === "arrow";
  const angle = Math.atan2(-height, width),
    head = Math.max(8, stroke * 4);
  const points = [-1, 1].map((side) => ({
    x: width + Math.cos(angle + Math.PI + (side * Math.PI) / 6) * head,
    y: Math.sin(angle + Math.PI + (side * Math.PI) / 6) * head,
  }));
  return (
    <svg
      className="annotation-shape"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-label={o.kind}
      style={{ opacity }}
    >
      {line ? (
        <g fill="none" stroke={color} strokeWidth={stroke}>
          <line x1="0" y1={height} x2={width} y2="0" />
          {o.kind === "arrow" &&
            points.map((p, i) => (
              <line key={i} x1={width} y1="0" x2={p.x} y2={p.y} />
            ))}
        </g>
      ) : o.kind === "circle" ? (
        <ellipse
          cx={width / 2}
          cy={height / 2}
          rx={width / 2}
          ry={height / 2}
          fill={fill}
          stroke={color}
          strokeWidth={stroke}
        />
      ) : (
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill={o.kind === "highlight" ? o.fill || o.color || "#facc15" : fill}
          stroke={o.kind === "highlight" ? "none" : color}
          strokeWidth={stroke}
        />
      )}
    </svg>
  );
}
