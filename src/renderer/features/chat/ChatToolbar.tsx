import { GitBranch, Minus, Plus, RotateCcw, Sparkles, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatSession } from '../../../domain/models';
import { chatUndoIssue } from '../../../domain/chat-undo-policy';
import { useApp } from '../../app/store';
import { messageText } from '../../app/diagnostics';
import { IconButton, Tip } from '../../shared/ui';
import { sessionTitle } from './session-title';
import { TurnNavigator } from './TurnNavigator';

export function ChatToolbar({
  session,
  fontSize,
  opening,
  resizeText,
  onUndo,
  onReset,
  onJump,
  currentRow,
}: {
  session: ChatSession;
  fontSize: number;
  opening: boolean;
  resizeText: (delta: number) => void;
  onUndo: () => void;
  onReset: () => void;
  onJump: (messageId: string) => boolean;
  currentRow: () => string | null;
}) {
  const { t } = useTranslation();
  const { busy, dirty } = useApp();
  const issue = chatUndoIssue(session);
  return (
    <div className="chat-toolbar">
      <span className="chat-scope">
        {session.branch ? <GitBranch size={13} /> : <Sparkles size={13} />}
        {sessionTitle(session, t)}
        {session.branch && <span className="chat-branch-label">{t('chatBranch')}</span>}
      </span>
      <TurnNavigator
        key={session.id}
        messages={session.messages}
        disabled={opening}
        currentRow={currentRow}
        onJump={onJump}
      />
      <IconButton
        label={t('smallerText')}
        disabled={fontSize <= 10}
        onClick={() => {
          resizeText(-1);
        }}
      >
        <Minus size={13} />
      </IconButton>
      <IconButton
        label={t('biggerText')}
        disabled={fontSize >= 22}
        onClick={() => {
          resizeText(1);
        }}
      >
        <Plus size={13} />
      </IconButton>
      {session.messages.filter((message) => message.role === 'user').length > 1 &&
        (issue ? (
          <Tip label={messageText(issue)}>
            <button className="icon-button" type="button" aria-label={t('undoTurn')} aria-disabled="true">
              <Undo2 size={14} />
            </button>
          </Tip>
        ) : (
          <IconButton
            label={t('undoTurn')}
            disabled={busy || dirty || opening || !session.checkpoints?.length}
            onClick={onUndo}
          >
            <Undo2 size={14} />
          </IconButton>
        ))}
      <IconButton label={t('newConversation')} disabled={busy || dirty || opening} onClick={onReset}>
        <RotateCcw size={14} />
      </IconButton>
    </div>
  );
}
