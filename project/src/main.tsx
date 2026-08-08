import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { verifyChaseExampleLogic } from '@/lib/api';

if (import.meta.env.DEV) {
  try {
    verifyChaseExampleLogic();
    // eslint-disable-next-line no-console
    console.debug('Chase diagnostic checks passed.');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Chase diagnostic failure:', error);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
