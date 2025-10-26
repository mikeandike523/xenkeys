import type * as monaco from "monaco-editor";
import { type RefObject } from "react";

export default interface MonacoManager {
  /** Attach this to your <div> to mount Monaco */
  containerRef: RefObject<HTMLDivElement|null>;
  /** Imperative API */
  getValue: () => string;
  setValue: (v: string) => void;
  focus: () => void;
  layout: () => void;
  editor: () => monaco.editor.IStandaloneCodeEditor | null;
};
