import { useEffect, useRef } from 'react';

/**
 * Calls the callback once when the document becomes visible (tab focus return).
 * Skips the initial mount trigger.
 */
export function useVisibilityRefresh(callback: () => void): void {
  // Keep a fresh ref to callback so the listener never needs to re-subscribe
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') return;
      callbackRef.current();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // empty deps — subscribe once on mount, unsubscribe on unmount
}
