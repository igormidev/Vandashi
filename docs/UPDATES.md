# Desktop updates

`release.json` is the authoring record: the version and one to three concise notes.
`npm run version:bump -- "Short change summary."` increments the patch version in
that record, `package.json`, and both lockfile version fields. Bump before every
commit; `npm run check` verifies agreement. A source commit alone is not an update.

On a master push, the desktop workflow builds macOS ARM64, Windows x64 and Linux
x64 installers after the source gate, native UI tests and real packaged runtime
checks. Only the final job has release-write permission. It downloads those exact
artifacts and corresponding native sources, checks every installer against the
builder-generated metadata, and creates `update.json` with version, notes, target,
filename, size and SHA-512. An existing version tag must resolve to the exact
verified source commit. Installers, updater metadata, licenses and corresponding
sources are uploaded to a draft; publication happens last. Published versions
are immutable: fixes need another version. An interrupted draft can resume only
for the same commit. PRs and manual verification runs do not publish.

Target keys use Node's platform/architecture names. Installer basenames follow
Electron Builder: Linux `linux-x64-AppImage` maps to `linux-x86_64.AppImage`,
while `linux-x64-deb` maps to `linux-amd64.deb`. Discovery validates the entire
cross-platform manifest before selecting its local artifact. The release regression
passes the generated five-installer manifest through every supported target, so a
filename from another platform cannot silently break local update discovery.

The installed app checks the public GitHub Releases API at startup and every
20 minutes. `Updates` serializes checks/downloads/apply requests. Concurrent checks
coalesce; polling cannot replace a download awaiting approval. Checks continue
while a download is ready but retain the version already reviewed by the user.
Offline responses, rate limits, missing releases and malformed metadata remain
errors, never an assertion that the app is current. Development launches show that
updates require an installed build. Unsupported architectures show an explicit
installer-unavailable result rather than downloading another architecture.
Native updater construction is deferred until a native download/apply request.
Development and installer-only builds never initialize it; Electron's renamed
Linux development launcher can report `0.0`, which its semver validation rejects.

The header presents an update button and a dismissible top-right notice. The
first confirmation authorizes downloading only. Progress comes from transferred
bytes; the dialog remains locked until the request settles. A second confirmation
opens the installer or restarts to apply. Settings has an independently visible
Check for updates button on the left of its Save row, with immediate pending
feedback. All UI and app-owned diagnostics are translated in eight catalogs.

## Platform behavior

- **Unsigned macOS:** verified DMG download, then a separate Open installer action.
  Vandashi stays running. Quit it before dragging the replacement into Applications.
  Brand folders and the user-data profile are not replaced by the installer.
- **Windows NSIS / Linux AppImage:** electron-updater 6.8.9 downloads only after
  approval, with `autoDownload=false`, `autoInstallOnAppQuit=false`, no prereleases
  and no downgrades. The native feed is pinned to the reviewed release; every YAML
  file entry must match the approved manifest, and additional package URLs are
  rejected. Installer bytes are independently checked before applying. Application
  work is gated during apply and dirty/manual-editor UI blocks restart. The existing
  quit lifecycle owns process cleanup only after windows actually close. Emitted
  installer errors and canceled quit attempts retain a retryable diagnostic.
- **Linux outside AppImage:** the verified `.deb` installer opens separately, with
  the same explicit confirmation and no automatic quit.

Automatic macOS replacement requires a Developer ID Application certificate and
notarization. It is intentionally not enabled by a development certificate or an
ad-hoc signature. After signing secrets and signed release verification exist,
change the macOS mode in `DesktopUpdates`, validate MacUpdater's ZIP against the
manifest, and exercise an actual signed two-version update before enabling it.

## Ownership and recovery

Only the main process sees URLs and local cache paths. Renderer IPC accepts a
stable version string, never an arbitrary URL, command or filesystem destination.
GitHub JSON is bounded and schema-checked; fallback download redirects permit only
GitHub's HTTPS release hosts. The fallback writes a private temporary file,
checks length and SHA-512, then atomically renames it. Cached bytes are reverified
before opening. A changed/missing installer returns to the download step. Rejected
native cache files are quarantined so electron-updater's existence-only in-process
cache cannot indefinitely reuse bad bytes. Ordinary quit never installs an update.
After relaunch, choosing Download can reuse a fully verified cached file; it still
requires separate confirmation to apply.

## Reference and verification

The implementation is independent, informed by T3 Code's
`apps/desktop/src/updates/DesktopUpdates.ts` and
`apps/desktop/src/electron/ElectronUpdater.ts` at
`95030dc674883f0f2a7fd034b32ce742c8cf55d0` (MIT), inspected September 26, 2026.
See the [official updater contract](https://www.electron.build/v26/docs/features/auto-update/)
and [GitHub release API](https://docs.github.com/en/rest/releases/releases).

Focused tests cover interval/coalescing, version guards, separate confirmations,
failed checks, retries, actual upstream cache behavior, redirect restrictions,
checksums, missing/tampered bytes, native install error events, canceled quit and
IPC boundaries. Native Electron tests exercise both confirmations and Settings
loading/locks. These controlled cases do not establish that a public release or
an actual OS replacement has completed; delivery evidence belongs in
`MANUAL-VERIFICATION.md`.
