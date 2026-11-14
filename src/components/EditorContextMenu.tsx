import { useRef } from "react";
import type { ReactNode } from "react";
import {
  Download,
  Pencil,
  Copy,
  Trash2,
  Settings2,
  Type,
  Minus,
  ArrowUpRight,
  Square,
  Circle,
  Highlighter,
  PenLine,
  ImagePlus,
  Undo2,
  Redo2,
} from "lucide-react";
import type { Overlay } from "@/lib/overlay-types";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";

type Props = {
  children: ReactNode;
  selected: Overlay | null;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  onSelectAtTarget: (id: string | null) => void;
  onEditText: () => void;
  onProperties: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddText: () => void;
  onDraw: (
    kind: "line" | "arrow" | "rectangle" | "circle" | "highlight",
  ) => void;
  onSignature: () => void;
  onImage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDownload: () => void;
};

export function EditorContextMenu(p: Props) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const actions = [
    ...(p.selected?.kind === "text"
      ? [{ label: "Edit text", icon: Pencil, run: p.onEditText }]
      : []),
    ...(p.selected
      ? [{ label: "Properties", icon: Settings2, run: p.onProperties }]
      : []),
    ...(p.selected
      ? [{ label: "Duplicate", icon: Copy, run: p.onDuplicate }]
      : []),
    ...(p.selected
      ? [{ label: "Delete", icon: Trash2, run: p.onDelete, destructive: true }]
      : []),
  ];
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={triggerRef}
          tabIndex={0}
          aria-label="PDF page editor"
          className="context-menu-area"
          onKeyDown={(event) => {
            if (
              (event.key === "F10" && event.shiftKey) ||
              event.key === "ContextMenu"
            ) {
              event.preventDefault();
              const target = event.target as HTMLElement;
              const rect = target.getBoundingClientRect();
              target.dispatchEvent(
                new MouseEvent("contextmenu", {
                  bubbles: true,
                  cancelable: true,
                  clientX: rect.left + rect.width / 2,
                  clientY: rect.top + rect.height / 2,
                }),
              );
            }
          }}
          onContextMenu={(event) => {
            const target = (event.target as HTMLElement).closest<HTMLElement>(
              "[data-overlay-id]",
            );
            p.onSelectAtTarget(target?.dataset.overlayId ?? null);
          }}
        >
          {p.children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent alignOffset={4} collisionPadding={8}>
        {actions.map(({ label, icon: Icon, run, destructive }) => (
          <ContextMenuItem
            key={label}
            className={destructive ? "destructive" : ""}
            disabled={p.busy}
            onSelect={run}
          >
            <Icon size={15} />
            {label}
          </ContextMenuItem>
        ))}
        {actions.length > 0 && <ContextMenuSeparator />}
        {!p.selected && (
          <>
            <ContextMenuItem disabled={p.busy} onSelect={p.onAddText}>
              <Type size={15} />
              Add text
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger disabled={p.busy}>
                Draw shape
              </ContextMenuSubTrigger>
              <ContextMenuSubContent collisionPadding={8}>
                <ContextMenuItem
                  disabled={p.busy}
                  onSelect={() => p.onDraw("line")}
                >
                  <Minus size={15} />
                  Line
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={p.busy}
                  onSelect={() => p.onDraw("arrow")}
                >
                  <ArrowUpRight size={15} />
                  Arrow
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={p.busy}
                  onSelect={() => p.onDraw("rectangle")}
                >
                  <Square size={15} />
                  Rectangle
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={p.busy}
                  onSelect={() => p.onDraw("circle")}
                >
                  <Circle size={15} />
                  Circle
                </ContextMenuItem>
                <ContextMenuItem
                  disabled={p.busy}
                  onSelect={() => p.onDraw("highlight")}
                >
                  <Highlighter size={15} />
                  Highlight
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuItem disabled={p.busy} onSelect={p.onSignature}>
              <PenLine size={15} />
              Signature
            </ContextMenuItem>
            <ContextMenuItem disabled={p.busy} onSelect={p.onImage}>
              <ImagePlus size={15} />
              Add image
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!p.canUndo || p.busy} onSelect={p.onUndo}>
          <Undo2 size={15} />
          Undo
        </ContextMenuItem>
        <ContextMenuItem disabled={!p.canRedo || p.busy} onSelect={p.onRedo}>
          <Redo2 size={15} />
          Redo
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={p.busy} onSelect={p.onDownload}>
          <Download size={15} />
          Download
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
