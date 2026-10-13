export default {
  pre: (file, expected) => (typeof file === "string" && /^[0-9a-f]{64}$/.test(expected ?? ""))
    || "file path and a lowercase 64-hex expected digest are required",
  post: (result, _file, expected) => (typeof result?.matches === "boolean"
    && /^[0-9a-f]{64}$/.test(result?.actual ?? "")
    && result.matches === (result.actual === expected))
    || "matches is true exactly when the actual digest equals the pinned one",
};
