import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// Vérifications visuelles : ?debug expose quelques calques (aucune écriture sur la Bbox)
if (new URLSearchParams(location.search).has('debug')) import('./debug');

// Service worker (contexte sécurisé uniquement : https ou localhost), jamais dans les aperçus
if (import.meta.env.PROD && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !document.documentElement.dataset.preview) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
