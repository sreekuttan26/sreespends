"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

/** Bottom sheet on phones, centered dialog on larger screens. */
export default function Sheet({ title, subtitle, onClose, children, footer }: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-6 fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="sheet-in flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-[var(--surface)] shadow-2xl sm:max-w-lg sm:rounded-[28px]"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-[var(--border)] sm:hidden" />
        <header className="flex items-start justify-between gap-4 px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {subtitle && (
              <p className="truncate text-sm text-[var(--muted)]">{subtitle}</p>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--muted)] transition hover:text-[var(--fg)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </header>
        <div className="flex-1 overflow-y-auto px-5 pb-4 sm:px-6">{children}</div>
        {footer && (
          <div className="border-t border-[var(--border)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
