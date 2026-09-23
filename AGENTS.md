# Working on Vandashi

Read `genesis_prompt.md` and `docs/REQUIREMENTS.md` before changing a feature. The brief is the product contract. Update this file and `docs/ARCHITECTURE.md` whenever relevant architecture changes.

## MANDATORY quality gates

- ALWAYS follow dependency boundaries. NEVER bypass a port to reach the filesystem, Codex, Git, Electron, or Hyperframes from the renderer.
- ZERO static analysis warnings or errors. Run `npm run check` before EVERY commit. This includes consistent Prettier formatting, strict types, lint, architecture, tests, and a production build. NEVER disable checks to make a commit pass. Git hooks and CI enforce the same gate.
- Add meaningful tests for business rules, concurrency, recovery, schemas, and edge cases. Avoid tests that merely restate code.
- COMMIT after each verified feature or meaningful increment. Ask before every commit: does this meet the brief, handle failure and edge cases, preserve architecture, avoid unnecessary UI text, and require updated documentation?
- Check ALL consumers of a shared component before editing it. Test it on EVERY affected page, especially brand and video assets and chat.
- Never claim a feature works from compilation alone. Exercise real integrations and inspect the actual app. Record unavailable external prerequisites honestly.
- NEVER hardcode user-facing text in UI components. Add English locale keys; translations come only after the app is complete.
- Keep app-owned message descriptors separate from raw provider output and user content. Use `AppFault` with a typed ID from `src/domain/messages.ts` for app-owned errors and retain external diagnostics separately. IPC uses a validated failure envelope, then a versioned marker through Electron's copied Error.message; decode only at the renderer boundary. Never infer a translation key by matching English prose. Keep native dialog text in its typed source catalog and preserve raw user/provider content.

## Design contract

Use Hyperframes' studio visual language: quiet dark surfaces, restrained borders, compact controls, sparse copy. Do not put everything in cards or add empty marketing subtitles. Explain with accessible tooltips. Use official platform marks. Horizontal scrollers carry padding INSIDE their content so scrolling reaches the component edge. Keep keyboard navigation, focus visibility, reduced motion, and error recovery usable.

## Safety and consistency

Only one AI operation runs globally. Dirty manual drafts block AI and navigation; active AI blocks manual writes. All repository changes must be committed after AI, including failure recovery. Script synchronization has an explicit staged-script exception. Preserve user files, validate path containment and symlinks, and keep recovery backups before repairing invalid YAML. Never expose generic shell or unrestricted filesystem IPC.

Brand creation checks Git before writing and prepares both initial repositories in a private staging
directory. Never recursively clean a published brand or an existing user folder after failure. An
unregistered brand can resume registration only at the exact requested path with a valid creation
manifest, complete files, and unchanged clean initial commits. Project names cannot start with a dot.
Video/clip media preparation runs under the unpublished storage transaction. Publish prepared files
exclusively with the manifest last, and never reenter the storage queue from a preparation callback.
Once a clip is published, later chat/refresh failure must return its saved receipt and retry prompt;
it must not be treated as a failed creation or trigger automatic duplicate creation.

Media playback regressions must exercise the production protocol with real native file grants. Fixture protocol replacements do not verify seek behavior or access control. Preserve range metadata and restrictive response policies when changing media delivery.

Provider image capabilities come only from completed Codex items or freshly verified provider history. Never grant access from renderer Markdown or local session metadata alone, and never broaden access to a Codex-home or temporary directory. Revalidate the exact canonical artifact before every read.

An uncertain AI start must await process shutdown before file recovery or lease release. Preserve uncertain edits; never restore staged files merely because the start acknowledgement was lost. History recovery must preserve app receipts and verified undo boundaries.

Keep UI editing locked through workspace refreshes, not only the preceding operation.
Never replace a dirty local draft with an asynchronous snapshot. Validation belongs to
the complete workspace scope. Async modal actions must lock both controls and dismissal
until they resolve; preserve entered values and offer retry when they fail.

Asset-inspection progress, cancellation, and evidence ownership use a unique request
ID. Reattach to pending work across development StrictMode effect replay; never launch
a duplicate operation and abandon its cancellation handle. Retain the operation lease
until processes stop and temporary evidence is disposed. Preserve the inspected
source hash through review and reject changed source bytes before importing metadata.

Structural changes require a separate read-only agent to check whether the landing page and screenshots are still accurate. Do not add claims for unfinished features. Every agent reads the original brief. Final audits must be independent and section-specific.
