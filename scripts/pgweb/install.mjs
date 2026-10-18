import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkArchiveDigest } from "../garnet/digest.mjs";
import { downloadFile } from "../garnet/download.mjs";
import { extractZip } from "../garnet/extract.mjs";
import { INSTALL_MARKER, PGWEB_RELEASE } from "./pgweb-release.mjs";

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

/**
 * Idempotently installs the pinned pgweb release under <root>/.local/pgweb/<version>/.
 * Download and extraction happen in a staging dir, so a failed or tampered
 * download never leaves a half-installed tree in the final location.
 * No connection info is configured or persisted here: the viewer enters it on pgweb's form each time.
 */
export async function ensurePgwebInstalled({
  root,
  release = PGWEB_RELEASE,
  download = downloadFile,
  extract = extractZip,
}) {
  const installDir = pgwebInstallDir(root, release.version);
  const executable = join(installDir, release.executable);
  if (await isInstalled(installDir, release)) return { status: "skipped", executable };

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
    return { status: "installed", executable };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
