import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import type MonacoManager from "../shared-types/MonacoManager";
import { idbGet, idbSet } from "./fwk/idb";

/**
 * Options for configuring the Monaco editor instance and persistence.
 */
type Options = monaco.editor.IStandaloneEditorConstructionOptions & {
  /** Initial editor value */
  defaultValue?: string;
  /** Optional key to persist code in IndexedDB */
  persistKey?: string;
};

export default function useMonacoEditor(opts?: Options): MonacoManager {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Extract default value and persistence key, pass rest to Monaco
    const { defaultValue = "", persistKey, ...monacoOpts } = opts ?? {};

    modelRef.current = monaco.editor.createModel(defaultValue, "lua");
    editorRef.current = monaco.editor.create(el, {
      model: modelRef.current,
      automaticLayout: false, // we'll use ResizeObserver
      minimap: { enabled: false },
      tabSize: 2,
      detectIndentation: false,
      theme: "vs-dark",
      ...monacoOpts,
    });

    roRef.current = new ResizeObserver(() => editorRef.current?.layout());
    roRef.current.observe(el);

    // Persistence: load stored code and save on changes
    let persistenceDisposable: monaco.IDisposable | undefined;
    if (persistKey) {
      idbGet(persistKey)
        .then((stored) => {
          const model = modelRef.current;
          if (model && stored != null && stored !== defaultValue) {
            model.pushEditOperations(
              [],
              [{ range: model.getFullModelRange(), text: stored }],
              () => null
            );
          }
        })
        .catch((error) =>
          console.error(`Error reading IndexedDB key “${persistKey}”:`, error)
        );
      persistenceDisposable = editorRef.current.onDidChangeModelContent(() => {
        const model = modelRef.current;
        if (model) {
          idbSet(persistKey, model.getValue()).catch((error) =>
            console.error(`Error setting IndexedDB key “${persistKey}”:`, error)
          );
        }
      });
    }

    return () => {
      persistenceDisposable?.dispose();
      roRef.current?.disconnect();
      roRef.current = null;
      editorRef.current?.dispose();
      editorRef.current = null;
      modelRef.current?.dispose();
      modelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount once

  return {
    containerRef,
    getValue: () => modelRef.current?.getValue() ?? "",
    setValue: (v: string) => {
      const model = modelRef.current;
      if (!model) return;
      if (model.getValue() === v) return;
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: v }],
        () => null
      );
    },
    focus: () => editorRef.current?.focus(),
    layout: () => editorRef.current?.layout(),
    editor: () => editorRef.current,
  };
}
