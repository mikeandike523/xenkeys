// ---------- Messaging Types ---------- //
//
// Messages: init, run, preload

type InitMsg = { type: "init" };
type RunMsg = { type: "run"; code: string };
type PreloadMsg = { type: "preload"; modules: Array<{ name: string; src: string }> };

type Incoming = InitMsg | RunMsg | PreloadMsg;

// ---------- Worker State ---------- //

import { LuaFactory, LuaEngine } from "wasmoon";
let engine: LuaEngine | null = null;

self.addEventListener("message", async (evt: MessageEvent<Incoming>) => {
  const msg = evt.data;
  try {
    switch (msg.type) {
      case "init": {
        const factory = new LuaFactory();
        engine = await factory.createEngine();

        // Hook print(...) -> stdout lines
        engine.global.set("print", (...args: any[]) => {
          (self as unknown as Worker).postMessage({
            type: "stdout",
            line: args.map(String).join("\t"),
          });
        });

        // Lua helper: install string-backed modules into package.preload
        await engine.doString(`
          function __install_string_module(name, src)
            package.preload[name] = function(...)
              local chunk, err = load(src, "@"..name..".lua")
              if not chunk then error(err, 2) end
              return chunk(...)
            end
          end
        `);

        (self as unknown as Worker).postMessage({ type: "ready" });
        break;
      }

      case "preload": {
        if (!engine) throw new Error('Engine not initialized. Send { type: "init" } first.');
        for (const { name, src } of msg.modules) {
          const lua = `
            __install_string_module(${JSON.stringify(name)}, ${JSON.stringify(src)})
          `;
          await engine.doString(lua);
        }
        (self as unknown as Worker).postMessage({ type: "preloaded", count: msg.modules.length });
        break;
      }

      case "run": {
        if (!engine) throw new Error('Engine not initialized. Send { type: "init" } first.');
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

export {};
