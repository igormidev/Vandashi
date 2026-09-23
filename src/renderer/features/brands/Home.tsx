import { ArrowRight, Clapperboard, FolderPlus, HardDrive, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Workspace } from '../../../domain/models';
import { diagnosticFromBridge, type Diagnostic } from '../../../domain/diagnostics';
import { useApp } from '../../app/store';
import { diagnosticText } from '../../app/diagnostics';
import { Empty, InfoTip, Modal } from '../../shared/ui';

export function Home({ onOpen }: { onOpen: (workspace: Workspace) => void }) {
  const { t, i18n } = useTranslation();
  const { state, api, refresh, run } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [folder, setFolder] = useState('');
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Diagnostic | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const chooseLocation = () => {
    void run(async () => {
      const value = await api.chooseDirectory();
      if (value) {
        setFolder(value);
        setName('');
        setFailure(null);
        setCreatedId(null);
        setCreating(true);
      }
    });
  };
  const create = async () => {
    if (loading || name.trim().length < 3 || !folder) return;
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
          <button className="button primary" type="button" onClick={chooseLocation}>
            <Plus size={15} />
            {t('createBrand')}
          </button>
        )}
      </div>
      {state?.brands.length ? (
        <div className="brand-list">
          {state.brands.map((brand) => (
            <button
              type="button"
              className="brand-row"
              key={brand.id}
              onClick={() => {
                void run(async () => {
                  onOpen(await api.openBrand(brand.id));
                });
              }}
            >
              <span className="brand-avatar">{brand.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <h2>{brand.name}</h2>
                <div className="path">{brand.path}</div>
              </div>
              <span className="last">{new Date(brand.lastOpened).toLocaleDateString(i18n.language)}</span>
              <ArrowRight size={17} />
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
            <button className="button primary" type="button" onClick={chooseLocation}>
              <FolderPlus size={16} />
              {t('createBrand')}
            </button>
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
            >
              {t(loading ? 'loading' : failure ? 'retry' : 'create')}
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
