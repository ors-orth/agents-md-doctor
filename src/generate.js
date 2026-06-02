const { COMMAND_KINDS } = require("./detect");

function generateAgentsMarkdown(project) {
  const lines = [
    "# AGENTS.md",
    "",
    "## Project Overview",
    "",
    "- This repository uses `AGENTS.md` to give AI coding agents durable project instructions.",
    "- Keep this file synchronized with the actual build, lint, test, and review workflow.",
    "- Prefer concrete commands over broad guidance so agents can verify their work.",
    "",
    "## Repository Layout",
    "",
    ...repositoryLayoutLines(project),
    "",
    "## Setup",
    "",
    ...commandLines(project.commands.install, "- Install dependencies"),
    "",
    "## Build, Test, and Lint",
    "",
    "Run the commands that match the files you changed before opening a pull request.",
    "",
    ...commandSection("Lint", project.commands.lint),
    "",
    ...commandSection("Test", project.commands.test),
    "",
    ...commandSection("Build", project.commands.build),
    "",
    "## Review Guidelines",
    "",
    "- Review for correctness, security regressions, broken public APIs, data loss, and CI failures.",
    "- Treat missing validation for changed behavior as a review issue.",
    "- Treat failing or missing required commands from this file as a P1 issue unless the PR explains why they could not be run.",
    "- Keep review comments focused on actionable P0/P1 problems.",
    "",
    "## Agent Working Rules",
    "",
    "- Read the relevant files before editing.",
    "- Keep changes focused on the requested task.",
    "- Do not add production dependencies unless the change requires them.",
    "- Update documentation when user-facing behavior or commands change.",
    "- Do not commit secrets, tokens, local environment files, or generated dependency directories.",
    "",
    "## Completion Criteria",
    "",
    "- Relevant lint, test, and build commands pass, or the final response explains why they were not run.",
    "- Generated GitHub Actions or Codex prompt changes are reviewed for secret exposure and unsafe write permissions.",
    "- `AGENTS.md` remains concrete: commands should refer to scripts, Make targets, or tooling that exists in this repository.",
    "",
  ];

  return `${lines.join("\n")}`;
}

function repositoryLayoutLines(project) {
  const lines = [];
  if (project.packageJson) {
    lines.push("- `package.json` - Node.js package metadata, CLI entrypoints, and npm scripts.");
  }
  if (project.pyproject) {
    lines.push("- `pyproject.toml` - Python project metadata and tool configuration.");
  }
  if (project.cargoToml) {
    lines.push("- `Cargo.toml` - Rust package metadata.");
  }
  if (project.makefile) {
    lines.push(`- \`${project.makefile.name}\` - Make targets for local development tasks.`);
  }
  if (project.workflows.length > 0) {
    lines.push("- `.github/workflows/` - GitHub Actions workflows.");
  }
  if (lines.length === 0) {
    lines.push("- Add project layout notes here as the repository structure takes shape.");
  }
  return lines;
}

function commandSection(title, commands) {
  if (commands.length === 0) {
    return [`### ${title}`, "", "- No command was detected yet. Add one when the project defines it."];
  }

  return [`### ${title}`, "", ...commandLines(commands, `- ${title}`)];
}

function commandLines(commands, label) {
  if (commands.length === 0) {
    return [`${label}: no command detected yet.`];
  }
  return commands.map((entry) => {
    const suffix = entry.confidence === "high" ? "" : ` (${entry.confidence} confidence, from ${entry.source})`;
    return `${label}: \`${entry.command}\`${suffix}`;
  });
}

function generateCodexReviewPrompt(project) {
  const commands = COMMAND_KINDS
    .filter((kind) => kind !== "install")
    .flatMap((kind) => project.commands[kind].map((entry) => `- ${kind}: \`${entry.command}\``));
  const commandBlock = commands.length > 0
    ? commands.join("\n")
    : "- No concrete validation commands were detected. Read the repo files before recommending commands.";

  return `# Codex Pull Request Review

You are reviewing a GitHub pull request for this repository.

Before reviewing:

- Read \`AGENTS.md\` and follow its Review Guidelines.
- Inspect the pull request diff against the base branch. If \`PR_BASE_REF\` is set, use \`origin/$PR_BASE_REF...HEAD\`.
- Prefer high-signal findings over style comments.

Focus on P0/P1 issues:

- Correctness bugs and broken behavior.
- Security regressions, secret exposure, unsafe permissions, and prompt injection risk.
- Data loss, migration, compatibility, or release risks.
- Missing tests for changed behavior.
- CI failures or validation commands that no longer match the repository.

Repository validation commands detected by agents-md-doctor:

${commandBlock}

Output rules:

- Start with the most severe findings.
- Include file and line references when possible.
- If no serious issues are found, say that clearly and mention any residual test risk.
- Do not modify files, push commits, or perform automatic fixes during review.
`;
}

function generateCodexReviewWorkflow() {
  return `name: Codex PR review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

concurrency:
  group: codex-review-\${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  check_secret:
    runs-on: ubuntu-latest
    outputs:
      has_openai_api_key: \${{ steps.check.outputs.has_openai_api_key }}
    steps:
      - name: Check OpenAI API key secret
        id: check
        env:
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
        run: |
          if [ -n "$OPENAI_API_KEY" ]; then
            echo "has_openai_api_key=true" >> "$GITHUB_OUTPUT"
          else
            echo "has_openai_api_key=false" >> "$GITHUB_OUTPUT"
          fi

  codex:
    needs: check_secret
    if: github.event.pull_request.draft == false && github.event.pull_request.head.repo.full_name == github.repository && github.actor != 'dependabot[bot]' && needs.check_secret.outputs.has_openai_api_key == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
    outputs:
      final_message: \${{ steps.run_codex.outputs.final-message }}
    steps:
      - uses: actions/checkout@v6
        with:
          ref: refs/pull/\${{ github.event.pull_request.number }}/merge
          persist-credentials: false

      - name: Pre-fetch base and head refs
        env:
          PR_BASE_REF: \${{ github.event.pull_request.base.ref }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
        run: |
          git fetch --no-tags origin \\
            "$PR_BASE_REF" \\
            "+refs/pull/$PR_NUMBER/head"

      - name: Run Codex review
        id: run_codex
        uses: openai/codex-action@v1
        env:
          PR_BASE_REF: \${{ github.event.pull_request.base.ref }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
        with:
          openai-api-key: \${{ secrets.OPENAI_API_KEY }}
          prompt-file: .github/codex/prompts/review.md
          output-file: codex-output.md
          sandbox: read-only
          safety-strategy: drop-sudo

  post_feedback:
    runs-on: ubuntu-latest
    needs: codex
    if: needs.codex.outputs.final_message != ''
    permissions:
      issues: write
      pull-requests: write
    steps:
      - name: Post Codex feedback
        uses: actions/github-script@v9
        with:
          github-token: \${{ github.token }}
          script: |
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.payload.pull_request.number,
              body: process.env.CODEX_FINAL_MESSAGE,
            });
        env:
          CODEX_FINAL_MESSAGE: \${{ needs.codex.outputs.final_message }}
`;
}

module.exports = {
  generateAgentsMarkdown,
  generateCodexReviewPrompt,
  generateCodexReviewWorkflow,
};
