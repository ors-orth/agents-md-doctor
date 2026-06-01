const path = require("node:path");
const {
  directoryExists,
  fileExists,
  listFilesRecursive,
  readJsonIfExists,
  readTextIfExists,
} = require("./files");

const COMMAND_KINDS = ["install", "lint", "test", "build"];

function detectProject(root) {
  const project = {
    root,
    files: [],
    packageJson: undefined,
    pyproject: undefined,
    cargoToml: undefined,
    makefile: undefined,
    workflows: [],
    commands: Object.fromEntries(COMMAND_KINDS.map((kind) => [kind, []])),
    scriptNames: new Set(),
    makeTargets: new Set(),
  };

  detectPackageJson(project);
  detectPyproject(project);
  detectCargo(project);
  detectMakefile(project);
  detectGithubActions(project);

  for (const kind of COMMAND_KINDS) {
    project.commands[kind] = dedupeCommands(project.commands[kind]).sort(compareCommands);
  }

  return project;
}

function detectPackageJson(project) {
  const filePath = path.join(project.root, "package.json");
  const packageJson = readJsonIfExists(filePath);
  if (!packageJson) {
    return;
  }

  project.files.push("package.json");
  project.packageJson = packageJson;

  const scripts = packageJson.scripts || {};
  for (const name of Object.keys(scripts)) {
    project.scriptNames.add(name);
  }

  const manager = detectNodePackageManager(project.root, packageJson);
  addCommand(project, "install", `${manager} install`, "package.json", "high", "Install Node.js dependencies.");

  addPackageScript(project, "lint", manager, scripts, ["lint", "typecheck", "format:check"]);
  addPackageScript(project, "test", manager, scripts, ["test", "test:ci", "test:unit"]);
  addPackageScript(project, "build", manager, scripts, ["build"]);
}

function detectNodePackageManager(root, packageJson) {
  if (typeof packageJson.packageManager === "string") {
    if (packageJson.packageManager.startsWith("pnpm@")) return "pnpm";
    if (packageJson.packageManager.startsWith("yarn@")) return "yarn";
    if (packageJson.packageManager.startsWith("bun@")) return "bun";
    if (packageJson.packageManager.startsWith("npm@")) return "npm";
  }
  if (fileExists(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fileExists(path.join(root, "yarn.lock"))) return "yarn";
  if (fileExists(path.join(root, "bun.lock")) || fileExists(path.join(root, "bun.lockb"))) return "bun";
  return "npm";
}

function addPackageScript(project, kind, manager, scripts, candidates) {
  for (const scriptName of candidates) {
    if (Object.prototype.hasOwnProperty.call(scripts, scriptName)) {
      const command = manager === "npm" ? `npm run ${scriptName}` : `${manager} run ${scriptName}`;
      addCommand(project, kind, command, `package.json:scripts.${scriptName}`, "high", scripts[scriptName]);
    }
  }
}

function detectPyproject(project) {
  const filePath = path.join(project.root, "pyproject.toml");
  const text = readTextIfExists(filePath);
  if (!text) {
    return;
  }

  project.files.push("pyproject.toml");
  project.pyproject = { text, runner: detectPythonRunner(project.root, text) };
  const runner = project.pyproject.runner;
  addCommand(project, "install", pythonInstallCommand(runner), "pyproject.toml", "medium", "Install Python dependencies.");

  if (hasPyTool(text, "pytest")) {
    addCommand(project, "test", pythonRunCommand(runner, "pytest"), "pyproject.toml", "medium", "pytest appears in pyproject.toml.");
  }

  if (hasPyTool(text, "ruff")) {
    addCommand(project, "lint", pythonRunCommand(runner, "ruff check ."), "pyproject.toml", "medium", "ruff appears in pyproject.toml.");
  }
  if (hasPyTool(text, "black")) {
    addCommand(project, "lint", pythonRunCommand(runner, "black --check ."), "pyproject.toml", "medium", "black appears in pyproject.toml.");
  }
  if (hasPyTool(text, "mypy")) {
    addCommand(project, "lint", pythonRunCommand(runner, "mypy ."), "pyproject.toml", "medium", "mypy appears in pyproject.toml.");
  }

  if (/\[build-system\]|\[project\]|\[tool\.poetry\]/.test(text)) {
    addCommand(project, "build", pythonBuildCommand(runner), "pyproject.toml", "low", "Python build metadata was found.");
  }
}

function detectPythonRunner(root, text) {
  if (fileExists(path.join(root, "uv.lock")) || /\[tool\.uv\]/.test(text)) return "uv";
  if (fileExists(path.join(root, "poetry.lock")) || /\[tool\.poetry\]/.test(text)) return "poetry";
  if (fileExists(path.join(root, "pdm.lock")) || /\[tool\.pdm\]/.test(text)) return "pdm";
  return "python";
}

function hasPyTool(text, tool) {
  const escaped = escapeRegExp(tool);
  return new RegExp(`\\[tool\\.${escaped}(\\.|\\])`, "i").test(text)
    || new RegExp(`["']${escaped}([<>=~! ].*)?["']`, "i").test(text)
    || new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function pythonInstallCommand(runner) {
  if (runner === "uv") return "uv sync";
  if (runner === "poetry") return "poetry install";
  if (runner === "pdm") return "pdm install";
  return "python -m pip install -e .";
}

function pythonRunCommand(runner, command) {
  if (runner === "uv") return `uv run ${command}`;
  if (runner === "poetry") return `poetry run ${command}`;
  if (runner === "pdm") return `pdm run ${command}`;
  return command.startsWith("pytest") ? "python -m pytest" : command;
}

function pythonBuildCommand(runner) {
  if (runner === "uv") return "uv build";
  if (runner === "poetry") return "poetry build";
  if (runner === "pdm") return "pdm build";
  return "python -m build";
}

function detectCargo(project) {
  const filePath = path.join(project.root, "Cargo.toml");
  const text = readTextIfExists(filePath);
  if (!text) {
    return;
  }

  project.files.push("Cargo.toml");
  project.cargoToml = { text };
  addCommand(project, "test", "cargo test", "Cargo.toml", "high", "Run Rust tests.");
  addCommand(project, "lint", "cargo fmt --all -- --check", "Cargo.toml", "medium", "Check Rust formatting.");
  addCommand(
    project,
    "lint",
    "cargo clippy --all-targets --all-features -- -D warnings",
    "Cargo.toml",
    "medium",
    "Run Rust clippy lints.",
  );
  addCommand(project, "build", "cargo build", "Cargo.toml", "high", "Build Rust package.");
}

function detectMakefile(project) {
  const name = ["Makefile", "makefile"].find((candidate) => fileExists(path.join(project.root, candidate)));
  if (!name) {
    return;
  }

  const text = readTextIfExists(path.join(project.root, name));
  project.files.push(name);
  project.makefile = { name, text };

  for (const target of parseMakeTargets(text)) {
    project.makeTargets.add(target);
  }

  addMakeCommand(project, "lint", ["lint", "check", "typecheck"]);
  addMakeCommand(project, "test", ["test", "test-ci", "test-all"]);
  addMakeCommand(project, "build", ["build"]);
}

function parseMakeTargets(text) {
  const targets = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*:(?!=)/);
    if (match && !match[1].includes(".")) {
      targets.add(match[1]);
    }
  }
  return targets;
}

function addMakeCommand(project, kind, candidates) {
  for (const target of candidates) {
    if (project.makeTargets.has(target)) {
      addCommand(project, kind, `make ${target}`, `${project.makefile.name}:${target}`, "high", "Make target exists.");
    }
  }
}

function detectGithubActions(project) {
  const workflowsDir = path.join(project.root, ".github", "workflows");
  if (!directoryExists(workflowsDir)) {
    return;
  }

  const workflowFiles = listFilesRecursive(workflowsDir, (filePath) => /\.(ya?ml)$/i.test(filePath));
  for (const filePath of workflowFiles) {
    const relativePath = path.relative(project.root, filePath).replaceAll(path.sep, "/");
    const text = readTextIfExists(filePath) || "";
    project.files.push(relativePath);
    project.workflows.push({
      path: relativePath,
      text,
      runCommands: extractWorkflowRunCommands(text),
    });
  }
}

function extractWorkflowRunCommands(text) {
  const commands = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const inline = line.match(/^\s*run:\s+(.+?)\s*$/);
    if (inline && !["|", ">"].includes(inline[1])) {
      commands.push(inline[1].trim());
      continue;
    }

    if (/^\s*run:\s*[|>]\s*$/.test(line)) {
      const indent = leadingSpaces(line);
      const block = [];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (lines[cursor].trim() === "") {
          block.push("");
          continue;
        }
        if (leadingSpaces(lines[cursor]) <= indent) {
          break;
        }
        block.push(lines[cursor].trim());
        index = cursor;
      }
      commands.push(...block.filter((entry) => entry && !entry.startsWith("#")));
    }
  }

  return commands;
}

function leadingSpaces(line) {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function addCommand(project, kind, command, source, confidence, reason) {
  project.commands[kind].push({ command, source, confidence, reason });
}

function dedupeCommands(commands) {
  const seen = new Set();
  const result = [];
  for (const command of commands) {
    if (seen.has(command.command)) {
      continue;
    }
    seen.add(command.command);
    result.push(command);
  }
  return result;
}

function compareCommands(a, b) {
  const rank = { high: 0, medium: 1, low: 2 };
  return rank[a.confidence] - rank[b.confidence] || a.command.localeCompare(b.command);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  COMMAND_KINDS,
  detectProject,
  detectNodePackageManager,
  parseMakeTargets,
};

