#!/usr/bin/env node
// Tiny CLI invoked by MediaMTX runOn* commands (see mediamtx.yml).
//
// MediaMTX exposes path/query info via env vars (MTX_PATH, MTX_QUERY) when
// running runOn* hooks. Inlining `$MTX_PATH` in YAML works on POSIX shells
// but breaks on Windows cmd.exe (which uses %MTX_PATH%), so we read the env
// vars in Node and POST a normalized payload to media-server.mjs's local
// hook server.

import process from "node:process";

const HOOK_PORT = process.env.MEDIAMTX_HOOK_PORT ?? "9100";

const event = process.argv[2];
if (!event || !["ready", "notReady"].includes(event)) {
  console.error(`[mediamtx-hook] usage: ${process.argv[1]} <ready|notReady>`);
  process.exit(2);
}

const payload = {
  event,
  path: process.env.MTX_PATH ?? "",
  query: process.env.MTX_QUERY ?? "",
};

try {
  const res = await fetch(`http://127.0.0.1:${HOOK_PORT}/hook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error(`[mediamtx-hook] hook server rejected: HTTP ${res.status}`);
    process.exit(1);
  }
} catch (err) {
  console.error(`[mediamtx-hook] hook server unreachable: ${err.message}`);
  process.exit(1);
}
