import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

// Windows ships bsdtar (which reads zip) in System32. Name it explicitly so a
// GNU tar from Git Bash earlier on PATH is not picked up.
function tarCommand() {
  if (process.platform !== "win32") return "tar";
  return join(process.env.SystemRoot ?? "C:\Windows", "System32", "tar.exe");
}

export async function extractZip(archive, dest) {
  await run(tarCommand(), ["-xf", archive, "-C", dest]);
}
