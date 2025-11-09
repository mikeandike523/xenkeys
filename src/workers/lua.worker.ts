// Messages: init, cache, run
type InitMsg = {
  type: "init";
  loader: { baseUrl: string; packagePrefix?: string };
};
type CacheMsg = { type: "cache"; modules: Array<{ name: string; src: string }> };
type RunMsg = { type: "run"; code: string };
type Incoming = InitMsg | CacheMsg | RunMsg;

import { LuaFactory, LuaEngine } from "wasmoon";

let engine: LuaEngine | null = null;
let loaderBaseUrl = "/lua";
let loaderPrefix: string | null = null;

// Synchronous module cache (JS side)
const cachedModules = new Map<string, string>();

function post(msg: any) {
  (self as unknown as Worker).postMessage(msg);
}

self.addEventListener("message", async (evt: MessageEvent<Incoming>) => {
  const msg = evt.data as Incoming;
  try {
    switch (msg.type) {
      case "init": {
        loaderBaseUrl = msg.loader.baseUrl || "/lua";
        loaderPrefix = msg.loader.packagePrefix ?? null;

        const factory = new LuaFactory();
        engine = await factory.createEngine();

        // print(...) -> stdout
        engine.global.set("print", (...args: any[]) => {
          post({ type: "stdout", line: args.map(String).join("\t") });
        });

        // Expose a synchronous getter into our JS cache. No Promises, no await.
        engine.global.set("getCachedLuaSource", (name: string) => {
          if (loaderPrefix && !name.startsWith(loaderPrefix)) return null;
          return cachedModules.get(name) ?? null;
        });

        // Synchronous searcher backed by our JS cache
        await engine.doString(`
          local __BASE = ${JSON.stringify(loaderBaseUrl)}
          local __PREFIX = ${JSON.stringify(loaderPrefix)}

          local function cached_searcher(name)
            local src = getCachedLuaSource(name)
            if not src then
              if __PREFIX and #__PREFIX > 0 and (name:sub(1, #__PREFIX) ~= __PREFIX) then
                return ("not handled for prefix %q"):format(__PREFIX)
              end
              return ("no cached module %q under %s"):format(name, __BASE)
            end
            local chunk, err = load(src, '@'..name..'.lua')
            if not chunk then return err end
            return chunk
          end

          table.insert(package.searchers, 1, cached_searcher)
        `);

        post({ type: "ready" });
        break;
      }

      case "cache": {
        for (const { name, src } of msg.modules) cachedModules.set(name, src);
        post({ type: "cached", count: msg.modules.length });
        break;
      }

      case "run": {
        if (!engine) throw new Error("Engine not initialized");
        const result = await engine.doString(msg.code);
        post({ type: "result", result });
        break;
      }
    }
  } catch (err) {
    post({ type: "error", message: (err as Error)?.message ?? String(err) });
  }
});

export {};
