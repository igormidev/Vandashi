import { useUpdates } from '../features/updates/use-updates';
import { UpdateControls } from '../features/updates/UpdateControls';
import { ChevronRight, LoaderCircle, Settings2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Workspace } from '../../domain/models';
import { scopeKey } from '../../domain/defaults';
import { useApp } from './store';
import { toastText } from './toast';
import { IconButton, Loading, Logo, PendingLabel } from '../shared/ui';
import { Split } from '../shared/Split';
import { Home } from '../features/brands/Home';
import { BrandPage } from '../features/brands/BrandPage';
import { VideosPage } from '../features/videos/VideosPage';
import { Settings } from '../features/settings/Settings';
import { ChatPane } from '../features/chat/ChatPane';
import { PackagingPage } from '../features/packaging/PackagingPage';
import { CreationPage } from '../features/creation/CreationPage';
import { ManualPage } from '../features/creation/ManualPage';
import { AssetsPage } from '../features/assets/AssetsPage';
import { ClipsPage } from '../features/clips/ClipsPage';
import { LaunchPage } from '../features/launch/LaunchPage';
import { Checks } from '../features/workspace/Checks';
import { CommitDialog } from '../features/history/CommitDialog';
import { StudioLeaveDialog } from '../features/creation/StudioLeaveDialog';
import type { FileChange } from '../../domain/models';
import type { Page, Destination } from './navigation-tabs';
import { WorkspaceNavigation } from './WorkspaceNavigation';
import { PrepareTranscriptions } from '../features/transcription/PrepareTranscriptions';

export function App() {
  const updates = useUpdates();
  const { t } = useTranslation();
  const {
    api,
    state,
    workspace,
    parentVideo,
    setWorkspace,
    setDirty,
    busy,
    dirty,
    toast,
    setToast,
    run,
    setChatTarget,
    beginNavigation,
  } = useApp();
  const [page, setPage] = useState<Page>('home');
  const [settings, setSettings] = useState(false);
  const [transcriptionsReady, setTranscriptionsReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState<Destination | null>(null);
  const [studioFiles, setStudioFiles] = useState<FileChange[]>([]);
  const [saveStudio, setSaveStudio] = useState(false);
  const [navigationStatus, setNavigationStatus] = useState<{
    owner: object;
    destination: Destination;
  } | null>(null);
  const restored = useRef(false);
  const open = useCallback(
    (value: Workspace, destination?: 'packaging' | 'launch') => {
      setWorkspace(value);
      setChatTarget(null);
      setDirty(false);
      setPage(
        destination ?? (value.video?.origin === 'imported' ? 'launch' : value.video ? 'packaging' : 'brand'),
      );
      setChecking(true);
    },
    [setWorkspace, setChatTarget, setDirty],
  );
  useEffect(() => {
    if (!state || !transcriptionsReady || restored.current) return;
    restored.current = true;
    if (state.lastBrandId)
      void run(async () => {
        open(await api.openBrand(state.lastBrandId ?? ''));
      });
  }, [api, state, run, open, transcriptionsReady]);
  useEffect(() => {
    if (!dirty && !busy && page !== 'manual') return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', protect);
    return () => {
      window.removeEventListener('beforeunload', protect);
    };
  }, [dirty, busy, page]);
  const navigate = async (next: Destination, skipStudio = false) => {
    if (busy) {
      setToast({ kind: 'interface', key: 'runningHelp' });
      return;
    }
    if (dirty) {
      setToast({ kind: 'interface', key: 'dirtyHelp' });
      return;
    }
    if (checking && next !== 'home' && !(next === 'videos' && workspace?.video)) return;
    const navigation = beginNavigation();
    if (!navigation) return;
    setNavigationStatus({ owner: navigation, destination: next });
    try {
      if (page === 'manual' && workspace && !checking && !skipStudio) {
        const changes = await api.studioChanges(workspace.scope);
        if (!navigation.current()) return;
        if (changes.dirty) {
          setStudioFiles(changes.files);
          setPending(next);
          return;
        }
      }
      if (next === 'checks') {
        setChecking(true);
        return;
      }
      const leavingVideo = ['brand', 'videos', 'sharedAssets'].includes(next) && !!workspace?.video;
      let target = workspace;
      if (next === 'home') target = null;
      else if (leavingVideo) target = await api.openBrand(workspace.scope.brandId);
      else if (workspace?.scope.clipId && next !== 'clips') {
        target = await api.openWorkspace({ ...workspace.scope, clipId: null });
        if (target.video?.origin === 'imported' && (next === 'creation' || next === 'manual'))
          next = 'packaging';
      }
      if (!navigation.current()) return;
      if (target !== workspace) {
        if (!navigation.adopt(target)) return;
        setChatTarget(null);
      }
      setPage(next);
      setChecking(leavingVideo);
    } catch (error) {
      if (navigation.current()) throw error;
    } finally {
      navigation.release();
      setNavigationStatus((current) => (current?.owner === navigation ? null : current));
    }
  };
  if (!state) return <Loading />;
  const revisionKey = `${workspace?.scope.videoId ?? 'brand'}:${workspace?.revision ?? ''}`;
  const renderPage = () => {
    if (!transcriptionsReady)
      return (
        <PrepareTranscriptions
          scope={null}
          onReady={() => {
            setTranscriptionsReady(true);
          }}
          onDefer={() => {
            restored.current = true;
            setTranscriptionsReady(true);
          }}
        />
      );
    if (checking)
      return (
        <Checks
          key={workspace ? scopeKey(workspace.scope) : 'home'}
          video={!!workspace?.video && workspace.video.origin !== 'imported'}
          onReady={() => {
            setChecking(false);
          }}
        />
      );
    switch (page) {
      case 'home':
        return <Home onOpen={open} />;
      case 'brand':
        return <Split id="brand" left={<ChatPane />} right={<BrandPage key={revisionKey} />} />;
      case 'videos':
        return <VideosPage onOpen={open} />;
      case 'sharedAssets':
      case 'assets':
        return <AssetsPage />;
      case 'packaging':
        return <Split id="packaging" left={<ChatPane />} right={<PackagingPage key={revisionKey} />} />;
      case 'creation':
        return <CreationPage key={workspace?.scope.videoId} />;
      case 'manual':
        return <ManualPage />;
      case 'clips':
        return <ClipsPage />;
      case 'launch':
        return (
          <LaunchPage
            onCreateClips={() => {
              void run(() => navigate('clips'));
            }}
          />
        );
    }
  };
  return (
    <div className="app">
      <header className="titlebar">
        <button
          type="button"
          className="wordmark"
          disabled={busy || dirty}
          aria-busy={navigationStatus?.destination === 'home'}
          onClick={() => {
            void run(() => navigate('home'));
          }}
        >
          {navigationStatus?.destination === 'home' ? (
            <LoaderCircle className="spin" size={24} aria-hidden="true" />
          ) : (
            <Logo size={24} />
          )}
          <span>{t('appName')}</span>
        </button>
        {workspace && (
          <div className="crumb">
            <ChevronRight size={13} />
            <button
              type="button"
              disabled={busy || dirty || (checking && !workspace.video)}
              aria-busy={navigationStatus?.destination === 'videos'}
              onClick={() => {
                void run(() => navigate('videos'));
              }}
            >
              {navigationStatus?.destination === 'videos' ? (
                <PendingLabel label={workspace.brand.name} />
              ) : (
                workspace.brand.name
              )}
            </button>
            {workspace.video && (
              <>
                <ChevronRight size={13} />
                <span className="crumb-current">{workspace.video.name}</span>
              </>
            )}
          </div>
        )}
        <div className="titlebar-end">
          <UpdateControls updates={updates} blocked={busy || dirty || page === 'manual' || settings} />
          <div className="status" aria-busy={busy}>
            <span className={`status-dot ${busy ? 'busy' : ''}`} />
            {t(busy ? 'statusBusy' : 'statusReady')}
          </div>
          <IconButton
            label={t('settings')}
            disabled={busy || dirty}
            onClick={() => {
              setSettings(true);
            }}
          >
            <Settings2 size={17} />
          </IconButton>
        </div>
      </header>
      <div className="app-body">
        {page !== 'home' && (
          <WorkspaceNavigation
            workspace={workspace}
            parentVideo={parentVideo}
            page={page}
            busy={busy}
            dirty={dirty}
            checking={checking}
            destination={navigationStatus?.destination ?? null}
            onNavigate={(destination) => {
              void run(() => navigate(destination));
            }}
          />
        )}
        {renderPage()}
      </div>
      {settings && (
        <Settings
          updates={updates}
          onClose={() => {
            setSettings(false);
          }}
          onChecks={() => {
            setSettings(false);
            void run(() => navigate('checks'));
          }}
        />
      )}
      <div role="status" aria-live="polite" aria-atomic="true">
        {toast && (
          <div className="toast">
            <span>{toastText(toast)}</span>
            <IconButton
              label={t('dismiss')}
              onClick={() => {
                setToast(null);
              }}
            >
              <X size={14} />
            </IconButton>
          </div>
        )}
      </div>
      <StudioLeaveDialog
        open={pending !== null && !saveStudio}
        files={studioFiles}
        onClose={() => {
          setPending(null);
        }}
        onDiscard={async () => {
          if (!workspace || !pending) return;
          await api.discardStudio(workspace.scope);
          const next = pending;
          setPending(null);
          await navigate(next, true);
        }}
        onSave={() => {
          setSaveStudio(true);
        }}
      />
      {saveStudio && (
        <CommitDialog
          summary={JSON.stringify(studioFiles)}
          onClose={() => {
            setSaveStudio(false);
          }}
          onSave={async (commit) => {
            if (!workspace || !pending) return;
            const result = await api.saveStudio({ scope: workspace.scope, ...commit });
            setWorkspace(result);
            const next = pending;
            setPending(null);
            setSaveStudio(false);
            await navigate(next, true);
          }}
        />
      )}
    </div>
  );
}
