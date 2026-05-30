import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * Centered modal dialog: full-screen dimmed overlay with a click-outside-to-close
 * panel. Width and any panel-specific layout (max height, scroll, flex) are passed
 * via `className`; pass `padded={false}` when the children manage their own padding
 * (e.g. a scrollable panel with sticky sections).
 */
export function Modal({
  onClose,
  children,
  className,
  padded = true,
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={clsx(
          "rounded-modal border border-border bg-surface shadow-modal",
          padded && "p-5",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
