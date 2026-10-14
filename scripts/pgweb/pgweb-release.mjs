// Pinned pgweb release for the HQ Postgres viewer.
// Bumping the version means updating version / url / sha256 together after
// re-measuring the asset digest (see spec/feature/pgweb-hq-viewer.md).
export const PGWEB_RELEASE = Object.freeze({
  version: "0.17.0",
  asset: "pgweb_windows_amd64.zip",
  url: "https://github.com/sosedoff/pgweb/releases/download/v0.17.0/pgweb_windows_amd64.zip",
  sha256: "7471bb79175549622f90877f5aec69c20ec014b3d4b3df288c1121f8775728bc",
  // The zip holds a single binary without an extension; it is renamed to `executable`.
  archiveEntry: "pgweb_windows_amd64",
  executable: "pgweb.exe",
});

/** Marker written after a verified extraction; its presence makes setup a no-op. */
export const INSTALL_MARKER = ".pgweb-install.json";
