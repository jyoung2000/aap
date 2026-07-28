# JobPilot Browser Extension

The JobPilot extension is your in-browser auto-apply co-pilot. It pairs with a
self-hosted JobPilot container, pulls queued applications one at a time, fills each
job form (fast or "type like a human"), pauses for human input on knockout questions
/ CAPTCHAs, and reports results back — all over a single realtime link.

One codebase (built with [WXT](https://wxt.dev) + React + TypeScript and
`webextension-polyfill`) produces **both** a Chrome MV3 build and a Firefox build.

---

## Prerequisites

- **Node v22+** and npm
- A running JobPilot container (default `http://localhost:1456`)

## Install & build

```bash
cd extension
npm install

# Build (outputs to .output/)
npm run build           # Chrome  -> .output/chrome-mv3
npm run build:firefox   # Firefox -> .output/firefox-mv2

# Zip for distribution / store upload
npm run zip             # -> .output/jobpilot-<version>-chrome.zip
npm run zip:firefox     # -> .output/jobpilot-<version>-firefox.zip (+ sources zip)

# Build both AND copy distributable bundles into the backend:
npm run bundle          # -> backend/app/static/extension/jobpilot-chrome.zip
                        #    backend/app/static/extension/jobpilot-firefox.xpi
```

### npm scripts

| Script          | What it does                                                            |
| --------------- | ----------------------------------------------------------------------- |
| `dev`           | WXT dev server (Chrome) with HMR                                         |
| `dev:firefox`   | WXT dev server (Firefox)                                                 |
| `build`         | Production Chrome MV3 build                                              |
| `build:firefox` | Production Firefox build                                                 |
| `zip`           | Zip the Chrome build for load-unpacked / Web Store                       |
| `zip:firefox`   | Zip the Firefox build (+ an AMO sources zip)                             |
| `bundle`        | Build+zip both, copy to `../backend/app/static/extension/` as the served bundles |
| `compile`       | `wxt prepare && tsc --noEmit` — type-check only                          |

### Versioning

The manifest version is stamped from the `EXTENSION_VERSION` environment variable
(default `1.0.0`), matching the container's `EXTENSION_VERSION`:

```bash
EXTENSION_VERSION=1.2.0 npm run bundle
```

The popup shows an "update available" nudge when the container's
`GET /api/extension/info` reports a newer version than the built-in one.

### Icons

Toolbar/notification icons live in `public/icon/`. Regenerate them with
`node scripts/make-icons.mjs`.

---

## Load the extension

### Chrome / Chromium / Edge (load unpacked)

1. `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right)
4. **Load unpacked** → select `extension/.output/chrome-mv3`

To install the zipped build instead, drag `jobpilot-chrome.zip` onto the
`chrome://extensions` page, or upload it to the Chrome Web Store dashboard.

### Firefox (temporary install)

1. `npm run build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. **Load Temporary Add-on…**
4. Select `extension/.output/firefox-mv2/manifest.json` (or the built
   `jobpilot-firefox.xpi`)

A temporary add-on is removed when Firefox restarts.

**Permanent Firefox install** requires a signed add-on. Either:

- Submit the `.xpi` to [addons.mozilla.org](https://addons.mozilla.org) for signing, **or**
- Use **Firefox Developer Edition / ESR** and set
  `xpinstall.signatures.required = false` in `about:config`, then install the
  `.xpi` from `about:addons` → gear → *Install Add-on From File…*

The Firefox build sets a stable add-on id (`jobpilot@jobpilot.selfhosted`) so signing
and updates work.

---

## Pairing walkthrough

1. In the JobPilot web app, go to **Settings → Extensions** and generate a
   **6-digit pairing code** (valid for 10 minutes).
2. Click the JobPilot toolbar icon to open the popup.
3. Enter your **Container URL** (default `http://localhost:1456`) and the **6-digit code**.
4. Click **Pair browser**. The extension exchanges the code for a device token
   (`POST /api/extension/pair`) and stores `{ apiBase, wsUrl, deviceToken, userEmail }`
   in `browser.storage.local`.
5. The popup now shows a **live link status** (green dot when the realtime WebSocket
   is connected), the paired account, current activity, recent results, and any
   pending interventions with inline answer inputs.

Queue an application in JobPilot with the **extension** executor and the extension
opens it in a background tab, fills it, and submits (or pauses for review/input).

### Auto-apply & review

- **Watching queue** (default): the extension drains the apply queue one job at a
  time, honoring the server's submissions/hour cap. Toggle it off in the popup to pause.
- **Type like a human**: per-application humanized typing with variable cadence and
  reading pauses.
- **Review-first**: fills the form but injects an in-page approve bar (Approve / Edit
  / Skip, keyboard `a`/`e`/`s`) before submitting.

### Remote CAPTCHA solving (Chrome only)

When a run hits a CAPTCHA, the extension pauses and notifies you. On Chrome you can
grant the optional **`debugger`** permission (popup → *Enable remote CAPTCHA solving*)
to stream the blocked tab to the JobPilot web UI and solve it remotely via
`chrome.debugger`. On Firefox — or if you decline — the run falls back to
`needs_human` and asks you to finish at that machine.

---

## Architecture

```
entrypoints/
  background.ts   Service worker (MV3) / persistent background (Firefox):
                  realtime WS link + keepalive, queue runner, message hub,
                  screencast control, notifications.
  content.ts      Injected form filler: field scan → resolve → fill → interventions
                  → multi-step wizards → review bar → submit → report.
  popup/          React popup: pairing, link status, activity, interventions, unpair.
utils/
  api.ts                 Device-token API client (/api/ext/*) + pairing.
  dom.ts                 Field scanning, label derivation, React-safe native setter,
                         humanized typing, wizard navigation.
  approveBar.ts          In-page frosted UI (approve bar + intervention panel).
  debuggerScreencast.ts  chrome.debugger remote-CAPTCHA helper (Chrome only).
  protocol.ts / storage.ts / types.ts
```

The extension makes **no external network calls** at runtime — it only talks to the
JobPilot container it is paired with.
