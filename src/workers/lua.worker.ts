// ---------- Messaging Types ---------- //

// Keep only simple messages: init and run

type InitMsg = { type: "init" };
type RunMsg = { type: "run"; code: string };
type Incoming = InitMsg | RunMsg;

// ---------- Worker State ---------- //

import { LuaFactory, LuaEngine } from "wasmoon";
let engine: LuaEngine | null = null;

self.addEventListener("message", async (evt: MessageEvent<Incoming>) => {
  const msg = evt.data;
  try {
    switch (msg.type) {
      case "init": {
        // Create factory and engine once
        const factory = new LuaFactory();
        engine = await factory.createEngine();
        // redirect print(...) to stdout messages
        engine.global.set("print", (...args: any[]) => {
          (self as unknown as Worker).postMessage({
            type: "stdout",
            line: args.map(String).join("	"),
          });
        });
        (self as unknown as Worker).postMessage({ type: "ready" });
        break;
      }
      case "run": {
        if (!engine)
          throw new Error(
            'Engine not initialized. Send { type: "init" } first.'
          );
        const result = await engine.doString(msg.code);
        (self as unknown as Worker).postMessage({ type: "result", result });
        break;
      }
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: "error",
      message: (err as Error)?.message ?? String(err),
    });
  }
});

export {}; // Ensure this is a module for bundlers
