import { useEffect, useRef, type RefObject } from "react";

/**
 * Dismiss-on-outside-interaction wiring shared by the app's dropdowns.
 *
 * Attach the returned ref to the dropdown's container. While `active` is true,
 * `onDismiss` fires on a mousedown outside the container or an Escape keypress.
 * Centralizes what was previously hand-rolled in every dropdown.
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
  active: boolean,
  onDismiss: () => void,
): RefObject<T> {
  const ref = useRef<T>(null);
  // Keep the latest callback without making it an effect dependency, so the
  // listeners are bound once per open/close rather than on every render.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!active) return;
    function onMouseDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) onDismissRef.current();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismissRef.current();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);

  return ref;
}
