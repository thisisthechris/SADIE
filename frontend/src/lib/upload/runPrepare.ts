import { prepareCsv, type PrepareResult, type ProgressFn } from "./prepare";

/** Run prepareCsv in a Web Worker when available, otherwise on the main thread. */
export function prepareInWorker(text: string, onProgress?: ProgressFn): Promise<PrepareResult> {
  if (typeof Worker === "undefined") return prepareCsv(text, onProgress);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./prepare.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      if (e.data.type === "progress") onProgress?.(e.data.done, e.data.total);
      else {
        resolve(e.data.result as PrepareResult);
        worker.terminate();
      }
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    worker.postMessage(text);
  });
}
