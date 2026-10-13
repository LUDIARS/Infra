#!/usr/bin/env node
/**
 * Garnet (HQ shared cache) setup: fetch the pinned release, verify its SHA-256,
 * and extract it to .local/garnet/<version>/. Safe to re-run; an existing
 * verified install is left untouched. The binary is never committed.
 * Starting Garnet is Excubitor's job (excubitor.catalog.yaml code: garnet).
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureGarnetInstalled } from "./install.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

try {
  const result = await ensureGarnetInstalled({ root });
  console.log(`[garnet] ${result.status}: ${result.executable}`);
} catch (error) {
  console.error(`[garnet] setup failed: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}
