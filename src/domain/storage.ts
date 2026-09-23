import type {
  AppState,
  Asset,
  AssetDraft,
  Brand,
  ChatSession,
  Clip,
  Commit,
  FileChange,
  Launch,
  SaveInput,
  Scope,
  Settings,
  VideoSummary,
  Workspace,
} from './models';

export interface GitStatus {
  dirty: boolean;
  paths: string[];
}
export interface StorageRecovery {
  path: string;
  backupPath: string | null;
  revision: string;
}
export type RecoveryListener = (recovery: StorageRecovery) => void;
export interface GitPort {
  init(repository: string): Promise<void>;
  head(repository: string): Promise<string>;
  contentRevision(repository: string): Promise<string>;
  status(repository: string): Promise<GitStatus>;
  diff(repository: string): Promise<FileChange[]>;
  diffBetween(repository: string, from: string, to: string): Promise<FileChange[]>;
  stage(repository: string, paths?: string[]): Promise<void>;
  commit(repository: string, title: string, body: string): Promise<string>;
  history(repository: string, page: number): Promise<{ commits: Commit[]; hasMore: boolean }>;
  readAt(repository: string, revision: string, path: string): Promise<string>;
  revisions(repository: string, path: string): Promise<string[]>;
  restore(repository: string, revision: string): Promise<void>;
  restoreFiles(repository: string, revision: string, paths: string[]): Promise<void>;
}

export interface NewClip {
  scope: Scope;
  name: string;
  ratio: '9:16' | '1:1';
  start: number;
  end: number;
}
export interface ImportedVideo {
  brandId: string;
  name: string;
  ratio: '16:9' | '9:16';
  sourcePath: string;
}

/** Persistence contracts contain no Electron or provider-specific dependencies. */
export interface StoragePort {
  getState(): Promise<AppState>;
  settings(settings: Settings): Promise<void>;
  createBrand(input: { parentPath: string; name: string }): Promise<Brand>;
  openBrand(id: string): Promise<Workspace>;
  listVideos(brandId: string): Promise<VideoSummary[]>;
  createVideo(input: { brandId: string; name: string; ratio: '16:9' | '9:16' }): Promise<Workspace>;
  importVideo(input: ImportedVideo, validateCopy: (path: string) => Promise<void>): Promise<Workspace>;
  openWorkspace(scope: Scope): Promise<Workspace>;
  saveWorkspace(input: SaveInput): Promise<Workspace>;
  createClip(input: NewClip): Promise<Clip>;
  repositories(scope: Scope): Promise<string[]>;
  projectPath(scope: Scope): Promise<string>;
  setRenderedPath(scope: Scope, path: string): Promise<void>;
  assetDirectory(scope: Scope): Promise<string>;
  writeScript(input: { scope: Scope; revision: string; content: string }): Promise<void>;
  sessions(scope: Scope): Promise<ChatSession[]>;
  getSession(id: string): Promise<ChatSession>;
  saveSession(session: ChatSession): Promise<void>;
  importAsset(input: { scope: Scope; draft: AssetDraft }): Promise<Asset>;
  updateAsset(input: {
    scope: Scope;
    assetId: string;
    title: string;
    description: string;
    tags: string[];
    commit?: { title: string; body: string };
  }): Promise<Asset>;
  deleteAsset(input: { scope: Scope; assetId: string }): Promise<void>;
  importThumbnail(input: { scope: Scope; sourcePath: string }): Promise<Workspace>;
  updateLaunch(input: { scope: Scope; launch: Launch }): Promise<void>;
  allowedPath(path: string): Promise<string>;
}
