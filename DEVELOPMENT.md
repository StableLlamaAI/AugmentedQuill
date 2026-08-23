# AugmentedQuill Developer Guide

This guide is for contributors, maintainers, and anyone building AugmentedQuill from source. For end-user installation and usage, see the [README](README.md).

## Prerequisites

- Python >= 3.12 (CI uses 3.12)
- Node >= 24 (CI uses 24)
- Git

## Repository layout

- Backend: `src/augmentedquill/` — FastAPI application (API, domain services, models, utilities).
- Frontend: `src/frontend/` — React + TypeScript single-page application (Vite-based).
- Tests: `tests/unit/` — Python backend unit/integration-style tests.
- Tools: `tools/` — development and maintenance scripts.
- Resources: `resources/` — configuration templates, JSON schemas, and static sample config assets.
- Static: `static/` — runtime-served static assets (images and built frontend output).
- Data: `data/` — local runtime project data and logs.
- Docs: `docs/` — technical documentation (organization and architecture) plus the user manual.

See [docs/ORGANIZATION.md](docs/ORGANIZATION.md) for detailed placement rules, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system architecture.

## Development setup

1. Clone the repository:

   ```bash
   git clone https://github.com/StableLlamaAI/AugmentedQuill.git
   cd AugmentedQuill
   ```

2. Set up the Python backend:

   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   pip install -e ".[dev]"
   ```

3. Build the frontend:

   ```bash
   cd src/frontend
   npm install --legacy-peer-deps
   npm run build
   cd ../..
   ```

### Dev mode (recommended)

Terminal 1 — backend with hot reload:

```bash
source venv/bin/activate
augmentedquill --reload --host 127.0.0.1 --port 28000
```

Terminal 2 — frontend dev server:

```bash
cd src/frontend
npm run dev
```

- The Vite dev server defaults to `http://127.0.0.1:28001` and proxies the backend/static.
- Override the backend target with `VITE_BACKEND_URL=http://127.0.0.1:<your-port> npm run dev` if you run the backend on a different port.

### Production-like local run

```bash
cd src/frontend && npm run build
cd ../..
source venv/bin/activate
augmentedquill --host 127.0.0.1 --port 8000
```

## Development commands

Run the smallest relevant subset first, then broaden if needed.

### Backend checks

```bash
source venv/bin/activate
ruff check .
black --check .
python -m pytest
```

### Frontend checks

```bash
cd src/frontend
npm run lint
npm run typecheck
npm run test
npm run build
```

### Generated API types drift check

```bash
cd src/frontend
npm run check:generated-types
```

### Accessibility validation

```bash
cd src/frontend && npm run test:accessibility
```

Accessibility in the frontend is guarded by layered checks:

- **Lint:** `jsx-a11y` rules (accessible markup, keyboard handlers, label associations) are enforced as part of `npm run lint`.
- **Automated audits:** `axe-core` via `vitest-axe` scans key dialogs and the Machine Settings screen (`npm run test:accessibility`) and fails the suite on any violation; additional focused checks live in the `features/*` test files.
- **CSS regression tests:** `index.css.test.ts` guards the global accessibility CSS — the `prefers-reduced-motion` block and the prose-editor focus suppression — so those rules cannot silently regress.

**Design note — no focus ring around the prose:** the CodeMirror writing editor (`src/frontend/features/editor`) manages its own caret, and `index.css` explicitly suppresses any `:focus-visible` outline on `.cm-content`. A ring around the whole page looked like an error state when the editor was clicked into, so the caret (plus the inline chapter title's own focus underline) is the focus indicator. Keep it that way unless there is a strong accessibility reason not to.

### Debug diagnostics

Developer-oriented endpoints and knobs used when investigating AI/LLM behaviour (all are advanced and intentionally not part of the user-facing workflow):

- `GET /api/v1/debug/llm_logs` and `DELETE /api/v1/debug/llm_logs` — read / clear the in-memory list of LLM requests (shown in the app's Debug Logs window).
- `GET /api/v1/debug/connectivity?url=<base_url>` — probes DNS → TCP → HTTP(S) from the backend process (the same probe the Debug Logs “Network diagnostics” panel runs) to separate “cannot reach the provider” from “provider rejected the request”.
- Raw LLM request/response dump: set `AUGQ_LLM_DUMP=1` (optionally `AUGQ_LLM_DUMP_PATH`; default `data/logs/llm_raw.log`) to append finalized entries to a file. `AUGQ_LLM_DUMP_LEVEL` (`compact` | `normal` | `debug`) controls verbosity.
- Transport failures are categorised (DNS, connection refused, timeout, proxy, TLS) with actionable hints in `src/augmentedquill/services/llm/llm_http_ops.py` (`_classify_transport_error`); loopback targets bypass any HTTP(S) proxy.

## Dev container (optional)

Prefer a fully sandboxed environment? A [Development Container](https://code.visualstudio.com/docs/devcontainers/containers) is defined in `.devcontainer/` (Python 3.12 + Node 24) with the Python venv, frontend dependencies, and Playwright Chromium installed automatically on first start:

1. Open the repository in VS Code with Docker running.
2. Run **Dev Containers: Reopen in Container**.
3. Bootstrap runs automatically (`pip install -e ".[dev]"`, `npm install --legacy-peer-deps`, `npx playwright install --with-deps chromium`).

See `.devcontainer/README.md` for details, including how the container keeps its own `venv/` and `node_modules/` in isolated named volumes so your host setup is unaffected.

## Configuration paths

Runtime config:

- `data/config/machine.json`
- `data/config/story.json`
- `data/config/projects.json`

Model endpoint variables:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_TIMEOUT_S`

## QA requirements

- Run `tools/enforce_code_hygiene.py .` after code changes.
- Run `tools/check_copyright.py .`.
- Keep `data/projects/` and `data/logs/` names safe by setting `AUGQ_USER_DATA_DIR` in test runs.
- Follow the test data safety rules in [AGENTS.md](AGENTS.md): tests must isolate runtime paths via temp environment variables (`AUGQ_USER_DATA_DIR`, `AUGQ_PROJECTS_ROOT`, `AUGQ_PROJECTS_REGISTRY`, `AUGQ_MACHINE_CONFIG_PATH`) before importing app modules.

## Branching notes

When contributing, branch from `develop` and open pull requests against `develop` (unless the change is an urgent fix to `main`).

- Feature branches: `feature/<short-desc>`
- Release branches: `release/vX.Y` (short-lived)
- Hotfix branches: `hotfix/vX.Y.Z` (branch from `main`)

The `main` branch always reflects the last release; `develop` is the integration branch used for ongoing development.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow, and [AGENTS.md](AGENTS.md) for repository-wide agent operating guidance.
