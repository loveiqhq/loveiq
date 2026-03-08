"use client";

import { useState } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  requireTyped?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  requireTyped,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = useState("");

  if (!open) return null;

  const isTypedMatch = !requireTyped || typedValue === requireTyped;

  function handleCancel() {
    setTypedValue("");
    onCancel();
  }

  function handleConfirm() {
    setTypedValue("");
    onConfirm();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-surface p-6">
        <h3 className="font-serif text-lg font-bold text-text-primary">{title}</h3>
        <p className="mt-2 text-sm text-text-muted">{message}</p>

        {requireTyped && (
          <div className="mt-4">
            <label className="block text-sm text-text-muted">
              To confirm, type{" "}
              <span className="font-semibold text-text-primary">&quot;{requireTyped}&quot;</span>{" "}
              below:
            </label>
            <input
              type="text"
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:border-white/20 focus:outline-none"
              placeholder={requireTyped}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-text-muted transition hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isTypedMatch}
            className={
              requireTyped
                ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:bg-red-600/30 disabled:text-red-300/50"
                : "rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/30"
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
