import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { contract } from './contract-runtime.mjs'; /* augur-inject:import:c2ae6726 */
import augurContract_4a1be8ca from '../../contracts/check-archive-digest.contract.mjs'; /* augur-inject:contract-predicate:cf049883 */

export async function sha256File(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** Compares the archive digest with the pinned one. Never throws on mismatch; the caller decides. */
export async function checkArchiveDigest(file, expected) {
  const actual = await sha256File(file);
  return { matches: actual === expected, actual };
}
// @ts-expect-error augur-inject
checkArchiveDigest = contract(checkArchiveDigest, { ...augurContract_4a1be8ca, contractId: 'C-2', mode: 'observe', sample: 1, where: 'scripts/garnet/digest.mjs:11', rule: 'contract-wrap', id: '4a1be8ca' }); /* augur-inject:contract-wrap:4a1be8ca */
