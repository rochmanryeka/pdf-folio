export type EditorToolbarProps = {
  ready: boolean;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  onUndo: () => void;
  onRedo: () => void;
  onRotate: () => void;
  onSignature: () => void;
  onImage: () => void;
  onAddAnnotation?: (
    kind: "text" | "line" | "arrow" | "rectangle" | "circle" | "highlight",
  ) => void;
  activeTool?: "line" | "arrow" | "rectangle" | "circle" | "highlight" | null;
  onZoom: (zoom: number) => void;
  onFit: () => void;
};
import {
  Undo2,
  Redo2,
  PenLine,
  ImagePlus,
  RotateCw,
  Minus,
  Plus,
  Scan,
  MousePointer2,
  Type,
  Minus as LineIcon,
  ArrowUpRight,
  Square,
  Circle,
  Highlighter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
export function EditorToolbar(p: EditorToolbarProps) {
  return (
    <div
      className="editor-toolbar"
      role="toolbar"
      aria-label="PDF editing tools"
    >
      <div className="toolbar-group">
        <Button
          variant="ghost"
          size="icon"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          disabled={!p.canUndo}
          onClick={p.onUndo}
        >
          <Undo2 />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
          disabled={!p.canRedo}
          onClick={p.onRedo}
        >
          <Redo2 />
        </Button>
      </div>
      <span className="toolbar-divider" />
      <div className="toolbar-group tool-actions">
        <span className="select-tool" title="Select and move objects">
          <MousePointer2 size={17} />
        </span>
        <Button
          variant="ghost"
          disabled={!p.ready}
          onClick={p.onSignature}
          aria-label="Signature"
          title="Add signature"
          className="signature-tool"
        >
          <PenLine />
          <span>Signature</span>
        </Button>
        <Button
          variant="ghost"
          disabled={!p.ready}
          onClick={p.onImage}
          aria-label="Add image"
        >
          <ImagePlus />
          <span>Image</span>
        </Button>
        {(
          ["text", "line", "arrow", "rectangle", "circle", "highlight"] as const
        ).map((kind) => (
          <Button
            key={kind}
            variant="ghost"
            disabled={!p.ready}
            aria-label={kind === "text" ? "Add text" : `Add ${kind}`}
            title={kind === "text" ? "Add text" : `Add ${kind}`}
            aria-pressed={kind !== "text" ? p.activeTool === kind : undefined}
            onClick={() => p.onAddAnnotation?.(kind)}
          >
            {kind === "text" ? (
              <Type />
            ) : kind === "line" ? (
              <LineIcon />
            ) : kind === "arrow" ? (
              <ArrowUpRight />
            ) : kind === "rectangle" ? (
              <Square />
            ) : kind === "circle" ? (
              <Circle />
            ) : (
              <Highlighter />
            )}
            <span>
              {kind === "text" ? "Text" : kind[0].toUpperCase() + kind.slice(1)}
            </span>
          </Button>
        ))}
        <Button
          variant="ghost"
          disabled={!p.ready}
          onClick={p.onRotate}
          aria-label="Rotate page 90°"
          title="Rotate page 90°"
        >
          <RotateCw />
          <span>Rotate</span>
        </Button>
      </div>
      <div className="zoom-group toolbar-group">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom out"
          disabled={p.zoom <= 30}
          onClick={() => p.onZoom(Math.max(30, p.zoom - 10))}
        >
          <Minus />
        </Button>
        <span className="zoom-value">{p.zoom}%</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom in"
          disabled={p.zoom >= 200}
          onClick={() => p.onZoom(Math.min(200, p.zoom + 10))}
        >
          <Plus />
        </Button>
        <span className="toolbar-divider" />
        <Button
          variant="ghost"
          size="icon"
          title="Fit width"
          aria-label="Fit width"
          onClick={p.onFit}
        >
          <Scan />
        </Button>
      </div>
    </div>
  );
}
