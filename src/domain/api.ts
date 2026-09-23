import type {
  AppEvent,
  AppState,
  Asset,
  AssetDraft,
  Brand,
  Chapter,
  ChatRequest,
  ChatSession,
  Clip,
  Commit,
  DependencyCheck,
  FileChange,
  Launch,
  ModelInfo,
  Packaging,
  SaveInput,
  Scope,
  Settings,
  StudioInfo,
  VideoSummary,
  Workspace,
} from './models';
import type { Diagnostic } from './diagnostics';

export interface CreatedClip {
  clip: Clip;
  generation: { status: 'started' } | { status: 'failed'; diagnostic: Diagnostic; prompt: string };
}

/** Transient response metadata; deferred history has not refreshed provider artifact grants. */
export type OpenedChat = ChatSession & { historyDeferred?: true };

export interface DesktopApi {
  getState(): Promise<AppState>;
  chooseDirectory(): Promise<string | null>;
  chooseFiles(kind: 'assets' | 'images' | 'video'): Promise<string[]>;
  createBrand(input: { parentPath: string; name: string }): Promise<Brand>;
  openBrand(id: string): Promise<Workspace>;
  listVideos(brandId: string): Promise<VideoSummary[]>;
  createVideo(input: { brandId: string; name: string; ratio: '16:9' | '9:16' }): Promise<Workspace>;
  importFinishedVideo(input: { brandId: string; name: string; sourcePath: string }): Promise<Workspace>;
  openWorkspace(scope: Scope): Promise<Workspace>;
  saveWorkspace(input: SaveInput): Promise<Workspace>;
  suggestCommit(input: { scope: Scope; summary: string }): Promise<{ title: string; body: string }>;
  history(input: { scope: Scope; page: number }): Promise<{ commits: Commit[]; hasMore: boolean }>;
  checks(input: { scope: Scope | null; video: boolean }): Promise<DependencyCheck[]>;
  models(): Promise<ModelInfo[]>;
  settings(settings: Settings): Promise<void>;
  sessions(scope: Scope): Promise<ChatSession[]>;
  openChat(input: { scope: Scope; topic: string; title: string }): Promise<OpenedChat>;
  closeChat(id: string): Promise<void>;
  resetChat(id: string): Promise<ChatSession>;
  sendChat(request: ChatRequest): Promise<void>;
  cancelChat(): Promise<void>;
  undoChat(id: string): Promise<ChatSession>;
  importAsset(input: { scope: Scope; draft: AssetDraft }): Promise<Asset>;
  describeAsset(input: { scope: Scope; path: string; requestId: string }): Promise<AssetDraft>;
  cancelAssetInspection(requestId: string): Promise<void>;
  updateAsset(input: {
    scope: Scope;
    assetId: string;
    expectedRevision: string;
    title: string;
    description: string;
    tags: string[];
    commit?: { title: string; body: string };
  }): Promise<Asset>;
  deleteAsset(input: { scope: Scope; assetId: string }): Promise<void>;
  importThumbnail(input: { scope: Scope; sourcePath: string }): Promise<Workspace>;
  startStudio(scope: Scope): Promise<StudioInfo>;
  studioChanges(scope: Scope): Promise<FileChangeResult>;
  discardStudio(scope: Scope): Promise<void>;
  saveStudio(input: { scope: Scope; title: string; body: string }): Promise<Workspace>;
  renderVideo(scope: Scope): Promise<string>;
  saveScript(input: {
    scope: Scope;
    revision: string;
    content: string;
    guidance: string;
    selection: Settings['chat'];
  }): Promise<ChatSession>;
  createClip(input: {
    scope: Scope;
    name: string;
    ratio: '9:16' | '1:1';
    start: number;
    end: number;
    prompt: string;
    selection: Settings['chat'];
  }): Promise<CreatedClip>;
  updateLaunch(input: { scope: Scope; launch: Launch }): Promise<void>;
  generateChapters(scope: Scope): Promise<Chapter[]>;
  importFinishedClip(input: { scope: Scope; sourcePath: string }): Promise<Clip>;
  preparePublish(input: {
    scope: Scope;
    platform: string;
    browser: string;
    packaging: Packaging;
    clipId: string | null;
    chapters?: Chapter[];
  }): Promise<{ session: ChatSession; prompt: string }>;
  revealPath(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  copyImage(path: string): Promise<void>;
  mediaUrl(path: string): Promise<string>;
  assetWaveform(input: { scope: Scope; assetId: string }): Promise<number[]>;
  onEvent(listener: (event: AppEvent) => void): () => void;
  pathForFile(file: File): string;
}
export interface FileChangeResult {
  dirty: boolean;
  files: FileChange[];
}
export type ApiMethod = Exclude<keyof DesktopApi, 'onEvent' | 'pathForFile'>;
