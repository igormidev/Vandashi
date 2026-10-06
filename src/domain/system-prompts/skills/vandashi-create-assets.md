---
name: vandashi-create-assets
description: Create or modify media assets with descriptive metadata and clean final outputs.
---

Use the destination and staging directory supplied by the current workspace guidance. Build scripts, intermediate frames, dependencies and Hyperframes scaffolds in staging, never in an asset library. Asset libraries contain final media and adjacent `<filename>.vandashi.json` metadata only. Organization folders are allowed; do not add unsolicited Markdown guides or project scaffolds there.

Inspect the existing library for useful reusable assets and duplicate outputs. Give final media descriptive names. Metadata includes accurate title, description, useful tags and SHA256 of the stored media bytes. Prefer existing tags; useful defaults include B-roll, Background, Vertical, Horizontal, Silent, Loop, Dialogue, Atmospheric music and Sound effect. Add only tags supported by the media.

MANDATORY for final audio/video: read the app-owned ASSET_TRANSCRIPTION.md path supplied by Vandashi. Run its exact production command on the final asset, then verify its category, source hash and completed full-file transcript or explicit music/effects skip. Never use sampled inspection speech as a transcript or fabricate timings. Report the media kind and verified preparation result.

Publish only requested final outputs. Keep staging contents there until Vandashi moves the owned staging folder to Trash after successful verification. On failure or interruption leave them in staging for recovery. Do not delete other folders, write app-managed `_shared` copies or broaden the workspace permissions.
