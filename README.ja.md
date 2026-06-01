# AGENTS.md Doctor

AGENTS.md Doctor は、OSS リポジトリを AI コーディングエージェントが作業しやすい状態に整える CLI です。

Codex、Claude Code、Cursor などのエージェントが迷わないように、実際のプロジェクトファイルを読んで `AGENTS.md`、レビュー指示、Codex GitHub Action の PR レビューワークフローを生成・検査します。

このプロジェクトは experimental です。v1.0 までは挙動や生成ファイルの形式が変わる可能性があります。

[English README](README.md)

## できること

- `package.json`、`pyproject.toml`、`Cargo.toml`、`Makefile`、GitHub Actions workflow を読む。
- 実際の install / lint / test / build コマンドを推定する。
- `AGENTS.md` を生成する。
- `.github/codex/prompts/review.md` を生成する。
- Codex GitHub Action 用の PR review workflow を生成する。
- 曖昧すぎる指示、存在しないコマンド、危険な自動レビュー/自動修正設定を lint する。

## インストール

`npx` で実行できます。

```sh
npx agents-md-doctor init
```

このリポジトリを開発する場合:

```sh
npm install
npm test
```

## コマンド

### `init`

検出したリポジトリ構成とコマンドから `AGENTS.md` を生成します。

```sh
npx agents-md-doctor init
```

既存ファイルを上書きする場合:

```sh
npx agents-md-doctor init --force
```

### `lint`

`AGENTS.md`、Codex review prompt、GitHub Actions workflow を検査します。

```sh
npx agents-md-doctor lint
```

現在の lint 対象:

- 「適宜」「必要に応じて」「as needed」のような、具体コマンドがない曖昧な指示。
- 存在しない `package.json` script や Make target を参照しているコマンド。
- 対応する project file がない Node / Python / Rust コマンド。
- `pull_request_target` と OpenAI secrets の組み合わせ、`sandbox: danger-full-access`、`safety-strategy: unsafe`、自動 `git push` などの危険な Codex workflow 設定。

## 検出対象スコープ

MVP では、よくある次の構成を対象にしています。

- `package.json` を持つ Node.js project。
- `pyproject.toml` を持つ Python project。
- `Cargo.toml` を持つ Rust project。
- `Makefile` を使う repository。
- GitHub Actions workflows を使う repository。

曖昧な repository では、存在しないコマンドを作り込まず、警告や TODO 的な指示として扱う方針です。

### `codex-review-setup`

Codex review prompt と GitHub Actions workflow を生成します。

```sh
npx agents-md-doctor codex-review-setup
```

生成されるファイル:

- `.github/codex/prompts/review.md`
- `.github/workflows/codex-review.yml`

生成される workflow は `openai/codex-action@v1` を使い、`pull_request` で動きます。checkout は merge ref を使い、`persist-credentials: false`、Codex は `read-only` sandbox で実行します。

workflow を動かすには、GitHub repository secret として `OPENAI_API_KEY` を設定してください。デフォルトでは fork PR をスキップします。GitHub は信頼できない fork workflow に repository secret を渡さないためです。

## オプション

```sh
npx agents-md-doctor <command> --cwd path/to/repo
npx agents-md-doctor <command> --dry-run
npx agents-md-doctor <command> --force
```

## 設計方針

- 汎用テンプレートよりも、検出した実コマンドを優先する。
- 曖昧な場合は推測で断定せず、警告として扱う。
- PR レビュー自動化はデフォルトで read-only にする。
- 特定ベンダー専用ではなく、複数の AI エージェントに役立つ指示を生成する。
- MVP は依存なしで、挙動を追いやすくする。

## 開発

```sh
npm run lint
npm test
npm run build
```

## ライセンス

MIT
