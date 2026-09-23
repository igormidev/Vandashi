import { Copy, FolderOpen, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Asset } from '../../../domain/models';
import { useApp } from '../../app/store';
import { AiButton, IconButton, InfoTip, PendingLabel } from '../../shared/ui';
import { CommitDialog } from '../history/CommitDialog';
import { AssetPreview } from './AssetPreview';
import { parseAssetTags } from './asset-index';

function formatSize(bytes: number, locale: string): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'];
  const exponent = Math.min(3, Math.max(0, Math.floor(Math.log(Math.max(1, bytes)) / Math.log(1_000))));
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: units[exponent] ?? 'byte',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(bytes / 1_000 ** exponent);
}

export function AssetInspector({
  asset,
  onDelete,
  locked,
}: {
  asset: Asset;
  onDelete: () => void;
  locked: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { api, workspace, setDirty, setChatTarget, run, reload, setToast } = useApp();
  const [title, setTitle] = useState(asset.title);
  const [description, setDescription] = useState(asset.description);
  const [tags, setTags] = useState(asset.tags.join(', '));
  const [expectedRevision, setExpectedRevision] = useState(asset.revision);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const sharedLocked = asset.shared && workspace?.video !== null;
  const writeLocked = locked || sharedLocked;
  const changed =
    title !== asset.title ||
    description !== asset.description ||
    JSON.stringify(parseAssetTags(tags)) !== JSON.stringify(asset.tags);
  const update = (field: 'title' | 'description' | 'tags', value: string): void => {
    if (field === 'title') setTitle(value);
    if (field === 'description') setDescription(value);
    if (field === 'tags') setTags(value);
    setDirty(
      (field === 'title' ? value : title) !== asset.title ||
        (field === 'description' ? value : description) !== asset.description ||
        JSON.stringify(parseAssetTags(field === 'tags' ? value : tags)) !== JSON.stringify(asset.tags),
    );
  };
  const save = async (commit: { title: string; body: string }): Promise<void> => {
    if (!workspace || !title.trim()) return;
    setSaving(true);
    try {
      await api.updateAsset({
        scope: workspace.scope,
        assetId: asset.id,
        expectedRevision,
        title: title.trim(),
        description: description.trim(),
        tags: parseAssetTags(tags),
        commit,
      });
      setDirty(false);
      setConfirming(false);
      await reload();
      setToast({ kind: 'interface', key: 'saved' });
    } catch (error) {
      // The store defers this snapshot until Reset so a conflict never erases the inspector draft.
      await reload().catch(() => undefined);
      throw error;
    } finally {
      setSaving(false);
    }
  };
  return (
    <aside className="asset-inspector" aria-label={t('assetDetails')}>
      <div className="asset-panel-heading">
        <h2>{t('assetSelection')}</h2>
        {sharedLocked && <InfoTip text={t('assetSharedEditHelp')} />}
        <AiButton
          disabled={writeLocked || changed || saving}
          onClick={() => {
            setChatTarget({ topic: `asset:${asset.id}`, title: asset.title });
          }}
        />
      </div>
      <div className="asset-inspector-scroll">
        <div className="asset-large-preview">
          <AssetPreview key={`${asset.mediaUrl}:${asset.revision}`} asset={asset} />
        </div>
        <div className="asset-file-actions">
          <span className="mono">{formatSize(asset.size, i18n.language)}</span>
          {asset.shared && <span className="badge">{t('shared')}</span>}
          <div className="spacer" />
          {asset.kind === 'image' && (
            <IconButton
              label={t('assetCopyImage')}
              onClick={() => {
                void run(async () => {
                  await api.copyImage(asset.path);
                  setToast({ kind: 'interface', key: 'copied' });
                });
              }}
            >
              <Copy size={14} />
            </IconButton>
          )}
          <IconButton
            label={t('reveal')}
            onClick={() => {
              void run(() => api.revealPath(asset.path));
            }}
          >
            <FolderOpen size={15} />
          </IconButton>
        </div>
        <fieldset className="form asset-details-form" disabled={writeLocked || saving}>
          <label className="field">
            <span>{t('assetTitle')}</span>
            <input
              value={title}
              onChange={(event) => {
                update('title', event.target.value);
              }}
            />
          </label>
          <label className="field">
            <span>{t('assetDescription')}</span>
            <textarea
              rows={4}
              value={description}
              onChange={(event) => {
                update('description', event.target.value);
              }}
            />
          </label>
          <label className="field">
            <span>{t('tags')}</span>
            <input
              value={tags}
              placeholder={t('assetTags')}
              onChange={(event) => {
                update('tags', event.target.value);
              }}
            />
          </label>
        </fieldset>
        <div className="asset-path mono">{asset.relativePath}</div>
      </div>
      <div className="asset-inspector-footer">
        <IconButton label={t('deleteAsset')} disabled={writeLocked || changed || saving} onClick={onDelete}>
          <Trash2 size={15} />
        </IconButton>
        <IconButton
          label={t('assetReset')}
          disabled={!changed || writeLocked || saving}
          onClick={() => {
            setTitle(asset.title);
            setDescription(asset.description);
            setTags(asset.tags.join(', '));
            setExpectedRevision(asset.revision);
            setDirty(false);
          }}
        >
          <RotateCcw size={14} />
        </IconButton>
        <button
          className="button primary small"
          type="button"
          disabled={!changed || !title.trim() || writeLocked || saving}
          aria-busy={saving}
          onClick={() => {
            setConfirming(true);
          }}
        >
          {saving ? <PendingLabel label={t('loading')} /> : t('save')}
        </button>
      </div>
      {confirming && (
        <CommitDialog
          summary={JSON.stringify({
            asset: asset.relativePath,
            before: { title: asset.title, description: asset.description, tags: asset.tags },
            after: { title: title.trim(), description: description.trim(), tags: parseAssetTags(tags) },
          })}
          onSave={save}
          onClose={() => {
            setConfirming(false);
          }}
        />
      )}
    </aside>
  );
}
