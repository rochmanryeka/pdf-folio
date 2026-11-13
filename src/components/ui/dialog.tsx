import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;
export function DialogContent({
  children,
  className,
  ...props
}: React.ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/55" />
      <D.Content
        className={cn(
          "dialog-content fixed z-50 rounded-2xl border border-border bg-card p-6 text-foreground shadow-2xl",
          className,
        )}
        {...props}
      >
        {children}
        <D.Close className="dialog-close" aria-label="Close dialog">
          <X size={18} />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
export function DialogTitle(props: React.ComponentProps<typeof D.Title>) {
  return (
    <D.Title className="text-xl font-semibold tracking-tight" {...props} />
  );
}
export function DialogDescription(
  props: React.ComponentProps<typeof D.Description>,
) {
  return (
    <D.Description className="mt-2 text-sm text-muted-foreground" {...props} />
  );
}
