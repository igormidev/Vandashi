# Asset identity and metadata revisions

An imported asset has two identities with different purposes:

- `Asset.hash` preserves the SHA-256 of the original selected file while the stored media matches the sidecar's recorded `contentHash`. Metadata embedding may change stored media bytes. When an external program changes those bytes, `Asset.hash` becomes the actual current byte hash instead of retaining a stale original identity.
- `Asset.revision` is a derived SHA-256 covering the current media bytes and exact sidecar bytes, including a distinct state for a missing sidecar. Formatting-only sidecar edits also change this revision. It is not a persisted counter and does not require migration of existing sidecars.

Import duplicate detection accepts either the effective original identity or the current stored bytes. Reimporting the original file, a renamed embedded copy, or a renamed externally edited copy returns the existing asset without replacing its reviewed metadata. The media hash cache includes size, modification time, and change time.

AI-reviewed import drafts carry `sourceHash`, the exact SHA-256 of the bytes inspected. Inspection streams the original before and after extracting evidence, requiring matching hashes and file identity timestamps; the hash remains attached while the model runs and the user edits metadata. The desktop accepts only a lowercase 64-character SHA-256 token. Import compares it before duplicate lookup or library mutation, then checks the copied bytes again before metadata embedding. Replacing the selected file requires a new inspection, even when its replacement already exists in the library. Uninspected manual fallback drafts can omit the token; their copy still receives the normal byte-integrity check.

Metadata updates require `expectedRevision` through the renderer API, desktop validation, storage port, and storage implementation. The desktop boundary accepts only a lowercase 64-character SHA-256 string. There is no force-save or omitted-revision fallback.

Storage first compares the requested revision with the current asset. It prepares embedded metadata on a disposable media copy and writes the prospective sidecar separately. Immediately before installation it reads the original asset again and requires the exact same revision. A conflict raises the typed `assetMetadataConflict` diagnostic, discards the prepared files, and leaves media, sidecar, and Git HEAD unchanged. Finished-video sources continue to use sidecars so their original media bytes remain intact.

The inspector keeps the revision associated with its editable draft. Failed saves request a new snapshot without discarding that draft; the application defers the snapshot until the user resets the editor. Reset adopts the latest fields and revision. A successful retry must therefore be based on the latest snapshot. Clean refreshes remount the inspector when its revision changes, including changes that leave the displayed metadata unchanged.

Metadata sidecars retain the existing `embeddingWarning` text for external consumers and can also carry a validated `embeddingDiagnostic`. App-owned fallback guidance uses a stable message ID; raw ExifTool details remain external text. Existing sidecars without a descriptor continue to load. This additive field does not change the asset import interface.

Local writes are serialized and each installed file uses a rename. This is optimistic concurrency, not an operating-system lock against arbitrary external programs. A program writing in the final check-to-rename interval can still race the installation, and media plus sidecar are not a single filesystem transaction.

## Verification

`tests/storage-asset-revisions.test.ts` uses real files, ExifTool, and Git to verify original/embedded duplicate detection, invalidation of stale original identities, sidecar-only and media-byte conflicts, sidecar removal, edits arriving while metadata preparation is held, unchanged files and HEAD after rejected saves, temporary-file cleanup, and successful retry with the latest revision. It also verifies strict IPC revision validation.

`tests/asset-inspection-integrity.test.ts` uses real selected files, storage, and Git with controlled inspection/model responses. Replacement during the model call or review rejects without changing the library or HEAD; inspecting the replacement permits import. It also covers stale duplicate rejection, replacement between the source hash and copy, and strict IPC token validation. `tests/application-asset-evidence.test.ts` verifies that the inspection lease's hash reaches the returned draft; the media inspection tests independently check hashes and mutation detection during actual evidence extraction.

`tests/e2e/asset-refresh.spec.ts` includes shared-library and video-library scenarios for stale inspector drafts, explicit conflict feedback, reset, and retry. The video scenario receives an external-change event; the shared scenario discovers the conflict during save. All four native asset-refresh scenarios passed on 2026-09-23, including preserved drafts after cancelling the commit dialog and exact-revision retry. These tests use controlled backend responses in the real Electron renderer; the storage suite separately verifies the file/Git behavior.
