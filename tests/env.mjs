/* tests/env.mjs — boots a browser-like global environment (jsdom) so the real
 * application modules can be exercised in Node exactly as they run in a browser. */

import { JSDOM } from 'jsdom';

export const BASE_URL = process.env.WSR_BASE_URL || 'http://127.0.0.1:8138/';

export function bootDom({ html = '<!doctype html><html><head></head><body><div id="app"></div></body></html>', url = BASE_URL } = {}) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;

  const define = (name, value) => {
    try {
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    } catch {
      globalThis[name] = value;
    }
  };

  define('window', window);
  define('document', window.document);
  define('navigator', window.navigator);
  define('localStorage', window.localStorage);
  define('sessionStorage', window.sessionStorage);
  define('HTMLElement', window.HTMLElement);
  define('Node', window.Node);
  define('Event', window.Event);
  define('CustomEvent', window.CustomEvent);
  define('KeyboardEvent', window.KeyboardEvent);
  define('MouseEvent', window.MouseEvent);
  define('getComputedStyle', window.getComputedStyle.bind(window));
  define('requestAnimationFrame', (cb) => setTimeout(() => cb(performance.now()), 16));
  define('cancelAnimationFrame', (id) => clearTimeout(id));
  define('matchMedia', (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  define('CSS', window.CSS || { escape: (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) });
  define('location', window.location);
  define('isSecureContext', false);
  define('vibrate', undefined);
  window.navigator.vibrate = () => true;
  window.scrollTo = () => {};
  window.open = () => ({ focus() {} });

  // jsdom does not implement scrolling; the game calls these defensively.
  const noop = () => {};
  if (window.Element) {
    window.Element.prototype.scrollTo = window.Element.prototype.scrollTo || noop;
    window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView || noop;
  }
  if (window.HTMLElement) {
    window.HTMLElement.prototype.scrollTo = window.HTMLElement.prototype.scrollTo || noop;
    window.HTMLElement.prototype.scrollIntoView = window.HTMLElement.prototype.scrollIntoView || noop;
  }

  return dom;
}

export function teardownDom(dom) {
  try { dom.window.close(); } catch { /* noop */ }
}
