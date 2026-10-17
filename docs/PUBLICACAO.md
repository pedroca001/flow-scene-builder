# Source publication, 2026-10-17

This revision captures the working serial production code without changing its running installation. The source was copied into an isolated checkout before offline tests and build. No queue, Chrome profile, native host or production controller was restarted.

## Included

Production extension, Python entry points and their required Drive-preserved implementations, serial controller, frame transfer, programmatic export/download, cooldown recovery, composition, presets, regression tests, installers and documentation. The source archive explicitly includes the implementation files and shared runtime module. Readable documentation/shell files whose local copies carried a Drive `(1)` suffix are restored to their expected canonical names in this publication.

## Configuration replaced by examples

The Google email becomes `operator@example.invalid`; the sole project route uses an all-zero UUID; local profile labels use `production_profile`; the external-volume allowlist and mount check use `/Volumes/EXTERNAL_DRIVE`. Home indices in examples still need confirmation in the current session. Configure these locally as described in README. No live settings or runtime files are distributed. These substitutions change configuration literals only, not download, transfer, retry, serial scheduling or composition logic.

## Excluded

Dependencies, generated extension package, build archives, media, queues, settings, connection metadata, jobs, manifests, receipts, holds, submission gates, browser profiles and all other production state.

Five untracked ad-hoc helpers are also excluded: `clean_tabs.py`, `list_all_tabs.py`, `launch_chrome.js`, `run_batch_harness.py`, and `test_unintercepted_click.py`. They are legacy/manual experiments outside the production extension path and are not needed to reproduce the published workflow. Superseded Drive duplicates of extension modules are excluded; current canonical extension modules are included. Required Python implementations and regression tests with `(1)` names are retained.

Publishing does not apply this checkout to a live installation. Updates must wait for a safe no-submission boundary and reconcile persisted work before normal deployment.

## Offline verification

145 JavaScript tests and 100 Python tests pass. `scripts/test_python.py` explicitly collects all Python regressions, including filenames ignored by ordinary unittest discovery. Two legacy test expectations were aligned with existing behavior: an explicit provider error can be recovered under the bounded policy, and account-home validation is tested through the public `home` argument rather than patching an inert wrapper attribute. Production logic is unchanged.
