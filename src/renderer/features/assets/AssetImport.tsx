import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { scopeKey } from '../../../domain/defaults';
import type { AssetInspectionProgress } from '../../../domain/asset-inspection';
import type { AssetDraft } from '../../../domain/models';
import { useApp } from '../../app/store';
import { Loading, Modal } from '../../shared/ui';
import { fallbackAssetKind, parseAssetTags } from './asset-index';
import { errorText } from '../../app/diagnostics';

export function AssetImport({ paths, onClose }: { paths: string[]; onClose: () => void }) {
  const { t } = useTranslation();
  const { api, workspace, run, reload, setDirty, setToast } = useApp();
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<AssetDraft | null>(null);
  const [tags, setTags] = useState('');
  const [describing, setDescribing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const inspectionId = useRef('');
  const pending = useRef<{
    scope: string;
    path: string;
    requestId: string;
    promise: Promise<AssetDraft>;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [inspection, setInspection] = useState<AssetInspectionProgress | null>(null);
  const path = paths[index];
  const brandId = workspace?.scope.brandId;
  const videoId = workspace?.scope.videoId ?? null;
  const clipId = workspace?.scope.clipId ?? null;
  const scope = useMemo(() => (brandId ? { brandId, videoId, clipId } : null), [brandId, videoId, clipId]);
  useEffect(() => {
    if (!path || !scope) return;
    const previous = pending.current;
    const sameRequest = previous?.scope === scopeKey(scope) && previous.path === path ? previous : null;
    const requestId = sameRequest?.requestId ?? crypto.randomUUID();
    inspectionId.current = requestId;
    let disposed = false;
    const unsubscribe = api.onEvent((event) => {
      if (
        !disposed &&
        event.type === 'asset-inspection' &&
        event.requestId === requestId &&
        scopeKey(event.scope) === scopeKey(scope)
      )
        setInspection(event.inspection);
    });
    setDirty(true);
    // Development StrictMode replays setup. Reattach to its result and cancellation ID;
    // starting a second inspection would abandon the first operation's lease.
    const request = sameRequest ?? {
      scope: scopeKey(scope),
      path,
      requestId,
      promise: api.describeAsset({ scope, path, requestId }),
    };
    pending.current = request;
    void request.promise
      .then((result) => {
        if (!disposed) {
          setDraft(result);
          setTags(result.tags.join(', '));
        }
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setFailure(errorText(error));
        setDraft({
          sourcePath: path,
          title:
            path
              .replaceAll('\\', '/')
              .split('/')
              .at(-1)
              ?.replace(/\.[^.]+$/, '') ?? '',
          description: '',
          tags: [],
          kind: fallbackAssetKind(path),
        });
      })
      .finally(() => {
        if (!disposed) setDescribing(false);
      });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [api, path, scope, setDirty]);
  const advance = (): void => {
    if (index >= paths.length - 1) {
      setDirty(false);
      onClose();
      return;
    }
    setDraft(null);
    setTags('');
    setDescribing(true);
    setFailure(null);
    setInspection(null);
    setIndex(index + 1);
  };
  const importAsset = async (): Promise<void> => {
    if (!draft || !scope) return;
    setSaving(true);
    await run(async () => {
      const imported = await api.importAsset({
        scope,
        draft: {
          sourcePath: draft.sourcePath,
          ...(draft.sourceHash ? { sourceHash: draft.sourceHash } : {}),
          kind: draft.kind,
          title: draft.title.trim(),
          description: draft.description.trim(),
          tags: parseAssetTags(tags),
        },
      });
      if (workspace?.assets.some((asset) => asset.id === imported.id))
        setToast({ kind: 'interface', key: 'assetDuplicate' });
      await reload();
      advance();
    });
    setSaving(false);
  };
  const cancelInspection = async (): Promise<void> => {
    setCancelling(true);
    await run(async () => {
      await api.cancelAssetInspection(inspectionId.current);
      setDirty(false);
      onClose();
    });
    setCancelling(false);
  };
  return (
    <Modal
      locked={describing || saving || cancelling}
      title={t('importAsset')}
      open
      onClose={() => {
        if (!describing && !saving && !cancelling) {
          setDirty(false);
          onClose();
        }
      }}
    >
      {describing ? (
        <div className="form">
          <Loading
            label={t(
              inspection?.phase === 'model-download'
                ? 'assetInspectionDownload'
                : inspection?.phase === 'frames'
                  ? 'assetInspectionFrames'
                  : inspection?.phase === 'speech'
                    ? 'assetInspectionSpeech'
                    : 'describeAsset',
            )}
          />
          {inspection?.phase === 'model-download' && (
            <progress aria-label={t('assetInspectionDownload')} value={inspection.progress} max={1} />
          )}
        </div>
      ) : (
        draft && (
          <div className="form">
            <div className="asset-import-filename mono">
              {draft.sourcePath.replaceAll('\\', '/').split('/').at(-1)}
            </div>
            {failure && (
              <p className="field-error" role="alert">
                {failure}
              </p>
            )}
            {draft.inspection && (
              <div className="muted" role="note">
                {draft.inspection.frames > 0 && (
                  <p>{t('assetInspectionFrameNote', { count: draft.inspection.frames })}</p>
                )}
                {draft.inspection.sampledSeconds > 0 && (
                  <p>
                    {t(
                      draft.inspection.speech === 'recognized'
                        ? 'assetInspectionSpeechNote'
                        : 'assetInspectionNoSpeech',
                      { seconds: String(Math.ceil(draft.inspection.sampledSeconds)) },
                    )}
                  </p>
                )}
              </div>
            )}
            <fieldset className="form" disabled={saving || cancelling}>
              <label className="field">
                <span>{t('assetTitle')}</span>
                <input
                  value={draft.title}
                  onChange={(event) => {
                    setDraft({ ...draft, title: event.target.value });
                  }}
                />
              </label>
              <label className="field">
                <span>{t('assetDescription')}</span>
                <textarea
                  value={draft.description}
                  onChange={(event) => {
                    setDraft({ ...draft, description: event.target.value });
                  }}
                  rows={4}
                />
              </label>
              <label className="field">
                <span>{t('tags')}</span>
                <input
                  value={tags}
                  placeholder={t('assetTags')}
                  onChange={(event) => {
                    setTags(event.target.value);
                  }}
                />
              </label>
            </fieldset>
          </div>
        )
      )}
      <div className="modal-actions asset-import-actions">
        {paths.length > 1 && (
          <span className="muted">{t('assetImportRemaining', { count: paths.length - index })}</span>
        )}
        <button
          className="button"
          type="button"
          disabled={saving || cancelling || (describing && !inspection)}
          onClick={() => {
            if (describing) void cancelInspection();
            else advance();
          }}
        >
          {t(
            cancelling
              ? 'assetInspectionCancelling'
              : describing
                ? 'cancel'
                : paths.length > 1
                  ? 'assetImportSkip'
                  : 'cancel',
          )}
        </button>
        <button
          className="button primary"
          type="button"
          disabled={describing || saving || cancelling || !draft?.title.trim() || !draft.description.trim()}
          onClick={() => {
            void importAsset();
          }}
        >
          {t(saving ? 'loading' : 'importAsset')}
        </button>
      </div>
    </Modal>
  );
}
