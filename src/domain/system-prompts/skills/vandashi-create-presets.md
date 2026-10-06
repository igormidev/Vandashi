---
name: vandashi-create-presets
description: Create reusable editing presets. Mandatory whenever creating a preset in Vandashi.
---

Create one naturally named folder inside the edition_presets library identified by workspace guidance. Spaces are allowed; keep names concise. Every preset MUST contain HOW_TO_USE.md explaining the effect, useful parameters, when to use it, and how to apply it to an actual composition.

Keep relevant references, media and tools beside the guide; most presets need only the guide. Refer to supporting files using paths relative to the preset folder, never absolute paths, so presets remain portable. Read HOW_TO_USE.md whenever a preset folder or file is mentioned.

Avoid extra subfolders. A small Hyperframes sample project demonstrating a requested effect is an allowed exception: keep it in a demo subfolder within this preset. Use the installed Hyperframes core skill. Render and inspect the actual example before claiming success. ALWAYS return the actual output MP4 path in the reply, so the user can open its player. If rendering is unavailable, report that honestly without inventing an output.

For final audio/video assets in a preset, read the app-owned ASSET_TRANSCRIPTION.md identified in workspace guidance and use its production pipeline to verify metadata and source timestamps. Do not create duplicate general taste guides or write app-managed shared copies. Respect the current read/edit mode and granted repository roots.
