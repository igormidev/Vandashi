import { ChevronLeft, ChevronRight, Copy, GitCommitHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { IconButton } from '../../shared/ui';
import { ExpandableText } from '../../shared/ExpandableText';
import { DiffFiles } from './DiffFiles';
import { useHistory } from './use-history';

export function History() {
  const { t } = useTranslation();
  const { run, setToast } = useApp();
  const { page, setPage, commits, hasMore } = useHistory();
  return (
    <section className="history">
      <div className="history-heading">
        <span className="eyebrow">{t('history')}</span>
        <div className="toolbar">
          <IconButton
            label={t('previous')}
            disabled={page === 0}
            onClick={() => {
              setPage(page - 1);
            }}
          >
            <ChevronLeft size={14} />
          </IconButton>
          {hasMore && (
            <IconButton
              label={t('next')}
              onClick={() => {
                setPage(page + 1);
              }}
            >
              <ChevronRight size={14} />
            </IconButton>
          )}
        </div>
      </div>
      {commits.map((commit) => (
        <article className="commit" key={commit.sha}>
          <div className="commit-heading">
            <GitCommitHorizontal size={15} />
            <h3>{commit.title}</h3>
            <IconButton
              label={t('commitSha')}
              onClick={() => {
                void run(async () => {
                  await navigator.clipboard.writeText(commit.sha);
                  setToast(t('copied'));
                });
              }}
            >
              <Copy size={12} />
            </IconButton>
          </div>
          <div className="commit-meta">
            <span>{commit.sha.slice(0, 7)}</span>
            <time>{new Date(commit.date).toLocaleString()}</time>
          </div>
          {commit.body && <ExpandableText text={commit.body} />}
          <DiffFiles files={commit.files} />
        </article>
      ))}
    </section>
  );
}
