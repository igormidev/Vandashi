import { ArrowLeft, Film, Plus, Scissors, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Clip, Scope, Workspace } from '../../../domain/models';
import { scopeKey } from '../../../domain/defaults';
import { useApp } from '../../app/store';
import { Empty, IconButton } from '../../shared/ui';
import { Split } from '../../shared/Split';
import { ChatPane } from '../chat/ChatPane';
import { PackagingPage } from '../packaging/PackagingPage';
import { Checks } from '../workspace/Checks';
import { Preview } from '../creation/Preview';
import { ClipCreation } from './ClipCreation';
import { ClipPlayer } from './ClipPlayer';
import { timecode } from './clip-range';
import '../../styles/clips.css';

export function ClipsPage() {
  const { t } = useTranslation();
  const { workspace, api, run, busy, dirty, setWorkspace, setChatTarget, chatTarget } = useApp();
  const [parent, setParent] = useState<Workspace | null>(workspace);
  const [view, setView] = useState<'list' | 'checks' | 'create' | 'edit'>(
    workspace?.scope.clipId ? 'edit' : 'list',
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [playRequest, setPlayRequest] = useState(0);
  const [initialRun, setInitialRun] = useState(false);
  useEffect(
    () =>
      api.onEvent((event) => {
        if (
          event.type === 'activity' &&
          (event.activity.phase === 'done' || event.activity.phase === 'error')
        )
          setInitialRun(false);
      }),
    [api],
  );
  const main = workspace?.scope.clipId ? parent : workspace;
  if (!workspace || !main?.video) return null;
  const selectedClip = main.clips.find((clip) => clip.id === selected) ?? main.clips[0];
  const parentScope: Scope = { ...main.scope, clipId: null };
  const back = async () => {
    const result = await api.openWorkspace(parentScope);
    setParent(result);
    setChatTarget(null);
    setWorkspace(result);
    setView('list');
    setInitialRun(false);
  };
  const openClip = async (id: string, first = false) => {
    setParent(main);
    const next = await api.openWorkspace({ ...parentScope, clipId: id });
    setWorkspace(next);
    setInitialRun(first);
    setView('edit');
    setChatTarget({ topic: 'clip', title: t('clipEditor') });
  };
  if (view === 'edit' && workspace.scope.clipId)
    return (
      <section className="clip-workspace">
        <div className="clip-workspace-header">
          <button
            className="button ghost small"
            type="button"
            disabled={busy || dirty}
            onClick={() => {
              void run(back);
            }}
          >
            <ArrowLeft size={14} />
            {t('backToClips')}
          </button>
          <span className="clip-workspace-name">{workspace.video?.name}</span>
          <span className="badge">{workspace.video?.ratio}</span>
          <span className="spacer" />
          <IconButton
            label={t('clipReturnEditor')}
            disabled={busy || dirty}
            onClick={() => {
              setChatTarget({ topic: 'clip', title: t('clipEditor') });
            }}
          >
            <Sparkles size={15} />
          </IconButton>
        </div>
        {initialRun && busy ? (
          <div className="clip-initial-run">
            <ChatPane />
          </div>
        ) : (
          <div className="clip-editor-columns">
            <ChatPane />
            <section className="clip-packaging" aria-label={t('clipPackaging')}>
              <PackagingPage key={`${scopeKey(workspace.scope)}:${workspace.revision}`} />
            </section>
            <section className="clip-editor-preview" aria-label={t('preview')}>
              <Preview compact />
            </section>
          </div>
        )}
      </section>
    );
  if (view === 'checks') {
    const checks = (
      <Checks
        video
        onReady={() => {
          setChatTarget(null);
          setView('create');
        }}
      />
    );
    return (
      <div className="clip-checks">
        <div className="clip-form-top">
          <button
            className="button ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              setView('list');
            }}
          >
            <ArrowLeft size={15} />
            {t('backToClips')}
          </button>
        </div>
        {chatTarget?.topic.startsWith('repair:') ? (
          <Split id="clip-checks" left={<ChatPane />} right={checks} />
        ) : (
          checks
        )}
      </div>
    );
  }
  if (view === 'create')
    return (
      <ClipCreation
        source={main.video}
        scope={parentScope}
        onBack={() => {
          void run(back);
        }}
        onCreated={(id) => openClip(id, true)}
      />
    );
  if (main.video.ratio !== '16:9')
    return <Empty icon={<Scissors size={32} />} title={t('clipOnlyLandscape')} />;
  if (!main.video.renderedPath && !main.clips.length)
    return <Empty icon={<Film size={32} />} title={t('noRender')} />;
  return (
    <section className="clips-library">
      <div className="clips-list">
        <div className="clips-list-header">
          <h1>{t('clips')}</h1>
          <button
            className="button primary small"
            type="button"
            disabled={busy || dirty || !main.video.renderedPath}
            onClick={() => {
              setView('checks');
            }}
          >
            <Plus size={14} />
            {t('createClip')}
          </button>
        </div>
        {main.clips.length ? (
          <div className="clip-list-rows">
            {main.clips.map((clip) => (
              <ClipRow
                key={clip.id}
                clip={clip}
                selected={selectedClip?.id === clip.id}
                disabled={busy || dirty}
                onSelect={() => {
                  setSelected(clip.id);
                  setPlayRequest((value) => value + 1);
                }}
                onOpen={() => {
                  void run(() => openClip(clip.id));
                }}
              />
            ))}
          </div>
        ) : (
          <Empty icon={<Scissors size={28} />} title={t('noClips')} description={t('noClipsHelp')} />
        )}
      </div>
      <div className="clips-preview-panel">
        {selectedClip ? (
          <>
            <div className="clips-preview-heading">
              <h2>{selectedClip.name}</h2>
              <button
                className="button small"
                type="button"
                disabled={busy || dirty}
                onClick={() => {
                  void run(() => openClip(selectedClip.id));
                }}
              >
                {t('clipEditor')}
              </button>
            </div>
            <ClipPlayer
              key={`${selectedClip.id}:${selectedClip.updatedAt}`}
              path={selectedClip.renderedPath}
              ratio={selectedClip.ratio}
              name={selectedClip.name}
              autoPlay={selected !== null}
              playRequest={playRequest}
            />
          </>
        ) : (
          <div className="clip-empty-frame" aria-hidden="true">
            <span />
          </div>
        )}
      </div>
    </section>
  );
}
function ClipRow({
  clip,
  selected,
  disabled,
  onSelect,
  onOpen,
}: {
  clip: Clip;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={`clip-row ${selected ? 'selected' : ''}`}>
      <button
        className="clip-row-main"
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        aria-label={t('clipPreviewSelected', { name: clip.name })}
        onClick={onSelect}
      >
        <span className={`clip-row-format ${clip.ratio === '1:1' ? 'square' : ''}`} />
        <span className="clip-row-info">
          <strong>{clip.name}</strong>
          <span className="mono">
            {timecode(clip.start)}
            <span className="clip-time-divider" aria-hidden="true" />
            {timecode(clip.end)}
          </span>
        </span>
        <span className="badge">{clip.ratio}</span>
      </button>
      <IconButton label={t('clipEditor')} disabled={disabled} onClick={onOpen}>
        <Sparkles size={15} />
      </IconButton>
    </div>
  );
}
