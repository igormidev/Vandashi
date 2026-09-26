import { ArrowRight, Clapperboard, FolderOpen, FolderPlus, HardDrive, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Workspace } from '../../../domain/models';
import { diagnosticFromBridge, type Diagnostic } from '../../../domain/diagnostics';
import { useApp } from '../../app/store';
import { diagnosticText } from '../../app/diagnostics';
import { Empty, InfoTip, Modal, PendingLabel } from '../../shared/ui';

export function Home({ onOpen }: { onOpen: (workspace: Workspace) => void }) {
  const { t, i18n } = useTranslation();
  const { state, api, refresh, run } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [failure, setFailure] = useState<Diagnostic | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<'create' | 'open' | null>(null);
  const actionOwner = useRef(false);
  const locked = loading || opening !== null || choosing !== null;
  const chooseLocation = () => {
    if (actionOwner.current) return;
    actionOwner.current = true;
    setChoosing('create');
    void run(async () => {
      const value = await api.chooseDirectory();
      if (value) {
        setFolder(value);
        setName('');
        setFailure(null);
        setCreatedId(null);
        setCreating(true);
      }
    }).finally(() => {
      actionOwner.current = false;
      setChoosing(null);
    });
  };
  const openExisting = () => {
    if (actionOwner.current) return;
    actionOwner.current = true;
    setChoosing('open');
    void run(async () => {
      const path = await api.chooseDirectory();
      if (!path) return;
      const brand = await api.importBrand({ path });
      await refresh();
      onOpen(await api.openBrand(brand.id));
    }).finally(() => {
      actionOwner.current = false;
      setChoosing(null);
    });
  };
  const openButton = (
    <button
      className="button"
      type="button"
      disabled={locked}
      aria-busy={choosing === 'open'}
      onClick={openExisting}
    >
      {choosing === 'open' ? (
        <PendingLabel label={t('openingBrand')} />
      ) : (
        <>
          <FolderOpen size={16} />
          {t('openExistingBrand')}
        </>
      )}
    </button>
  );
  const create = async () => {
    if (actionOwner.current || name.trim().length < 3 || !folder) return;
    actionOwner.current = true;
    setLoading(true);
    try {
      const id = createdId ?? (await api.createBrand({ name: name.trim(), parentPath: folder })).id;
      // A saved brand whose workspace failed to open must be reopened, never created twice.
      setCreatedId(id);
      await refresh();
      onOpen(await api.openBrand(id));
      setFailure(null);
      setCreating(false);
    } catch (error) {
      setFailure(diagnosticFromBridge(error));
    } finally {
      actionOwner.current = false;
      setLoading(false);
    }
  };
  return (
    <main className="home">
      <div className="home-head">
        <div>
          <div className="eyebrow">{t('studio')}</div>
          <h1>{t(state?.brands.length ? 'recentBrands' : 'welcome')}</h1>
        </div>
        {!!state?.brands.length && (
          <div className="toolbar">
            {openButton}
            <button
              className="button primary"
              type="button"
              disabled={locked}
              aria-busy={choosing === 'create'}
              onClick={chooseLocation}
            >
              {choosing === 'create' ? (
                <PendingLabel label={t('loading')} />
              ) : (
                <>
                  <Plus size={15} />
                  {t('createBrand')}
                </>
              )}
            </button>
          </div>
        )}
      </div>
      {state?.brands.length ? (
        <div className="brand-list">
          {state.brands.map((brand) => (
            <button
              type="button"
              className="brand-row"
              key={brand.id}
              disabled={locked}
              aria-busy={opening === brand.id}
              onClick={() => {
                if (actionOwner.current) return;
                actionOwner.current = true;
                setOpening(brand.id);
                void run(async () => {
                  onOpen(await api.openBrand(brand.id));
                }).finally(() => {
                  actionOwner.current = false;
                  setOpening(null);
                });
              }}
            >
              <span className="brand-avatar">{brand.name.slice(0, 1).toUpperCase()}</span>
              <div className="brand-row-text">
                <h2>{brand.name}</h2>
                <div className="path">{brand.path}</div>
              </div>
              <span className="last">{new Date(brand.lastOpened).toLocaleDateString(i18n.language)}</span>
              {opening === brand.id ? <PendingLabel label={t('loading')} /> : <ArrowRight size={17} />}
            </button>
          ))}
        </div>
      ) : (
        <div className="home-empty">
          <Empty
            icon={<Clapperboard size={43} strokeWidth={1} />}
            title={t('createBrand')}
            description={t('noBrands')}
          >
            <div className="toolbar">
              {openButton}
              <button
                className="button primary"
                type="button"
                onClick={chooseLocation}
                disabled={locked}
                aria-busy={choosing === 'create'}
              >
                {choosing === 'create' ? (
                  <PendingLabel label={t('loading')} />
                ) : (
                  <>
                    <FolderPlus size={16} />
                    {t('createBrand')}
                  </>
                )}
              </button>
            </div>
          </Empty>
        </div>
      )}
      <footer className="home-footer">
        <span className="toolbar">
          <HardDrive size={12} />
          {t('localOnly')}
        </span>
        <span>{t('openSource')}</span>
      </footer>
      <Modal
        title={t('createBrand')}
        open={creating}
        locked={loading}
        onClose={() => {
          if (!loading) setCreating(false);
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <div className="form">
            <label className="field" htmlFor="brand-name" aria-label={t('brandName')}>
              <span className="field-label">
                <span>
                  {t('brandName')}
                  <InfoTip text={t('brandNameHelp')} />
                </span>
              </span>
              <input
                id="brand-name"
                disabled={loading || createdId !== null}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                placeholder={t('brandNameHint')}
                minLength={3}
                maxLength={100}
                required
                autoComplete="off"
              />
            </label>
            {failure && (
              <div className="field-error" role="alert">
                <p>{diagnosticText(failure)}</p>
                {failure.kind === 'app' && failure.message.id === 'gitUnavailable' && (
                  <button
                    className="button small"
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      void run(() => api.openExternal('https://git-scm.com/downloads'));
                    }}
                  >
                    {t('installHelp')}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="modal-actions">
            <button
              className="button"
              type="button"
              disabled={loading}
              onClick={() => {
                setCreating(false);
              }}
            >
              {t('cancel')}
            </button>
            <button
              className="button primary"
              type="submit"
              disabled={!folder || name.trim().length < 3 || loading}
              aria-busy={loading}
            >
              {loading ? <PendingLabel label={t('loading')} /> : t(failure ? 'retry' : 'create')}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
