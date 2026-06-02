const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const binPath = path.resolve(__dirname, "..", "bin", "agents-md-doctor.js");

test("init generates AGENTS.md from package.json scripts", () => {
  const root = tempDir();
  writeJson(path.join(root, "package.json"), {
    scripts: {
      lint: "eslint .",
      test: "node --test",
      build: "tsc",
    },
  });

  const result = runCli(["init", "--cwd", root]);

  assert.equal(result.status, 0, result.stderr);
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /- Lint: `npm run lint`/);
  assert.match(agents, /- Test: `npm run test`/);
  assert.match(agents, /- Build: `npm run build`/);
});

test("codex-review-setup generates prompt and workflow", () => {
  const root = tempDir();
  writeJson(path.join(root, "package.json"), {
    scripts: {
      lint: "eslint .",
      test: "node --test",
    },
  });

  const result = runCli(["codex-review-setup", "--cwd", root]);

  assert.equal(result.status, 0, result.stderr);
  const prompt = fs.readFileSync(path.join(root, ".github", "codex", "prompts", "review.md"), "utf8");
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "codex-review.yml"), "utf8");

  assert.match(prompt, /lint: `npm run lint`/);
  assert.match(workflow, /openai\/codex-action@v1/);
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/github-script@v9/);
});

test("lint exits non-zero for a missing package script", () => {
  const root = tempDir();
  writeJson(path.join(root, "package.json"), {
    scripts: {
      test: "node --test",
    },
  });
  fs.writeFileSync(path.join(root, "AGENTS.md"), "- Lint: `npm run lint`\n");

  const result = runCli(["lint", "--cwd", root]);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /missing package\.json script `lint`/);
});

function runCli(args) {
  return spawnSync(process.execPath, [binPath, ...args], {
    encoding: "utf8",
  });
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agents-md-doctor-cli-"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

