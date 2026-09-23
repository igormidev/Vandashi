import { FileText, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { Split } from '../../shared/Split';
import { ChatPane } from '../chat/ChatPane';
import { History } from '../history/History';
import { Preview } from './Preview';
import { ScriptEditor } from './ScriptEditor';
import '../../styles/creation.css';

export function CreationPage() {
  const { t } = useTranslation();
  const { workspace, busy, dirty, setChatTarget } = useApp();
  const [tab, setTab] = useState<'script' | 'chat'>('script');
  const openChat = () => {
    setChatTarget({ topic: 'creation', title: t('creation') });
    setTab('chat');
  };
  return (
    <Split
      id="creation"
      left={
        <>
          <div className="tabs-small">
            <button
              type="button"
              className={tab === 'script' ? 'active' : ''}
              disabled={busy}
              onClick={() => {
                setTab('script');
              }}
            >
              <FileText size={13} />
              {t('script')}
            </button>
            <button
              type="button"
              className={tab === 'chat' ? 'active' : ''}
              disabled={dirty}
              onClick={openChat}
            >
              <MessageSquare size={13} />
              {t('chat')}
            </button>
          </div>
          <div className="creation-panel" hidden={tab !== 'chat'}>
            <ChatPane />
          </div>
          <div className="creation-panel" hidden={tab !== 'script'}>
            <ScriptEditor key={workspace?.revision} onBegin={openChat} />
          </div>
        </>
      }
      right={
        <div className="creation-right">
          <Preview />
          <History key={workspace?.revision} />
        </div>
      }
    />
  );
}
