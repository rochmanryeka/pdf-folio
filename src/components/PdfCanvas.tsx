import { useEffect, useRef } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
GlobalWorkerOptions.workerSrc = workerUrl;
const documents = new WeakMap<Uint8Array, Promise<PDFDocumentProxy>>();
function getPdf(bytes: Uint8Array) {
  let promise = documents.get(bytes);
  if (!promise) {
    promise = getDocument({
      data: bytes.slice(),
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
    }).promise;
    documents.set(bytes, promise);
  }
  return promise;
}
export function PdfCanvas({
  bytes,
  pageIndex,
  rotation,
  width,
  onError,
  thumbnail = false,
}: {
  bytes: Uint8Array;
  pageIndex: number;
  rotation: number;
  width: number;
  onError?: (message: string) => void;
  thumbnail?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let task:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    async function render() {
      try {
        const pdf = await getPdf(bytes);
        const page = await pdf.getPage(pageIndex + 1);
        if (cancelled || !ref.current) return;
        const base = page.getViewport({ scale: 1, rotation });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({
          scale: width / base.width,
          rotation,
        });
        const canvas = ref.current;
        canvas.width = Math.round(viewport.width * dpr);
        canvas.height = Math.round(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        task = page.render({
          canvas,
          canvasContext: canvas.getContext("2d")!,
          viewport,
          transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
        });
        await task.promise;
      } catch (error) {
        if (!cancelled)
          onError?.(
            error instanceof Error
              ? error.message
              : "Unable to display this page.",
          );
      }
    }
    void render();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [bytes, pageIndex, rotation, width, onError]);
  return (
    <canvas
      ref={ref}
      aria-label={
        thumbnail
          ? `Page preview ${pageIndex + 1}`
          : `PDF page ${pageIndex + 1}`
      }
      className="pdf-canvas"
    />
  );
}
