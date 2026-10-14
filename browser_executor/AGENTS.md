# Playwright prototype

## Purpose

Implement the extension-free browser transport and exercise existing Flow UI and media components on local fixtures. A production job executor is a later stage.

## Ownership

- This directory owns the Playwright runtime, transport and local fixture.
- CLI: `scripts/flow_playwright.mjs`. Offline media companion: `scripts/playwright_fixture.py`.
- Guide: `docs/playwright_prototipo.md`. Brain context: `<BRAIN_ROOT>/Ferramentas/midia/flow_sem_extensao.md`; code: `<CODIGO_ROOT>/flow_scene_builder`.

## Local Contracts

- No extension, Native Messaging or production queue access. Persistent profiles and proof files stay in a separate local runtime outside the repo/Drive.
- Fixture mode accepts only the exact loopback origin supplied by the local test server. Inspect mode accepts only read-only DOM operations on Flow pages.
- No live generation, project creation, uploads, retries or account releases in this prototype. Production holds, counters and ownership cannot be bypassed by a new profile.
- Reuse FlowClient, flowDom, submitScene, trusted-control helpers and the Python media pipeline; do not duplicate prompts or selection logic.
- Borrowed extension files are ordinary source modules here. Importing them does not require an installed extension.
- Preserve files from existing jobs. Cleanup may remove only temporary files created by the current test under its verified runtime root.

## Work Guidance

- Changes to this backend must not reload the production extension or restart production actors.
- Default smoke runs locally and headless; headed is explicit. Session inspection launches one dedicated visible Chrome window for manual login and only reports minimal account/configuration checks.
- `open` launches installed Chrome directly with the dedicated user-data-dir and Flow home, without Playwright/CDP during manual login. Chrome owns this phase; the Node launcher exits. Repeated opens use Chrome's existing profile instance. `open-status` reports only the launch receipt, not live account/window verification. Desktop shortcut is created by `scripts/create_playwright_shortcut.ps1`.
- Google Search unusual-traffic CAPTCHA and Google Account unsafe-browser rejection are separate observed restrictions. The user completed the CAPTCHA manually; the controlled-login phase then failed. Use a genuine manual authentication phase, not fingerprint patches, proxy changes, cookie exports or security overrides. Real login and subsequent automation compatibility remain to be validated by the user.
- Pedro explicitly asked to log in first and send an OK before the first real tests. Opening the session or detecting an account is not that OK and never starts a test.
- Keep library availability separate from Chrome availability and real Flow validation. Do not claim Flow integration based on fixture success.

## Verification

- `node --test tests/playwright_transport.test.mjs`
- `node scripts/flow_playwright.mjs doctor`
- `node scripts/flow_playwright.mjs open-status` confirms the manual launch receipt only.
- `node scripts/flow_playwright.mjs smoke`
- Smoke must exercise trusted file drop, both download strategies, four-scene media validation and a browser restart with no duplicate submission.

## Child DOX Index

- None.
