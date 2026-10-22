/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload stub */
/**
 * Plain-Node stand-in for the `server-only` / `client-only` marker packages.
 *
 * Next.js resolves them through the `react-server` export condition, but plain
 * Node resolves the throwing default build. Only the guard *policy* is under
 * test here, so the marker is mapped to an empty module.
 */
const Module = require("node:module");
const path = require("node:path");

const empty = path.join(__dirname, "empty-module.cjs");
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function resolveFilename(request, ...rest) {
  if (request === "server-only" || request === "client-only") return empty;
  return originalResolve.call(this, request, ...rest);
};
