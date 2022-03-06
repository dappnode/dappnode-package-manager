import path from "path";
import fs from "fs";

const CACHE_DIR = path.join(__dirname, "../../cache");

export function memoDisk<T extends (...args: any) => Promise<any>>(
  fn: T,
  opts: {
    toId: (...args: Parameters<T>) => string;
    ttlMs: number;
  }
): T {
  return async function (...args) {
    const cacheFilepath = path.join(
      CACHE_DIR,
      opts
        .toId(...args)
        // Ensure file path has no /
        .replace(/\//g, ":")
    );

    try {
      const stat = fs.statSync(cacheFilepath);

      if (Date.now() - stat.mtimeMs < opts.ttlMs) {
        return JSON.parse(fs.readFileSync(cacheFilepath, "utf8"));
      }
    } catch (e) {
      if ((e as {code: string}).code !== "ENOENT") {
        throw e;
      }
    }

    const res = await fn(...args);

    fs.writeFileSync(cacheFilepath, JSON.stringify(res, null, 2));

    return res;
  } as T;
}
