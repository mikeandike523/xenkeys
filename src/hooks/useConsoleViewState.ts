import { v4 as uuidv4 } from "uuid";

import {
  type ConsoleViewState,
  type ConsoleViewMessage,
  type ConsoleViewMessageKind,
} from "@/shared-types/console-view";
import { useEffect, useRef, useState, type RefObject } from "react";

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
  // Mechanism to force rerender on change
  const [version, setVersion] = useState<number>(0);
  const forceRerender = () => setVersion(version+ 1);

  useEffect(() => {
    if (consoleRef.current) {
      // Smoothly scroll to bottom
      consoleRef.current.scrollTo({
        top: consoleRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [version]);

  const addMessage = (
    kind: ConsoleViewMessageKind,
    text: string,
    color?: string
  ) => {
    const newId = uuidv4();
    const newMessage: ConsoleViewMessage = {
      kind,
      text,
      color: color ?? defaultKindColors[kind],
    };
    messageMapRef.current.set(newId, newMessage);
    if(messageMapRef.current.size > ROTATE) {
        const oldestId = messageMapRef.current.keys().next().value;
        messageMapRef.current.delete(oldestId!);
    }
    forceRerender();
  };
  const removeMessage = (id: string) => {
    messageMapRef.current.delete(id);
    forceRerender();
  };
  const updateMessage = (id: string, updates: Partial<ConsoleViewMessage>) => {
    const existing = messageMapRef.current.get(id);
    if (!existing) return;
    const updatedMessage = { ...existing, ...updates };
    messageMapRef.current.set(id, updatedMessage);
    forceRerender();
  };
  const getMessages = () => {
    const result: Array<[string, ConsoleViewMessage]> = [];
    messageMapRef.current.forEach((message, id) => {
      result.push([id, message]);
    });
    return result;
  };
  const clearMessages = () => {
    messageMapRef.current.clear();
    forceRerender();
  };
  return {
    addMessage,
    updateMessage,
    removeMessage,
    getMessages,
    clearMessages,
  };
}
