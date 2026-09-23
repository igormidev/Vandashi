import { AppFault, diagnosticFromError } from '../domain/diagnostics';
import type { DesktopApi } from '../domain/api';
import type { AgentPort } from '../domain/agent';
import type { MediaPort } from '../domain/media';
import type { AppEvent, Scope, Settings, Workspace } from '../domain/models';
import type { GitPort, StoragePort } from '../domain/storage';
import { scopeKey } from '../domain/defaults';
import { OperationGate } from './operation-gate';
import { Commits } from './commits';
import { Chats } from './chats';
import { Studio } from './studio';
import { Automation } from './automation';
import { Publishing } from './publishing';
import { Dependencies } from './dependencies';
import { importFinishedVideo } from './finished-video';

export type HostMethods = Pick<
  DesktopApi,
  'chooseDirectory' | 'chooseFiles' | 'openExternal' | 'revealPath' | 'copyImage' | 'mediaUrl'
> & {
  prepareStudio?: (url: string) => Promise<void>;
  flushStudio?: (url: string) => Promise<void>;
};
export type BackendApi = Omit<DesktopApi, 'onEvent' | 'pathForFile'>;

export function createBackend(
  store: StoragePort,
  git: GitPort,
  agent: AgentPort,
  media: MediaPort,
  host: HostMethods,
  emit: (event: AppEvent) => void,
): BackendApi {
  const snapshots = new Map<string, Workspace>();
  const reads = new Map<string, Promise<Workspace>>();
  const changedScopes = new Map<string, Scope>();
  let activityOwner = '';
  const notify = (event: AppEvent) => {
    try {
      emit(event);
    } catch {
      /* Persist if the renderer is unavailable. */
    }
  };
  const gate = new OperationGate((owner) => {
    if (owner !== null) activityOwner = owner;
    notify({
      type: 'activity',
      activity: { sessionId: activityOwner, phase: owner === null ? 'done' : 'working', detail: '' },
    });
    if (owner === null) {
      const changed = [...changedScopes.values()];
      changedScopes.clear();
      for (const scope of changed) notify({ type: 'workspace-changed', scope });
    }
  });
  const dispatch = (event: AppEvent) => {
    if (event.type === 'workspace-changed' && gate.busy)
      changedScopes.set(scopeKey(event.scope), event.scope);
    else notify(event);
  };
  const remember = (workspace: Workspace) => {
    snapshots.set(scopeKey(workspace.scope), structuredClone(workspace));
    return workspace;
  };
  const readWorkspace = (scope: Scope): Promise<Workspace> => {
    const key = scopeKey(scope);
    const pending = reads.get(key);
    if (pending) return pending;
    const cached = snapshots.get(key);
    if (gate.busy && cached) return Promise.resolve(structuredClone(cached));
    const read = async () => {
      while (gate.busy) await gate.waitUntilIdle();
      // Storage performs shared-asset synchronization and YAML repair, so refreshes cannot overlap edits.
      return gate.run('workspace-read', async () => remember(await store.openWorkspace(scope)), false);
    };
    const promise = read().finally(() => {
      reads.delete(key);
    });
    reads.set(key, promise);
    return promise;
  };
  const commits = new Commits(store, git, agent, media);
  const chats = new Chats(store, git, agent, commits, gate, dispatch, media);
  const studio = new Studio(
    store,
    git,
    media,
    agent,
    gate,
    commits,
    dispatch,
    host.prepareStudio,
    host.flushStudio,
  );
  const automation = new Automation(store, agent, gate, media, notify);
  const publishing = new Publishing(store, agent, media, gate);
  const dependencies = new Dependencies(store, agent, media, commits, notify);
  const mutation = <T>(task: () => Promise<T>): Promise<T> => gate.run('manual', task);
  return {
    chooseDirectory: host.chooseDirectory,
    chooseFiles: host.chooseFiles,
    openExternal: host.openExternal,
    revealPath: host.revealPath,
    copyImage: host.copyImage,
    mediaUrl: host.mediaUrl,
    getState: () => store.getState(),
    settings: (settings: Settings) => store.settings(settings),
    createBrand: (input) =>
      mutation(async () => {
        await git.checkAvailable();
        return store.createBrand(input);
      }),
    openBrand: (id) =>
      gate.run('open-brand', async () => {
        const workspace = await store.openBrand(id);
        await commits.reconcile(workspace.scope);
        return remember(await store.openWorkspace(workspace.scope));
      }),
    listVideos: (id) => store.listVideos(id),
    createVideo: (input) =>
      mutation(async () => {
        const workspace = await store.createVideo(input, ({ path, ratio, name }) =>
          media.seedProject(path, ratio, name),
        );
        return remember(workspace);
      }),
    importFinishedVideo: (input) =>
      mutation(async () => remember(await importFinishedVideo(input, store, media))),
    openWorkspace: (scope) => readWorkspace(scope),
    saveWorkspace: (input) => mutation(async () => remember(await store.saveWorkspace(input))),
    suggestCommit: (input) => gate.run('commit-message', () => commits.suggest(input.scope, input.summary)),
    history: async ({ scope, page }) => git.history(await store.projectPath(scope), page),
    models: () => agent.models(),
    assetWaveform: async ({ scope, assetId }) => {
      const workspace = await readWorkspace(scope);
      const asset = workspace.assets.find((entry) => entry.id === assetId);
      if (asset?.kind !== 'audio') throw new AppFault({ id: 'appChooseAudio' });
      return media.audioWaveform(await store.allowedPath(asset.path));
    },
    checks: ({ scope, video }) =>
      gate.run('checks', async () => {
        const result = await dependencies.check(scope, video);
        if (scope && result.some((check) => check.id === 'Git' && check.status === 'ready')) {
          remember(await store.openWorkspace(scope));
          dispatch({ type: 'workspace-changed', scope });
        }
        return result;
      }),
    sessions: (scope) => store.sessions(scope),
    openChat: (input) => chats.open(input),
    closeChat: (id) => chats.close(id),
    resetChat: (id) => chats.reset(id),
    sendChat: (request) => chats.start(request),
    cancelChat: () => agent.stop(),
    undoChat: (id) => chats.undo(id),
    describeAsset: (input) => automation.describeAsset(input),
    cancelAssetInspection: (requestId) => automation.cancelAssetInspection(requestId),
    importAsset: (input) => mutation(() => store.importAsset(input)),
    updateAsset: (input) => mutation(() => store.updateAsset(input)),
    deleteAsset: (input) => mutation(() => store.deleteAsset(input)),
    importThumbnail: (input) => mutation(async () => remember(await store.importThumbnail(input))),
    startStudio: async (scope) => {
      if ((await store.openWorkspace(scope)).video?.origin === 'imported')
        throw new AppFault({ id: 'appImportedNoComposition' });
      return studio.start(scope);
    },
    studioChanges: (scope) => studio.changes(scope),
    discardStudio: (scope) => studio.discard(scope),
    saveStudio: async (input) => remember(await studio.save(input)),
    renderVideo: async (scope) => {
      if ((await store.openWorkspace(scope)).video?.origin === 'imported')
        throw new AppFault({ id: 'appFinishedNoRender' });
      return studio.render(scope);
    },
    saveScript: (input) => chats.saveScript(input),
    generateChapters: (scope) => publishing.chapters(scope),
    importFinishedClip: (input) => publishing.importClip(input),
    createClip: async (input) => {
      const clip = await mutation(async () => {
        const workspace = await store.openWorkspace(input.scope);
        if (!workspace.video?.renderedPath) throw new AppFault({ id: 'appRenderBeforeClip' });
        const sourceVideoPath = workspace.video.renderedPath;
        const result = await store.createClip(input, ({ path, name }) =>
          media.createClip({
            projectPath: path,
            sourceVideoPath,
            ratio: input.ratio,
            start: input.start,
            end: input.end,
            title: name,
          }),
        );
        return result;
      });
      const scope = { ...input.scope, clipId: clip.id };
      const prompt = `Create the first ${input.ratio} clip from ${String(input.start)}s to ${String(input.end)}s. ${input.prompt}`;
      try {
        remember(await store.openWorkspace(scope));
        const session = await chats.open({ scope, topic: 'clip', title: input.name });
        await chats.start({
          sessionId: session.id,
          text: prompt,
          mode: 'edit',
          selection: input.selection,
          attachments: [],
        });
        return { clip, generation: { status: 'started' } };
      } catch (error) {
        return { clip, generation: { status: 'failed', diagnostic: diagnosticFromError(error), prompt } };
      }
    },
    updateLaunch: (input) => publishing.updateLaunch(input),
    preparePublish: (input) => publishing.prepare(input, chats),
  };
}
