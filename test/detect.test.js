const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { detectProject, parseMakeTargets } = require("../src/detect");

test("detects npm scripts from package.json", () => {
  const root = tempDir();
  writeJson(path.join(root, "package.json"), {
    scripts: {
      lint: "eslint .",
      test: "node --test",
      build: "tsc -p tsconfig.json",
    },
  });

  const project = detectProject(root);

  assert.deepEqual(project.commands.lint.map((entry) => entry.command), ["npm run lint"]);
  assert.deepEqual(project.commands.test.map((entry) => entry.command), ["npm run test"]);
  assert.deepEqual(project.commands.build.map((entry) => entry.command), ["npm run build"]);
});

test("detects make targets", () => {
  const targets = parseMakeTargets(`
.PHONY: lint test
lint:
\tnpm run lint
test:
\tnpm test
build: lint
\tnpm run build
`);

  assert.deepEqual([...targets].sort(), ["build", "lint", "test"]);
});

test("detects Python tools from pyproject.toml", () => {
  const root = tempDir();
  fs.writeFileSync(
    path.join(root, "pyproject.toml"),
    `
[project]
dependencies = ["pytest", "ruff", "mypy"]

[tool.ruff]
line-length = 100
`,
  );

  const project = detectProject(root);

  assert(project.commands.install.some((entry) => entry.command === "python -m pip install -e ."));
  assert(project.commands.test.some((entry) => entry.command === "python -m pytest"));
  assert(project.commands.lint.some((entry) => entry.command === "ruff check ."));
  assert(project.commands.lint.some((entry) => entry.command === "mypy ."));
});

test("detects Rust commands from Cargo.toml", () => {
  const root = tempDir();
  fs.writeFileSync(path.join(root, "Cargo.toml"), "[package]\nname = \"sample\"\nversion = \"0.1.0\"\n");

  const project = detectProject(root);

  assert(project.commands.test.some((entry) => entry.command === "cargo test"));
  assert(project.commands.build.some((entry) => entry.command === "cargo build"));
});

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agents-md-doctor-"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

