import type {
  AppState,
  AspectRatio,
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
  checkAvailable(): Promise<void>;
  init(repository: string): Promise<void>;
  head(repository: string): Promise<string>;
  contentRevision(repository: string): Promise<string>;
  status(repository: string): Promise<GitStatus>;
  diff(repository: string): Promise<FileChange[]>;
  diffBetween(repository: string, from: string, to: string): Promise<FileChange[]>;
  stage(repository: string, paths?: string[]): Promise<void>;
  indexEntries(repository: string, paths?: string[]): Promise<string>;
  stagedIndexEntries(repository: string): Promise<string>;
  restoreIndexEntries(repository: string, paths: string[], entries: string, expected: string): Promise<void>;
  commit(repository: string, title: string, body: string, expectedHead?: string): Promise<string>;
  history(repository: string, page: number): Promise<{ commits: Commit[]; hasMore: boolean }>;
  readAt(repository: string, revision: string, path: string): Promise<string>;
  revisions(repository: string, path: string): Promise<string[]>;
  restore(repository: string, revision: string, expectedHead?: string): Promise<string>;
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
export interface ImportedClip {
  scope: Scope;
  name: string;
  ratio: '9:16' | '1:1';
  sourcePath: string;
  duration: number;
}
/** Called on a private unpublished project. Must not reenter this storage port. */
export type ProjectPreparation = (project: {
  path: string;
  name: string;
  ratio: AspectRatio;
}) => Promise<void>;

/** Registered paths only: discovery must never synchronize assets or repair project files. */
export interface AgentScopePaths {
  repositories: string[];
  sharedScopes: Scope[];
  cwd: string;
}

/** Persistence contracts contain no Electron or provider-specific dependencies. */
export interface StoragePort {
  getState(): Promise<AppState>;
  settings(settings: Settings): Promise<void>;
  createBrand(input: { parentPath: string; name: string }): Promise<Brand>;
  openBrand(id: string): Promise<Workspace>;
  listVideos(brandId: string): Promise<VideoSummary[]>;
  createVideo(
    input: { brandId: string; name: string; ratio: '16:9' | '9:16' },
    prepare?: ProjectPreparation,
  ): Promise<Workspace>;
  importVideo(input: ImportedVideo, validateCopy: (path: string) => Promise<void>): Promise<Workspace>;
  openWorkspace(scope: Scope): Promise<Workspace>;
  saveWorkspace(input: SaveInput): Promise<Workspace>;
  createClip(input: NewClip, prepare?: ProjectPreparation): Promise<Clip>;
  importClip(input: ImportedClip, validateCopy: (path: string) => Promise<void>): Promise<Clip>;
  repositories(scope: Scope): Promise<string[]>;
  discoverAgentScope(scope: Scope): Promise<AgentScopePaths>;
  projectPath(scope: Scope): Promise<string>;
  setRenderedPath(scope: Scope, path: string): Promise<void>;
  assetDirectory(scope: Scope): Promise<string>;
  syncSharedAssets(scope: Scope): Promise<void>;
  writeScript(input: { scope: Scope; revision: string; content: string }): Promise<void>;
  sessions(scope: Scope): Promise<ChatSession[]>;
  getSession(id: string): Promise<ChatSession>;
  saveSession(session: ChatSession): Promise<void>;
  importAsset(input: { scope: Scope; draft: AssetDraft }): Promise<Asset>;
  updateAsset(input: {
    scope: Scope;
    assetId: string;
    expectedRevision: string;
    title: string;
    description: string;
    tags: string[];
    commit?: { title: string; body: string };
  }): Promise<Asset>;
  deleteAsset(input: { scope: Scope; assetId: string; expectedRevision: string }): Promise<void>;
  importThumbnail(input: { scope: Scope; sourcePath: string }): Promise<Workspace>;
  updateLaunch(input: { scope: Scope; launch: Launch }): Promise<void>;
  allowedPath(path: string): Promise<string>;
}
