# Local evidence for asset descriptions

Automatic metadata uses real visual evidence and optional speech recognition before asking the configured asset-description model (Luna by default). `MediaPort.inspectAsset()` returns a temporary evidence lease. `Automation` attaches the generated PNG frames, supplies timestamped speech, and releases the lease in `finally`, including model failures. Source media is never rewritten during inspection; import and embedded metadata remain a separate user-confirmed step.

Each review has a unique request ID. Once the application acknowledges inspection,
the Cancel action aborts its download/local processes or interrupts its own Codex
helper. The dialog stays locked until the operation settles and temporary evidence
has been removed. A stale cancellation ID cannot stop a later inspection or another
conversation. Progress carries the same ID, so old events cannot update a new review.

Videos attempt six evenly spaced frames across their duration, at a maximum 960-pixel dimension. Samples with no decodable frame are omitted; the review reports the actual frame count. FFmpeg applies display rotation and pixel aspect ratio. Static images supply a single decoded image; animated images can supply multiple sampled frames. Speech covers the whole file up to 90 seconds, or three 30-second beginning/middle/end windows for longer files. Sampling can miss an event, a speaker or relevant audio. The confirmation dialog states this coverage. An audio cover image does not turn an audio asset into a video.

Inspection stream-hashes the original bytes before and after local evidence
collection. The resulting SHA-256 token travels with the proposed metadata and is
checked again at confirmed import, before deduplication or library changes. Replacing
or modifying the source during AI generation or review requires a new inspection;
an old automatic description cannot silently attach to different media. This reads
the source without rewriting it. Manually entered fallback details can omit the
inspection token because no automatic description was accepted.

Speech runs entirely on the user's machine through pinned `@huggingface/transformers` **4.3.0**, `onnxruntime-node` **1.30.0**, and the multilingual quantized `Xenova/whisper-base` model. No Vandashi server, API key, Python, Homebrew package, source compilation or Whisper CLI is required. Metadata generation itself still uses the signed-in Codex account. Models are downloaded from the public Hugging Face repository on first non-silent use; audio is not sent there.

## Exact model and cache

The model is pinned to revision `64da57285918e20ea79ea5c88eed7197933abaa8`. `src/infrastructure/media/speech-model.json` records all eight files, exact sizes and SHA-256 digests, including the tokenizer and generation config. The total is 79,680,095 bytes. Downloads stream into unique temporary files, enforce exact length and SHA-256, sync, then atomically rename. Failure or cancellation removes the partial file. Every use re-verifies the cached files; a corrupt file is replaced. The app stores these files under `<userData>/models/whisper-base-q8/<revision>/`, outside project repositories. A network connection is needed only when a file is absent or corrupt.

The model card identifies Apache-2.0 for the ONNX conversion. OpenAI's original Whisper model/source uses MIT. Original model-card/license attribution and ONNX Runtime's complete upstream third-party notices are included by `scripts/generate-notices.mjs`. Do not infer that a wrapper's license replaces linked native component terms.

Set `ONNXRUNTIME_NODE_INSTALL=skip` before `npm ci` or dependency installation. The Node package already carries CPU binaries; the flag prevents its Linux x64 default CUDA download. CI sets it globally. Do not remove the platform-specific `onnxruntime-node/bin/napi-v6/<platform>/<arch>` binding or adjacent runtime libraries from packaged builds. `asar: false` currently preserves their ordinary filesystem layout.

## Bounded execution and limitations

An isolated `speech-worker.js` is a separate Electron-vite main entry. The adapter starts it using the application's executable with `ELECTRON_RUN_AS_NODE=1`, forces CPU execution and two inference threads, and exits it after each inspection. No model remains loaded in Vandashi's main or renderer processes. FFmpeg decoding is bounded to 30 seconds and 1,920,000 PCM bytes per window. A worker has a two-minute deadline; the complete inspection has a six-minute deadline. Abort/disposal terminates the owned processes, waits for closure, then removes temporary media. Model files remain reusable in the app cache.

Transformers 4.3.0's Whisper implementation currently defaults to English when language is omitted, despite its pipeline docstring suggesting automatic detection. The worker therefore obtains the initial decoder logits, selects a language token from the pinned generation config, and passes it explicitly. It uses Whisper's no-speech token probability, language confidence, a silence threshold and repetition/rate rejection before accepting text. These safeguards reduce hallucinations; they cannot prove that every accepted word is correct. The code never claims to recognize music, instruments, mood, speaker identity or voice characteristics. A transcript describes spoken subject matter only. Files without reliable visual or speech evidence enter the existing manual metadata fallback. Videos can retain useful visual descriptions when transcription or model download is unavailable.

On the development macOS ARM64 machine, two short synthetic English/Portuguese samples took about **2.25 seconds** in the production worker, with about **2.3 GB peak resident memory**. These are measurements, not cross-platform performance guarantees. Base was selected over tiny because its observed English accuracy was better; the download size substantially understates inference memory. Failed or terminated inference keeps the original file intact and falls back to manual details.

## Verification

`tests/media-inspection.test.ts` checks sample limits, silence/repetition gates and process cancellation/output caps. With `VANDASHI_MEDIA_SMOKE=1`, it generates real video/audio, extracts six frames and verifies source bytes and temporary-file cleanup. `tests/media-model-cache.test.ts` verifies exact pinned requests, corruption repair, checksum/size rejection and cancellation cleanup. `tests/application-asset-evidence.test.ts` verifies actual image attachments, timestamped prompts, authoritative media kind, manual fallback and finally cleanup. `tests/e2e/asset-inspection.spec.ts` verifies progress scoped to the chosen file, coverage notes and omission of temporary evidence fields from the confirmed import.

The production worker was independently bundled into `/tmp`, then run under both Node 24 and Electron **44.4.5** in Node mode against verified model files. English and Portuguese source speech returned their actual requested subject matter with source-language labels and bounded timestamps. Silence's no-speech probability was approximately 0.945 and a pure tone's 0.834, both above the 0.6 rejection threshold. An unsuitable synthetic voice produced repetition and is rejected rather than treated as dependable content. The complete inspector-to-Electron-worker flow was also exercised against the two original AIFF files.

A real macOS ARM64 application package was built with the worker under its production
resource path. `tests/media-speech-package.test.ts` passed against that package with
Finder's minimal PATH, verifying English/Portuguese subject matter and timestamps,
unchanged input bytes, timeout, and explicit cancellation. The installed application
used its bundled ONNX Runtime native binding. Reproduce with
`VANDASHI_PACKAGED_APP=/path/to/Vandashi.app/Contents/MacOS/Vandashi`,
`VANDASHI_SPEECH_MODEL_PATH=/path/to/verified/whisper-base-model`, and
`VANDASHI_SPEECH_FIXTURES=/path/to/synthetic/fixtures` while running that test.

Windows and Linux execution remain separate, unverified runtime checks. On upgrades,
recheck language handling, tensor outputs, tokenizer token IDs, generation settings,
exact model files, CPU installer behavior, native package notices and platform
resource loading.
