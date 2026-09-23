# Native source distribution

This source bundle accompanies Vandashi's bundled **sharp 0.35.4 / libvips 8.18.6** implementation, including the `@img/sharp-libvips-*` 1.3.3 and `@img/sharp-wasm32` 0.35.4 dependencies. It contains source archives and build recipes, not just links to upstream websites. Its scope is sharp/libvips and their reported components; it is not a blanket statement about every native program installed on the user's computer or every component of Electron and Windows Strawberry Perl.

## Produce and verify the bundle

With the project's locked development dependencies installed:

```sh
node scripts/native-sources.mjs --check
node scripts/native-sources.mjs
node scripts/native-sources.mjs --offline --verify-only
node scripts/native-source-verify.mjs
```

The first command checks the reviewed source coverage against the lockfile and installed native component versions without downloading anything. The second downloads missing source payloads into `build/native-source-cache`, verifies their exact byte lengths and SHA-256 hashes, and creates `build/native-sources/vandashi-native-sources-sharp-0.35.4.tar.gz` and its `.sha256` file. The third checks all cached payloads without network access. The final command verifies the assembled archive's contents against its receipt and the committed source manifest without extracting or executing it. `npm run package` assembles and verifies this source artifact before creating installers. The development-only `package:dir` command checks source-version coverage without producing the release archive.

Downloaded archives are never executed by these commands. Existing cache files with different bytes cause a failure; they are not silently trusted or overwritten. The large generated cache and archive stay outside Git. After a source manifest change, an old cache entry with the same filename must be removed intentionally before downloading its replacement.

The archive contains:

- `archives/`: original component source archives, patches, build repositories and Rust crate archives, each with a fixed source URL, size and SHA-256 in the manifest.
- `native-sources.lock.json`: the reviewed source manifest and component-version coverage for POSIX, Windows and WebAssembly builds.
- `CONTENTS.json`: every included file's SHA-256, the source and application lock hashes, the observed installed native component versions, and source-payload counts.
- `vandashi-source/`: the application's current source files, build configuration, npm lockfile, generator scripts and original license/source records. This snapshot lets recipients rebuild the corresponding application without relying solely on a repository URL.
- `README.md`: this document.

The current source collection has **395 payloads totaling 310,888,963 bytes** before archive overhead. It covers every component/version reported by the inspected macOS ARM64, Linux x64, Windows x64 and WebAssembly package inventories. Other supported native architectures use the same platform build recipes; the `--check` command still checks their actual installed inventories before packaging.

## Exact source records

| Build                                       | Source record                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POSIX libvips packages 1.3.3                | `lovell/sharp-libvips` commit `6e5971d333377743163edc3ad9e5d0b897abcbc9`, tag `v1.3.3`; source URLs, versions, compiler options and patches are in `versions.properties`, `build/posix.sh` and `platforms/`.                                                                                   |
| Windows libvips 8.18.6                      | `libvips/build-win64-mxe` commit `09cfccf20b91b441fbe97fa7a7ed8a597e55e830`, tag `v8.18.6`; includes its custom MXE plugins, patches and build configuration. The corresponding `kleisauke/mxe` base branch snapshot is commit `d973945bb92c7783d5afa41bb2b8d2e1a04eaba3`.                     |
| WebAssembly                                 | `kleisauke/wasm-vips` commit `79103664d21ce00982e80571cf12f58bd3dcc5f3`; this is the last upstream commit before publication of the 1.3.3 development package and matches all reported WebAssembly component versions. It pins Emscripten 6.0.8 and Rust nightly 2026-08-25 in its Dockerfile. |
| sharp native bindings/application interface | Full `lovell/sharp` source for tag `v0.35.4`, including native C++ sources and build configuration.                                                                                                                                                                                            |

The POSIX and Windows recipes report a different AOM version (3.15.0 and 3.14.1 respectively); both original archives are included. WebAssembly uses resvg 0.48.1 rather than librsvg 2.62.91; both are included. The collection retains each platform's patches rather than substituting the POSIX build for all platforms.

The 350 registry crates in librsvg's `Cargo.lock` are individually included and were checked against that lockfile's checksums. The resvg source release already vendors all 88 registry packages identified by its lockfile. The Rust source component already vendors all 31 registry packages identified by its standard-library lockfile. Those original vendor trees remain inside their source archives. The Rust source archive also matches the checksum published by the Rust project for nightly 2026-08-25.

Two original download hosts rejected retrieval during assembly. The libtiff payload uses the project's official 4.7.2 release archive from `download.osgeo.org`. Fontconfig uses the official GitHub mirror's exact 2.18.3 tag commit, `0f236723a3c26bd9745e32ba2b3ee21e5f809295`. These alternative source archive layouts are recorded, not represented as byte-identical copies of GitLab's automatic snapshots. The manifest pins the actual bytes supplied here.

## Rebuilding and replacement

Extract the source archive into a new directory, retaining its license files. Each payload in `archives/` is still its original upstream archive; unpack the component or recipe archive needed for the target platform. Follow the included upstream build instructions and apply the included patches in the order recorded by that build recipe. The manifest maps each original source URL to the exact payload supplied alongside it. No current branch tip or newly resolved dependency is needed to obtain the collected source bytes.

For POSIX, the original `sharp-libvips/build.sh` supports `darwin-arm64v8`, `darwin-x64`, `linux-x64`, `linux-arm64v8` and the other targets listed in that file. It calls `build/posix.sh` and includes target CMake/Meson settings. For Windows, use the included `build-win64-mxe` source and its web/static configuration used by `sharp-libvips/build/win.sh`. For WebAssembly, use the included wasm-vips snapshot and the options shown in `sharp-libvips/build/wasm.sh`: `--disable-bindings --disable-modules --disable-jxl --enable-libvips-cpp`.

The original recipes install external build tools and may fetch their source inputs through `curl`, Cargo or a compiler package manager. The source bundle does not run or rewrite those recipes, and it is not a preconfigured offline compiler image. Configure their source/cache locations to use the supplied archives; retain the pinned component versions and recorded patches. Emscripten and Rust runtime source are included for the WebAssembly configuration. General system compilers, SDKs, Docker, Meson, CMake and similar build tools must be installed separately as specified by the upstream recipe.

Build sharp's native bindings from the included sharp source against the rebuilt libvips. Vandashi uses unpacked application dependencies (`asar: false`); the shipped native modules and libvips files remain ordinary files under the application's `node_modules/@img` directories. Preserve the module's exported interface and target architecture when substituting a compatible rebuilt library. To rebuild Vandashi itself, use its included `vandashi-source` tree, run `npm ci`, then `npm run build`. The application source and npm lockfile are included so this route does not depend on reverse engineering a minified binary.

This collection has been verified for source availability, hashes, version coverage, included Rust vendor packages and archive integrity. All eight collected POSIX/WebAssembly patches were also applied successfully to fresh copies of their matching source files in temporary directories. **It has not been used to rebuild every supported native binary.** Upstream's original WASM packaging called a moving `HEAD` and did not record the selected wasm-vips commit in the npm package. The chosen snapshot matches the publication timeline and all reported versions, but the original build identity remains an inference. Some original POSIX/compiler installation steps also use an unpinned nightly toolchain. Do not describe this artifact as proof of bit-for-bit reproduction or a legal certification.

## Installer and CI integration

The source archive and checksum must accompany the installers that use this dependency set. Publish both from the same release/download location as the installers, retain them for as long as those installers are distributed, and link the source archive from the release description. A temporary CI artifact or a list of upstream URLs is not a substitute for the assembled download.

The verification workflow now creates the source artifact before running the installer jobs:

1. A Linux `native-sources` job runs `npm ci`, `node scripts/native-sources.mjs`, and `node scripts/native-source-verify.mjs`. Cache `build/native-source-cache` under a key derived from `scripts/native-sources.lock.json`; cache integrity is still verified on every run.
2. Each installer job runs `node scripts/native-sources.mjs --check` after installing its target dependencies. This rejects a changed native component/version that has no reviewed source payload, before packaging.
3. The desktop matrix depends on successful source collection and verification. The source job uploads the generated `.tar.gz` and `.sha256` with `if-no-files-found: error`; its downloaded material is cached by the source manifest hash and rechecked every time.
4. When publishing an installer release, upload the source archive and checksum alongside the macOS, Windows and Linux installers in the same release operation. Keep that complete source archive as a durable release asset. The current workflow collects CI artifacts with 14-day retention and does not publish releases; that retention alone does not implement durable source delivery.

Changing sharp/libvips requires updating the manifest from the new upstream recipes, collecting any added component archives and patches, verifying their hashes and actual native version inventories, and rerunning the source tests. The collector intentionally refuses unknown component versions rather than presenting a previous source bundle as coverage for an upgraded binary.
