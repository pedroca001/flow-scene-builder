# Flow Scene Builder

## Purpose

Operate Google Flow through normal UI controls, retain continuous-scene inputs, download verified results and compose local MP4s. Heavy media and runtime state stay outside this repository.

## Ownership

Source: this repository. Production executor: Chrome extension plus Python Native Messaging companion. The separate Playwright prototype belongs to `browser_executor/AGENTS.md`.

## Local Contracts

- Preserve pending submissions, source identity, attempts, receipts and completed deliveries. Unknown outcomes require reconciliation before any retry.
- Never ship credentials, signed media URLs, browser profiles, production manifests, account holds, gates, job state or personal machine settings.
- Use only the normal service controls. No token capture/replay, fingerprint changes, challenge bypass or identity switching. Active challenges, login, quota or nonzero cost stop new submissions.
- Serial production uses one authorized profile, one existing project, one dedicated window and one active video. Maintain at least 30 seconds between confirmed submissions, including retries.
- x1, first result, zero visible cost, and no quality-driven regeneration. Technical/audio retry counts share their explicitly authorized per-scene limit.
- Download programmatically and validate the asset UUID, file contents and SHA-256 before ingestion or delivery. Preserve the original verified frame at each recipe seam.
- Never restart a live controller because an observation timer expired. Check its actual process handle; do not duplicate controllers.

## Work Guidance

- Read README configuration instructions before deploying this sanitized source snapshot. Example identity/project/volume literals are not live authorization.
- `bridge.py`, `flow_scene_builder.py` and `candidate_selection.py` load their required sibling `* (1).py` implementation files. Keep them together. Drive-preserved test filenames are intentional too.
- The serial controller uses the historical `producao_serial_2026_10_16` layout for compatibility. Do not migrate existing state opportunistically.
- Recovery waits ten minutes only when a saved explicit policy permits it, then performs a normal UI/account/model/cost/inventory check. A wait alone does not release an active restriction. Reuse existing results; never clear uncertain sends.
- Healthy model supervision may be spaced to about 30 minutes; native queue polling remains local. Report only material failures, required human action or verified completion unless asked for status.
- Keep publication work in an isolated snapshot. Do not rebuild/reload the live extension, restart its host, stop production or copy runtime files for a source release.

## Verification

Use `python scripts/test_python.py` for all Python regressions in an isolated runtime, `npm test`, then `npm run build` and `npm run verify`. Validate the built package and a source archive. Before push, inspect tracked candidates for secrets, personal configuration, signed URLs, browser sessions and media. Check the remote commit after publication.

## Child DOX Index

- `browser_executor/AGENTS.md`: separate Playwright fixture/read-only prototype.
