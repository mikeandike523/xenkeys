import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import monacoEditorPlugin from "vite-plugin-monaco-editor-esm";
import fs from "fs";
import path from "path";
import { parse } from "jsonc-parser";

// --- Derive alias map dynamically from tsconfig.app.json ---
const tsconfigPath = path.resolve("tsconfig.app.json");
const tsconfigText = fs.readFileSync(tsconfigPath, "utf8");
const tsconfig = parse(tsconfigText);

const baseUrl = tsconfig?.compilerOptions?.baseUrl || ".";
const paths = tsconfig?.compilerOptions?.paths || {};

const alias: Record<string, string> = {};
for (const [key, values] of Object.entries(paths)) {
  const aliasKey = key.replace("/*", "");
  const target = (values as Array<string>)[0].replace("/*", "");
  alias[aliasKey] = path.resolve(baseUrl, target);
}

console.log("🔗 Vite alias map:", alias);

// --- Vite config ---
export default defineConfig({
  resolve: { alias },
  worker: {
    format: 'es',   // ensures modern module workers
  },
  server: {
    allowedHosts: [
      "wirestheyeen.ngrok.app"
    ]
  },
  plugins: [
    react({
      babel: { plugins: [["babel-plugin-react-compiler"]] },
    }),
    monacoEditorPlugin({ languageWorkers: [] }),
  ],
});