/// <reference lib="webworker" />
/**
 * Parses and hashes a CSV off the main thread so big exports don't freeze the
 * page. Receives the file's text, posts progress messages, then the result.
 */
import { prepareCsv } from "./prepare";

self.onmessage = async (e: MessageEvent<string>) => {
  const result = await prepareCsv(e.data, (done, total) => self.postMessage({ type: "progress", done, total }));
  self.postMessage({ type: "done", result });
};
