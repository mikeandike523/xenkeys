import { v4 as uuidv4 } from "uuid";
import { useEffect, useRef, useState, useCallback, type RefObject } from "react";
import {
  type ConsoleViewState,
  type ConsoleViewMessage,
  type ConsoleViewMessageKind,
} from "@/shared-types/console-view";

const defaultKindColors = {
  log: "black",
  warning: "yellow",
  error: "red",
  info: "skyblue",
} as const;

const ROTATE = 50;

export default function useConsoleViewState(
  consoleRef: RefObject<HTMLDivElement | null>
): ConsoleViewState {
  const messageMapRef = useRef<Map<string, ConsoleViewMessage>>(new Map());

  const [, setVersion] = useState(0);
  // ✅ Always increments from the latest state; no stale closure risk.
  const forceRerender = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const el = consoleRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [consoleRef]); // version is no longer needed as a dep since forceRerender triggers a render anyway

  const addMessage = useCallback(
    (kind: ConsoleViewMessageKind, text: string, color?: string) => {
      const newId = uuidv4();
      const newMessage: ConsoleViewMessage = {
        kind,
        text,
        color: color ?? defaultKindColors[kind],
      };
      const map = messageMapRef.current;
      map.set(newId, newMessage);
      if (map.size > ROTATE) {
        const oldestId = map.keys().next().value as string | undefined;
        if (oldestId) map.delete(oldestId);
      }
      forceRerender();
    },
    [forceRerender]
  );

  const removeMessage = useCallback((id: string) => {
    messageMapRef.current.delete(id);
    forceRerender();
  }, [forceRerender]);

  const updateMessage = useCallback(
    (id: string, updates: Partial<ConsoleViewMessage>) => {
      const map = messageMapRef.current;
      const existing = map.get(id);
      if (!existing) return;
      map.set(id, { ...existing, ...updates });
      forceRerender();
    },
    [forceRerender]
  );

  const getMessages = useCallback(() => {
    const result: Array<[string, ConsoleViewMessage]> = [];
    messageMapRef.current.forEach((message, id) => {
      result.push([id, message]);
    });
    return result;
  }, []);

  const clearMessages = useCallback(() => {
    messageMapRef.current.clear();
    forceRerender();
  }, [forceRerender]);

  return { addMessage, updateMessage, removeMessage, getMessages, clearMessages };
}
