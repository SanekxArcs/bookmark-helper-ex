import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/assets/main.css';
import { QuickSearch } from './QuickSearch';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QuickSearch />
  </StrictMode>,
);
