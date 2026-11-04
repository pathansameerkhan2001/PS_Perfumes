import { useEffect } from 'react';

/**
 * Warns before unsaved admin changes are lost.
 * - Reloading or closing the tab: the browser's own "Leave site?" prompt.
 * - Clicking a link inside the app (sidebar, header): a confirmation first. The app uses
 *   BrowserRouter, which has no navigation blocker, so link clicks are intercepted in the capture
 *   phase, before React Router handles them.
 */
export function useUnsavedChangesGuard(isDirty, message = 'You have unsaved changes. Leave without saving?') {
  useEffect(() => {
    if (!isDirty) return undefined;

    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = ''; // required by some browsers to show the prompt
    };
    const onClickCapture = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest?.('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, [isDirty, message]);
}
