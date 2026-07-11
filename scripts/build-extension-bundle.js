const esbuild = require("esbuild");
const path = require("path");

async function main() {
  await esbuild.build({
    entryPoints: [path.resolve(__dirname, "..", "bundle-entry.js")],
    outfile: path.resolve(__dirname, "..", "dist", "extension.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: ["node20"],
    external: ["vscode"],
    logLevel: "info",
    sourcemap: false,
    minify: false,
    legalComments: "none",
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
