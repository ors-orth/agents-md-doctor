const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { listFilesRecursive } = require("../src/files");

const root = path.resolve(__dirname, "..");
const files = [
  ...listFilesRecursive(path.join(root, "bin"), (filePath) => filePath.endsWith(".js")),
  ...listFilesRecursive(path.join(root, "src"), (filePath) => filePath.endsWith(".js")),
  ...listFilesRecursive(path.join(root, "scripts"), (filePath) => filePath.endsWith(".js")),
  ...listFilesRecursive(path.join(root, "test"), (filePath) => filePath.endsWith(".js")),
];

let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr || result.stdout);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`checked ${files.length} JavaScript file(s)`);
}

