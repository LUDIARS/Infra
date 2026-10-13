import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { checkArchiveDigest } from "../digest.mjs";
import { GARNET_RELEASE, INSTALL_MARKER } from "../garnet-release.mjs";
import { ensureGarnetInstalled, garnetInstallDir } from "../install.mjs";

const ARCHIVE_BYTES = "fake garnet zip";
const sha = (text) => createHash("sha256").update(text).digest("hex");

function fakeRelease(overrides = {}) {
  return { ...GARNET_RELEASE, sha256: sha(ARCHIVE_BYTES), ...overrides };
}

function fakeDownload(calls) {
  return async (url, dest) => {
    calls.push(url);
    await writeFile(dest, ARCHIVE_BYTES);
  };
}

async function fakeExtract(_archive, dest) {
  await mkdir(join(dest, "net8.0"), { recursive: true });
  await writeFile(join(dest, "net8.0", "GarnetServer.exe"), "exe");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("ensureGarnetInstalled", () => {
  let root;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "garnet-setup-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("downloads, verifies and extracts into .local/garnet/<version>", async () => {
    const calls = [];
    const release = fakeRelease();
    const result = await ensureGarnetInstalled({
      root, release, download: fakeDownload(calls), extract: fakeExtract,
    });
    const installDir = garnetInstallDir(root, release.version);
    assert.equal(result.status, "installed");
    assert.equal(result.executable, join(installDir, "net8.0", "GarnetServer.exe"));
    assert.deepEqual(calls, [release.url]);
    assert.ok(await exists(result.executable));
    const marker = JSON.parse(await readFile(join(installDir, INSTALL_MARKER), "utf8"));
    assert.equal(marker.sha256, release.sha256);
  });

  it("does nothing when the same version is already extracted", async () => {
    const release = fakeRelease();
    await ensureGarnetInstalled({ root, release, download: fakeDownload([]), extract: fakeExtract });
    const calls = [];
    const result = await ensureGarnetInstalled({
      root, release, download: fakeDownload(calls), extract: fakeExtract,
    });
    assert.equal(result.status, "skipped");
    assert.deepEqual(calls, []);
  });

  it("stops on a SHA-256 mismatch without extracting", async () => {
    const release = fakeRelease({ sha256: "0".repeat(64) });
    let extracted = false;
    await assert.rejects(
      ensureGarnetInstalled({
        root, release, download: fakeDownload([]),
        extract: async () => { extracted = true; },
      }),
      /SHA-256 mismatch/,
    );
    assert.equal(extracted, false);
    assert.equal(await exists(garnetInstallDir(root, release.version)), false);
  });

  it("re-installs over a tree left without a marker", async () => {
    const release = fakeRelease();
    const installDir = garnetInstallDir(root, release.version);
    await mkdir(installDir, { recursive: true });
    await writeFile(join(installDir, "partial"), "x");
    const result = await ensureGarnetInstalled({
      root, release, download: fakeDownload([]), extract: fakeExtract,
    });
    assert.equal(result.status, "installed");
    assert.equal(await exists(join(installDir, "partial")), false);
  });
});

describe("checkArchiveDigest", () => {
  it("reports matches only for the pinned digest", async () => {
    const dir = await mkdtemp(join(tmpdir(), "garnet-digest-"));
    try {
      const file = join(dir, "a.zip");
      await writeFile(file, ARCHIVE_BYTES);
      assert.deepEqual(await checkArchiveDigest(file, sha(ARCHIVE_BYTES)),
        { matches: true, actual: sha(ARCHIVE_BYTES) });
      assert.equal((await checkArchiveDigest(file, "f".repeat(64))).matches, false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("GARNET_RELEASE", () => {
  it("pins v2.1.8 and the measured digest", () => {
    assert.equal(GARNET_RELEASE.version, "2.1.8");
    assert.match(GARNET_RELEASE.url, /\/v2\.1\.8\/win-x64-based-readytorun\.zip$/);
    assert.equal(GARNET_RELEASE.sha256,
      "b841c63ce12b2674ff5c5b64c76b1cba953c5c0e0738b96d031b66d498d2c933");
  });
});
