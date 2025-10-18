import { useState, useEffect, type RefObject, useCallback } from "react";
import { throttle } from "lodash";

const DEFAULT_THROTTLE_MILLIS = 100;

interface UseElementSizeOptions {
  throttleMillis?: number;
  includeTransforms?: boolean;
  silent?: boolean;
}

type GlobalThis = typeof globalThis;

// Type assertion to handle environments where ResizeObserver might not be present
type GlobalThisWithResizeObserver = GlobalThis & {
  ResizeObserver?: typeof ResizeObserver;
};

/** An interface representing an element that can be measured by useElementSize. */
export interface MeasurableElement extends Element {
  offsetWidth: number;
  offsetHeight: number;
}

/**
 * A hook that measures the size of an HTMLElement and updates on resize.
 *
 * @param ref - A React ref to the element to measure.
 * @param options - Configuration options.
 * @param options.throttleMillis - The throttle delay in milliseconds for resize events. Defaults to 100.
 * @param options.includeTransforms - Whether to include CSS transforms in the measurement. Defaults to true.
 * @param options.silent - Whether to suppress the warning when falling back to window resize. Defaults to false.
 * @returns A DOMRect object representing the element's size and position, or null if not yet measured.
 */
export function useElementSize<T extends MeasurableElement>(
  ref: RefObject<T>,
  options: UseElementSizeOptions = {}
): DOMRect | null {
  const {
    throttleMillis = DEFAULT_THROTTLE_MILLIS,
    includeTransforms = true,
    silent = false,
  } = options;

  const [size, setSize] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) {
      setSize(null);
      return;
    }

    if (includeTransforms) {
      setSize(element.getBoundingClientRect());
    } else {
      // When not including transforms, we build a DOMRect from offset properties.
      const { offsetWidth, offsetHeight } = element;
      const rect = new DOMRect(0, 0, offsetWidth, offsetHeight);
      setSize(rect);
    }
  }, [ref, includeTransforms]);

  useEffect(() => {
    // Initial measurement on mount.
    measure();

    const element = ref.current;
    if (!element) {
      return;
    }

    const throttledMeasure = throttle(measure, throttleMillis, {
      leading: true,
      trailing: true,
    });

    const hasResizeObserver =
      typeof (globalThis as GlobalThisWithResizeObserver).ResizeObserver !==
      "undefined";

    if (hasResizeObserver) {
      const resizeObserver = new (
        globalThis as GlobalThisWithResizeObserver
      ).ResizeObserver!(throttledMeasure);
      resizeObserver.observe(element);

      return () => {
        resizeObserver.disconnect();
      };
    } else {
      if (!silent) {
        console.warn(
          "useElementSize: ResizeObserver not available. Falling back to window resize event. This may be less performant and might not catch all resize events of the element."
        );
      }
      window.addEventListener("resize", throttledMeasure);
      return () => {
        window.removeEventListener("resize", throttledMeasure);
      };
    }
  }, [ref, measure, throttleMillis, silent]);

  return size;
}
