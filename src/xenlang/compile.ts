import type { LuaWorkerClient } from "@/utils/LuaWorkerClient";

export type OnLogHandler = (message: string) => void;
export type OnWarningHandler = (message: string) => void;
export type OnErrorHandler = (message: string) => void;
export type OnInfoHandler = (message: string) => void;

export interface CompileOptions {
  onLog: OnLogHandler;
  onWarning: OnWarningHandler;
  onError: OnErrorHandler;
  onInfo: OnInfoHandler;
}


export default async function compile(
  luaWorkerClient: LuaWorkerClient,
  source: string,
  { onLog, onError }: CompileOptions
) {

  source = source.replace(/\r\n/g, "\n")

  try {
    
    // Run lua code
    // Lua code should return a fairly large object with tracks and events
    // Play and pause button will be separate


    onLog("Beginning compilation...");

    const result = await luaWorkerClient.run(source)

    onLog("Compilation successful!");

    return result;

  } catch (error) {
    onError(`Compilation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    return;
  }
}