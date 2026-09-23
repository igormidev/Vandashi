# Finished video imports

The Videos page offers **Import finished video** independently of the Launch tab. This implements the upload-only entry described in `genesis_prompt.md:600–604` while keeping empty composition projects' Launch tabs disabled as required at line 382.

A native picker grants access to the selected file. The backend probes it, accepts actual 16:9 or 9:16 media with at most two pixels of rounding and one percent ratio error, and rejects unsupported ratios. Square media continues to use the existing clip-import workflow; it is not relabeled as portrait or introduced as a new top-level aspect ratio.

Import reserves a new project name without adopting existing folders. A hidden temporary repository receives the original media bytes, authoritative metadata sidecar, packaging, script and release files. It verifies source/copy hashes, probes the copied media again, and commits before publishing the manifest last. Failures remove only the newly reserved and temporary directories. No Hyperframes canvas, AI edit, transcode or render is generated.

`VideoSummary.origin` distinguishes `imported` from `composition`; old manifests default to `composition`. Imported projects open Launch and keep Packaging and Assets available. Creation and Manual editing are unavailable because there is no editable composition; those operations are also rejected at the backend. A landscape import can supply real source media to the existing clip workflow, which retains its normal creation dependency checks.

The copied video remains Git-tracked. Imported freshness compares the actual media's SHA-256, cached by size/mtime/ctime. Unrelated packaging or shared-asset changes do not invent a need to render a nonexistent composition. Publishing still requires a clean workspace. Editing the imported source's asset description/tags uses its sidecar and preserves video bytes; deleting media referenced by the project manifest is blocked. An external byte change invalidates the upload-ready media.

`tests/finished-video.test.ts` exercises the application, real temporary storage and Git, including copy failure cleanup, grants, aspect ratios, source deletion/reopen, unchanged media bytes, metadata edits, guarded source deletion and media freshness. `tests/e2e/finished-video.spec.ts` covers the renderer's Videos-to-unsent-upload flow with deterministic chat responses, and separately exercises actual desktop IPC, native grants, FFprobe and storage. Native test execution is tracked with the release verification; test source alone is not a claim of execution.
