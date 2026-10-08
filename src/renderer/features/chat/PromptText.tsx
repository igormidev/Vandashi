import { useTranslation } from 'react-i18next';
import type { PromptDocument, PromptReference } from '../../../domain/chat-prompt';
import { Tip } from '../../shared/ui';

export function PromptText({
  document,
  disabled,
  onReference,
}: {
  document: PromptDocument;
  disabled: boolean;
  onReference: (reference: PromptReference) => void;
}) {
  const { t } = useTranslation();
  const content = document.references.flatMap((reference, index) => {
    const preceding = document.text.slice(document.references[index - 1]?.end ?? 0, reference.start);
    const value = document.text.slice(reference.start, reference.end);
    return [
      preceding,
      reference.readable ? (
        <Tip key={reference.id} label={t('promptOpenFile', { name: reference.label })}>
          <button
            className={`prompt-reference prompt-reference-${reference.kind}`}
            type="button"
            disabled={disabled}
            onClick={() => {
              onReference(reference);
            }}
          >
            {value}
          </button>
        </Tip>
      ) : (
        <Tip key={reference.id} label={t('promptReferenceOnly')}>
          <span className={`prompt-reference prompt-reference-${reference.kind}`}>{value}</span>
        </Tip>
      ),
    ];
  });
  return (
    <div className="prompt-text">
      {content}
      {document.text.slice(document.references.at(-1)?.end ?? 0)}
    </div>
  );
}
