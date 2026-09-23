import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useTranslation } from 'react-i18next';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/geist-mono/400.css';
import './i18n';
import './styles/base.css';
import { AppProvider } from './app/store';
import { App } from './app/App';

function Root() {
  const { t } = useTranslation();
  if (!window.vandashi)
    return (
      <div className="empty">
        <h1>{t('desktopRequired')}</h1>
        <p>{t('desktopRequiredHelp')}</p>
      </div>
    );
  return (
    <Tooltip.Provider>
      <AppProvider api={window.vandashi}>
        <App />
      </AppProvider>
    </Tooltip.Provider>
  );
}
const root = document.getElementById('root');
if (root)
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
