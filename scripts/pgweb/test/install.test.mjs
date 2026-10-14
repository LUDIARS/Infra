import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ensurePgwebInstalled, pgwebInstallDir } from "../install.mjs";
import { INSTALL_MARKER, PGWEB_RELEASE } from "../pgweb-release.mjs";

const ARCHIVE_BYTES = "fake pgweb zip";
const sha = (text) => createHash("sha256").update(text).digest("hex");

function fakeRelease(overrides = {}) {
  return { ...PGWEB_RELEASE, sha256: sha(ARCHIVE_BYTES), ...overrides };
}

function fakeDownload(calls) {
  return async (url, dest) => {
    calls.push(url);
    await writeFile(dest, ARCHIVE_BYTES);
  };
}

async function fakeExtract(_archive, dest) {
  await writeFile(join(dest, PGWEB_RELEASE.archiveEntry), "exe");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("ensurePgwebInstalled", () => {
  let root;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "pgweb-setup-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("downloads, verifies and renames the binary to pgweb.exe", async () => {
    const calls = [];
    const release = fakeRelease();
    const result = await ensurePgwebInstalled({ root, release, download: fakeDownload(calls), extract: fakeExtract });
    const installDir = pgwebInstallDir(root, release.version);
    assert.equal(result.status, "installed");
    assert.equal(result.executable, join(installDir, "pgweb.exe"));
    assert.deepEqual(calls, [release.url]);
    assert.ok(await exists(result.executable));
    assert.equal(await exists(join(installDir, release.archiveEntry)), false);
    const marker = JSON.parse(await readFile(join(installDir, INSTALL_MARKER), "utf8"));
    assert.equal(marker.sha256, release.sha256);
  });

  it("does nothing when the same version is already extracted", async () => {
    const release = fakeRelease();
    await ensurePgwebInstalled({ root, release, download: fakeDownload([]), extract: fakeExtract });
    const calls = [];
    const result = await ensurePgwebInstalled({ root, release, download: fakeDownload(calls), extract: fakeExtract });
    assert.equal(result.status, "skipped");
    assert.deepEqual(calls, []);
  });

  it("stops on a SHA-256 mismatch without extracting", async () => {
    const release = fakeRelease({ sha256: "0".repeat(64) });
    let extracted = false;
    await assert.rejects(
      ensurePgwebInstalled({
        root, release, download: fakeDownload([]),
        extract: async () => { extracted = true; },
      }),
      /SHA-256 mismatch/,
    );
    assert.equal(extracted, false);
    assert.equal(await exists(pgwebInstallDir(root, release.version)), false);
  });

  it("stops when the archive lacks the expected binary", async () => {
    const release = fakeRelease();
    await assert.rejects(
      ensurePgwebInstalled({ root, release, download: fakeDownload([]), extract: async () => {} }),
      /not found/,
    );
    assert.equal(await exists(pgwebInstallDir(root, release.version)), false);
  });
});

describe("PGWEB_RELEASE", () => {
  it("pins v0.17.0 and the measured digest", () => {
    assert.equal(PGWEB_RELEASE.version, "0.17.0");
    assert.match(PGWEB_RELEASE.url, /\/v0\.17\.0\/pgweb_windows_amd64\.zip$/);
    assert.equal(PGWEB_RELEASE.sha256,
      "7471bb79175549622f90877f5aec69c20ec014b3d4b3df288c1121f8775728bc");
  });
});

describe("catalog entry", () => {
  async function pgwebBlock() {
    const here = dirname(fileURLToPath(import.meta.url));
    const text = await readFile(join(here, "..", "..", "..", "excubitor.catalog.yaml"), "utf8");
    const start = text.indexOf("- code: pgweb");
    assert.ok(start >= 0, "catalog has the pgweb entry");
    const next = text.indexOf("\n  - code:", start + 1);
    return text.slice(start, next < 0 ? undefined : next);
  }

  it("stays read-only, loopback-only and without SSH", async () => {
    const block = await pgwebBlock();
    assert.match(block, /- --readonly$/m);
    assert.match(block, /- --bind=127\.0\.0\.1$/m);
    assert.match(block, /- --no-ssh$/m);
  });

  it("never carries the connection string; it comes from Vault (PGWEB_DATABASE_URL)", async () => {
    const block = await pgwebBlock();
    assert.doesNotMatch(block, /postgres(?:ql)?:\/\//i);
    assert.doesNotMatch(block, /--url\b/);
    assert.doesNotMatch(block, /--sessions\b/);
  });
});
