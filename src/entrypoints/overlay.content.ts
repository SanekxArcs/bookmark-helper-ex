// Injected on demand by the background when the quick search shortcut is
// pressed (activeTab + scripting, so no host permissions are needed). It only
// mounts an iframe of quick-search.html: the UI runs on the extension's origin,
// isolated from the page's CSS, and the page can't read what the user types.

const CLOSE_MESSAGE = 'bookmark-helper:close';

interface OverlayHandle {
  close: () => void;
}

export default defineContentScript({
  registration: 'runtime',
  async main() {
    const global = window as typeof window & { __bookmarkHelperOverlay?: OverlayHandle };
    // Pressing the shortcut again toggles the overlay off.
    if (global.__bookmarkHelperOverlay) {
      global.__bookmarkHelperOverlay.close();
      return;
    }

    const iframe = document.createElement('iframe');
    const previousFocus = document.activeElement as HTMLElement | null;

    // The iframe stays transparent only if its color-scheme matches the
    // document inside it, so resolve the same theme the palette will use.
    const { theme = 'system' } = await browser.storage.local.get('theme');
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);

    iframe.src = browser.runtime.getURL('/quick-search.html');
    iframe.title = 'Bookmark quick search';
    iframe.setAttribute('allowtransparency', 'true');
    iframe.style.cssText = [
      'all: initial',
      'position: fixed',
      'inset: 0',
      'width: 100vw',
      'height: 100vh',
      'border: 0',
      'margin: 0',
      'padding: 0',
      'z-index: 2147483647',
      'background: transparent',
      `color-scheme: ${dark ? 'dark' : 'light'}`,
    ].join(';');

    const close = () => {
      window.removeEventListener('message', onMessage);
      iframe.remove();
      delete global.__bookmarkHelperOverlay;
      previousFocus?.focus?.({ preventScroll: true });
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source === iframe.contentWindow && event.data?.type === CLOSE_MESSAGE) close();
    };

    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', () => iframe.focus(), { once: true });
    global.__bookmarkHelperOverlay = { close };
    document.documentElement.appendChild(iframe);
  },
});
