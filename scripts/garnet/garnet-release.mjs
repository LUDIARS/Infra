// Pinned Garnet release for the HQ shared cache.
// Bumping the version means updating all four values together after
// re-verifying the asset digest (see spec/feature/garnet-shared-cache.md).
export const GARNET_RELEASE = Object.freeze({
  version: "2.1.8",
  asset: "win-x64-based-readytorun.zip",
  url: "https://github.com/microsoft/garnet/releases/download/v2.1.8/win-x64-based-readytorun.zip",
  sha256: "b841c63ce12b2674ff5c5b64c76b1cba953c5c0e0738b96d031b66d498d2c933",
  // HQ has the .NET 8 runtime, so use the framework-dependent net8.0 build.
  executable: "net8.0/GarnetServer.exe",
});

/** Marker written after a verified extraction; its presence makes setup a no-op. */
export const INSTALL_MARKER = ".garnet-install.json";
