// Messages: run (with optional modules)
type RunMsg  = { type: "run"; code: string; modules?: Array<{ name: string; src: string }> };
type Incoming = RunMsg;

import { LuaFactory } from "wasmoon";

function post(msg: any) {
  (self as unknown as Worker).postMessage(msg);
}

self.addEventListener("message", async (evt: MessageEvent<Incoming>) => {
  const msg = evt.data;
  try {
    if (msg.type !== "run") return;

    // Create a brand new engine for this run
    const factory = new LuaFactory();
    const engine = await factory.createEngine();

    try {
      // print(...) -> stdout
      engine.global.set("print", (...args: any[]) => {
        post({ type: "stdout", line: args.map(String).join("\t") });
      });

      // Helper: install a string-backed module into package.preload
      await engine.doString(`
        function __install_string_module(name, src)
          package.preload[name] = function(...)
            local chunk, err = load(src, '@'..name..'.lua')
            if not chunk then error(err, 2) end
            return chunk(...)
          end
        end
      `);

      // If provided, register modules for this run
      if (msg.modules && msg.modules.length > 0) {
        for (const { name, src } of msg.modules) {
          await engine.doString(
            `__install_string_module(${JSON.stringify(name)}, ${JSON.stringify(src)})`
          );
        }
      }

      // Execute entry code
      const result = await engine.doString(msg.code);
      post({ type: "result", result });
    } finally {
      // Best-effort cleanup (optional chaining for wasmoon versions without close)
      // @ts-ignore
      await engine?.close?.();
    }
  } catch (err) {
    post({ type: "error", message: (err as Error)?.message ?? String(err) });
  }
});

export {};
