import { access, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkArchiveDigest } from "../garnet/digest.mjs";
import { downloadFile } from "../garnet/download.mjs";
import { extractZip } from "../garnet/extract.mjs";
import { BOOKMARKS_DIR, INSTALL_MARKER, PGWEB_RELEASE } from "./pgweb-release.mjs";

const SHIPPED_BOOKMARKS = join(dirname(fileURLToPath(import.meta.url)), BOOKMARKS_DIR);

export function pgwebInstallDir(root, version = PGWEB_RELEASE.version) {
  return join(root, ".local", "pgweb", version);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isInstalled(installDir, release) {
  try {
    const marker = JSON.parse(await readFile(join(installDir, INSTALL_MARKER), "utf8"));
    return marker.version === release.version
      && marker.sha256 === release.sha256
      && await exists(join(installDir, release.executable));
  } catch {
    return false;
  }
}

/** Bookmarks are config, not part of the verified binary: refresh them on every run. */
async function syncBookmarks(installDir, source) {
  const dest = join(installDir, BOOKMARKS_DIR);
  await rm(dest, { recursive: true, force: true });
  await cp(source, dest, { recursive: true });
}

/**
 * Idempotently installs the pinned pgweb release under <root>/.local/pgweb/<version>/.
 * Download and extraction happen in a staging dir, so a failed or tampered
 * download never leaves a half-installed tree in the final location.
 */
export async function ensurePgwebInstalled({
  root,
  release = PGWEB_RELEASE,
  bookmarks = SHIPPED_BOOKMARKS,
  download = downloadFile,
  extract = extractZip,
}) {
  const installDir = pgwebInstallDir(root, release.version);
  const executable = join(installDir, release.executable);
  if (await isInstalled(installDir, release)) {
    await syncBookmarks(installDir, bookmarks);
    return { status: "skipped", executable };
  }

  const parent = join(root, ".local", "pgweb");
  await mkdir(parent, { recursive: true });
  const stage = await mkdtemp(join(parent, `.stage-${release.version}-`));
  try {
    const archive = join(stage, release.asset);
    await download(release.url, archive);
    const digest = await checkArchiveDigest(archive, release.sha256);
    if (!digest.matches) {
      throw new Error(
        `SHA-256 mismatch for ${release.asset}: expected ${release.sha256}, got ${digest.actual}`,
      );
    }
    const extracted = join(stage, "extracted");
    await mkdir(extracted);
    await extract(archive, extracted);
    const entry = join(extracted, release.archiveEntry);
    if (!await exists(entry)) throw new Error(`${release.archiveEntry} not found in ${release.asset}`);
    // Windows only runs it reliably with an .exe name; Excubitor matches the process by it too.
    await rename(entry, join(extracted, release.executable));
    // A tree without a valid marker is an interrupted install of ours; replace it.
    await rm(installDir, { recursive: true, force: true });
    await rename(extracted, installDir);
    await writeFile(join(installDir, INSTALL_MARKER), `${JSON.stringify({
      version: release.version,
      asset: release.asset,
      sha256: release.sha256,
      installedAt: new Date().toISOString(),
    }, null, 2)}\n`, "utf8");
    await syncBookmarks(installDir, bookmarks);
    return { status: "installed", executable };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
