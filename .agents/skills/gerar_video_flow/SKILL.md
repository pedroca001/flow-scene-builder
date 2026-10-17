---
name: gerar_video_flow
description: Operate the configured Flow Scene Builder through its production extension, persistent queue and verified local media pipeline.
---

Read the repository AGENTS.md and README before acting. Resolve `<REPO>` from this skill's path. Configure the authorized session, route and volume locally; public example values are not usable production settings.

For the paired 300-video production workflow, use only `scripts/run_serial_300_flow.py --root <BATCH> --output <DESTINATION>`, one process and one active video. Each pair produces one 8-second hook plus four continuous 8-second recipe scenes. Keep at least 30 seconds between confirmed sends, x1, free Lower Priority, first result, no quality retries.

Use the existing manifest and jobs on resume. Never issue another start for a source already indexed. Download programmatically, verify the asset UUID and SHA-256, and compose only matching hook/recipe pairs. Preserve uncertain sends, attempts, holds and receipts.

Ten-minute recovery requires explicit saved authorization and a fresh ordinary UI check. Active account challenges/login/quota/cost stop sends. Do not capture or replay tokens or change identity to release a block.

Inspect local process/state compactly. Healthy production does not require continuous model checks. Completion means every requested final physically exists, has verified media/hash receipts and no source remains pending.
