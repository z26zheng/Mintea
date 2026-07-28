import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  createLinkToken,
  exchangePublicToken,
  type LinkTokenOptions,
  syncPlaidItem,
} from '@mintea/core';

import { useClient } from './auth';

export type ConnectStatus =
  | 'idle'
  | 'creating-token'
  | 'awaiting-user'
  | 'exchanging'
  | 'syncing'
  | 'done'
  | 'error';

/**
 * The platform-independent half of linking a bank: fetch a Link token, then
 * exchange whatever Plaid Link hands back and pull the first batch of data.
 *
 * Opening Link itself differs per platform (a modal iframe on web, a native
 * SDK on device), so that part lives in PlaidLink.tsx / PlaidLink.web.tsx.
 */
export function usePlaidConnect() {
  const client = useClient();
  const queryClient = useQueryClient();

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setLinkToken(null);
    setStatus('idle');
    setError(null);
  }, []);

  /**
   * Fetches a Link token. `itemId` re-authenticates a broken connection;
   * `phoneNumber` explicitly selects another Plaid returning-user profile.
   */
  const begin = useCallback(
    async (options: LinkTokenOptions = {}) => {
      setError(null);
      setStatus('creating-token');

      try {
        const { linkToken: token } = await createLinkToken(client, options);
        setLinkToken(token);
        setStatus('awaiting-user');
      } catch (caught) {
        setStatus('error');
        setError(
          caught instanceof Error ? caught.message : 'Could not start Plaid Link',
        );
      }
    },
    [client],
  );

  /** Called with the public token once the user finishes in Link. */
  const complete = useCallback(
    async (publicToken: string, phoneNumber?: string) => {
      setStatus('exchanging');

      try {
        const result = await exchangePublicToken(client, {
          publicToken,
          ...(phoneNumber ? { phoneNumber } : {}),
        });

        setStatus('syncing');

        // The first sync can take a few seconds; a failure here isn't fatal
        // since the webhook will deliver the data shortly anyway.
        try {
          await syncPlaidItem(client, result.itemId);
        } catch (syncError) {
          console.warn('Initial sync failed; webhook will retry', syncError);
        }

        await queryClient.invalidateQueries();

        setStatus('done');
        setLinkToken(null);

        return result;
      } catch (caught) {
        setStatus('error');
        setError(
          caught instanceof Error
            ? caught.message
            : 'Could not finish connecting that institution',
        );
        setLinkToken(null);
        return null;
      }
    },
    [client, queryClient],
  );

  const isBusy =
    status === 'creating-token' ||
    status === 'exchanging' ||
    status === 'syncing';

  return { linkToken, status, error, isBusy, begin, complete, reset };
}
