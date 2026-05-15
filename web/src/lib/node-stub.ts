// Stub for Node.js modules that are not available in the browser.
// The SDK imports node:child_process, node:util, and node:crypto
// which are Node-only. This stub prevents Vite/Rollup build failures.
// At runtime, browser-native crypto.getRandomValues is used instead.

export const execFile = () => {
  throw new Error("node:child_process is not available in the browser");
};
export const promisify = (fn: unknown) => fn;
export function randomBytes(size: number): Uint8Array {
  const buf = new Uint8Array(size);
  crypto.getRandomValues(buf);
  return buf;
}
export function createHash() {
  throw new Error("node:crypto createHash is not available in the browser");
}
export default {};
