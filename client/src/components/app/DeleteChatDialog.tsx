"use client";

import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function DeleteChatDialog({
  title,
  open,
  deleting = false,
  error = null,
  onOpenChange,
  onConfirm,
}: {
  title: string;
  open: boolean;
  deleting?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <DialogContent
        showCloseButton={!deleting}
        className="gap-0 overflow-hidden border-2 border-[var(--hero-ink)] bg-white p-0 shadow-[8px_8px_0_var(--hero-ink)] sm:max-w-md"
      >
        <div className="border-b-2 border-[var(--hero-ink)]/10 bg-[var(--hero-bg)] px-6 py-5">
          <DialogHeader className="gap-3 text-left">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--hero-ink)]/45">
              Delete chat
            </p>
            <DialogTitle className="font-heading text-xl font-extrabold tracking-tight text-[var(--hero-ink)]">
              Delete {title}?
            </DialogTitle>
            <DialogDescription className="text-sm font-medium leading-relaxed text-[var(--hero-ink)]/65">
              This removes the chat, its messages, and any unsaved draft. Saved projects and activity
              history are kept.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-5">
          {error ? (
            <p className="mb-4 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-full border-2 border-[var(--hero-ink)]/20 bg-white px-5 py-2.5 text-sm font-bold text-[var(--hero-ink)]/70 transition-colors hover:border-[var(--hero-ink)]/40 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-coral)] px-5 py-2.5 text-sm font-bold text-white shadow-[4px_4px_0_var(--hero-ink)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" strokeWidth={2.5} aria-hidden />
              )}
              Delete chat
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
