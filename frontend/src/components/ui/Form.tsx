import { forwardRef } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";

/** Shared field styling for text inputs, selects, and textareas. */
export const fieldClass =
  "w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors";

/** Small uppercase label rendered above a form field. */
export function FormLabel({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={clsx(
        "mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}

export const FormInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function FormInput({ className, ...props }, ref) {
  return <input ref={ref} className={clsx(fieldClass, className)} {...props} />;
});

export const FormTextarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function FormTextarea({ className, ...props }, ref) {
  return (
    <textarea ref={ref} className={clsx(fieldClass, "resize-none", className)} {...props} />
  );
});

export const FormSelect = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function FormSelect({ className, ...props }, ref) {
  return <select ref={ref} className={clsx(fieldClass, className)} {...props} />;
});

/** Inline per-field validation message. Renders nothing when there is no message. */
export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-danger-text">{children}</p>;
}

/** Block-level error banner for server/submit errors. Renders nothing when empty. */
export function ErrorBanner({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <div
      className={clsx(
        "rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text",
        className,
      )}
    >
      {children}
    </div>
  );
}
