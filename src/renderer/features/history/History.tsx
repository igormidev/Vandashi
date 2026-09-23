import { ChevronLeft, ChevronRight, Copy, GitCommitHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { IconButton, Loading } from '../../shared/ui';
import { PendingIconButton } from '../../shared/PendingIconButton';
import { ExpandableText } from '../../shared/ExpandableText';
import { DiffFiles } from './DiffFiles';
import { useHistory } from './use-history';

export function History() {
  const { t, i18n } = useTranslation();
  const { setToast } = useApp();
  const { page, setPage, commits, hasMore, loading, failed, retry } = useHistory();
  return (
    <section className="history" aria-busy={loading}>
      <div className="history-heading">
        <span className="eyebrow">{t('history')}</span>
        <div className="toolbar">
          <IconButton
            label={t('previous')}
            disabled={page === 0 || loading}
            onClick={() => {
              setPage(page - 1);
            }}
          >
            <ChevronLeft size={14} />
          </IconButton>
          {hasMore && (
            <IconButton
              label={t('next')}
              disabled={loading}
              onClick={() => {
                setPage(page + 1);
              }}
            >
              <ChevronRight size={14} />
            </IconButton>
          )}
        </div>
      </div>
      {loading && <Loading />}
      {failed && (
        <button className="button small" type="button" onClick={retry}>
          {t('retry')}
        </button>
      )}
      {!loading &&
        !failed &&
        commits.map((commit) => (
          <article className="commit" key={commit.sha}>
            <div className="commit-heading">
              <GitCommitHorizontal size={15} />
              <h3>{commit.title}</h3>
              <PendingIconButton
                label={t('commitSha')}
                action={async () => {
                  await navigator.clipboard.writeText(commit.sha);
                  setToast({ kind: 'interface', key: 'copied' });
                }}
              >
                <Copy size={12} />
              </PendingIconButton>
            </div>
            <div className="commit-meta">
              <span>{commit.sha.slice(0, 7)}</span>
              <time>{new Date(commit.date).toLocaleString(i18n.language)}</time>
            </div>
            {commit.body && <ExpandableText text={commit.body} />}
            <DiffFiles files={commit.files} />
          </article>
        ))}
    </section>
  );
}
