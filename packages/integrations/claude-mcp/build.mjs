import {build} from "esbuild"

// Bundle the MCP server into a single Node-runnable ESM file.
// The createRequire banner lets bundled CommonJS deps (e.g. `ws`) use require()
// for Node built-ins inside an ESM output (avoids "Dynamic require not supported").
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/index.js",
  banner: {js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);"},
  logLevel: "info"
})
