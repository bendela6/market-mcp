import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app.js';
import { ensureUser } from './api-client.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

ensureUser()
  .catch((err) => { console.error('user boot failed', err); })
  .finally(() => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
