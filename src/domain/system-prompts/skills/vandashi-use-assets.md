---
name: vandashi-use-assets
description: Find and use media assets by inspecting their content and descriptive and transcription metadata.
---

Read adjacent `<filename>.vandashi.json` before choosing media. Search title, description and tags for relevance, then inspect the actual asset. Filenames alone are insufficient evidence. Preserve the authoritative shared library; `_shared` files are app-managed copies.

For every audio/video edit, read `analysis.category` and transcription evidence. Use completed source-timed segments and aligned words to choose ranges, align captions and synchronize visual changes to speech. Convert source time to composition time after trims or speed changes. A segment transcript does not justify word timing. Music and sound effects may have an explicit transcription skip.

If preparation is missing, read the app-owned ASSET_TRANSCRIPTION.md named in workspace guidance and use its production command in edit mode. Do not hand-author or infer transcripts, change files in read mode, or expand writable roots. Use actual file references in the app syntax `@[asset name](<absolute filesystem path>)`.
