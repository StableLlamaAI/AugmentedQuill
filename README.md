# AugmentedQuill

[![Build Status](https://img.shields.io/github/actions/workflow/status/StableLlamaAI/AugmentedQuill/ci.yml?branch=develop)](https://github.com/StableLlamaAI/AugmentedQuill/actions)
[![License: GPLv3](https://img.shields.io/badge/license-GPLv3-blue.svg)](LICENSE)

![AugmentedQuill logo](static/images/logo_2048.png)

**Local-first AI writing assistant with story structure + chatbot + image prompt support.**

- Join the community: [r/AugmentedQuill](https://www.reddit.com/r/AugmentedQuill/)

> **Screenshot placeholder:** Insert your app screenshot here (e.g., `docs/assets/screenshot.png`).

---

## 🚀 Quick start (for users)

1.  Clone repository and create Python environment
    - `git clone https://github.com/StableLlamaAI/AugmentedQuill.git`
    - `cd AugmentedQuill`
    - `python -m venv venv && source venv/bin/activate`
2.  Install dependencies
    - `python -m pip install -e ".[dev]"`
3.  Build frontend
    - `cd src/frontend && npm install && npm run build`
4.  Run backend
    - `augmentedquill --reload --host 127.0.0.1 --port 28000`
5.  Open
    - `http://127.0.0.1:28001` (vite dev) or `http://127.0.0.1:8000` (production mode)

### ✅ First actions in the app

- Create a project
- Add chapters / short story content
- Open Writing Partner (AI chat)
- Add sourcebook entries
- Open Images panel and use prompt generator

---

## 📘 User documentation (most important)

The complete user guide is in `docs/user_manual/`:

- `docs/user_manual/01_getting_started.md`
- `docs/user_manual/02_projects_and_settings.md`
- `docs/user_manual/03_writing_interface.md`
- `docs/user_manual/04_chapters_and_books.md`
- `docs/user_manual/05_sourcebook.md`
- `docs/user_manual/06_project_images.md`
- `docs/user_manual/07_ai_chat_assistant.md`
- `docs/user_manual/08_appearance_and_display.md`
- `docs/user_manual/09_tutorial_first_story.md`
- `docs/user_manual/10_writing_a_story.md`
- `docs/user_manual/11_troubleshooting.md`

> Tip: Start with `01_getting_started.md`, then `03_writing_interface.md`.

---

## ✨ What AugmentedQuill does

- Project-based story authoring (short story, novel, series)
- Multi-chapter and multi-book structure
- Live AI writing assistant and chat (local API key / OpenAI-compatible endpoints)
- Custom prompt pipelines (editor, writer, chat voices)
- Sourcebook (characters, scenes, lore, items, etc.)
- Image metadata + optimized image prompt generation
- Config-driven with JSON templates and env overrides
- Auto-captured project artifacts in `data/projects`

---

## ⚠️ Important (security and deployment)

- Local-first app. No built-in auth. Do not expose to public internet without reverse proxy + access control.
- Security model: single-user local use.
- Browser-based LLM calls may require CORS-friendly endpoints or use internal proxy route `/api/v1/openai/models`.
- AugmentedQuill does not include an LLM server; you must point it at an OpenAI-compatible API endpoint (self-hosted or cloud). For local use, set up a compatible host such as `llama.cpp` endpoints, `Ollama`, or another OpenAI API compliant server.
- For easier setup and releases, try the official Electron or Docker builds provided with each release instead of building from source.

---

## 🛠️ Developer section (find all dev info here)

### Repo layout

- Backend: `src/augmentedquill/`
- Frontend: `src/frontend/`
- Integration artifacts: `static/` and `data/`
- Tests: `tests/unit/`
- Config schemas: `resources/schemas/`

### Development commands

- Backend lint/test
  - `ruff check .`
  - `black --check .`
  - `python -m pytest`
- Frontend: `cd src/frontend && npm run lint && npm run test && npm run build`
- Quick run: `augmentedquill --reload --host 127.0.0.1 --port 28000`

### Configuration paths

Runtime config:

- `data/config/machine.json`
- `data/config/story.json`
- `data/config/projects.json`

Model endpoint variables:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_TIMEOUT_S`

### QA requirements

- Run `tools/enforce_code_hygiene.py .` after code changes.
- Run `tools/check_copyright.py .`.
- Keep `data/projects/` and `data/logs/` names safe by setting `AUGQ_USER_DATA_DIR` in test runs.

---

## 📄 Links

- `docs/ARCHITECTURE.md`
- `docs/ORGANIZATION.md`
- `CONTRIBUTING.md`
- `LICENSE` (GPLv3)

---

## 🧩 Known limitations

- No multi-user access controls.
- Limited accessibility support.
- No real-time external editor sync.
