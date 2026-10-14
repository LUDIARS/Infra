import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ensurePgwebInstalled, pgwebInstallDir } from "../install.mjs";
import { BOOKMARKS_DIR, INSTALL_MARKER, PGWEB_RELEASE } from "../pgweb-release.mjs";

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
  let bookmarks;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "pgweb-setup-"));
    bookmarks = join(root, "shipped-bookmarks");
    await mkdir(bookmarks);
    await writeFile(join(bookmarks, "shared.toml"), "host = \"127.0.0.1\"\n");
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it("downloads, verifies, renames to pgweb.exe and places the bookmarks", async () => {
    const calls = [];
    const release = fakeRelease();
    const result = await ensurePgwebInstalled({
      root, release, bookmarks, download: fakeDownload(calls), extract: fakeExtract,
    });
    const installDir = pgwebInstallDir(root, release.version);
    assert.equal(result.status, "installed");
    assert.equal(result.executable, join(installDir, "pgweb.exe"));
    assert.deepEqual(calls, [release.url]);
    assert.ok(await exists(result.executable));
    assert.equal(await exists(join(installDir, release.archiveEntry)), false);
    assert.ok(await exists(join(installDir, BOOKMARKS_DIR, "shared.toml")));
    const marker = JSON.parse(await readFile(join(installDir, INSTALL_MARKER), "utf8"));
    assert.equal(marker.sha256, release.sha256);
  });

  it("skips the download when installed, but refreshes the bookmarks", async () => {
    const release = fakeRelease();
    await ensurePgwebInstalled({ root, release, bookmarks, download: fakeDownload([]), extract: fakeExtract });
    await writeFile(join(bookmarks, "shared.toml"), "host = \"changed\"\n");
    const calls = [];
    const result = await ensurePgwebInstalled({
      root, release, bookmarks, download: fakeDownload(calls), extract: fakeExtract,
    });
    assert.equal(result.status, "skipped");
    assert.deepEqual(calls, []);
    const copied = await readFile(join(pgwebInstallDir(root, release.version), BOOKMARKS_DIR, "shared.toml"), "utf8");
    assert.match(copied, /changed/);
  });

  it("stops on a SHA-256 mismatch without extracting", async () => {
    const release = fakeRelease({ sha256: "0".repeat(64) });
    let extracted = false;
    await assert.rejects(
      ensurePgwebInstalled({
        root, release, bookmarks, download: fakeDownload([]),
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
      ensurePgwebInstalled({ root, release, bookmarks, download: fakeDownload([]), extract: async () => {} }),
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

describe("shipped bookmark", () => {
  it("points at the tunnel, is read-only and carries no password", async () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const text = await readFile(join(here, "..", BOOKMARKS_DIR, "shared-postgres.toml"), "utf8");
    assert.match(text, /^host = "127\.0\.0\.1"$/m);
    assert.match(text, /^port = 5432$/m);
    assert.match(text, /^readonly = true$/m);
    assert.doesNotMatch(text, /^password\s*=/im);
  });
});
