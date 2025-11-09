import LuaWorker from "@/workers/lua.worker.ts?worker";

export class LuaWorkerClient {
  private worker = new LuaWorker();

  constructor() {
    this.init()
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

  terminate() {
    this.worker.terminate();
  }
}
