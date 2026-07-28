# JobPilot

A self-hosted, multi-user, Dockerized **job-search and auto-apply platform** with a
companion browser extension. Discover real jobs across public ATS boards and
aggregators, keep a rich "work identity" profile, and auto-fill / auto-submit
applications with a human-in-the-loop you can answer from **any device**.

Everything — UI, API, and WebSocket — is served on **port `1456`** from a single origin.

> **Responsible use:** JobPilot only reads job data from ToS-safe sources (public ATS
> APIs, aggregator APIs, and `schema.org/JobPosting` structured data). It never scrapes
> LinkedIn/Indeed/Monster, never bypasses CAPTCHAs (they always go to you), applies a
> configurable submission-rate cap, and asks you to review sensitive answers (EEO
> self-identification, screening questions). See **[Responsible use](#responsible-use)**.

---

## Table of contents
- [Architecture](#architecture)
- [Quick start (Docker)](#quick-start-docker)
- [Install on unraid](#install-on-unraid)
- [First-run walkthrough](#first-run-walkthrough)
- [The browser extension](#the-browser-extension)
- [Pairing walkthrough](#pairing-walkthrough)
- [Humanized input & the "Type like a human" toggle](#humanized-input)
- [Job sources](#job-sources)
- [Configuration (.env)](#configuration)
- [Development](#development)
- [Testing](#testing)
- [Responsible use](#responsible-use)

---

## Architecture

```
                        ┌──────────────────────────────────────────────┐
   Browser (web UI) ───▶│                  app  (:1456)                 │
   phone / laptop       │  FastAPI:  React SPA + REST API + WebSockets  │
        ▲   │           │  /ws/app (session)   /ws/ext (device token)   │
        │   │ ws/app     └───────┬───────────────┬───────────────┬──────┘
        │   ▼                    │ SQLAlchemy     │ arq enqueue   │ Redis pub/sub
   ┌────┴────────┐         ┌─────▼─────┐    ┌─────▼──────┐   (realtime fan-out
   │  Extension  │         │ Postgres  │    │   Redis    │    to web + ext)
   │ Chrome / FF │         │  (data)   │    │ queue+bus  │
   └────┬────────┘         └───────────┘    └─────┬──────┘
        │ ws/ext + REST (Bearer device token)     │ arq jobs
        │                                    ┌─────▼──────────────────────────┐
        │  fills live ATS forms in your      │           worker               │
        └─ browser (humanized input, HITL)   │  discovery • enrichment (LLM)  │
                                             │  Playwright server executor    │
                                             └────────────────────────────────┘
   Discovery/enrichment/apply also use the Anthropic API (optional) and,
   for a few bot-friendly boards, a server-side Playwright executor.
```

**Components**
- **`app`** — FastAPI serving the built React UI, the JSON API, and both WebSockets on `:1456`.
- **`worker`** — [arq](https://arq-docs.helpmanual.io/) background jobs: runs searches (connectors), LLM enrichment, and the server-side Playwright executor.
- **`db`** — Postgres. Every table is scoped by `user_id`; isolation is enforced at the query layer.
- **`redis`** — arq job queue **and** a pub/sub bus that fans real-time events out to the right user's web + extension sockets.
- **Extension** — one `wxt` codebase → Chrome (MV3) + Firefox. Fills forms in your own browser and streams human-in-the-loop questions back to the container.

**Tech:** Python 3.12 · FastAPI · SQLAlchemy + Alembic · Postgres · Redis · arq · Playwright · React 18 + Vite + TypeScript + Tailwind · Anthropic API (optional).

---

## Quick start (Docker)

```bash
git clone https://github.com/jyoung2000/aap.git jobpilot
cd jobpilot
cp .env.example .env
# edit .env: set a strong SECRET_KEY (openssl rand -hex 32) and, optionally, ANTHROPIC_API_KEY
docker compose up --build
```

Then open **http://localhost:1456**.

- A **demo account is seeded** on first boot: `demo@jobpilot.local` / `demo12345` (or create your own).
- `docker compose build` also builds the **extension bundles**; download them from **Settings → Extension**.
- Without an `ANTHROPIC_API_KEY`, JobPilot still runs — it uses transparent heuristic fallbacks for summaries, match scores, and field mapping.

> The image is lean by default and the server-side Playwright executor runs in **simulation**
> mode unless you enable a real browser. Everything else (real discovery, the whole
> extension apply flow, remote HITL) works out of the box. To enable the live no-browser
> executor + remote-CAPTCHA noVNC, build with `INSTALL_BROWSERS=true` (see [Configuration](#configuration)).

---

## Install on unraid

Run this **once** from the unraid terminal. It creates the app folder, clones JobPilot,
builds, and launches — then tails the log:

```bash
mkdir -p /mnt/user/appdata/jobpilot && cd /mnt/user/appdata/jobpilot && nohup bash -c 'if [ ! -d .git ]; then git clone --branch claude/jobpilot-platform-spycvv https://github.com/jyoung2000/aap.git . ; fi; git fetch origin claude/jobpilot-platform-spycvv && git reset --hard origin/claude/jobpilot-platform-spycvv && bash update-all.sh' > /mnt/user/appdata/jobpilot-update.log 2>&1 </dev/null & disown; tail -F /mnt/user/appdata/jobpilot-update.log
```

`update-all.sh` will, on first run, create `.env` with a generated `SECRET_KEY` and set
`PUBLIC_BASE_URL` to your server's LAN IP (so extension pairing works from your phone).
To **update** later, just run the same command again — it fetches the latest branch and rebuilds.

Open **http://&lt;your-unraid-ip&gt;:1456**.

---

## First-run walkthrough

1. **Create an account** (or use the demo login). Sessions are httpOnly cookies with CSRF protection.
2. **Build your profile** (`Profile`): personal details, work experience (drag to reorder), education,
   recommendations, and the **Standard Fields** (work authorization, sponsorship, salary expectation,
   EEO self-ID defaulting to *Decline to self-identify*, consents…). Upload a resume and click
   **Parse resume** to auto-extract structured data for your review.
3. **Add custom fields & saved answers** as needed — the form-filler treats these exactly like built-in fields.
4. **Download & pair the extension** (`Settings → Extension`).
5. **Run a search** (`Search`) — keywords + location (or remote). Watch live progress; browse results
   with match scores, salary, education, and a detail drawer.
6. **Auto-apply** — select jobs → *Auto apply to selected*. Answer any human-in-the-loop prompt from the
   **Apply Queue** (on your laptop or phone). See submissions in **Analytics** with exact timestamps.

---

## The browser extension

One codebase (`wxt` + `webextension-polyfill`) builds both browsers. `docker compose build`
produces the bundles and the app serves them at **Settings → Extension**:

### Chrome (MV3)
1. Download **"Download for Chrome"** (a `.zip`) and unzip it.
2. Go to `chrome://extensions`, enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the unzipped folder.
4. Pin JobPilot and open the popup.

### Firefox
1. Download **"Download for Firefox"** (an `.xpi`).
2. **Temporary install (any Firefox):** go to `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → select the `.xpi` (or the built `manifest.json`). Temporary add-ons are removed when Firefox restarts.
3. **Permanent install** requires a signed add-on, **or** Firefox Developer Edition / ESR with
   `about:config` → `xpinstall.signatures.required = false`, then install the `.xpi` from `about:addons`.

The popup shows an **"update available"** nudge when the container is running a newer extension version than the one you installed.

---

## Pairing walkthrough

Pairing binds a browser to your account with a revocable device token.

1. In the web UI: **Settings → Extension → Generate pairing code**. A **6-digit code** and a **QR** appear (valid ~10 minutes).
2. Open the **extension popup**. Enter your JobPilot URL (e.g. `http://<server-ip>:1456`) and the 6-digit code.
3. The extension exchanges the code for a **device token** and opens a WebSocket to `ws://<host>:1456/ws/ext`.
4. Both the popup and the web UI show a **green dot** when linked. Manage/revoke devices under **Settings → Extension**.

Multiple browsers per user are allowed; each only ever receives **its own user's** queue.

---

## Humanized input

Per-user setting (with a per-run override) — **"Type like a human"**:

- **On (humanized):** each field is scrolled into view, focused/clicked, and typed
  **character-by-character** with a variable **60–180 ms** cadence and occasional longer pauses;
  the full event chain fires (`keydown/keypress/input/keyup/change/blur`); dropdowns are opened and
  picked (not value-set); there's a randomized **2–8 s "reading" pause** between fields and a
  randomized think-time between jobs. The Playwright executor mirrors this via its input APIs.
- **Off (fast mode):** instant fills, but still dispatching **real** `input`/`change`/`blur` events
  so React/Vue forms register the values.

**Honest disclaimer:** humanized input reduces the chance of automated-submission detection but is
**no guarantee**. A configurable **submission-velocity cap** (default **15 applications/hour**) applies
in **both** modes, and **CAPTCHAs are never bypassed** — they always go to you.

---

## Job sources

**ToS-safe by design.** Connectors live in `backend/app/sources/` behind
`JobSource.search(query) -> list[RawListing]`:

1. **Public ATS board APIs** (no keys): Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee. The org-slug list grows automatically via method 3.
2. **Aggregator APIs**: Remotive & Arbeitnow (free), plus Adzuna, Jooble, USAJobs, The Muse (optional env keys).
3. **Search-engine discovery**: dorks like `site:boards.greenhouse.io "{title}"` (SerpAPI/Brave if keyed, else DuckDuckGo HTML) to find listing URLs and **new org slugs**.
4. **JSON-LD extraction**: parses `schema.org/JobPosting` structured data from any discovered careers page — the most reliable generic scrape.
5. **LinkedIn / Indeed / Monster**: **stubs only**, intentionally not implemented (their ToS prohibits scraping). See `backend/app/sources/stubs.py`.

Listings are deduped (canonical URL + fuzzy title/company), normalized (salary parsed, "Not listed"
when absent), and enriched with a 3-sentence summary, key requirements, and a **0–100 match score**
with a one-line rationale (LLM when available, heuristic otherwise).

---

## Configuration

All variables are documented in **`.env.example`**. Highlights:

| Variable | Default | Purpose |
|---|---|---|
| `APP_PORT` | `1456` | Host port (the app is always `1456` inside the container). |
| `SECRET_KEY` | — | **Change this.** Signs sessions/CSRF/tokens. |
| `PUBLIC_BASE_URL` | `http://localhost:1456` | URL browsers + extension use; set to your LAN IP on unraid. |
| `ANTHROPIC_API_KEY` | *(empty)* | Enables LLM parsing/summaries/match/field-mapping. Optional. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Model id for LLM calls. |
| `MAX_APPLICATIONS_PER_HOUR` | `15` | Submission-velocity cap (both fill modes). |
| `HUMANIZED_INPUT_DEFAULT` | `true` | Default for the "Type like a human" toggle. |
| `SERVER_EXECUTOR_MODE` | `auto` | `auto` (live→simulate) · `live` · `simulate`. |
| `INSTALL_BROWSERS` | `false` | Build-time: install Chromium for the live server executor + noVNC. |
| `SEED_ON_START` | `true` | Seed demo user + sample/live jobs on first boot. |
| `ADZUNA_* / JOOBLE_* / USAJOBS_* / THEMUSE_* / SERPAPI_KEY / BRAVE_API_KEY` | *(empty)* | Optional source keys. |
| `NOTIFY_WEBHOOK_URL` | *(empty)* | ntfy/Telegram-compatible webhook fired when a run pauses. |

---

## Development

**Backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
# Point at a local Postgres/Redis, or use SQLite for quick runs:
export DATABASE_URL=sqlite:///./dev.db DATA_DIR=./data SERVER_EXECUTOR_MODE=simulate
uvicorn app.main:app --reload --port 1456      # API + (built) UI
arq app.worker.main.WorkerSettings             # background worker (needs Redis)
python -m app.seed                             # demo data
```

**Frontend** (Vite dev server proxies `/api` + `/ws` to `:1456`)
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 during development
npm run build      # emits into ../backend/app/static (served by FastAPI in prod)
```

**Extension**
```bash
cd extension
npm install
npm run dev            # live-reload dev build
npm run bundle         # builds Chrome + Firefox and copies bundles into backend/app/static/extension
```

**Migrations**
```bash
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

---

## Testing

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

Covered: **connector parsing** (recorded fixtures), **field-resolution order** (profile → custom →
saved → LLM, with knockout safety and "never fill current comp when blank"), **state-machine
transitions**, **multi-user isolation & CSRF** (user A cannot read user B), and a full
**remote human-in-the-loop apply flow** (queue → pause at a screening question → answer from the web
UI → knowledge-base save → resume → submitted → visible in analytics).

---

## Responsible use

- **ToS-safe sources only.** Public ATS APIs, aggregator APIs, and `schema.org/JobPosting` JSON-LD.
  LinkedIn/Indeed/Monster are **not** scraped.
- **CAPTCHAs are never bypassed.** When one appears, the run pauses and hands it to you
  (locally in the tab, or remotely via a scoped screencast). You solve it; JobPilot verifies it cleared.
- **You review sensitive answers.** EEO self-identification defaults to *Decline to self-identify* and
  is only ever submitted exactly as you set it. Screening questions drafted by the LLM are flagged for
  review; **knockout questions** (licenses, certifications, clearances, shift availability) are never
  guessed — they go to you.
- **Rate limited.** A configurable submissions/hour cap applies in both fill modes.
- **Current compensation** is never auto-filled if you leave it blank.
- Humanized input reduces automated-detection risk but is **not** a guarantee. Use JobPilot in line
  with each site's terms and applicable law.

---

*JobPilot is self-hosted software you run for your own job search. You are responsible for how you use it.*
