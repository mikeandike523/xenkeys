
import { useState, useEffect, useCallback } from "react";
import { idbGet, idbSet } from "./idb";

/**
 * A persistent state hook using IndexedDB for storage.
 * Provides the same interface as localStorage-based usePersistentState.
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [state, setState] = useState<T>(defaultValue);

  const resetState = useCallback(() => {
    setState(defaultValue);
  }, [defaultValue]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const stored = await idbGet(key);
        if (!cancelled && stored != null) {
          setState(JSON.parse(stored) as T);
        }
      } catch (error) {
        console.error(`Error reading IndexedDB key “${key}”:`, error);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    async function save() {
      try {
        await idbSet(key, JSON.stringify(state));
      } catch (error) {
        console.error(`Error setting IndexedDB key “${key}”:`, error);
      }
    }
    save();
  }, [key, state]);

  return [state, setState, resetState];
}
