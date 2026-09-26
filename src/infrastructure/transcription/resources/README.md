# Managed local transcription runtime

Vandashi installs a private Python 3.11.15 environment with uv 0.10.9. The three
platform requirement files pin package versions and distribution SHA-256 hashes.
Windows and Linux select PyTorch's CPU index. Installation does not alter system
Python, require administrator access, or install CUDA.
ANTLR 4.9.3 is the sole source-build exception because its publisher supplies no
wheel; it is pure Python, has a pinned source digest, and uses pinned build tools
from `build-constraints.txt`. All other packages require prebuilt wheels.

`worker.py` accepts a private request JSON file and emits JSON-lines progress/result
events. Both the desktop application and its asset command use this same worker.
Media is decoded by Vandashi's verified FFmpeg path; media bytes stay local.
WhisperX performs full-file transcription and optional language-specific word
alignment. Unavailable alignment languages retain segment timing, never fabricated
word timing. A silent source has a completed empty transcript.

`models.json` pins exact Hugging Face revisions, lengths and SHA-256 values for six
Whisper models, alignment models, the official YAMNet TFLite model and NLTK data.
Only the selected ASR model is installed initially. Alignment weights download on
first use of a supported language; later use works offline. Existing verified
metadata does not require rerunning inference when the selected model changes.

YAMNet runs through LiteRT over the full audio. Speech in any window and ambiguous
results retain the dialog path. User-selected music/sound effects skip transcription.
Video speech is always transcribed. Silero weights come from its pinned wheel;
WhisperX's default unpinned `torch.hub` downloader is never invoked.

## Upstream notices and provenance

- [WhisperX](https://github.com/m-bain/whisperX/tree/v3.8.6): BSD-2-Clause.
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper/tree/v1.2.1),
  [CTranslate2](https://github.com/OpenNMT/CTranslate2),
  [Silero VAD](https://github.com/snakers4/silero-vad): MIT.
- [Whisper weights](https://github.com/openai/whisper): MIT; converted model
  repositories and immutable revisions are recorded individually in `models.json`.
- [YAMNet](https://github.com/tensorflow/models/tree/master/research/audioset/yamnet)
  and [LiteRT](https://github.com/google-ai-edge/LiteRT): Apache-2.0.
- [PyTorch](https://github.com/pytorch/pytorch): BSD-3-Clause.
- [uv](https://github.com/astral-sh/uv/tree/0.10.9): MIT or Apache-2.0.
- [NLTK](https://github.com/nltk/nltk_data): each downloaded data package retains
  its own included license. Punkt data includes its model README files.

Downloaded Python wheels retain their distribution metadata and license files.
Managed Python comes from Astral python-build-standalone with its included notices.
Alignment model licenses and source identifiers are recorded in `models.json`.
The runtime guide is application-owned; user-facing AI asset instructions are
provided separately by the desktop application and its CLI wrapper.

The AI command uses read-only cache mode: it verifies prepared models and never
creates a host cache lock, installs packages or downloads missing weights. Missing
dependencies produce a retryable failure; the desktop verification pass can finish
the installation and metadata update under its own operation lease.
