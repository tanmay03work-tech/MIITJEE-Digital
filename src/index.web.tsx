import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppRegistry } from 'react-native';

// Add global error handler to catch and display initialization errors
window.addEventListener('error', (event) => {
  console.error('[MIITJEE Web] Uncaught error:', event.error);
  const root = document.getElementById('root');
  if (root && !root.hasChildNodes()) {
    root.innerHTML = `<div style="padding:40px;font-family:system-ui;color:#c00;">
      <h2>App failed to load</h2>
      <pre style="white-space:pre-wrap;background:#f5f5f5;padding:16px;border-radius:8px;font-size:13px;">${event.error?.stack || event.message}</pre>
    </div>`;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[MIITJEE Web] Unhandled promise rejection:', event.reason);
});

function injectDesktopStyles() {
  const style = document.createElement('style');
  style.id = 'miitjee-desktop-responsive';
  style.textContent = `
    /* ===== Desktop Full-Width Layout Overrides ===== */

    /* Ensure root elements fill 100% full height and width */
    html, body, #root {
      height: 100% !important;
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }

    #root > div {
      height: 100% !important;
      width: 100% !important;
      max-width: 100% !important;
      display: flex !important;
      flex-direction: column !important;
      box-sizing: border-box !important;
    }

    /* Enable visible custom scrollbar for desktop */
    ::-webkit-scrollbar {
      width: 8px !important;
      height: 8px !important;
      display: block !important;
    }
    ::-webkit-scrollbar-track {
      background: #EBF0F7 !important;
      border-radius: 4px !important;
    }
    ::-webkit-scrollbar-thumb {
      background: #5B61F6 !important;
      border-radius: 4px !important;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #3941D8 !important;
    }

    /* Question images & diagrams: contain fit so no diagram or options are cropped */
    img {
      object-fit: contain !important;
      max-height: 560px !important;
    }
  `;
  document.head.appendChild(style);
}

async function bootstrap() {
  try {
    // Import App component
    const { default: App } = await import('../App');

    // Register with AppRegistry to get react-native-web stylesheet injection
    AppRegistry.registerComponent('MIITJEEApp', () => App);

    const appRegistryWeb = AppRegistry as unknown as {
      getApplication: (
        appKey: string,
        options?: { initialProps?: Record<string, unknown> }
      ) => { element: React.ReactNode; getStyleElement: () => React.ReactNode };
    };

    // Use AppRegistry.getApplication to get the element + styles
    // This is compatible with React 19's createRoot API
    const { element, getStyleElement } = appRegistryWeb.getApplication('MIITJEEApp', {
      initialProps: {},
    });

    // Mount using React 19's createRoot API
    const rootElement = document.getElementById('root');
    if (!rootElement) {
      throw new Error('Root element #root not found');
    }

    const root = createRoot(rootElement);
    root.render(
      React.createElement(React.Fragment, null, element, getStyleElement())
    );

    // Inject desktop responsive overrides
    injectDesktopStyles();

    console.log('[MIITJEE Web] App mounted successfully');
  } catch (err) {
    console.error('[MIITJEE Web] Failed to initialize app:', err);
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `<div style="padding:40px;font-family:system-ui;color:#c00;">
        <h2>App initialization failed</h2>
        <pre style="white-space:pre-wrap;background:#f5f5f5;padding:16px;border-radius:8px;font-size:13px;">${(err as Error)?.stack || err}</pre>
      </div>`;
    }
  }
}

bootstrap();
