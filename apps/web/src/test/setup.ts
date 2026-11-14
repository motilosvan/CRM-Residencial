import '@testing-library/jest-dom/vitest';

// Node >= 25 define un `localStorage` global propio (sin archivo) que tapa el de jsdom y avisa al
// leerlo. Se reemplaza sin leerlo por el de la ventana de jsdom.
const jsdom = (globalThis as unknown as { jsdom?: { window: Window } }).jsdom;
if (jsdom) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: jsdom.window.localStorage,
  });
}

// jsdom no implementa matchMedia (lo lee `useIsMobile` de shadcn). Valor por defecto: sin coincidencias.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }) as MediaQueryList;
}
