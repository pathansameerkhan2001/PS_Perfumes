/**
 * Runs a background task (e.g. fetching the code of other pages) once the current page has
 * finished loading and the browser is idle, so it never competes with what the visitor is
 * looking at. Skipped on Data Saver and 2G-class connections: those visitors download each part
 * only when they open it.
 * @param {() => void} task
 */
export function whenIdleAfterLoad(task) {
  if (typeof window === 'undefined') return;
  const connection = navigator.connection;
  if (connection?.saveData || /2g/.test(connection?.effectiveType || '')) return;

  const run = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(task, { timeout: 5000 });
    } else {
      window.setTimeout(task, 2000);
    }
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}
