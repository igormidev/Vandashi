import { AppFault } from '../domain/diagnostics';
import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { ApiMethod, DesktopApi } from '../domain/api';

/** Selection grants are created only by native picker results or the isolated preload's real File lookup. */
export class PathPermissions {
  private readonly files = new Map<string, Promise<string>>();
  private readonly directories = new Map<string, string>();
  constructor(
    private readonly workspacePath: (value: string) => Promise<string>,
    private readonly providerImage?: (value: string) => Promise<string | null>,
  ) {}

  async grantDirectory(value: string): Promise<string> {
    const canonical = await realpath(value);
    if (!(await lstat(canonical)).isDirectory()) throw new AppFault({ id: 'desktopChooseDirectory' });
    this.directories.set(canonical, canonical);
    return canonical;
  }

  grantFile(value: string): Promise<string> {
    const promise = (async () => {
      const canonical = await realpath(value);
      if (!(await lstat(canonical)).isFile()) throw new AppFault({ id: 'desktopChooseFile' });
      return canonical;
    })();
    this.files.set(value, promise);
    void promise.then(
      (canonical) => {
        this.files.set(canonical, promise);
      },
      () => {
        this.files.delete(value);
      },
    );
    return promise;
  }

  async file(value: string): Promise<string> {
    const selected = this.files.get(value);
    if (selected) {
      const canonical = await selected;
      if ((await realpath(value)) !== canonical || !(await lstat(canonical)).isFile())
        throw new AppFault({ id: 'desktopSelectedLocationChanged' });
      return canonical;
    }
    const artifact = await this.providerImage?.(value);
    if (artifact) return artifact;
    const workspace = await this.workspacePath(value);
    if (!(await lstat(workspace)).isFile()) throw new AppFault({ id: 'desktopChooseFile' });
    return workspace;
  }

  async authorize(method: ApiMethod, args: unknown[]): Promise<void> {
    if (method === 'createBrand') {
      const input = args[0] as Parameters<DesktopApi['createBrand']>[0];
      const canonical = await realpath(input.parentPath);
      if (!this.directories.has(canonical)) throw new AppFault({ id: 'desktopBrandPickerRequired' });
      input.parentPath = canonical;
    } else if (method === 'sendChat') {
      const input = args[0] as Parameters<DesktopApi['sendChat']>[0];
      input.attachments = await Promise.all(input.attachments.map((attachment) => this.file(attachment)));
    } else if (method === 'describeAsset') {
      const input = args[0] as Parameters<DesktopApi['describeAsset']>[0];
      input.path = await this.file(input.path);
    } else if (method === 'importAsset') {
      const input = args[0] as Parameters<DesktopApi['importAsset']>[0];
      input.draft.sourcePath = await this.file(input.draft.sourcePath);
    } else if (
      method === 'importThumbnail' ||
      method === 'importFinishedClip' ||
      method === 'importFinishedVideo'
    ) {
      const input = args[0] as Parameters<DesktopApi['importThumbnail']>[0];
      input.sourcePath = await this.file(input.sourcePath);
    } else if (method === 'saveWorkspace') {
      const input = args[0] as Parameters<DesktopApi['saveWorkspace']>[0];
      if (input.brandConfig?.image && isAbsolute(input.brandConfig.image))
        input.brandConfig.image = await this.file(input.brandConfig.image);
    }
  }
}
