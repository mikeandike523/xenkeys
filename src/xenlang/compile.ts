import { parse } from 'yaml'

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


export default function compile(
  source: string,
  { onLog, onError }: CompileOptions
) {
  onLog("Beginning compilation...");

  source = source.replace(/\r\n/g, "\n")

  try {
    const data = parse(source)
    onLog(JSON.stringify(data, null, 2))
  } catch (error) {
    onError(`Compilation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    return;
  }
}