import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDraft } from '../../../domain/models';
import { useApp } from '../../app/store';
import { Loading, Modal } from '../../shared/ui';
import { fallbackAssetKind, parseAssetTags } from './asset-index';

export function AssetImport({ paths, onClose }: { paths: string[]; onClose: () => void }) {
  const { t } = useTranslation();
  const { api, workspace, run, reload, setDirty, setToast } = useApp();
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<AssetDraft | null>(null);
  const [tags, setTags] = useState('');
  const [describing, setDescribing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const path = paths[index];
  const brandId = workspace?.scope.brandId;
  const videoId = workspace?.scope.videoId ?? null;
  const clipId = workspace?.scope.clipId ?? null;
  const scope = useMemo(() => (brandId ? { brandId, videoId, clipId } : null), [brandId, videoId, clipId]);
  useEffect(() => {
    if (!path || !scope) return;
    let disposed = false;
    setDirty(true);
    void api
      .describeAsset({ scope, path })
      .then((result) => {
        if (!disposed) {
          setDraft(result);
          setTags(result.tags.join(', '));
        }
      })
      .catch(() => {
        if (disposed) return;
        setFailed(true);
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
    setFailed(false);
    setIndex(index + 1);
  };
  const importAsset = async (): Promise<void> => {
    if (!draft || !scope) return;
    setSaving(true);
    await run(async () => {
      const imported = await api.importAsset({
        scope,
        draft: {
          ...draft,
          title: draft.title.trim(),
          description: draft.description.trim(),
          tags: parseAssetTags(tags),
        },
      });
      if (workspace?.assets.some((asset) => asset.id === imported.id)) setToast(t('assetDuplicate'));
      await reload();
      advance();
    });
    setSaving(false);
  };
  return (
    <Modal
      locked={describing || saving}
      title={t('importAsset')}
      open
      onClose={() => {
        if (!describing && !saving) {
          setDirty(false);
          onClose();
        }
      }}
    >
      {describing ? (
        <Loading label={t('describeAsset')} />
      ) : (
        draft && (
          <div className="form">
            <div className="asset-import-filename mono">
              {draft.sourcePath.replaceAll('\\', '/').split('/').at(-1)}
            </div>
            {failed && <p className="muted">{t('assetImportFailed')}</p>}
            <fieldset className="form" disabled={saving}>
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
        <button className="button" type="button" disabled={describing || saving} onClick={advance}>
          {t(paths.length > 1 ? 'assetImportSkip' : 'cancel')}
        </button>
        <button
          className="button primary"
          type="button"
          disabled={describing || saving || !draft?.title.trim() || !draft.description.trim()}
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
