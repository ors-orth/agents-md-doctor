const path = require("node:path");
const { detectProject } = require("./detect");
const {
  generateAgentsMarkdown,
  generateCodexReviewPrompt,
  generateCodexReviewWorkflow,
} = require("./generate");
const { lintProject } = require("./lint");
const { writeFileIfAllowed } = require("./files");

const VERSION = require("../package.json").version;

async function main(argv) {
  const { command, options } = parseArgs(argv);
  const root = path.resolve(options.cwd || process.cwd());

  if (options.help || command === "help") {
    printHelp();
    return;
  }

  if (options.version) {
    console.log(VERSION);
    return;
  }

  if (command === "init") {
    const project = detectProject(root);
    const result = writeFileIfAllowed({
      root,
      relativePath: "AGENTS.md",
      content: generateAgentsMarkdown(project),
      force: options.force,
      dryRun: options.dryRun,
    });
    printWriteResult(result);
    printDetectedSummary(project);
    return;
  }

  if (command === "codex-review-setup") {
    const project = detectProject(root);
    const promptResult = writeFileIfAllowed({
      root,
      relativePath: ".github/codex/prompts/review.md",
      content: generateCodexReviewPrompt(project),
      force: options.force,
      dryRun: options.dryRun,
    });
    const workflowResult = writeFileIfAllowed({
      root,
      relativePath: ".github/workflows/codex-review.yml",
      content: generateCodexReviewWorkflow(),
      force: options.force,
      dryRun: options.dryRun,
    });
    printWriteResult(promptResult);
    printWriteResult(workflowResult);
    printDetectedSummary(project);
    return;
  }

  if (command === "lint") {
    const project = detectProject(root);
    const report = lintProject(project);
    printLintReport(report);
    process.exitCode = report.errors.length > 0 ? 1 : 0;
    return;
  }

  console.error(`Unknown command: ${command || "(none)"}`);
  printHelp();
  process.exitCode = 1;
}

function parseArgs(argv) {
  const options = {
    cwd: undefined,
    dryRun: false,
    force: false,
    help: false,
    version: false,
  };
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cwd") {
      options.cwd = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--cwd=")) {
      options.cwd = arg.slice("--cwd=".length);
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--force" || arg === "-f") {
      options.force = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else {
      positionals.push(arg);
    }
  }

  return {
    command: positionals[0] || "help",
    options,
  };
}

function printHelp() {
  console.log(`agents-md-doctor ${VERSION}

Generate and lint AI-agent repository instructions.

Usage:
  agents-md-doctor init [--force] [--dry-run] [--cwd <path>]
  agents-md-doctor lint [--cwd <path>]
  agents-md-doctor codex-review-setup [--force] [--dry-run] [--cwd <path>]

Commands:
  init                 Generate AGENTS.md from repository files.
  lint                 Check AGENTS.md and Codex review setup.
  codex-review-setup   Generate Codex PR review prompt and GitHub Actions workflow.

Options:
  --force, -f          Overwrite existing generated files.
  --dry-run            Print what would be written without changing files.
  --cwd <path>         Run against a different repository root.
  --help, -h           Show help.
  --version, -v        Show version.`);
}

function printWriteResult(result) {
  if (result.status === "written") {
    console.log(`created ${result.relativePath}`);
  } else if (result.status === "overwritten") {
    console.log(`updated ${result.relativePath}`);
  } else if (result.status === "skipped") {
    console.log(`skipped ${result.relativePath} (already exists; use --force to overwrite)`);
  } else if (result.status === "dry-run") {
    console.log(`would write ${result.relativePath}`);
    console.log(result.content);
  }
}

function printDetectedSummary(project) {
  const counts = Object.entries(project.commands)
    .map(([name, commands]) => `${name}:${commands.length}`)
    .join(" ");
  console.log(`detected ${project.files.length} project file(s); commands ${counts}`);
}

function printLintReport(report) {
  for (const issue of [...report.errors, ...report.warnings]) {
    const label = issue.severity.toUpperCase();
    const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
    console.log(`${label} ${location} ${issue.message}`);
  }

  if (report.errors.length === 0 && report.warnings.length === 0) {
    console.log("agents-md-doctor lint passed");
    return;
  }

  console.log(
    `agents-md-doctor lint found ${report.errors.length} error(s) and ${report.warnings.length} warning(s)`,
  );
}

module.exports = {
  main,
  parseArgs,
};

