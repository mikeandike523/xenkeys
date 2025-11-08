import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import type MonacoManager from "../shared-types/MonacoManager";

type Options = monaco.editor.IStandaloneEditorConstructionOptions & {
  defaultValue?: string;
};

export default function useMonacoEditor(opts?: Options): MonacoManager {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    modelRef.current = monaco.editor.createModel(
      opts?.defaultValue ?? "",
      "lua"
    );

    editorRef.current = monaco.editor.create(el, {
      model: modelRef.current,
      automaticLayout: false, // we'll use ResizeObserver
      minimap: { enabled: false },
      tabSize: 2,
      detectIndentation: false,
      theme: "vs-dark",
      ...opts,
    });

    roRef.current = new ResizeObserver(() => editorRef.current?.layout());
    roRef.current.observe(el);

    return () => {
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
