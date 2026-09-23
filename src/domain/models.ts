import type { AssetInspectionNote, AssetInspectionProgress } from './asset-inspection';
import type { AppMessage } from './messages';
import type { Diagnostic } from './diagnostics';
import type { Locale } from './locales';

export type AspectRatio = '16:9' | '9:16' | '1:1';
export type AssetKind = 'image' | 'video' | 'audio' | 'other';
export type Platform =
  'youtube' | 'youtubeShorts' | 'odysee' | 'rumble' | 'tiktok' | 'instagram' | 'facebook' | 'x';
export type LaunchStatus = 'not_started' | 'uploading' | 'uploaded' | 'failed';
export interface Scope {
  brandId: string;
  videoId: string | null;
  clipId: string | null;
}
export interface BrandSummary {
  id: string;
  name: string;
  path: string;
  lastOpened: string;
}
export interface SocialLink {
  url: string;
  browser: string;
}
export interface BrandConfig {
  name: string;
  description: string;
  image: string;
  platforms: Partial<Record<Platform, SocialLink>>;
}
export interface Brand extends BrandSummary {
  config: BrandConfig;
}
export interface Packaging {
  titles: { long: string[]; short: string[] };
  descriptions: { long: string; short: string };
  tags: { long: string[]; short: string[] };
  thumbnails: string[];
  theme: string;
}
export interface VideoSummary {
  id: string;
  brandId: string;
  name: string;
  path: string;
  ratio: AspectRatio;
  origin: 'composition' | 'imported';
  updatedAt: string;
  packaging: Packaging;
  renderedPath: string | null;
}
export interface Clip extends VideoSummary {
  parentVideoId: string;
  start: number;
  end: number;
}
export interface WorkspaceDocument {
  path: string;
  name: string;
  content: string;
  kind: 'taste' | 'script' | 'config';
}
export interface Asset {
  id: string;
  path: string;
  relativePath: string;
  title: string;
  description: string;
  tags: string[];
  kind: AssetKind;
  size: number;
  /** Original imported bytes while the stored copy matches its recorded embedded metadata. */
  hash: string;
  /** Current media bytes and exact sidecar state; required for optimistic metadata updates. */
  revision: string;
  shared: boolean;
  mediaUrl: string;
}
export interface FileChange {
  path: string;
  additions: number;
  deletions: number;
  diff: string;
}
export interface Commit {
  sha: string;
  title: string;
  body: string;
  date: string;
  files: FileChange[];
}
export interface Launch {
  platform: Platform;
  status: LaunchStatus;
  url: string;
  clipId: string | null;
}
export interface Chapter {
  seconds: number;
  title: string;
}
export interface Workspace {
  scope: Scope;
  brand: Brand;
  video: VideoSummary | null;
  documents: WorkspaceDocument[];
  assets: Asset[];
  clips: Clip[];
  launches: Launch[];
  revision: string;
  dirty: boolean;
}
export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  reasoning: string[];
  defaultReasoning: string;
  fast: boolean;
  isDefault: boolean;
}
export interface ModelSelection {
  model: string;
  reasoning: string;
  fast: boolean;
}
export interface Settings {
  locale: Locale;
  chat: ModelSelection;
  automation: ModelSelection;
  scriptSync: ModelSelection;
  assetMetadata: ModelSelection;
  chapters: ModelSelection;
  splits: Record<string, number>;
}
export interface AppState {
  brands: BrandSummary[];
  lastBrandId: string | null;
  settings: Settings;
}
export interface DependencyCheck {
  id: string;
  status: 'checking' | 'ready' | 'missing' | 'error';
  detail: string;
  diagnostic?: Diagnostic;
  label?: AppMessage;
  repairPrompt: string | null;
  helpUrl: string | null;
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'reasoning' | 'tool' | 'error';
  text: string;
  turnId: string | null;
  files: FileChange[];
  createdAt: string;
  appMessage?: AppMessage;
  diagnostic?: Diagnostic;
  generatedImages?: string[];
}
export interface ChatSession {
  id: string;
  scope: Scope;
  topic: string;
  title: string;
  threadId: string | null;
  messages: ChatMessage[];
  open: boolean;
  updatedAt: string;
  checkpoints?: ChatCheckpoint[];
}
export interface ChatCheckpoint {
  turnId: string;
  threadId: string;
  heads: Record<string, string>;
  postHeads?: Record<string, string>;
  messageCount: number;
}
export interface ChatRequest {
  sessionId: string;
  text: string;
  mode: 'read' | 'edit';
  selection: ModelSelection;
  attachments: string[];
}
export interface ChatActivity {
  sessionId: string;
  phase: 'starting' | 'working' | 'committing' | 'done' | 'error';
  detail: string;
}
export type AppEvent =
  | {
      type: 'checks';
      scope: Scope | null;
      video: boolean;
      checks: DependencyCheck[];
      progress: number;
      current: string;
      currentLabel?: AppMessage;
    }
  | { type: 'chat'; sessionId: string; message: ChatMessage; delta: boolean }
  | { type: 'activity'; activity: ChatActivity }
  | { type: 'workspace-changed'; scope: Scope }
  | { type: 'notice'; code: string; detail: string; diagnostic?: Diagnostic }
  | {
      type: 'asset-inspection';
      scope: Scope;
      sourcePath: string;
      requestId: string;
      inspection: AssetInspectionProgress;
    }
  | { type: 'render'; progress: number; detail: string; label?: AppMessage };
export interface StudioInfo {
  url: string;
  previewUrl: string;
  projectPath: string;
}
export interface AssetDraft {
  inspection?: AssetInspectionNote;
  sourcePath: string;
  /** Exact original bytes inspected for this metadata; omitted only for uninspected manual drafts. */
  sourceHash?: string;
  title: string;
  description: string;
  tags: string[];
  kind: AssetKind;
}
export interface SaveInput {
  scope: Scope;
  revision: string;
  documents: { path: string; content: string }[];
  brandConfig: BrandConfig | null;
  packaging: Packaging | null;
  commit: { title: string; body: string };
}
