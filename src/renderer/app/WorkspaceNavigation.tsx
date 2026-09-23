import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { VideoSummary, Workspace } from '../../domain/models';
import { PendingLabel } from '../shared/ui';
import { brandTabs, videoTabs, type Destination, type Page } from './navigation-tabs';

export function WorkspaceNavigation({
  workspace,
  parentVideo,
  page,
  busy,
  dirty,
  checking,
  destination,
  onNavigate,
}: {
  workspace: Workspace | null;
  parentVideo: VideoSummary | null;
  page: Page;
  busy: boolean;
  dirty: boolean;
  checking: boolean;
  destination: Destination | null;
  onNavigate: (destination: Destination) => void;
}) {
  const { t } = useTranslation();
  const video = workspace?.scope.clipId ? parentVideo : workspace?.video;
  return (
    <nav className="nav" aria-label={t('studio')}>
      {workspace?.video && (
        <button
          type="button"
          aria-label={t('back')}
          disabled={busy || dirty}
          aria-busy={destination === 'videos'}
          onClick={() => {
            onNavigate('videos');
          }}
        >
          {destination === 'videos' ? (
            <LoaderCircle className="spin" size={15} aria-hidden="true" />
          ) : (
            <ArrowLeft size={15} />
          )}
        </button>
      )}
      {(workspace?.video ? videoTabs : brandTabs)
        .filter((tab) => tab.id !== 'clips' || workspace?.video?.ratio === '16:9' || workspace?.scope.clipId)
        .map(({ id, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={page === id ? 'active' : ''}
            aria-current={page === id ? 'page' : undefined}
            aria-busy={destination === id}
            title={
              video?.origin === 'imported' && (id === 'creation' || id === 'manual')
                ? t('importedVideoEditingHelp')
                : undefined
            }
            disabled={
              busy ||
              dirty ||
              checking ||
              (video?.origin !== 'composition' && (id === 'creation' || id === 'manual')) ||
              (!workspace?.video?.renderedPath &&
                !workspace?.scope.clipId &&
                ((id === 'clips' && !workspace?.clips.length) ||
                  (id === 'launch' && !workspace?.clips.some((clip) => clip.renderedPath))))
            }
            onClick={() => {
              onNavigate(id);
            }}
          >
            {destination === id ? <LoaderCircle className="spin" aria-hidden="true" /> : <Icon />}
            {t(id)}
          </button>
        ))}
      {destination === 'checks' && (
        <span className="toolbar" role="status">
          <PendingLabel label={t('loading')} />
        </span>
      )}
    </nav>
  );
}
