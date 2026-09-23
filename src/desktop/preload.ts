import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ApiMethod, DesktopApi } from '../domain/api';
import type { AppEvent } from '../domain/models';
import { diagnosticFromError, encodeDiagnostic, envelopeDiagnostic } from '../domain/diagnostics';

function invoke<K extends ApiMethod>(
  method: K,
  ...args: Parameters<DesktopApi[K]>
): ReturnType<DesktopApi[K]> {
  return ipcRenderer.invoke('vandashi:invoke', method, args).then(
    (value: unknown) => {
      const diagnostic = envelopeDiagnostic(value);
      if (diagnostic) throw new Error(encodeDiagnostic(diagnostic));
      return value;
    },
    (error: unknown) => {
      // IPC and contextBridge both discard custom Error fields. Carry a validated machine record
      // in message, and decode it once in the renderer; external prose never becomes an app ID.
      throw new Error(encodeDiagnostic(diagnosticFromError(error)));
    },
  ) as ReturnType<DesktopApi[K]>;
}
const api: DesktopApi = {
  getState: () => invoke('getState'),
  chooseDirectory: () => invoke('chooseDirectory'),
  chooseFiles: (kind) => invoke('chooseFiles', kind),
  createBrand: (input) => invoke('createBrand', input),
  openBrand: (id) => invoke('openBrand', id),
  listVideos: (id) => invoke('listVideos', id),
  createVideo: (input) => invoke('createVideo', input),
  importFinishedVideo: (input) => invoke('importFinishedVideo', input),
  openWorkspace: (scope) => invoke('openWorkspace', scope),
  saveWorkspace: (input) => invoke('saveWorkspace', input),
  suggestCommit: (scope) => invoke('suggestCommit', scope),
  history: (input) => invoke('history', input),
  checks: (input) => invoke('checks', input),
  models: () => invoke('models'),
  settings: (value) => invoke('settings', value),
  sessions: (scope) => invoke('sessions', scope),
  openChat: (input) => invoke('openChat', input),
  closeChat: (id) => invoke('closeChat', id),
  resetChat: (id) => invoke('resetChat', id),
  sendChat: (input) => invoke('sendChat', input),
  cancelChat: () => invoke('cancelChat'),
  undoChat: (id) => invoke('undoChat', id),
  importAsset: (input) => invoke('importAsset', input),
  describeAsset: (input) => invoke('describeAsset', input),
  cancelAssetInspection: (requestId) => invoke('cancelAssetInspection', requestId),
  updateAsset: (input) => invoke('updateAsset', input),
  deleteAsset: (input) => invoke('deleteAsset', input),
  importThumbnail: (input) => invoke('importThumbnail', input),
  startStudio: (scope) => invoke('startStudio', scope),
  studioChanges: (scope) => invoke('studioChanges', scope),
  discardStudio: (scope) => invoke('discardStudio', scope),
  saveStudio: (input) => invoke('saveStudio', input),
  renderVideo: (scope) => invoke('renderVideo', scope),
  saveScript: (input) => invoke('saveScript', input),
  createClip: (input) => invoke('createClip', input),
  updateLaunch: (input) => invoke('updateLaunch', input),
  preparePublish: (input) => invoke('preparePublish', input),
  generateChapters: (scope) => invoke('generateChapters', scope),
  importFinishedClip: (input) => invoke('importFinishedClip', input),
  revealPath: (path) => invoke('revealPath', path),
  openExternal: (url) => invoke('openExternal', url),
  copyImage: (path) => invoke('copyImage', path),
  mediaUrl: (path) => invoke('mediaUrl', path),
  assetWaveform: (input) => invoke('assetWaveform', input),
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AppEvent) => {
      listener(payload);
    };
    ipcRenderer.on('vandashi:event', handler);
    return () => {
      ipcRenderer.removeListener('vandashi:event', handler);
    };
  },
  pathForFile: (file) => {
    const path = webUtils.getPathForFile(file);
    if (path) ipcRenderer.send('vandashi:grant-drop', path);
    return path;
  },
};
contextBridge.exposeInMainWorld('vandashi', api);
