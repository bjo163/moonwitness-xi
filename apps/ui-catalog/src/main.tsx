import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Catalog } from './catalog.js';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('UI catalog root element was not found');

createRoot(rootElement).render(
  <StrictMode>
    <Catalog />
  </StrictMode>
);
