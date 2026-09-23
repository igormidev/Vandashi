# Packaged speech verification recordings

These two short WAV recordings come from **PolyAI, MInDS-14: Multilingual Intent
Detection from Spoken Data (2021)**. The publisher licenses the dataset under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
The full license is preserved in `LICENSE.CC-BY-4.0.txt`; these recordings are not
covered by Vandashi's MIT license. No endorsement by the speakers or publisher is implied.

The files are unchanged bytes supplied by the dataset viewer for
[revision `40ce77cb32a384e4d50a568e1ec39ac804019d33`](https://huggingface.co/datasets/PolyAI/minds14/tree/40ce77cb32a384e4d50a568e1ec39ac804019d33).
The [publisher's dataset card](https://huggingface.co/datasets/PolyAI/minds14/blob/40ce77cb32a384e4d50a568e1ec39ac804019d33/README.md)
records the license. `manifest.json` preserves each language/configuration, row,
original path, reference transcription, size and SHA-256. The recordings contain
generic questions about opening a joint account and depositing money, with no
account number or name. Together they are 148,940 bytes.

Verify the committed files without network access:

```sh
node scripts/restore-speech-fixtures.mjs
```

Reproduce the source files in a separate directory:

```sh
node scripts/restore-speech-fixtures.mjs --download --output /tmp/vandashi-speech-fixtures
```

This fetches the public dataset viewer metadata and the two small recordings. It
requires the exact recorded revision/path and verifies the original byte hashes
before publishing either file. If the viewer stops serving this revision, it fails
instead of substituting a later recording. The pinned upstream Parquet files and
row identities provide the archival source; CI uses the committed WAVs and does
not rely on these download URLs.

The packaged test decodes a temporary copy to mono 16 kHz float PCM with FFmpeg:

```sh
ffmpeg -v error -i english.wav -ar 16000 -ac 1 -f f32le english.pcm
ffmpeg -v error -i portuguese.wav -ar 16000 -ac 1 -f f32le portuguese.pcm
```

The test checks the production language detector, recognizable subject matter and
timestamp bounds, without requiring a verbatim transcript. It verifies the WAV
hashes again afterward and deletes the temporary PCM. These fixtures are used only
by repository tests and are not included in the application's packaged resources.

Original-sentence eSpeak NG 1.52.0 samples were investigated first. Its tested
Portuguese formant voices did not pass the production confidence thresholds, so
the tests use these explicitly licensed recordings without reducing those safeguards.
