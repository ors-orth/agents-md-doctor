const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { detectProject } = require("../src/detect");
const { lintProject } = require("../src/lint");

test("reports missing package scripts referenced by AGENTS.md", () => {
  const root = tempDir();
  writeJson(path.join(root, "package.json"), {
    scripts: {
      test: "node --test",
    },
  });
  fs.writeFileSync(path.join(root, "AGENTS.md"), "- Lint: `npm run lint`\n");

  const report = lintProject(detectProject(root));

  assert.equal(report.errors.length, 1);
  assert.match(report.errors[0].message, /missing package\.json script `lint`/);
});

test("warns on vague instructions", () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "AGENTS.md"), "- 必要に応じてテストしてください。\n");

  const report = lintProject(detectProject(root));

  assert.equal(report.warnings.length, 1);
  assert.match(report.warnings[0].message, /too vague/);
});

test("reports dangerous Codex workflow settings", () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, ".github", "workflows"), { recursive: true });
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# AGENTS.md\n");
  fs.writeFileSync(
    path.join(root, ".github", "workflows", "codex.yml"),
    `
on:
  pull_request_target:
jobs:
  review:
    permissions:
      contents: write
    steps:
      - uses: openai/codex-action@v1
        with:
          openai-api-key: \${{ secrets.OPENAI_API_KEY }}
          sandbox: danger-full-access
          safety-strategy: unsafe
      - run: git push
`,
  );

  const report = lintProject(detectProject(root));

  assert(report.errors.some((entry) => entry.message.includes("pull_request_target")));
  assert(report.errors.some((entry) => entry.message.includes("danger-full-access")));
  assert(report.errors.some((entry) => entry.message.includes("safety-strategy: unsafe")));
  assert(report.errors.some((entry) => entry.message.includes("pushes changes automatically")));
  assert(report.warnings.some((entry) => entry.message.includes("contents: write")));
});

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agents-md-doctor-"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

