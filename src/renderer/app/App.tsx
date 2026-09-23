import {
  ArrowLeft,
  ChevronRight,
  Clapperboard,
  Film,
  Images,
  Layers,
  Rocket,
  Scissors,
  Settings2,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Workspace } from '../../domain/models';
import { scopeKey } from '../../domain/defaults';
import { useApp } from './store';
import { IconButton, Loading, Logo } from '../shared/ui';
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

type Page =
  | 'home'
  | 'brand'
  | 'videos'
  | 'sharedAssets'
  | 'packaging'
  | 'creation'
  | 'manual'
  | 'assets'
  | 'clips'
  | 'launch';
type Destination = Page | 'checks';
const brandTabs = [
  { id: 'brand', icon: SlidersHorizontal },
  { id: 'videos', icon: Film },
  { id: 'sharedAssets', icon: Images },
] as const;
const videoTabs = [
  { id: 'packaging', icon: Layers },
  { id: 'creation', icon: Clapperboard },
  { id: 'manual', icon: SlidersHorizontal },
  { id: 'assets', icon: Images },
  { id: 'clips', icon: Scissors },
  { id: 'launch', icon: Rocket },
] as const;

export function App() {
  const { t } = useTranslation();
  const { api, state, workspace, setWorkspace, setDirty, busy, dirty, toast, setToast, run, setChatTarget } =
    useApp();
  const [page, setPage] = useState<Page>('home');
  const [settings, setSettings] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState<Destination | null>(null);
  const [studioFiles, setStudioFiles] = useState<FileChange[]>([]);
  const [saveStudio, setSaveStudio] = useState(false);
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
    if (!state || restored.current) return;
    restored.current = true;
    if (state.lastBrandId)
      void run(async () => {
        open(await api.openBrand(state.lastBrandId ?? ''));
      });
  }, [api, state, run, open]);
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
      setToast(t('runningHelp'));
      return;
    }
    if (dirty) {
      setToast(t('dirtyHelp'));
      return;
    }
    if (checking && next !== 'home' && !(next === 'videos' && workspace?.video)) return;
    if (page === 'manual' && workspace && !checking && !skipStudio) {
      const changes = await api.studioChanges(workspace.scope);
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
    if (workspace?.scope.clipId && next !== 'clips') {
      const parent = await api.openWorkspace({ ...workspace.scope, clipId: null });
      setWorkspace(parent);
      if (parent.video?.origin === 'imported' && (next === 'creation' || next === 'manual'))
        next = 'packaging';
    }
    const leavingVideo = ['brand', 'videos', 'sharedAssets'].includes(next) && !!workspace?.video;
    if (leavingVideo) setWorkspace(await api.openBrand(workspace.scope.brandId));
    if (next === 'home') {
      setWorkspace(null);
      setChatTarget(null);
    }
    setPage(next);
    setChecking(leavingVideo);
  };
  if (!state) return <Loading />;
  const revisionKey = `${workspace?.scope.videoId ?? 'brand'}:${workspace?.revision ?? ''}`;
  const renderPage = () => {
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
          onClick={() => {
            void run(() => navigate('home'));
          }}
        >
          <Logo size={24} />
          <span>{t('appName')}</span>
        </button>
        {workspace && (
          <div className="crumb">
            <ChevronRight size={13} />
            <button
              type="button"
              disabled={busy || dirty || (checking && !workspace.video)}
              onClick={() => {
                void run(() => navigate('videos'));
              }}
            >
              {workspace.brand.name}
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
          <div className="status">
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
          <nav className="nav" aria-label={t('studio')}>
            {workspace?.video && (
              <button
                type="button"
                aria-label={t('back')}
                disabled={busy || dirty}
                onClick={() => {
                  void run(() => navigate('videos'));
                }}
              >
                <ArrowLeft size={15} />
              </button>
            )}
            {(workspace?.video ? videoTabs : brandTabs)
              .filter(
                (tab) => tab.id !== 'clips' || workspace?.video?.ratio === '16:9' || workspace?.scope.clipId,
              )
              .map(({ id, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  className={page === id ? 'active' : ''}
                  title={
                    workspace?.video?.origin === 'imported' && (id === 'creation' || id === 'manual')
                      ? t('importedVideoEditingHelp')
                      : undefined
                  }
                  disabled={
                    busy ||
                    dirty ||
                    checking ||
                    (workspace?.video?.origin === 'imported' && (id === 'creation' || id === 'manual')) ||
                    (!workspace?.video?.renderedPath &&
                      !workspace?.scope.clipId &&
                      ((id === 'clips' && !workspace?.clips.length) ||
                        (id === 'launch' && !workspace?.clips.some((clip) => clip.renderedPath))))
                  }
                  onClick={() => {
                    void run(() => navigate(id));
                  }}
                >
                  <Icon />
                  {t(id)}
                </button>
              ))}
          </nav>
        )}
        {renderPage()}
      </div>
      {settings && (
        <Settings
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
            <span>{toast}</span>
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
