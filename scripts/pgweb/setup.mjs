#!/usr/bin/env node
/**
 * pgweb (HQ Postgres viewer) setup: fetch the pinned release, verify its SHA-256,
 * and extract it to .local/pgweb/<version>/ together with the shipped bookmarks.
 * Safe to re-run; an existing verified install is left untouched (bookmarks are refreshed).
 * The binary is never committed. Starting pgweb is Excubitor's job (excubitor.catalog.yaml code: pgweb).
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensurePgwebInstalled } from "./install.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

try {
  const result = await ensurePgwebInstalled({ root });
  console.log(`[pgweb] ${result.status}: ${result.executable}`);
} catch (error) {
  console.error(`[pgweb] setup failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
