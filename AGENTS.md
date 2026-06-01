# AGENTS.md

## Project Overview

- This repository uses `AGENTS.md` to give AI coding agents durable project instructions.
- Keep this file synchronized with the actual build, lint, test, and review workflow.
- Prefer concrete commands over broad guidance so agents can verify their work.

## Repository Layout

- `package.json` - Node.js package metadata, CLI entrypoints, and npm scripts.
- `.github/workflows/` - GitHub Actions workflows.

## Setup

- Install dependencies: `npm install`

## Build, Test, and Lint

Run the commands that match the files you changed before opening a pull request.

### Lint

- Lint: `npm run lint`

### Test

- Test: `npm run test`

### Build

- Build: `npm run build`

## Review Guidelines

- Review for correctness, security regressions, broken public APIs, data loss, and CI failures.
- Treat missing validation for changed behavior as a review issue.
- Treat failing or missing required commands from this file as a P1 issue unless the PR explains why they could not be run.
- Keep review comments focused on actionable P0/P1 problems.

## Agent Working Rules

- Read the relevant files before editing.
- Keep changes focused on the requested task.
- Do not add production dependencies unless the change requires them.
- Update documentation when user-facing behavior or commands change.
- Do not commit secrets, tokens, local environment files, or generated dependency directories.

## Completion Criteria

- Relevant lint, test, and build commands pass, or the final response explains why they were not run.
- Generated GitHub Actions or Codex prompt changes are reviewed for secret exposure and unsafe write permissions.
- `AGENTS.md` remains concrete: commands should refer to scripts, Make targets, or tooling that exists in this repository.
