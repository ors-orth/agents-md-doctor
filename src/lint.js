const path = require("node:path");
const { fileExists, readTextIfExists } = require("./files");

const COMMAND_PATTERN = /`([^`\n]+)`/g;
const VAGUE_PATTERNS = [
  /as needed/i,
  /best effort/i,
  /do the right thing/i,
  /etc\./i,
  /if necessary/i,
  /make it good/i,
  /properly/i,
  /適宜/,
  /必要に応じて/,
  /いい感じ/,
  /ちゃんと/,
  /よしなに/,
  /適切に/,
];

function lintProject(project) {
  const errors = [];
  const warnings = [];

  lintAgentsMarkdown(project, errors, warnings);
  lintCodexPrompt(project, errors, warnings);
  lintWorkflows(project, errors, warnings);

  return { errors, warnings };
}

function lintAgentsMarkdown(project, errors, warnings) {
  const relativePath = "AGENTS.md";
  const filePath = path.join(project.root, relativePath);
  const text = readTextIfExists(filePath);

  if (!text) {
    warnings.push(issue("warning", relativePath, undefined, "`AGENTS.md` was not found. Run `agents-md-doctor init`."));
    return;
  }

  lintVagueLanguage(relativePath, text, warnings);
  lintCommands(project, relativePath, text, errors, warnings);
}

function lintCodexPrompt(project, errors, warnings) {
  const relativePath = ".github/codex/prompts/review.md";
  const text = readTextIfExists(path.join(project.root, relativePath));
  if (!text) {
    return;
  }

  lintVagueLanguage(relativePath, text, warnings);
  lintCommands(project, relativePath, text, errors, warnings);

  const risky = [
    /push commits?/i,
    /git push/i,
    /apply patches?/i,
    /modify files?/i,
    /fix .* automatically/i,
  ];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (risky.some((pattern) => pattern.test(line)) && !/do not|don't/i.test(line)) {
      warnings.push(
        issue(
          "warning",
          relativePath,
          index + 1,
          "Review prompt appears to allow automatic changes. Keep Codex review read-only unless explicitly intended.",
        ),
      );
    }
  });
}

function lintWorkflows(project, errors, warnings) {
  for (const workflow of project.workflows) {
    const text = workflow.text;
    const isCodexWorkflow = /openai\/codex-action@/.test(text) || /codex/i.test(workflow.path);
    const usesOpenAiSecret = /secrets\.OPENAI_API_KEY|openai-api-key:/.test(text);

    if (/pull_request_target\s*:/.test(text) && (isCodexWorkflow || usesOpenAiSecret)) {
      errors.push(
        issue(
          "error",
          workflow.path,
          findLine(text, /pull_request_target\s*:/),
          "`pull_request_target` with Codex or OpenAI secrets can expose secrets to untrusted PR code. Use `pull_request` unless you have a hardened design.",
        ),
      );
    }

    if (/sandbox:\s*danger-full-access/.test(text)) {
      errors.push(
        issue(
          "error",
          workflow.path,
          findLine(text, /sandbox:\s*danger-full-access/),
          "Codex workflow uses `sandbox: danger-full-access`. Use `read-only` for review workflows.",
        ),
      );
    }

    if (/safety-strategy:\s*unsafe/.test(text)) {
      errors.push(
        issue(
          "error",
          workflow.path,
          findLine(text, /safety-strategy:\s*unsafe/),
          "Codex workflow uses `safety-strategy: unsafe`. Keep `drop-sudo` or an unprivileged user on hosted runners.",
        ),
      );
    }

    if (isCodexWorkflow && /contents:\s*write/.test(text)) {
      warnings.push(
        issue(
          "warning",
          workflow.path,
          findLine(text, /contents:\s*write/),
          "Codex review workflow has `contents: write`. Review jobs should not need repository write access.",
        ),
      );
    }

    if (isCodexWorkflow && /\bgit push\b/.test(text)) {
      errors.push(
        issue(
          "error",
          workflow.path,
          findLine(text, /\bgit push\b/),
          "Codex review workflow pushes changes automatically. Keep review workflows read-only.",
        ),
      );
    }
  }
}

function lintVagueLanguage(relativePath, text, warnings) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (VAGUE_PATTERNS.some((pattern) => pattern.test(line))) {
      warnings.push(
        issue(
          "warning",
          relativePath,
          index + 1,
          "Instruction may be too vague. Prefer concrete commands, files, or pass/fail criteria.",
        ),
      );
    }
  });
}

function lintCommands(project, relativePath, text, errors, warnings) {
  for (const command of extractInlineCommands(text)) {
    const problem = validateCommand(project, command);
    if (!problem) {
      continue;
    }
    const target = problem.severity === "error" ? errors : warnings;
    target.push(issue(problem.severity, relativePath, findLine(text, new RegExp(escapeRegExp(`\`${command}\``))), problem.message));
  }
}

function extractInlineCommands(text) {
  const commands = new Set();
  let match;
  while ((match = COMMAND_PATTERN.exec(text)) !== null) {
    const command = match[1].trim();
    if (looksLikeCommand(command)) {
      commands.add(command);
    }
  }
  return [...commands];
}

function looksLikeCommand(command) {
  return /^(npm|pnpm|yarn|bun|make|cargo|python|pytest|ruff|black|mypy|uv|poetry|pdm|npx)\b/.test(command);
}

function validateCommand(project, command) {
  const parts = command.split(/\s+/);
  const first = parts[0];

  if (["npm", "pnpm", "yarn", "bun"].includes(first)) {
    return validateNodeCommand(project, first, parts, command);
  }

  if (first === "make") {
    const target = parts[1];
    if (target && project.makeTargets.size > 0 && !project.makeTargets.has(target)) {
      return {
        severity: "error",
        message: `Command \`${command}\` refers to missing Make target \`${target}\`.`,
      };
    }
    if (target && project.makeTargets.size === 0 && !fileExists(path.join(project.root, "Makefile"))) {
      return {
        severity: "warning",
        message: `Command \`${command}\` uses make, but no Makefile was detected.`,
      };
    }
  }

  if (first === "cargo" && !project.cargoToml) {
    return {
      severity: "warning",
      message: `Command \`${command}\` uses Cargo, but no Cargo.toml was detected.`,
    };
  }

  if (["pytest", "ruff", "black", "mypy", "uv", "poetry", "pdm"].includes(first) && !project.pyproject) {
    return {
      severity: "warning",
      message: `Command \`${command}\` looks like a Python command, but no pyproject.toml was detected.`,
    };
  }

  if (first === "python" && parts[1] === "-m" && ["pytest", "build"].includes(parts[2]) && !project.pyproject) {
    return {
      severity: "warning",
      message: `Command \`${command}\` looks like a Python project command, but no pyproject.toml was detected.`,
    };
  }

  return undefined;
}

function validateNodeCommand(project, manager, parts, command) {
  if (!project.packageJson) {
    return {
      severity: "warning",
      message: `Command \`${command}\` uses ${manager}, but no package.json was detected.`,
    };
  }

  const scripts = project.packageJson.scripts || {};
  let scriptName;

  if (parts[1] === "run") {
    scriptName = parts[2];
  } else if (manager === "npm" && ["test", "start", "stop", "restart"].includes(parts[1])) {
    scriptName = parts[1];
  } else if (["pnpm", "yarn", "bun"].includes(manager) && parts[1] && !["install", "add", "remove"].includes(parts[1])) {
    scriptName = parts[1];
  }

  if (scriptName && !Object.prototype.hasOwnProperty.call(scripts, scriptName)) {
    return {
      severity: "error",
      message: `Command \`${command}\` refers to missing package.json script \`${scriptName}\`.`,
    };
  }

  return undefined;
}

function issue(severity, file, line, message) {
  return { severity, file, line, message };
}

function findLine(text, pattern) {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => pattern.test(line));
  return index === -1 ? undefined : index + 1;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  extractInlineCommands,
  lintProject,
  validateCommand,
};

