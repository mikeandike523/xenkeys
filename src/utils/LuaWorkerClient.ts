import LuaWorker from "@/workers/lua.worker.ts?worker";

type PreloadSpec = Array<{ name: string; src: string }>;

export class LuaWorkerClient {
  private worker = new LuaWorker();

  constructor() {
    this.init();
  }

  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        if (e.data.type === "ready") {
          this.worker.removeEventListener("message", handler);
          resolve();
        }
        if (e.data.type === "error") {
          this.worker.removeEventListener("message", handler);
          console.error("Lua worker failed to initialize:", e.data.message);
          reject(new Error(e.data.message));
        }
      };
      this.worker.addEventListener("message", handler);
      this.worker.postMessage({ type: "init" });
    });
  }

  onStdout(handler: (line: string) => void) {
    const listener = (e: MessageEvent) => {
      if (e.data.type === "stdout") handler(e.data.line as string);
    };
    this.worker.addEventListener("message", listener);
    return () => this.worker.removeEventListener("message", listener);
  }

  run(code: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        if (e.data.type === "result") {
          this.worker.removeEventListener("message", handler);
          resolve(e.data.result);
        }
        if (e.data.type === "error") {
          this.worker.removeEventListener("message", handler);
          reject(new Error(e.data.message));
        }
      };
      this.worker.addEventListener("message", handler);
      this.worker.postMessage({ type: "run", code });
    });
  }

  preloadModules(mods: PreloadSpec): Promise<number> {
    return new Promise((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        if (e.data.type === "preloaded") {
          this.worker.removeEventListener("message", handler);
          resolve(e.data.count as number);
        }
        if (e.data.type === "error") {
          this.worker.removeEventListener("message", handler);
          reject(new Error(e.data.message));
        }
      };
      this.worker.addEventListener("message", handler);
      this.worker.postMessage({ type: "preload", modules: mods });
    });
  }

  // --- Static scanner for require("...") ---
  // Simple, robust for typical cases. You can enhance to ignore comments/strings if needed.
  private findRequires(src: string): string[] {
    const names = new Set<string>();
    const re = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
    let m;
    while ((m = re.exec(src))) names.add(m[1]);
    return [...names];
  }

  // Map a dotted module "xentheory.foo.bar" to a URL like "/xentheory/foo/bar.lua"
  private moduleToUrl(modName: string, base = "/xentheory"): string {
    return `${base}/${modName.replace(/\./g, "/")}.lua`;
  }

  // Fetch text with basic error handling
  private async fetchText(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.text();
  }

  /**
   * Recursively prefetch modules that start with the given prefix.
   * It also scans fetched module sources for transitive requires
   * (but only pulls those that match the same prefix).
   */
  async prefetchByPrefixFromUrls(
    code: string,
    opts: { prefix?: string; base?: string; maxDepth?: number } = {}
  ): Promise<number> {
    const prefix = opts.prefix ?? "xentheory";
    const base = opts.base ?? "/xentheory";
    const maxDepth = opts.maxDepth ?? 16;

    const queued = new Set<string>();
    const loaded = new Map<string, string>();

    const enqueue = (name: string) => {
      if (name.startsWith(prefix) && !queued.has(name) && !loaded.has(name)) {
        queued.add(name);
      }
    };

    // seed from user code
    this.findRequires(code).forEach(enqueue);

    // BFS/DFS hybrid up to maxDepth
    for (let depth = 0; depth < maxDepth && queued.size > 0; depth++) {
      const batch = Array.from(queued);
      queued.clear();

      // fetch in parallel
      const fetched = await Promise.all(
        batch.map(async (name) => {
          const url = this.moduleToUrl(name, base);
          const src = await this.fetchText(url);
          return { name, src };
        })
      );

      // store & scan each for further requires (same prefix only)
      for (const { name, src } of fetched) {
        loaded.set(name, src);
        this.findRequires(src).forEach(enqueue);
      }
    }

    // Preload into Lua VM
    if (loaded.size > 0) {
      const list: PreloadSpec = Array.from(loaded.entries()).map(([name, src]) => ({ name, src }));
      await this.preloadModules(list);
    }

    return loaded.size;
  }

  /**
   * Convenience: scan -> prefetch xentheory* modules -> run code.
   * - prefix: dotted namespace to capture (default "xentheory")
   * - base: public dir base path (default "/xentheory")
   */
  async runWithXenModules(
    code: string,
    opts: { prefix?: string; base?: string; maxDepth?: number } = {}
  ) {
    await this.prefetchByPrefixFromUrls(code, opts);
    return this.run(code);
  }

  terminate() {
    this.worker.terminate();
  }
}
