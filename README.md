# AGENTS.md Doctor

AGENTS.md Doctor helps open source repositories become easier for AI coding agents to work in.

It generates and checks repository instructions for tools such as Codex, Claude Code, Cursor, and other coding agents. The CLI reads real project files, infers the commands agents should run, and creates review guidance that stays close to the repository's actual workflow.

This project is experimental. Behavior and generated file formats may change before v1.0.

[日本語 README](README.ja.md)

## What It Does

- Reads `package.json`, `pyproject.toml`, `Cargo.toml`, `Makefile`, and GitHub Actions workflows.
- Infers the actual install, lint, test, and build commands.
- Generates `AGENTS.md`.
- Generates `.github/codex/prompts/review.md`.
- Generates a Codex GitHub Action pull request review workflow.
- Lints for vague instructions, missing commands, and risky automatic review/fix settings.

## Install

Run with `npx`:

```sh
npx agents-md-doctor init
```

For local development in this repository:

```sh
npm install
npm test
```

## Commands

### `init`

Generate `AGENTS.md` from the repository's detected files and commands.

```sh
npx agents-md-doctor init
```

Use `--force` to overwrite an existing file:

```sh
npx agents-md-doctor init --force
```

### `lint`

Check `AGENTS.md`, Codex review prompts, and GitHub Actions workflows.

```sh
npx agents-md-doctor lint
```

The linter currently checks for:

- Vague guidance such as "as needed" or "適宜" where concrete commands are expected.
- Commands that reference missing `package.json` scripts or Make targets.
- Python, Rust, or Node commands without matching project files.
- Dangerous Codex workflow settings such as `pull_request_target` with OpenAI secrets, `sandbox: danger-full-access`, `safety-strategy: unsafe`, and automatic `git push`.

## Supported Detection Scope

The MVP focuses on common patterns in:

- Node.js projects with `package.json`.
- Python projects with `pyproject.toml`.
- Rust projects with `Cargo.toml`.
- Repositories that use `Makefile`.
- Repositories that use GitHub Actions workflows.

When a repository is ambiguous, AGENTS.md Doctor should warn or leave a TODO-style instruction instead of inventing commands.

### `codex-review-setup`

Generate a Codex review prompt and GitHub Actions workflow:

```sh
npx agents-md-doctor codex-review-setup
```

Generated files:

- `.github/codex/prompts/review.md`
- `.github/workflows/codex-review.yml`

The generated workflow uses `openai/codex-action@v1`, runs on `pull_request`, checks out the merge ref with `persist-credentials: false`, and runs Codex in `read-only` sandbox mode.

You need to add an `OPENAI_API_KEY` repository secret before Codex review jobs can run. By default, the generated workflow skips fork PRs, Dependabot PRs, and repositories without that secret.

## Options

```sh
npx agents-md-doctor <command> --cwd path/to/repo
npx agents-md-doctor <command> --dry-run
npx agents-md-doctor <command> --force
```

## Design Principles

- Prefer detected commands over generic templates.
- Warn instead of guessing when a repository is ambiguous.
- Keep PR review automation read-only by default.
- Make generated instructions useful to multiple agents, not just one vendor.
- Keep the MVP dependency-free and easy to inspect.

## Development

```sh
npm run lint
npm test
npm run build
```

## License

MIT
