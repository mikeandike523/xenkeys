// build-worklets.js
import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { parse } from "jsonc-parser";

// --- Load & parse tsconfig.worklets.json ---
const tsconfigPath = path.resolve("tsconfig.worklets.json");
const tsconfigText = fs.readFileSync(tsconfigPath, "utf8");
const tsconfig = parse(tsconfigText);

// --- Derive alias map from baseUrl + paths ---
const baseUrl = tsconfig?.compilerOptions?.baseUrl || ".";
const paths = tsconfig?.compilerOptions?.paths || {};

const alias = {};
for (const [key, values] of Object.entries(paths)) {
  // "@/*" -> "@"
  const aliasKey = key.replace("/*", "");
  // "src/*" -> "src"
  const target = values[0].replace("/*", "");
  alias[aliasKey] = path.resolve(baseUrl, target);
}

console.log("🔗 Resolved aliases:", alias);

// --- Run esbuild ---
esbuild
  .build({
    entryPoints: ["src/worklets/**/*.worklet.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    outdir: "public/worklets",
    entryNames: "[name]",
    sourcemap: true,
    minify: true,
    tsconfig: tsconfigPath,
    alias, // ✅ direct alias injection
    
  })
  .then(() => {
    console.log("✅ Worklets built");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
