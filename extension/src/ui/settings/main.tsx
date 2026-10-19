import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsScreen } from './SettingsScreen';
import '../shared/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <StrictMode>
    <SettingsScreen />
  </StrictMode>,
);
