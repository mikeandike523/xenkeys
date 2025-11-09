import LuaWorker from "@/workers/lua.worker.ts?worker";

/**
 * A map from Lua package name -> URL to fetch its source string.
 * Example: { "app.util": "/lua/app/util.lua", "app.math": "/lua/app/math.lua" }
 */
export type ModuleUrlMap = Record<string, string>;

export class LuaWorkerClient {
  private worker = new LuaWorker();

  modules?: ModuleUrlMap;

  // No constructor init/handshake needed anymore

  constructor({modules}: { modules?: ModuleUrlMap }) {
    this.modules = modules;
  }

  onStdout(handler: (line: string) => void) {
    const listener = (e: MessageEvent) => {
      if (e.data.type === "stdout") handler(e.data.line as string);
    };
    this.worker.addEventListener("message", listener);
    return () => this.worker.removeEventListener("message", listener);
  }

  private async fetchText(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return res.text();
  }

  /**
   * Minimal API:
   * - Give us the entry code and a map of modules -> urls.
   * - We'll prefetch them as strings, send in a single 'run' message,
   *   and the worker will create a fresh engine, install modules, and execute.
   */
  async run(code: string, {
    modules
  }:{
    modules?: ModuleUrlMap
  }): Promise<any> {
    // Prefetch module sources

    const resolvedModules = {...(modules??{}), ...(this.modules??{})}
    const names = Object.keys(resolvedModules);
    const texts = await Promise.all(names.map((n) => this.fetchText(resolvedModules[n])));
    const payload = names.map((name, i) => ({ name, src: texts[i] }));

    // Send one 'run' message and await the result
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
      this.worker.postMessage({ type: "run", code, modules: payload });
    });
  }

  terminate() {
    this.worker.terminate();
  }
}
