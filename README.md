# Flow Scene Builder

Chrome Manifest V3 extension plus a local Python/FFmpeg companion for Google Flow. This snapshot preserves the serial production pipeline: one hook (8 seconds), four continuous recipe scenes (8 seconds each), and one verified portrait MP4 per image pair.

## Production behavior

- One existing Flow project, one dedicated Chrome window, one active video at a time.
- Veo 3.1 Lite Lower Priority, x1, zero visible credit cost. Verify the available model and cost in the current session.
- At least 30 seconds between confirmed submissions, including authorized retries.
- The last verified frame of each recipe scene becomes the next scene's input.
- Programmatic downloads use the normal export control, without a Save As dialog. Each scene has an asset UUID and SHA-256 receipt.
- Persistent queue, single-controller lock, source hashes, bounded retries and recovery of the same video. Completed files are reconciled before reuse.
- Ten-minute recovery is allowed only by an explicit saved policy, followed by a fresh normal UI check. Active challenges, login, quota, identity mismatch or nonzero cost stop submissions. Unknown submission outcomes require reconciliation.
- Local polling runs independently of an LLM; supervision can be spaced to roughly 30 minutes during healthy operation.

## Requirements

Chrome 120+, Node.js 22+, Python 3.10+ (3.12 recommended), and FFmpeg (`imageio-ffmpeg` is included in Python requirements). Use an authenticated normal Flow session. No Google credentials or browser profiles are distributed.

## Install

On macOS, confirm the real Flow account home in Chrome, then:

```sh
sh scripts/install_macos.sh --flow-home https://flow.google.com/u/0/
```

Load the generated `package/` directory in `chrome://extensions` using developer mode. Run `sh scripts/flow.sh doctor` to inspect the connection. See [macOS installation](docs/INSTALACAO_MACOS.md) and [Windows installation](docs/INSTALACAO_WINDOWS.md). Do not reinstall, rebuild or reload an extension while a job has an uncertain submission.

## Configure this source snapshot

Production configuration and private job state are deliberately excluded. These example values must be replaced locally before a real batch:

1. In `extension/production_routes.js`, replace the all-zero project UUID and account-home index with the exact existing project URL from the authorized Chrome session. Keep one route for serial production. Rebuild after configuration.
2. The historical serial controller `scripts/run_serial_300_flow.py` expects 300 pairs in `<BATCH>/aprovadas/`, named `NNN_PPP_hook_description.png` and `NNN_PPP_recipe_description.png`. `PPP` is the shared three-digit pair ID. It stores its manifest in `<BATCH>/relatorios/flow/producao_serial_2026_10_16/` and jobs outside the repository. Those date-based paths are retained for compatibility with the production version.
3. Replace `operator@example.invalid` and the Flow account-home index in that controller's initial-manifest defaults. Existing manifests are authoritative and must contain the authorized email, exact home, and `shared_project`. The controller refuses to invent a project when none has been configured.
4. Replace `/Volumes/EXTERNAL_DRIVE` with the real mounted external volume in the controller and `bridge (1).py`. This preserves the production mount/download-root checks. Do not point it at an unmounted placeholder directory.
5. Set `max_parallel` to `1` in the machine-local runtime settings. If using legacy batch tools, configure the same example account and volume literals there too. They are separate workflows, not the serial production entry point.
6. For ten-minute recovery, record the explicit operator authorization under `recovery_policy` in the batch manifest (`delay_seconds: 600`, nonempty `authorization`). The controller copies that policy into newly created jobs. Do not erase historical receipts, holds, attempts or uncertain sends to enable recovery.

Initialize/review the manifest and its single existing project before invoking the controller. `ensure_contract` in the serial controller prepares prompts and a manifest offline; it does not send a generation. Source pairs must be complete and their identities preserved.

Start only one controller:

```sh
python scripts/run_serial_300_flow.py --root /path/to/batch --output /path/to/final_videos
```

Use the installed companion virtualenv's Python. The controller's file lock rejects another instance. Keep the extension's permitted session open; do not run the retired dual-profile supervisor for a serial batch.

## Verification

Run in an isolated checkout/runtime, not against a production queue:

```sh
npm ci
npm test
npm run build
npm run verify
python scripts/test_python.py
```

The Python runner always creates an isolated runtime and includes the intentional `(1).py` test files that ordinary unittest discovery skips. Build output, dependencies, media, manifests, receipts, browser sessions and machine-local settings are ignored.

## Source layout and publication

- `extension/`: production UI executor, download/export, frame transfer, inventory cache and cooldown checks.
- `bridge.py`, `flow_scene_builder.py`, `candidate_selection.py`: compatibility entry points. Their sibling `* (1).py` implementation files are intentional and required. Do not omit or rename them.
- `scripts/run_serial_300_flow.py`: serial paired-batch controller; `scripts/compose_hook_recipe.py`: final composition.
- `tests/`: offline regression tests, including the intentional Drive-preserved `(1)` filenames.
- `browser_executor/`: separate read-only/fixture Playwright prototype; it is not the production executor.
- `docs/PUBLICACAO.md`: exact snapshot exclusions and configuration boundary.

This is a source publication of a running installation, with local identity/location literals replaced by examples. It does not claim that a fresh installation is already authenticated or configured. No production process is modified by publishing the source.
