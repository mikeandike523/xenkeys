
import { useState, useEffect, useCallback } from "react";

// IndexedDB utility for simple key-value storage
const DB_NAME = "usePersistentStateDB";
const STORE_NAME = "keyval";
const DB_VERSION = 1;
let dbPromise: Promise<IDBDatabase>;

function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function idbGet(key: string): Promise<string | undefined> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

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
