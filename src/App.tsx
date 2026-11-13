import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { Rnd } from "react-rnd";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Grid2X2,
  HelpCircle,
  ImagePlus,
  Layers,
  LockKeyhole,
  Maximize2,
  Moon,
  PanelLeftClose,
  PenLine,
  Plus,
  RotateCw,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SignatureDialog } from "@/components/SignatureDialog";
import { EditorToolbar } from "@/components/EditorToolbar";
import { OverlayVisual } from "@/components/OverlayVisual";
import { PdfCanvas } from "@/components/PdfCanvas";
import { createDemoPdf, inspectPdf, exportPdf } from "@/lib/pdf-engine";
import type { Overlay, OverlayKind, PageInfo } from "@/lib/pdf-engine";
import {
  createHistory,
  commitHistory,
  undoHistory,
  redoHistory,
} from "@/lib/editor-state";
import type { EditState } from "@/lib/editor-state";

export default function App() {
  const [bytes, setBytes] = useState<Uint8Array | null>(null),
    [pages, setPages] = useState<PageInfo[]>([]),
    [fileName, setFileName] = useState(""),
    [fileSize, setFileSize] = useState(0);
  const [history, setHistory] = useState(() =>
    createHistory({ rotations: [], overlays: [] }),
  );
  const edits = history.present;
  const [pageIndex, setPageIndex] = useState(0),
    [zoom, setZoom] = useState(85),
    [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(true),
    [exporting, setExporting] = useState(false),
    [signatureOpen, setSignatureOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false),
    [replaceOpen, setReplaceOpen] = useState(false);
  const [sidebar, setSidebar] = useState(() => window.innerWidth > 700),
    [tab, setTab] = useState<"pages" | "objects">("pages"),
    [dragging, setDragging] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || "dark",
  );
  const pdfInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    workspace = useRef<HTMLDivElement>(null),
    imageKind = useRef<"image" | "signature">("image"),
    pendingFile = useRef<File | null>(null),
    loadId = useRef(0);
  const [availableWidth, setAvailableWidth] = useState(800);
  const [mobileProperties, setMobileProperties] = useState(false);
  const [textOpen, setTextOpen] = useState(false),
    [textValue, setTextValue] = useState(""),
    [textColor, setTextColor] = useState("#162c4d"),
    [fontSize, setFontSize] = useState(18),
    [fontFamily, setFontFamily] = useState<"sans" | "serif" | "mono">("sans"),
    [bold, setBold] = useState(false),
    [italic, setItalic] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const addAnnotation = useCallback(
    (kind: OverlayKind) => {
      if (kind === "text") {
        setTextValue("");
        setEditingTextId(null);
        setTextOpen(true);
        return;
      }
      const overlay: Overlay = {
        id: crypto.randomUUID(),
        pageIndex,
        kind,
        x: 0.15,
        y: 0.18,
        width: kind === "line" || kind === "arrow" ? 0.38 : 0.3,
        height: kind === "line" || kind === "arrow" ? 0.08 : 0.12,
        color: kind === "highlight" ? "#facc15" : "#162c4d",
        fill: kind === "highlight" ? "#facc15" : "none",
        strokeWidth: 2,
        opacity: kind === "highlight" ? 0.3 : 1,
      };
      setHistory((h) =>
        commitHistory(h, {
          ...h.present,
          overlays: [...h.present.overlays, overlay],
        }),
      );
      setSelected(overlay.id);
      setNotice(`${kind[0].toUpperCase()}${kind.slice(1)} added.`);
    },
    [pageIndex],
  );
  function submitText() {
    const text = textValue.trim();
    if (!text) return;
    const common = {
      text,
      color: textColor,
      fontSize,
      fontFamily,
      bold,
      italic,
    };
    if (editingTextId) updateTextOverlay(editingTextId, common);
    else {
      const overlay: Overlay = {
        id: crypto.randomUUID(),
        pageIndex,
        kind: "text",
        x: 0.12,
        y: 0.14,
        width: 0.42,
        height: Math.min(
          0.32,
          Math.max(
            0.08,
            (text.split("\n").length * fontSize * 1.2) / displayHeight,
          ),
        ),
        ...common,
      };
      setHistory((h) =>
        commitHistory(h, {
          ...h.present,
          overlays: [...h.present.overlays, overlay],
        }),
      );
      setSelected(overlay.id);
    }
    setTextOpen(false);
  }
  function updateTextOverlay(id: string, patch: Partial<Overlay>) {
    setHistory((h) =>
      commitHistory(h, {
        ...h.present,
        overlays: h.present.overlays.map((o) =>
          o.id === id ? { ...o, ...patch } : o,
        ),
      }),
    );
  }
  function editText(o: Overlay) {
    setEditingTextId(o.id);
    setTextValue(o.text || "");
    setTextColor(o.color || "#162c4d");
    setFontSize(o.fontSize || 18);
    setFontFamily(o.fontFamily || "sans");
    setBold(!!o.bold);
    setItalic(!!o.italic);
    setTextOpen(true);
  }
  function duplicateSelected() {
    if (!activeOverlay) return;
    const clone = {
      ...activeOverlay,
      id: crypto.randomUUID(),
      x: Math.min(1 - activeOverlay.width, activeOverlay.x + 0.025),
      y: Math.min(1 - activeOverlay.height, activeOverlay.y + 0.025),
    };
    setHistory((h) =>
      commitHistory(h, {
        ...h.present,
        overlays: [...h.present.overlays, clone],
      }),
    );
    setSelected(clone.id);
  }
  function updateStyle(patch: Partial<Overlay>) {
    if (activeOverlay) updateOverlay(activeOverlay.id, patch);
  }
  const isMobile = typeof window !== "undefined" && window.innerWidth <= 700;

  const commit = useCallback(
    (next: EditState) => setHistory((h) => commitHistory(h, next)),
    [],
  );
  const rotation = edits.rotations[pageIndex] || 0;
  const info = pages[pageIndex];
  const landscape = rotation % 180 !== 0;
  const displayWidth = info ? (landscape ? info.height : info.width) : 595;
  const displayHeight = info ? (landscape ? info.width : info.height) : 842;
  const pageWidth = Math.max(
      100,
      Math.min((displayWidth * zoom) / 100, availableWidth - 40),
    ),
    pageHeight = (pageWidth * displayHeight) / displayWidth;
  const activeOverlay = edits.overlays.find((o) => o.id === selected);
  const reportError = useCallback((message: string) => setError(message), []);
  async function openDocument(data: Uint8Array, name: string) {
    const id = ++loadId.current;
    setBusy(true);
    setError("");
    try {
      const metadata = await inspectPdf(data);
      if (id !== loadId.current) return;
      if (!metadata.length) throw new Error("This PDF has no pages.");
      setBytes(data);
      setPages(metadata);
      setFileName(name);
      setFileSize(data.byteLength);
      setHistory(
        createHistory({
          rotations: metadata.map((p) => p.rotation),
          overlays: [],
        }),
      );
      setPageIndex(0);
      setSelected(null);
    } catch (e) {
      if (id === loadId.current)
        setError(e instanceof Error ? e.message : "Unable to open this PDF.");
    } finally {
      if (id === loadId.current) setBusy(false);
    }
  }
  useEffect(() => {
    let alive = true;
    void createDemoPdf()
      .then((data) => {
        if (alive) void openDocument(data, "Partnership proposal.pdf");
      })
      .catch(() => {
        setError("Unable to load the demo. Please upload a PDF.");
        setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const el = workspace.current;
    if (!el) return;
    const update = () => setAvailableWidth(el.clientWidth || 800);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sidebar]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("folio-theme", theme);
    } catch {
      /* storage optional */
    }
  }, [theme]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4200);
    return () => clearTimeout(timer);
  }, [notice]);
  const undo = useCallback(() => {
    setHistory((h) => undoHistory(h));
    setSelected(null);
  }, []);
  const redo = useCallback(() => {
    setHistory((h) => redoHistory(h));
    setSelected(null);
  }, []);
  const deleteSelected = useCallback(() => {
    if (selected) {
      setHistory((h) =>
        commitHistory(h, {
          ...h.present,
          overlays: h.present.overlays.filter((o) => o.id !== selected),
        }),
      );
      setSelected(null);
    }
  }, [selected]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
        target.isContentEditable ||
        document.querySelector('[role="dialog"]')
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      } else if (e.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [undo, redo, deleteSelected]);
  function rotate() {
    commit({
      ...edits,
      rotations: edits.rotations.map((r, i) =>
        i === pageIndex ? (r + 90) % 360 : r,
      ),
    });
    setSelected(null);
  }
  function chooseImage(kind: "image" | "signature") {
    imageKind.current = kind;
    imageInput.current?.click();
  }
  async function addImage(dataUrl: string, kind: "image" | "signature") {
    const targetPage = pageIndex;
    try {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const width =
        kind === "signature"
          ? 0.36
          : Math.min(
              0.4,
              0.5 *
                (img.naturalWidth / img.naturalHeight) *
                (displayHeight / displayWidth),
            );
      const height = Math.min(
        0.45,
        width *
          (displayWidth / displayHeight) *
          (img.naturalHeight / img.naturalWidth),
      );
      const safeWidth =
        (((height * displayHeight) / displayWidth) * img.naturalWidth) /
        img.naturalHeight;
      const overlay: Overlay = {
        id: crypto.randomUUID(),
        pageIndex: targetPage,
        kind,
        dataUrl,
        x: (1 - safeWidth) / 2,
        y: kind === "signature" ? 0.68 : 0.32,
        width: safeWidth,
        height,
      };
      setHistory((h) =>
        commitHistory(h, {
          ...h.present,
          overlays: [...h.present.overlays, overlay],
        }),
      );
      setSelected(overlay.id);
      setNotice(
        kind === "signature"
          ? "Signature added. Drag to position it."
          : "Image added. Drag and resize with the corner handles.",
      );
    } catch {
      setError("Unable to read image. Use a valid PNG or JPEG.");
    }
  }
  async function readImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Use a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("Images must be 15 MB or smaller.");
      return;
    }
    const kind = imageKind.current;
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 40000000) {
        bitmap.close();
        throw new Error("Image resolution exceeds 40 megapixels.");
      }
      const c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("This browser cannot process images.");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      await addImage(c.toDataURL("image/png"), kind);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read this image.");
    }
  }
  function requestFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Choose a .pdf document.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("PDF files must be 50 MB or smaller.");
      return;
    }
    pendingFile.current = file;
    if (history.past.length) setReplaceOpen(true);
    else void loadPending();
  }
  async function loadPending() {
    const file = pendingFile.current;
    pendingFile.current = null;
    setReplaceOpen(false);
    if (file)
      try {
        await openDocument(new Uint8Array(await file.arrayBuffer()), file.name);
      } catch {
        setError("Unable to read this file.");
      }
  }
  function drop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) requestFile(file);
  }
  async function download() {
    if (!bytes) return;
    setExporting(true);
    setError("");
    try {
      const output = await exportPdf(bytes, edits.rotations, edits.overlays);
      const blob = new Blob([new Uint8Array(output)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName.replace(/\.pdf$/i, "")}-edited.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setNotice("Edited PDF downloaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to export PDF.");
    } finally {
      setExporting(false);
    }
  }
  function updateOverlay(id: string, patch: Partial<Overlay>) {
    setHistory((h) =>
      commitHistory(h, {
        ...h.present,
        overlays: h.present.overlays.map((o) =>
          o.id === id ? { ...o, ...patch } : o,
        ),
      }),
    );
  }
  function goTo(i: number) {
    setPageIndex(Math.max(0, Math.min(pages.length - 1, i)));
    setSelected(null);
  }
  return (
    <div
      className="app-shell"
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes("Files")) setDragging(true);
      }}
      onDrop={drop}
    >
      <input
        ref={pdfInput}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label="Upload PDF"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) requestFile(f);
        }}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Upload image"
        onChange={readImage}
      />
      <header className="app-header">
        <a href="#" className="brand" aria-label="Folio PDF Studio">
          <span className="brand-mark">
            f<span>.</span>
          </span>
          <span className="brand-name">
            folio<span>PDF STUDIO</span>
          </span>
        </a>
        <div className="header-breadcrumb">
          <span className="breadcrumb-line" />
          <span>Workspace</span>
          <ChevronRight size={13} />
          <strong>PDF editor</strong>
        </div>
        <div className="header-actions">
          <span className="local-badge">
            <span />
            100% local & private
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            title="Toggle theme"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Help"
            onClick={() => setHelpOpen(true)}
          >
            <HelpCircle />
          </Button>
          <span className="avatar">R</span>
        </div>
      </header>
      <div className="document-header">
        <div className="document-title">
          <span className="pdf-file-icon">
            <FileText size={22} />
          </span>
          <div>
            <h1>{fileName || "PDF Studio"}</h1>
            <div className="document-meta">
              <span>{pages.length} pages</span>
              <span>·</span>
              <span>
                {fileSize < 1024 * 1024
                  ? `${Math.ceil(fileSize / 1024)} KB`
                  : `${(fileSize / 1024 / 1024).toFixed(1)} MB`}
              </span>
              <span className="demo-label">
                {fileName === "Partnership proposal.pdf"
                  ? "Demo document"
                  : "Local document"}
              </span>
            </div>
          </div>
        </div>
        <div className="document-actions">
          <span className="session-status">
            <Check size={13} />
            {history.past.length ? "Changes in this session" : "Ready to edit"}
          </span>
          <Button
            variant="outline"
            onClick={() => pdfInput.current?.click()}
            disabled={busy}
          >
            <FolderOpen />
            <span>Open PDF</span>
          </Button>
          <Button onClick={download} disabled={!bytes || busy || exporting}>
            <ArrowDownToLine />
            <span>{exporting ? "Processing…" : "Download PDF"}</span>
          </Button>
        </div>
      </div>
      <div className="editor-layout">
        <nav className="icon-rail" aria-label="Editor panels">
          <button
            title="Pages"
            aria-label="Pages panel"
            className={tab === "pages" && sidebar ? "active" : ""}
            onClick={() => {
              setTab("pages");
              setSidebar((v) => (tab === "pages" ? !v : true));
            }}
          >
            <Grid2X2 size={20} />
          </button>
          <button
            title="Objects"
            aria-label="Objects panel"
            className={tab === "objects" && sidebar ? "active" : ""}
            onClick={() => {
              setTab("objects");
              setSidebar((v) => (tab === "objects" ? !v : true));
            }}
          >
            <Layers size={20} />
            {edits.overlays.length > 0 && (
              <span className="rail-count">{edits.overlays.length}</span>
            )}
          </button>
          <div className="rail-bottom">
            <button
              aria-label="Privacy and help"
              onClick={() => setHelpOpen(true)}
            >
              <ShieldCheck size={20} />
            </button>
          </div>
        </nav>
        {sidebar && (
          <aside className="pages-panel">
            <div className="panel-title">
              <h2>{tab === "pages" ? "Pages" : "Document objects"}</h2>
              <Button
                variant="ghost"
                size="icon"
                title="Close panel"
                aria-label="Close panel"
                onClick={() => setSidebar(false)}
              >
                <PanelLeftClose size={16} />
              </Button>
            </div>
            <div className="panel-subtitle">
              {tab === "pages"
                ? `${pages.length} pages in document`
                : `${edits.overlays.length} objects added`}
            </div>
            <div className="panel-scroll">
              {tab === "pages" ? (
                pages.map((p, i) => (
                  <button
                    className={`page-thumb ${pageIndex === i ? "selected" : ""}`}
                    key={i}
                    aria-label={`Open page ${i + 1}`}
                    aria-current={pageIndex === i ? "page" : undefined}
                    onClick={() => goTo(i)}
                  >
                    <div
                      className="thumb-paper"
                      style={{
                        aspectRatio:
                          edits.rotations[i] % 180
                            ? p.height / p.width
                            : p.width / p.height,
                      }}
                    >
                      {bytes && (
                        <PdfCanvas
                          bytes={bytes}
                          pageIndex={i}
                          rotation={edits.rotations[i] || 0}
                          width={128}
                          thumbnail
                        />
                      )}
                      {edits.overlays
                        .filter((o) => o.pageIndex === i && Boolean(o.dataUrl))
                        .map((o) => (
                          <img
                            key={o.id}
                            alt=""
                            src={o.dataUrl}
                            className="thumb-overlay"
                            style={{
                              left: `${o.x * 100}%`,
                              top: `${o.y * 100}%`,
                              width: `${o.width * 100}%`,
                              height: `${o.height * 100}%`,
                            }}
                          />
                        ))}
                    </div>
                    <div className="thumb-label">
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      {pageIndex === i && (
                        <span className="thumb-selected-dot" />
                      )}
                    </div>
                  </button>
                ))
              ) : (
                <div className="objects-list">
                  {edits.overlays.length ? (
                    edits.overlays.map((o, i) => (
                      <button
                        key={o.id}
                        className={selected === o.id ? "selected" : ""}
                        onClick={() => {
                          goTo(o.pageIndex);
                          setSelected(o.id);
                        }}
                      >
                        {o.kind === "signature" ? (
                          <PenLine size={18} />
                        ) : (
                          <ImagePlus size={18} />
                        )}
                        <span>
                          {o.kind[0].toUpperCase() + o.kind.slice(1)} {i + 1}
                          <small>Page {o.pageIndex + 1}</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="empty-objects">
                      <Layers size={28} />
                      <p>No objects yet</p>
                      <span>
                        Add text, shapes, images, or signatures to your
                        document.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              className="upload-mini"
              onClick={() => pdfInput.current?.click()}
            >
              <Plus size={15} />
              Open another document
            </button>
          </aside>
        )}
        <main className="editor-main">
          <EditorToolbar
            ready={!!bytes && !busy}
            canUndo={history.past.length > 0 && !busy}
            canRedo={history.future.length > 0 && !busy}
            zoom={zoom}
            onUndo={undo}
            onRedo={redo}
            onRotate={rotate}
            onSignature={() => setSignatureOpen(true)}
            onImage={() => chooseImage("image")}
            onAddAnnotation={addAnnotation}
            onZoom={setZoom}
            onFit={() =>
              setZoom(
                Math.max(
                  30,
                  Math.min(
                    200,
                    Math.floor(((availableWidth - 64) / displayWidth) * 100),
                  ),
                ),
              )
            }
          />
          <div
            className="workspace"
            ref={workspace}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setSelected(null);
            }}
          >
            <div className="workspace-heading">
              <span>
                <span className="status-dot" />
                EDIT MODE
              </span>
              <span>
                Page {pageIndex + 1} of {pages.length || "—"}
              </span>
            </div>
            {busy ? (
              <div className="workspace-loading">
                <div className="loading-spinner" />
                Preparing document…
              </div>
            ) : bytes ? (
              <div
                className="page-stage"
                style={{ width: pageWidth, height: pageHeight }}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).tagName === "CANVAS")
                    setSelected(null);
                }}
              >
                <PdfCanvas
                  bytes={bytes}
                  pageIndex={pageIndex}
                  rotation={rotation}
                  width={pageWidth}
                  onError={reportError}
                />
                {edits.overlays
                  .filter((o) => o.pageIndex === pageIndex)
                  .map((o) => (
                    <Rnd
                      key={o.id}
                      bounds="parent"
                      lockAspectRatio={
                        o.kind === "image" || o.kind === "signature"
                      }
                      size={{
                        width: o.width * pageWidth,
                        height: o.height * pageHeight,
                      }}
                      position={{ x: o.x * pageWidth, y: o.y * pageHeight }}
                      minWidth={24}
                      minHeight={12}
                      enableResizing={
                        selected === o.id
                          ? {
                              topLeft: true,
                              topRight: true,
                              bottomLeft: true,
                              bottomRight: true,
                            }
                          : false
                      }
                      onMouseDown={() => setSelected(o.id)}
                      onTouchStart={() => setSelected(o.id)}
                      onDragStop={(_, d) =>
                        updateOverlay(o.id, {
                          x: Math.max(
                            0,
                            Math.min(1 - o.width, d.x / pageWidth),
                          ),
                          y: Math.max(
                            0,
                            Math.min(1 - o.height, d.y / pageHeight),
                          ),
                        })
                      }
                      onResizeStop={(_, __, ref, ___, position) =>
                        updateOverlay(o.id, {
                          width: ref.offsetWidth / pageWidth,
                          height: ref.offsetHeight / pageHeight,
                          x: position.x / pageWidth,
                          y: position.y / pageHeight,
                        })
                      }
                      className={`pdf-object ${selected === o.id ? "is-selected" : ""}`}
                      resizeHandleClasses={{
                        topLeft: "resize-dot",
                        topRight: "resize-dot",
                        bottomLeft: "resize-dot",
                        bottomRight: "resize-dot",
                      }}
                    >
                      <button
                        className="object-hit"
                        aria-label={`Select ${o.kind}`}
                        onFocus={() => setSelected(o.id)}
                        onClick={() => setSelected(o.id)}
                        onDoubleClick={() => {
                          if (o.kind === "text") editText(o);
                        }}
                        onKeyDown={(e) => {
                          if (
                            [
                              "ArrowLeft",
                              "ArrowRight",
                              "ArrowUp",
                              "ArrowDown",
                            ].includes(e.key)
                          ) {
                            e.preventDefault();
                            const step = e.shiftKey ? 0.02 : 0.005;
                            updateOverlay(o.id, {
                              x: Math.max(
                                0,
                                Math.min(
                                  1 - o.width,
                                  o.x +
                                    (e.key === "ArrowRight"
                                      ? step
                                      : e.key === "ArrowLeft"
                                        ? -step
                                        : 0),
                                ),
                              ),
                              y: Math.max(
                                0,
                                Math.min(
                                  1 - o.height,
                                  o.y +
                                    (e.key === "ArrowDown"
                                      ? step
                                      : e.key === "ArrowUp"
                                        ? -step
                                        : 0),
                                ),
                              ),
                            });
                          }
                        }}
                      >
                        <OverlayVisual
                          overlay={o}
                          width={o.width * displayWidth}
                          height={o.height * displayHeight}
                        />
                      </button>
                      {selected === o.id && (
                        <span className="object-tag">
                          {o.kind === "signature" ? "Signature" : "Image"}
                        </span>
                      )}
                    </Rnd>
                  ))}
              </div>
            ) : (
              <button
                className="empty-document"
                onClick={() => pdfInput.current?.click()}
              >
                <Upload size={32} />
                <strong>Open your first PDF</strong>
                <span>Drop a document here or click to choose</span>
              </button>
            )}
            <div className="workspace-hint">
              <LockKeyhole size={12} />
              Your document stays on your device.
            </div>
          </div>
          <footer className="editor-footer">
            <div className="footer-page">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Previous page"
                disabled={pageIndex === 0}
                onClick={() => goTo(pageIndex - 1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                <b>{pages.length ? pageIndex + 1 : 0}</b>
                <span>/ {pages.length}</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Next page"
                disabled={pageIndex >= pages.length - 1}
                onClick={() => goTo(pageIndex + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
            <span className="footer-dimensions">
              {Math.round(displayWidth)} × {Math.round(displayHeight)} pt
              <span>·</span>
              <span data-testid="rotation-status">{rotation}°</span>
            </span>
            <span className="footer-ready">
              <span />
              Processed in your browser
            </span>
          </footer>
        </main>
        <aside className="tools-panel">
          <div className="tools-panel-heading">
            <span className="eyebrow">MAKE IT YOURS</span>
            <h2>
              Finishing touches,
              <br />
              without the fuss.
            </h2>
            <p>Everything you need to get your document ready.</p>
          </div>
          <div className="tool-card-list">
            <button
              className="tool-card featured"
              onClick={() => setSignatureOpen(true)}
              disabled={!bytes || busy}
            >
              <span className="tool-icon">
                <PenLine size={20} />
              </span>
              <span>
                <strong>Signature</strong>
                <small>Draw, type, or upload</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
            <button
              className="tool-card"
              onClick={() => chooseImage("image")}
              disabled={!bytes || busy}
            >
              <span className="tool-icon image">
                <ImagePlus size={20} />
              </span>
              <span>
                <strong>Add image</strong>
                <small>Logos, stamps, and more</small>
              </span>
              <Plus size={16} />
            </button>
            <button
              className="tool-card"
              onClick={rotate}
              disabled={!bytes || busy}
            >
              <span className="tool-icon rotate">
                <RotateCw size={20} />
              </span>
              <span>
                <strong>Rotate page</strong>
                <small>90° clockwise</small>
              </span>
              <Plus size={16} />
            </button>
          </div>
          {activeOverlay ? (
            <div
              className={`object-properties ${isMobile ? "mobile-properties" : ""}`}
            >
              <h3>Selected object</h3>
              <p>
                {activeOverlay.kind} · Page {activeOverlay.pageIndex + 1}
              </p>
              {isMobile && (
                <Button
                  variant="outline"
                  onClick={() => setMobileProperties(true)}
                >
                  Edit properties
                </Button>
              )}
              <Button
                variant="outline"
                aria-label="Duplicate object"
                onClick={duplicateSelected}
              >
                Duplicate
              </Button>
              {activeOverlay.kind === "text" && (
                <Button
                  variant="outline"
                  onClick={() => editText(activeOverlay)}
                >
                  Edit text
                </Button>
              )}
              {activeOverlay.kind !== "image" &&
                activeOverlay.kind !== "signature" && (
                  <>
                    <label>
                      Color{" "}
                      <input
                        aria-label="Color"
                        type="color"
                        value={activeOverlay.color || "#162c4d"}
                        onChange={(e) => updateStyle({ color: e.target.value })}
                      />
                    </label>
                    {activeOverlay.kind !== "line" &&
                      activeOverlay.kind !== "arrow" && (
                        <label>
                          Fill{" "}
                          <select
                            aria-label="Fill"
                            value={activeOverlay.fill || "none"}
                            onChange={(e) =>
                              updateStyle({ fill: e.target.value })
                            }
                          >
                            <option value="none">Transparent</option>
                            <option value="#facc15">Yellow</option>
                            <option value="#ffffff">White</option>
                            <option value="#162c4d">Navy</option>
                          </select>
                        </label>
                      )}
                    {activeOverlay.kind !== "text" && (
                      <>
                        <label>
                          Stroke thickness{" "}
                          <input
                            aria-label="Stroke thickness"
                            type="range"
                            min="1"
                            max="12"
                            value={activeOverlay.strokeWidth || 2}
                            onChange={(e) =>
                              updateStyle({
                                strokeWidth: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label>
                          Opacity{" "}
                          <input
                            aria-label="Opacity"
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(
                              (activeOverlay.opacity ?? 1) * 100,
                            )}
                            onChange={(e) =>
                              updateStyle({
                                opacity: Number(e.target.value) / 100,
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                  </>
                )}
              <label htmlFor="object-size">
                Size <span>{Math.round(activeOverlay.width * 100)}%</span>
              </label>
              <input
                id="object-size"
                aria-label="Object size"
                type="range"
                min="5"
                max={Math.floor(
                  Math.min(
                    90,
                    (activeOverlay.width / activeOverlay.height) * 90,
                  ) * 1,
                )}
                value={Math.round(activeOverlay.width * 100)}
                onChange={(e) => {
                  const w = Number(e.target.value) / 100;
                  const h = (w / activeOverlay.width) * activeOverlay.height;
                  updateOverlay(activeOverlay.id, {
                    width: w,
                    height: h,
                    x: Math.min(activeOverlay.x, 1 - w),
                    y: Math.min(activeOverlay.y, 1 - h),
                  });
                }}
              />
              <Button
                variant="danger"
                className="w-full"
                onClick={deleteSelected}
              >
                <Trash2 />
                Delete object
              </Button>
              <span className="property-hint">
                Drag to move · Pull corners to resize
                <br />
                Arrow keys for precise positioning
              </span>
            </div>
          ) : (
            <div className="quick-tip">
              <span className="tip-icon">
                <Maximize2 size={16} />
              </span>
              <h3>Right where it belongs.</h3>
              <p>Drag objects into place. Pull a corner to resize.</p>
              <span className="tip-step">
                <span>1</span> Add <span>2</span> Position <span>3</span>{" "}
                Download
              </span>
            </div>
          )}
          <div className="privacy-card">
            <div>
              <ShieldCheck size={20} />
              <strong>Privacy is not optional.</strong>
            </div>
            <p>No account. No server uploads. Your files belong to you.</p>
            <span>
              <span />
              PROCESSED LOCALLY
            </span>
          </div>
          <div className="studio-version">
            FOLIO STUDIO <span>v1.0</span>
          </div>
        </aside>
      </div>
      {activeOverlay && (
        <div className="floating-object-actions">
          <Button
            variant="outline"
            aria-label="Object properties"
            onClick={() => setMobileProperties(true)}
          >
            Properties
          </Button>
          <Button
            variant="outline"
            aria-label="Duplicate object"
            onClick={duplicateSelected}
          >
            Duplicate
          </Button>
          {activeOverlay.kind === "text" && (
            <Button variant="outline" onClick={() => editText(activeOverlay)}>
              Edit text
            </Button>
          )}
          <Button
            variant="danger"
            aria-label="Delete object"
            onClick={deleteSelected}
          >
            Delete
          </Button>
        </div>
      )}
      <Dialog open={mobileProperties} onOpenChange={setMobileProperties}>
        <DialogContent>
          <DialogTitle>Object properties</DialogTitle>
          <DialogDescription>
            Adjust the selected annotation appearance.
          </DialogDescription>
          {activeOverlay && (
            <>
              <label>
                Color
                <input
                  aria-label="Color"
                  type="color"
                  value={activeOverlay.color || "#162c4d"}
                  onChange={(e) =>
                    updateOverlay(activeOverlay.id, { color: e.target.value })
                  }
                />
              </label>
              <label>
                Fill
                <select
                  aria-label="Fill"
                  value={activeOverlay.fill || "none"}
                  onChange={(e) =>
                    updateOverlay(activeOverlay.id, { fill: e.target.value })
                  }
                >
                  <option value="none">Transparent</option>
                  <option value="#facc15">Yellow</option>
                  <option value="#ffffff">White</option>
                </select>
              </label>
              <label>
                Stroke thickness
                <input
                  aria-label="Stroke thickness"
                  type="range"
                  min="1"
                  max="12"
                  value={activeOverlay.strokeWidth || 2}
                  onChange={(e) =>
                    updateOverlay(activeOverlay.id, {
                      strokeWidth: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Opacity
                <input
                  aria-label="Opacity"
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round((activeOverlay.opacity ?? 1) * 100)}
                  onChange={(e) =>
                    updateOverlay(activeOverlay.id, {
                      opacity: Number(e.target.value) / 100,
                    })
                  }
                />
              </label>
            </>
          )}
          <Button onClick={() => setMobileProperties(false)}>Done</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={textOpen} onOpenChange={setTextOpen}>
        <DialogContent>
          <DialogTitle>{editingTextId ? "Edit text" : "Add text"}</DialogTitle>
          <DialogDescription>
            Text is embedded locally in the exported PDF.
          </DialogDescription>
          <label>
            Text content
            <textarea
              aria-label="Text content"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              rows={4}
            />
          </label>
          <label>
            Font family
            <select
              aria-label="Font family"
              value={fontFamily}
              onChange={(e) =>
                setFontFamily(e.target.value as "sans" | "serif" | "mono")
              }
            >
              <option value="sans">Sans-serif</option>
              <option value="serif">Serif</option>
              <option value="mono">Monospace</option>
            </select>
          </label>
          <label>
            Font size
            <input
              aria-label="Font size"
              type="number"
              min="6"
              max="96"
              value={fontSize}
              onChange={(e) =>
                setFontSize(Math.max(6, Math.min(96, Number(e.target.value))))
              }
            />
          </label>
          <label>
            Text color
            <input
              aria-label="Text color"
              type="color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={bold}
              onChange={(e) => setBold(e.target.checked)}
            />
            Bold
          </label>
          <label>
            <input
              type="checkbox"
              checked={italic}
              onChange={(e) => setItalic(e.target.checked)}
            />
            Italic
          </label>
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setTextOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitText} disabled={!textValue.trim()}>
              {editingTextId ? "Save text" : "Add text"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <SignatureDialog
        key={signatureOpen ? "open" : "closed"}
        open={signatureOpen}
        onOpenChange={setSignatureOpen}
        onAdd={(data) => void addImage(data, "signature")}
        onUpload={() => chooseImage("signature")}
      />
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogTitle>Your PDF workspace</DialogTitle>
          <DialogDescription>
            A private document finishing workspace, inspired by desktop PDF
            editors.
          </DialogDescription>
          <div className="help-content">
            <h3>How it works</h3>
            <ol>
              <li>Open a PDF or try the demo document.</li>
              <li>Add text, shapes, signatures, or images from the toolbar.</li>
              <li>Drag objects, resize corners, or use the arrow keys.</li>
              <li>Rotate the current page, then download the edited PDF.</li>
            </ol>
            <h3>Keyboard shortcuts</h3>
            <p>
              Ctrl/⌘ + Z: undo · Ctrl/⌘ + Shift + Z: redo
              <br />
              Delete: delete object · Escape: clear selection
            </p>
            <h3>Before you start</h3>
            <p>
              Edits stay in this session until you download. Download before
              closing or reloading. Signatures are visual images, not certified
              digital signatures. Original PDF text is not rewritten.
              Password-protected PDFs are not supported. PDF limit: 50 MB; image
              limit: 15 MB.
            </p>
          </div>
          <Button className="w-full mt-4" onClick={() => setHelpOpen(false)}>
            Got it
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={replaceOpen}
        onOpenChange={(value) => {
          setReplaceOpen(value);
          if (!value) pendingFile.current = null;
        }}
      >
        <DialogContent>
          <DialogTitle>Open a new document?</DialogTitle>
          <DialogDescription>
            Your current edits will be lost. Download the edited PDF first if
            you want to keep them.
          </DialogDescription>
          <div className="dialog-actions">
            <Button
              variant="outline"
              onClick={() => {
                setReplaceOpen(false);
                pendingFile.current = null;
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void loadPending()}>
              Open new document
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {notice && (
        <div className="toast" role="status">
          <span>
            <Check size={16} />
          </span>
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <FileText size={18} />
          <span>{error}</span>
          <button aria-label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {dragging && (
        <div
          className="drop-overlay"
          onDragLeave={() => setDragging(false)}
          onDrop={drop}
        >
          <Upload size={48} />
          <h2>Drop your PDF here</h2>
          <p>Files stay on your device · Up to 50 MB</p>
        </div>
      )}
    </div>
  );
}
