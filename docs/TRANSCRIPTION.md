# Audio/video metadata

Vandashi prepares audio/video assets for timing-aware editing with local WhisperX
transcription and YAMNet classification. At startup it verifies registered shared
asset sources. Workspace entry checks local assets. Audio imports ask for Dialogue,
Music, or Sound effect before processing. Music/effects retain their classification
without a speech transcript; video speech is always analyzed. An empty completed
transcript means no speech was detected, not that processing was skipped.

First launch installs a private Python runtime and the `large-v3-turbo` model.
Initial setup needs internet and several GB of free disk space. Model weights alone
use about 1.62 GB; runtime and language alignment models add to this. macOS currently
runs CPU int8 inference. Settings can install/select tiny, base, small, medium,
large-v3-turbo, or large-v3. Changing the default preserves existing valid transcripts.

Metadata is stored beside the media as `<filename>.vandashi.json`:

```json
{
  "analysis": {
    "schemaVersion": 1,
    "sourceHash": "<sha256 of analyzed source>",
    "category": "dialog",
    "categorySource": "user",
    "transcription": {
      "status": "complete",
      "engine": "whisperx",
      "model": "large-v3-turbo",
      "language": "en",
      "duration": 4.2,
      "alignment": "word",
      "segments": [{ "start": 0.4, "end": 1.8, "text": "Hello world." }],
      "words": [{ "start": 0.4, "end": 0.9, "text": "Hello" }]
    }
  }
}
```

Times are seconds in the original asset. Editing must account for trims, timeline
placement and playback speed. Read `alignment` before using word timing: unsupported
alignment languages retain complete ASR text with segment timing, and some words may
remain unaligned. Automatic speech recognition is fallible; review caption text.

AI asset additions use the exact command in the app-owned `ASSET_TRANSCRIPTION.md`,
whose absolute path is supplied on every turn. It invokes the same production
analysis and sidecar writer as the UI, reports whether the file is audio/video,
and verifies saved metadata. The command does not commit. Vandashi checks all
participating repositories afterward, repairs missed metadata, synchronizes shared
copies and commits under the same operation lease before allowing the next turn.

Source files are never transcoded to add transcripts. Existing embedded descriptions
are preserved, and full transcripts stay in the sidecar to avoid container size limits.
External media replacement invalidates previous analysis. Interrupted or failed
preparation preserves completed metadata and offers retry; it does not report an
unprocessed file as complete. A missing registered folder can be reopened from Brands.

Runtime provenance, exact pins and third-party licenses are recorded alongside the
worker in `src/infrastructure/transcription/resources/`.

## Verification for 0.1.9

The required source gate passed: 972 tests, strict TypeScript, zero-warning lint,
dependency boundaries, catalog checks, formatting, and both production builds.
Thirteen existing platform/opt-in cases remain skipped in that ordinary run.
Six focused native UI cases passed, including development React replay, category
review/retry, visible progress, model-selection locking, and import cancellation.
Independent storage/application and UI/runtime reviewers checked the final fixes.

On this Apple Silicon Mac, the real private uv/Python bootstrap completed and
large-v3-turbo transcribed the entire 10.84-second English fixture with 19 aligned
words. Actual YAMNet classification was exercised with speech and silence. The
bundled CLI also ran in offline mode and verified its persisted sidecar using the
same adapter/writer as the app. A fresh-cache installation verified the sole pinned
pure-Python source-build exception. These checks establish integration, not general
recognition accuracy or fresh Windows/Linux runtime acceptance.

Existing public screenshots remain accurate and keep their documented source
revision. The eight landing catalogs now disclose first-run downloads and disk space.
