import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { DocsApp } from './portal.js';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Documentation portal root element was not found');

createRoot(rootElement).render(
  <StrictMode>
    <DocsApp />
  </StrictMode>
);
