import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkArchiveDigest } from "./digest.mjs";
import { downloadFile } from "./download.mjs";
import { extractZip } from "./extract.mjs";
import { GARNET_RELEASE, INSTALL_MARKER } from "./garnet-release.mjs";
import { contract } from './contract-runtime.mjs'; /* augur-inject:import:12f56db5 */
import augurContract_8140768e from '../../contracts/ensure-garnet-installed.contract.mjs'; /* augur-inject:contract-predicate:9c52644e */

export function garnetInstallDir(root, version = GARNET_RELEASE.version) {
  return join(root, ".local", "garnet", version);
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
 * Idempotently installs the pinned Garnet release under <root>/.local/garnet/<version>/.
 * Download and extraction happen in a staging dir, so a failed or tampered
 * download never leaves a half-installed tree in the final location.
 */
export async function ensureGarnetInstalled({
  root,
  release = GARNET_RELEASE,
  download = downloadFile,
  extract = extractZip,
}) {
  const installDir = garnetInstallDir(root, release.version);
  const executable = join(installDir, release.executable);
  if (await isInstalled(installDir, release)) return { status: "skipped", executable };

  const parent = join(root, ".local", "garnet");
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
    if (!await exists(join(extracted, release.executable))) {
      throw new Error(`${release.executable} not found in ${release.asset}`);
    }
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
// @ts-expect-error augur-inject
ensureGarnetInstalled = contract(ensureGarnetInstalled, { ...augurContract_8140768e, contractId: 'C-1', mode: 'observe', sample: 1, where: 'scripts/garnet/install.mjs:37', rule: 'contract-wrap', id: '8140768e' }); /* augur-inject:contract-wrap:8140768e */
