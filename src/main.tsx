import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './index.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/orbitron';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>
);
