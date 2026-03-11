import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

function SystemThemeSync({ children }) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');

    const applyTheme = () => {
      const theme = media.matches ? 'dark' : 'light';
      root.setAttribute('data-theme', theme);
      root.style.colorScheme = theme;
      if (themeColorMeta) {
        themeColorMeta.setAttribute('content', theme === 'dark' ? '#0f172a' : '#1A3C5E');
      }
    };

    applyTheme();
    if (media.addEventListener) media.addEventListener('change', applyTheme);
    else media.addListener(applyTheme);

    return () => {
      if (media.removeEventListener) media.removeEventListener('change', applyTheme);
      else media.removeListener(applyTheme);
    };
  }, []);

  return children;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SystemThemeSync>
      <App />
    </SystemThemeSync>
  </React.StrictMode>
);
