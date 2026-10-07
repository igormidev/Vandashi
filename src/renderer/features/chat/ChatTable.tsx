import { FileCode2, FileSpreadsheet, Text, WrapText } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import type { ExtraProps } from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { ChoiceMenu } from './ChoiceMenu';
import { MessageCopyButton } from './MessageCopyButton';
import { IconButton } from '../../shared/ui';
import { readTableContent, serializeTable, type TableFormat } from './table-copy';
import './chat-markdown.css';

export function ChatTable({ node, ...props }: ComponentProps<'table'> & ExtraProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<TableFormat>('plain');
  const [wrapped, setWrapped] = useState(false);
  const content = readTableContent(node);
  return (
    <div
      className={`chat-markdown-table ${wrapped ? 'is-wrapped' : ''}`}
      role="group"
      aria-label={t('chatTable')}
    >
      <div className="chat-table-scroll">
        <table {...props} />
      </div>
      <div className="chat-table-controls">
        <IconButton
          label={t(wrapped ? 'chatTableNoWrap' : 'chatTableWrap')}
          aria-pressed={wrapped}
          onClick={() => {
            setWrapped(!wrapped);
          }}
        >
          <WrapText size={13} />
        </IconButton>
        <div className="chat-table-copy">
          <ChoiceMenu
            label={t('chatTableCopy')}
            value={format}
            className="chat-table-format"
            options={[
              { value: 'plain', label: t('chatTablePlain'), icon: <Text size={12} /> },
              { value: 'markdown', label: t('chatTableMarkdown'), icon: <FileCode2 size={12} /> },
              { value: 'csv', label: t('chatTableCsv'), icon: <FileSpreadsheet size={12} /> },
            ]}
            onChange={(value) => {
              if (value === 'plain' || value === 'markdown' || value === 'csv') setFormat(value);
            }}
          />
          <MessageCopyButton text={serializeTable(content, format)} />
        </div>
      </div>
    </div>
  );
}
