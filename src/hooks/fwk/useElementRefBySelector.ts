
import { useState, useEffect, useMemo, type RefObject } from 'react';

/**
 * A hook that takes a CSS selector and returns a React RefObject pointing to the found element.
 * The element is searched for after the component mounts. The ref object is stable, but its
 * `current` property will update if the selector changes and finds a different element.
 *
 * @param selector - The CSS selector for the element.
 * @param options - Configuration options.
 * @param options.silent - Whether to suppress the warning if the element is not found. Defaults to false.
 * @returns A stable RefObject pointing to the element, or null if not found.
 */
export function useElementRefBySelector<T extends Element>(
  selector: string,
  options: { silent?: boolean } = {}
): RefObject<T> {
  const { silent = false } = options;
  const [element, setElement] = useState<T | null>(null);

  useEffect(() => {
    const el = document.querySelector<T>(selector);
    if (!el && !silent) {
      console.warn(
        `useElementRefBySelector: Element with selector "${selector}" not found.`
      );
    }
    setElement(el);
  }, [selector, silent]);

  // Create a stable ref object whose `current` property is always up-to-date.
  const ref = useMemo(() => ({ current: element }), [element]);

  return ref as RefObject<T>;
}
