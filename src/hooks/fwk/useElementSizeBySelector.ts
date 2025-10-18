
import { useElementRefBySelector } from './useElementRefBySelector';
import { useElementSize } from './useElementSize';
import type { MeasurableElement, UseElementSizeOptions } from './useElementSize';

/**
 * A hook that measures the size of an HTMLElement specified by a CSS selector and updates on resize.
 * This hook composes `useElementRefBySelector` and `useElementSize`.
 *
 * @param selector - A CSS selector string for the element to measure.
 * @param options - Configuration options for sizing and element selection.
 * @returns A DOMRect object representing the element's size and position, or null if not yet measured or found.
 */
export function useElementSizeBySelector(
  selector: string,
  options: UseElementSizeOptions = {}
): DOMRect | null {
  // Separate the silent option for the ref-finding hook.
  const { silent, ...sizeOptions } = options;

  const elementRef = useElementRefBySelector<MeasurableElement>(selector, {
    silent,
  });

  return useElementSize(elementRef, sizeOptions);
}
