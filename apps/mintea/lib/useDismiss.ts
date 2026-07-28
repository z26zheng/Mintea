import { useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';

/**
 * Closes a modal route safely.
 *
 * `router.back()` throws "The action 'GO_BACK' was not handled by any
 * navigator" when there is no history to pop — which is exactly what happens
 * when a modal is opened directly by URL, or reached by a deep link, or after
 * a full page reload on web. Every modal here is addressable that way, so
 * every dismissal needs a fallback destination rather than a bare `back()`.
 */
export function useDismiss(fallback: Href): () => void {
  const router = useRouter();

  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  }, [router, fallback]);
}
