import { useRef, useState } from "react";
import type { PointerEvent } from "react";
import { PenLine, Type, Upload, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
export type SignatureDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (dataUrl: string) => void;
  onUpload?: () => void;
};
export function SignatureDialog({
  open,
  onOpenChange,
  onAdd,
  onUpload,
}: SignatureDialogProps) {
  const [tab, setTab] = useState("draw");
  const [name, setName] = useState("");
  const [ink, setInk] = useState("#162c4d");
  const [hasInk, setHasInk] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  function point(e: PointerEvent<HTMLCanvasElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) * e.currentTarget.width) / box.width,
      y: ((e.clientY - box.top) * e.currentTarget.height) / box.height,
    };
  }
  function start(e: PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    drawing.current = true;
    setHasInk(true);
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const p = point(e);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) {
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }
  function clear() {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  }
  function useSignature() {
    let data: string | undefined;
    if (tab === "type") {
      const c = document.createElement("canvas");
      c.width = 1000;
      c.height = 250;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = ink;
      ctx.font = 'italic 88px "Segoe Script", "Brush Script MT", cursive';
      ctx.textBaseline = "middle";
      const width = ctx.measureText(name.trim()).width;
      const scale = Math.min(1, 940 / width);
      ctx.scale(scale, 1);
      ctx.fillText(name.trim(), 30, 125);
      data = c.toDataURL("image/png");
    } else {
      data = canvas.current?.toDataURL("image/png");
    }
    if (data) {
      onAdd(data);
      onOpenChange(false);
      setName("");
      setHasInk(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="signature-dialog">
        <div className="dialog-icon">
          <PenLine size={24} />
        </div>
        <DialogTitle>Create signature</DialogTitle>
        <DialogDescription>
          A personal touch for your document.
        </DialogDescription>
        <Tabs value={tab} onValueChange={setTab} className="mt-6">
          <TabsList className="w-full">
            <TabsTrigger value="draw">
              <PenLine size={15} />
              Draw
            </TabsTrigger>
            <TabsTrigger value="type">
              <Type size={15} />
              Type name
            </TabsTrigger>
            <TabsTrigger value="upload">
              <Upload size={15} />
              Upload
            </TabsTrigger>
          </TabsList>
          <TabsContent value="draw">
            <div className="signature-pad">
              <canvas
                aria-label="Signature drawing area"
                ref={canvas}
                width={1000}
                height={300}
                onPointerDown={start}
                onPointerMove={move}
                onPointerUp={() => {
                  drawing.current = false;
                }}
                onPointerCancel={() => {
                  drawing.current = false;
                }}
              />
              <span>Sign here</span>
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="flex gap-2">
                {["#162c4d", "#111111", "#b52424"].map((c) => (
                  <button
                    key={c}
                    aria-label={`Ink color ${c}`}
                    aria-pressed={ink === c}
                    className={`ink-dot ${ink === c ? "active" : ""}`}
                    style={{ background: c }}
                    onClick={() => {
                      setInk(c);
                    }}
                  />
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={clear}>
                <RotateCcw />
                Clear
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="type">
            <label htmlFor="sign-name" className="text-sm font-medium">
              Full name
            </label>
            <input
              autoComplete="name"
              id="sign-name"
              maxLength={60}
              className="text-input mt-2"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="typed-preview" style={{ color: ink }}>
              {name || "Your signature"}
            </div>
          </TabsContent>
          <TabsContent value="upload">
            <div className="signature-upload">
              <Upload size={28} />
              <p>Already have a signature?</p>
              <span>Use a transparent PNG for the best result.</span>
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  onUpload?.();
                }}
              >
                Choose signature image
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        <div className="signature-note">
          <ShieldCheck size={15} />
          <span>Visual signature, not a digital certificate.</span>
        </div>
        <div className="dialog-actions">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              tab === "type" ? !name.trim() : tab === "draw" ? !hasInk : true
            }
            onClick={useSignature}
          >
            Use signature
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
