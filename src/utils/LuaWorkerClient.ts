import LuaWorker from "@/workers/lua.worker.ts?worker";

export type LuaWorkerLoaderConfig = {
  baseUrl?: string;        // e.g. "/lua" or "https://cdn.example.com/lua"
  packagePrefix?: string;  // e.g. "myapp" (handle only require("myapp.*"))
};

export class LuaWorkerClient {
  private worker = new LuaWorker();
  private baseUrl: string;
  private prefix: string;

  constructor(config: LuaWorkerLoaderConfig = {}) {
    this.baseUrl = config.baseUrl ?? "/lua";
    this.prefix = config.packagePrefix ?? "";
    this.init();
  }

  private init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        if (e.data.type === "ready") {
          this.worker.removeEventListener("message", handler);
          resolve();
        }
        if (e.data.type === "error") {
          this.worker.removeEventListener("message", handler);
          reject(new Error(e.data.message));
        }
      };
      this.worker.addEventListener("message", handler);
      this.worker.postMessage({
        type: "init",
        loader: { baseUrl: this.baseUrl, packagePrefix: this.prefix || undefined },
      });
    });
  }

  onStdout(handler: (line: string) => void) {
    const listener = (e: MessageEvent) => {
      if (e.data.type === "stdout") handler(e.data.line as string);
    };
    this.worker.addEventListener("message", listener);
    return () => this.worker.removeEventListener("message", listener);
  }

  // --- minimal require() scanner + loader -----------------------------

  private findRequires(src: string): string[] {
    const out = new Set<string>();
    const re = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.add(m[1]);
    return [...out];
  }

  private moduleUrl(name: string): string {
    const cleanBase = this.baseUrl.replace(/\/+$/, "");
    const path = name.replace(/\./g, "/") + ".lua";
    return `${cleanBase}/${path}`;
  }

  private async fetchText(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.text();
  }

  /**
   * Minimal “smart loader”: scan requires in `code` recursively (under prefix),
   * fetch them from baseUrl, push into worker cache.
   */
  private async smartLoadWithBaseUrl(code: string, maxDepth = 16): Promise<number> {
    const shouldHandle = (n: string) => this.prefix === "" || n.startsWith(this.prefix);

    const queued = new Set<string>();
    const loaded = new Map<string, string>();

    const enqueue = (n: string) => {
      if (shouldHandle(n) && !queued.has(n) && !loaded.has(n)) queued.add(n);
    };

    // seed from entry code
    this.findRequires(code).forEach(enqueue);

    for (let depth = 0; depth < maxDepth && queued.size > 0; depth++) {
      const batch = Array.from(queued);
      queued.clear();

      const fetched = await Promise.all(
        batch.map(async (name) => {
          const src = await this.fetchText(this.moduleUrl(name));
          return { name, src };
        })
      );

      for (const { name, src } of fetched) {
        loaded.set(name, src);
        this.findRequires(src).forEach(enqueue);
      }
    }

    if (loaded.size > 0) {
      await new Promise<void>((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          if (e.data.type === "cached") {
            this.worker.removeEventListener("message", handler);
            resolve();
          }
          if (e.data.type === "error") {
            this.worker.removeEventListener("message", handler);
            reject(new Error(e.data.message));
          }
        };
        this.worker.addEventListener("message", handler);
        const modules = Array.from(loaded.entries()).map(([name, src]) => ({ name, src }));
        this.worker.postMessage({ type: "cache", modules });
      });
    }

    return loaded.size;
  }

  /**
   * Public API: just call run(code). It will:
   * 1) recursively cache required modules (under prefix) from baseUrl
   * 2) execute the code
   */
  async run(code: string): Promise<any> {
    await this.smartLoadWithBaseUrl(code);
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

  terminate() {
    this.worker.terminate();
  }
}
