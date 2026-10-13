export default {
  pre: (options) => (typeof options?.root === "string" && options.root.length > 0)
    || "options.root is required",
  post: (result) => (["installed", "skipped"].includes(result?.status)
    && typeof result?.executable === "string"
    && /GarnetServer\.exe$/.test(result.executable))
    || "result is installed/skipped with the GarnetServer.exe path",
};
