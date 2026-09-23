import { useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { SiteCopy } from './locales/catalogs';
import { HeadingText } from './HeadingText';

export const sourceUrl = 'https://github.com/igormidev/Vandashi';

export function Setup({ copy }: { copy: SiteCopy }) {
  const [result, setResult] = useState<'idle' | 'copied' | 'failed'>('idle');
  const prompt = useRef<HTMLDetailsElement>(null);
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(copy.setupPrompt);
      setResult('copied');
    } catch {
      setResult('failed');
      if (prompt.current) prompt.current.open = true;
    }
  }
  return (
    <section className="setup section" id="start" aria-labelledby="setup-title">
      <div>
        <h2 id="setup-title">
          <HeadingText text={copy.setupTitle} />
        </h2>
        <p>{copy.setupBody}</p>
        <p className="platforms">{copy.platforms}</p>
      </div>
      <div className="setup-actions">
        <div className="action-row">
          <button
            className="button primary"
            onClick={() => {
              void copyPrompt();
            }}
          >
            {result === 'copied' ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <Copy size={18} aria-hidden="true" />
            )}
            {result === 'copied' ? copy.copied : copy.copy}
          </button>
          <a className="text-link" href={`${sourceUrl}#run-from-source`}>
            {copy.guide}
          </a>
        </div>
        <p className="copy-status" role="status">
          {result === 'failed' ? copy.copyFailed : result === 'copied' ? copy.copied : ''}
        </p>
        <details ref={prompt} className="prompt">
          <summary>{copy.promptLabel}</summary>
          <textarea readOnly value={copy.setupPrompt} aria-label={copy.promptLabel} rows={10} />
        </details>
        <p className="requirements">{copy.requirements}</p>
      </div>
    </section>
  );
}
