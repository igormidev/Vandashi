import { ArrowLeft, Check, ChevronRight, Folder, Images, Plus, RefreshCw, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetKind } from '../../../domain/models';
import { useApp } from '../../app/store';
import { Split } from '../../shared/Split';
import { AiButton, Empty, IconButton, Modal } from '../../shared/ui';
import { ChatPane } from '../chat/ChatPane';
import { AssetImport } from './AssetImport';
import { AssetInspector } from './AssetInspector';
import { AssetPreview, AssetTypeIcon } from './AssetPreview';
import { filterAssets, indexAssets } from './asset-index';
import { useAssetRefresh } from './use-asset-refresh';
import '../../styles/assets.css';

const kinds: AssetKind[] = ['image', 'video', 'audio', 'other'];

export function AssetsPage() {
  const { t } = useTranslation();
  const { workspace, api, busy, dirty, setChatTarget, run, reload, setToast } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('');
  const [selectedKinds, setSelectedKinds] = useState<AssetKind[]>(kinds);
  const [tag, setTag] = useState('');
  const [imports, setImports] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const assets = workspace?.assets;
  const scopeKey = workspace
    ? [workspace.scope.brandId, workspace.scope.videoId, workspace.scope.clipId].join(':')
    : '';
  useAssetRefresh(scopeKey, busy || dirty || mutating || imports.length > 0);
  const index = useMemo(() => indexAssets(assets ?? []), [assets]);
  const visible = useMemo(
    () => filterAssets(index, { query, folder, kinds: selectedKinds, tag }),
    [index, query, folder, selectedKinds, tag],
  );
  const selected = assets?.find((asset) => asset.id === selectedId);
  const locked = busy || mutating || imports.length > 0;
  if (!workspace) return null;
  const beginImport = (paths: string[]): void => {
    if (locked || dirty) return;
    const unique = [...new Set(paths)].filter((path) => !assets?.some((asset) => asset.path === path));
    if (unique.length < paths.length) setToast({ kind: 'interface', key: 'assetDuplicate' });
    if (unique.length > 0) setImports(unique);
  };
  const library = (
    <div className="asset-workspace">
      <section
        className={`asset-library ${dragging ? 'dragging' : ''}`}
        aria-label={t('assetLibrary')}
        onDragOver={(event) => {
          event.preventDefault();
          if (!locked && !dirty) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          beginImport(
            Array.from(event.dataTransfer.files)
              .map((file) => api.pathForFile(file))
              .filter(Boolean),
          );
        }}
      >
        <header className="asset-panel-heading">
          <h2>{t(workspace.video ? 'assets' : 'sharedAssets')}</h2>
          <AiButton
            disabled={locked || dirty}
            onClick={() => {
              setChatTarget({ topic: 'assets', title: t(workspace.video ? 'assets' : 'sharedAssets') });
            }}
          />
          <IconButton
            label={t('assetRefresh')}
            disabled={locked || dirty}
            onClick={() => {
              setMutating(true);
              void run(reload).finally(() => {
                setMutating(false);
              });
            }}
          >
            <RefreshCw size={14} />
          </IconButton>
          <button
            className="button small"
            type="button"
            disabled={locked || dirty}
            onClick={() => {
              setMutating(true);
              void run(async () => {
                beginImport(await api.chooseFiles('assets'));
              }).finally(() => {
                setMutating(false);
              });
            }}
          >
            <Plus size={14} />
            {t('importAssets')}
          </button>
        </header>
        <div className="asset-search">
          <Search size={14} />
          <input
            aria-label={t('assetsSearch')}
            placeholder={t('assetsSearch')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          {query && (
            <IconButton
              label={t('clearSearch')}
              onClick={() => {
                setQuery('');
              }}
            >
              <X size={13} />
            </IconButton>
          )}
        </div>
        <div className="asset-filters">
          <fieldset className="asset-kind-filters" aria-label={t('assetAllTypes')}>
            {kinds.map((kind) => (
              <label key={kind} className={selectedKinds.includes(kind) ? 'selected' : ''}>
                <input
                  type="checkbox"
                  checked={selectedKinds.includes(kind)}
                  onChange={(event) => {
                    setSelectedKinds(
                      event.target.checked
                        ? [...selectedKinds, kind]
                        : selectedKinds.filter((value) => value !== kind),
                    );
                  }}
                />
                <AssetTypeIcon kind={kind} size={13} />
                <span>{t(kind)}</span>
              </label>
            ))}
          </fieldset>
          <select
            aria-label={t('assetTagFilter')}
            value={tag}
            onChange={(event) => {
              setTag(event.target.value);
            }}
          >
            <option value="">{t('assetAllTags')}</option>
            {index.tags.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </div>
        <div className="asset-breadcrumb">
          <IconButton
            label={t('assetFolderUp')}
            disabled={!folder || !!query || !!tag}
            onClick={() => {
              setFolder(folder.slice(0, Math.max(0, folder.lastIndexOf('/'))));
            }}
          >
            <ArrowLeft size={13} />
          </IconButton>
          <button
            type="button"
            disabled={!folder}
            onClick={() => {
              setFolder('');
            }}
          >
            {t('assetLibrary')}
          </button>
          {folder && !query && !tag && (
            <>
              <ChevronRight size={11} />
              <span>{folder}</span>
            </>
          )}
          <span className="asset-result-count">{t('assetCount', { count: visible.assets.length })}</span>
        </div>
        <div className="asset-library-scroll">
          {visible.assets.length || visible.folders.length ? (
            <div className="asset-grid">
              {visible.folders.map((path) => (
                <button
                  key={path}
                  className="asset-folder"
                  type="button"
                  onClick={() => {
                    setFolder(path);
                  }}
                >
                  <Folder size={28} strokeWidth={1.3} />
                  <span>{path.split('/').at(-1)}</span>
                  <ChevronRight size={13} />
                </button>
              ))}
              {visible.assets.map((asset) => (
                <button
                  className={`asset-tile ${selectedId === asset.id ? 'selected' : ''}`}
                  type="button"
                  key={asset.id}
                  aria-pressed={selectedId === asset.id}
                  disabled={dirty && selectedId !== asset.id}
                  onClick={() => {
                    setSelectedId(asset.id);
                  }}
                >
                  <div className="asset-tile-preview">
                    <AssetPreview key={`${asset.id}:${asset.revision}`} asset={asset} compact />
                    {selectedId === asset.id && (
                      <span className="asset-selected-mark">
                        <Check size={11} />
                      </span>
                    )}
                  </div>
                  <div className="asset-tile-name">
                    <AssetTypeIcon kind={asset.kind} size={12} />
                    <span>{asset.title}</span>
                  </div>
                  {asset.shared && <span className="asset-shared-label">{t('shared')}</span>}
                </button>
              ))}
            </div>
          ) : (
            <Empty
              icon={<Images size={35} strokeWidth={1.1} />}
              title={t(query || tag || assets?.length ? 'noResults' : 'noAssets')}
              description={t(query || tag || assets?.length ? 'assetSearchEmpty' : 'noAssetsHelp')}
            />
          )}
        </div>
        {dragging && (
          <div className="asset-drop-overlay">
            <Plus size={30} />
            <span>{t('assetDrop')}</span>
          </div>
        )}
      </section>
      {selected ? (
        <AssetInspector
          key={`${selected.id}:${selected.revision}`}
          asset={selected}
          locked={locked}
          onDelete={() => {
            setDeleting(true);
          }}
        />
      ) : (
        <aside className="asset-inspector">
          <Empty
            icon={<Images size={29} strokeWidth={1.1} />}
            title={t('noAssetSelected')}
            description={t('noAssetSelectedHelp')}
          />
        </aside>
      )}
    </div>
  );
  return (
    <>
      <Split id="assets" left={<ChatPane />} right={library} />
      {imports.length > 0 && (
        <AssetImport
          paths={imports}
          onClose={() => {
            setImports([]);
          }}
        />
      )}
      <Modal
        title={t('deleteAsset')}
        description={t('deleteAssetHelp')}
        open={deleting}
        locked={mutating}
        onClose={() => {
          if (!mutating) setDeleting(false);
        }}
      >
        <div className="modal-actions">
          <button
            type="button"
            className="button"
            disabled={mutating}
            onClick={() => {
              setDeleting(false);
            }}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            className="button danger"
            disabled={mutating || busy || dirty || !selected}
            onClick={() => {
              if (!selected) return;
              setMutating(true);
              void run(async () => {
                await api.deleteAsset({ scope: workspace.scope, assetId: selected.id });
                setSelectedId(null);
                setDeleting(false);
                await reload();
              }).finally(() => {
                setMutating(false);
              });
            }}
          >
            {t(mutating ? 'loading' : 'delete')}
          </button>
        </div>
      </Modal>
    </>
  );
}
