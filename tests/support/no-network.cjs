/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS preload tripwire */
/**
 * Preload tripwire: aborts the process if anything tries to reach a network
 * host. Used to prove that rejecting an unsafe test database never opens a
 * database connection.
 *
 * Unix-socket / pipe traffic is allowed through because the TypeScript loader
 * (tsx) talks to its own esbuild service over a local pipe; every *TCP* connect
 * and every DNS resolution aborts the process with exit code 3.
 */
const net = require("node:net");
const dns = require("node:dns");
const { syncBuiltinESMExports } = require("node:module");

function abort(what) {
  process.stderr.write(`NETWORK_ATTEMPT:${what}`);
  process.exit(3);
}

function isLocalPipeTarget(options) {
  // Some loaders/instrumentation call `connect` with an argument array.
  if (Array.isArray(options)) {
    return options.length > 0 && isLocalPipeTarget(options[0]);
  }
  if (typeof options === "string") return options.startsWith("/");
  if (options && typeof options === "object") {
    return typeof options.path === "string" && !("port" in options);
  }
  return false;
}

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function connect(options, ...rest) {
  if (!isLocalPipeTarget(options)) abort("socket.connect");
  return originalConnect.call(this, options, ...rest);
};

dns.lookup = function lookup() {
  abort("dns.lookup");
};
dns.promises.lookup = async function lookup() {
  abort("dns.promises.lookup");
};

syncBuiltinESMExports();
