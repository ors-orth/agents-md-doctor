# Codex Pull Request Review

You are reviewing a GitHub pull request for this repository.

Before reviewing:

- Read `AGENTS.md` and follow its Review Guidelines.
- Inspect the pull request diff against the base branch. If `PR_BASE_REF` is set, use `origin/$PR_BASE_REF...HEAD`.
- Prefer high-signal findings over style comments.

Focus on P0/P1 issues:

- Correctness bugs and broken behavior.
- Security regressions, secret exposure, unsafe permissions, and prompt injection risk.
- Data loss, migration, compatibility, or release risks.
- Missing tests for changed behavior.
- CI failures or validation commands that no longer match the repository.

Repository validation commands detected by agents-md-doctor:

- lint: `npm run lint`
- test: `npm run test`
- build: `npm run build`

Output rules:

- Start with the most severe findings.
- Include file and line references when possible.
- If no serious issues are found, say that clearly and mention any residual test risk.
- Do not modify files, push commits, or perform automatic fixes during review.
