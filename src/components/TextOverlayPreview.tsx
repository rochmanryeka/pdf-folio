import { useEffect, useRef, useState } from "react";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist";
import { exportPdf } from "@/lib/pdf-engine";
import type { Overlay } from "@/lib/overlay-types";

/** Render text with the exact export engine, including padding and wrapping. */
export function TextOverlayPreview({
  overlay,
  width,
  height,
}: {
  overlay: Overlay;
  width: number;
  height: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let loading: ReturnType<typeof getDocument> | undefined;
    let renderTask: { cancel: () => void; promise: Promise<void> } | undefined;
    setError(null);
    async function draw() {
      try {
        const blank = await PDFDocument.create();
        blank.addPage([width, height]);
        const bytes = await exportPdf(
          await blank.save(),
          [0],
          [{ ...overlay, pageIndex: 0, x: 0, y: 0, width: 1, height: 1 }],
        );
        if (cancelled) return;
        loading = getDocument({ data: bytes });
        const doc = await loading.promise;
        const page = await doc.getPage(1);
        if (cancelled || !ref.current) return;
        const canvas = ref.current;
        const scale = Math.max(1, window.devicePixelRatio || 1);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error("Text preview could not create a canvas renderer.");
        renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          background: "rgba(0,0,0,0)",
        });
        await renderTask.promise;
      } catch (cause) {
        if (!cancelled) {
          const canvas = ref.current;
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
          setError(
            cause instanceof Error
              ? cause.message
              : "Text preview could not be rendered.",
          );
        }
      }
    }
    void draw();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loading?.destroy();
    };
  }, [overlay, width, height]);
  return (
    <span
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        height: "100%",
      }}
    >
      <canvas
        ref={ref}
        aria-label={overlay.text || "Text annotation"}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
        }}
      />
      {error && (
        <span
          role="status"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "auto",
            background: "rgba(255,255,255,.96)",
            color: "#9b1c1c",
            fontSize: 12,
            padding: 4,
            pointerEvents: "none",
          }}
        >
          {error}
        </span>
      )}
    </span>
  );
}
