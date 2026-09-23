import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DesktopApi } from '../../domain/api';
import type { AppState, ChatActivity, ModelInfo, Scope, VideoSummary, Workspace } from '../../domain/models';
import i18n from '../i18n';
import { scopeKey } from '../../domain/defaults';
import { diagnosticFromBridge, diagnosticFromError, parseDiagnostic } from '../../domain/diagnostics';
import { rememberBrand } from './brand-summary';
import { ReceiptToasts } from './receipt-toasts';
import type { Toast } from './toast';

interface ChatTarget {
  topic: string;
  title: string;
  prompt?: string;
}
interface WorkspaceNavigation {
  current: () => boolean;
  adopt: (value: Workspace | null) => boolean;
  release: () => void;
}
interface Store {
  api: DesktopApi;
  state: AppState | null;
  workspace: Workspace | null;
  parentVideo: VideoSummary | null;
  models: ModelInfo[];
  activity: ChatActivity | null;
  dirty: boolean;
  busy: boolean;
  toast: Toast | null;
  chatTarget: ChatTarget | null;
  setDirty: (value: boolean) => void;
  setToast: (value: Toast | null) => void;
  setWorkspace: (value: Workspace | null) => void;
  beginNavigation: () => WorkspaceNavigation | null;
  setChatTarget: (value: ChatTarget | null) => void;
  refresh: () => Promise<void>;
  reload: (scope?: Scope) => Promise<Workspace | null>;
  run: <T>(task: () => Promise<T>) => Promise<T | undefined>;
}
const Context = createContext<Store | null>(null);
const matchesScope = (current: Scope | null, target: Scope): boolean =>
  current !== null && scopeKey(current) === scopeKey(target);
export function AppProvider({ api, children }: { api: DesktopApi; children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [workspace, updateWorkspace] = useState<Workspace | null>(null);
  const [parentVideo, setParentVideo] = useState<VideoSummary | null>(null);
  const workspaceScope = useRef<Scope | null>(null);
  const workspaceVersion = useRef(0);
  const deferredWorkspace = useRef<{ ticket: number; value: Workspace } | null>(null);
  const [refreshingWorkspace, setRefreshingWorkspace] = useState<number | null>(null);
  const navigationOwner = useRef<object | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [dirty, updateDirty] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    updateDirty(value);
  }, []);
  const adoptWorkspace = useCallback((value: Workspace | null) => {
    workspaceScope.current = value?.scope ?? null;
    updateWorkspace(value);
    setParentVideo((current) => {
      if (!value?.scope.videoId) return null;
      if (!value.scope.clipId) return value.video;
      return current?.id === value.scope.videoId && current.brandId === value.scope.brandId ? current : null;
    });
    if (value) setState((current) => rememberBrand(current, value.brand));
  }, []);
  const setWorkspace = useCallback(
    (value: Workspace | null) => {
      workspaceVersion.current++;
      deferredWorkspace.current = null;
      setRefreshingWorkspace(null);
      adoptWorkspace(value);
    },
    [adoptWorkspace],
  );
  const beginNavigation = useCallback((): WorkspaceNavigation | null => {
    if (navigationOwner.current || dirtyRef.current) return null;
    const owner = {};
    let version = workspaceVersion.current;
    navigationOwner.current = owner;
    setNavigating(true);
    const current = () =>
      navigationOwner.current === owner && version === workspaceVersion.current && !dirtyRef.current;
    return {
      current,
      adopt: (value) => {
        if (!current()) return false;
        setWorkspace(value);
        version = workspaceVersion.current;
        return true;
      },
      release: () => {
        if (navigationOwner.current !== owner) return;
        navigationOwner.current = null;
        setNavigating(false);
      },
    };
  }, [setWorkspace]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [activity, setActivity] = useState<ChatActivity | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const receiptToasts = useRef(new ReceiptToasts());
  const [chatTarget, setChatTarget] = useState<ChatTarget | null>(null);
  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await task();
    } catch (error) {
      setToast(diagnosticFromBridge(error));
      return undefined;
    }
  }, []);
  const refresh = useCallback(
    () =>
      Promise.all([
        api
          .getState()
          .then(async (value) => {
            setState(value);
            await i18n.changeLanguage(value.settings.locale);
          })
          .catch((error: unknown) => {
            setToast(diagnosticFromBridge(error));
          }),
        api
          .models()
          .then(setModels)
          .catch((error: unknown) => {
            setToast(diagnosticFromBridge(error));
          }),
      ]).then(() => undefined),
    [api],
  );
  const reload = useCallback(
    async (scope?: Scope) => {
      const target = scope ?? workspaceScope.current;
      if (!target) return null;
      if (!matchesScope(workspaceScope.current, target)) return api.openWorkspace(target);
      const ticket = ++workspaceVersion.current;
      deferredWorkspace.current = null;
      setRefreshingWorkspace(ticket);
      try {
        const result = await api.openWorkspace(target);
        if (ticket === workspaceVersion.current && matchesScope(workspaceScope.current, target)) {
          if (dirtyRef.current) deferredWorkspace.current = { ticket, value: result };
          else adoptWorkspace(result);
        }
        return result;
      } finally {
        setRefreshingWorkspace((current) => (current === ticket ? null : current));
      }
    },
    [api, adoptWorkspace],
  );
  useEffect(() => {
    const deferred = deferredWorkspace.current;
    if (dirty || !deferred) return;
    deferredWorkspace.current = null;
    if (
      deferred.ticket === workspaceVersion.current &&
      matchesScope(workspaceScope.current, deferred.value.scope)
    ) {
      adoptWorkspace(deferred.value);
    }
  }, [dirty, adoptWorkspace]);
  useEffect(() => {
    void refresh().catch((error: unknown) => {
      setToast(diagnosticFromBridge(error));
    });
  }, [refresh]);
  useEffect(
    () =>
      api.onEvent((event) => {
        const receipt = receiptToasts.current.consume(event);
        if (receipt) setToast({ kind: 'app', message: receipt });
        if (event.type === 'activity')
          setActivity((current) =>
            ['done', 'error'].includes(event.activity.phase)
              ? current?.sessionId === event.activity.sessionId
                ? null
                : current
              : event.activity,
          );
        if (event.type === 'notice')
          setToast(
            event.diagnostic !== undefined
              ? (parseDiagnostic(event.diagnostic) ?? { kind: 'app', message: { id: 'invalidDiagnostic' } })
              : diagnosticFromError(event.detail),
          );
        if (
          event.type === 'workspace-changed' &&
          workspaceScope.current &&
          event.scope.brandId === workspaceScope.current.brandId
        )
          void run(() => reload());
      }),
    [api, reload, run],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 6500);
    return () => {
      clearTimeout(timer);
    };
  }, [toast]);
  return (
    <Context.Provider
      value={{
        api,
        state,
        workspace,
        parentVideo,
        models,
        activity,
        dirty,
        busy: activity !== null || refreshingWorkspace !== null || navigating,
        toast,
        chatTarget,
        setDirty,
        setToast,
        setWorkspace,
        beginNavigation,
        setChatTarget,
        refresh,
        reload,
        run,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp(): Store {
  const store = useContext(Context);
  if (!store) throw new Error('AppProvider missing');
  return store;
}
