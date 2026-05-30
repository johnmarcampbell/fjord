import { forwardRef } from "react";
import clsx from "clsx";

type Variant = "primary" | "secondary";

const VARIANT: Record<Variant, string> = {
  primary:
    "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40",
  secondary:
    "rounded-lg px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink",
};

/**
 * Footer button used in dialogs and forms. `primary` is the accent submit action,
 * `secondary` is the muted cancel/dismiss action. Defaults `type` to "button" so it
 * doesn't accidentally submit a surrounding form unless asked to.
 */
export const Button = forwardRef<
  HTMLButtonElement,
  { variant?: Variant } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(function Button({ variant = "primary", className, type = "button", ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(VARIANT[variant], className)}
      {...props}
    />
  );
});
