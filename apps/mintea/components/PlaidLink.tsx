import { useEffect } from 'react';
import { Text, View } from 'react-native';
import {
  createPlaidLinkSession,
  type LinkExit,
  type LinkSuccess,
} from 'react-native-plaid-link-sdk';

import { usePlaidConnect } from '../lib/usePlaidConnect';
import { Button } from './ui';

/**
 * Native implementation — iOS and Android. Metro loads `PlaidLink.web.tsx`
 * instead when bundling for web, so the native SDK never reaches that bundle.
 *
 * Note: the Plaid SDK ships native code, so this needs a development build
 * (`npx expo run:ios`). It won't work in Expo Go.
 */
export function LinkAccountButton({
  label = 'Connect an account',
  itemId,
  variant = 'primary',
  onLinked,
}: {
  label?: string;
  /** Provide to re-authenticate an existing connection (Plaid update mode). */
  itemId?: string;
  variant?: 'primary' | 'secondary';
  onLinked?: () => void;
}) {
  const { linkToken, error, isBusy, begin, complete, reset } = usePlaidConnect();

  useEffect(() => {
    if (!linkToken) return;

    // Guards against opening Link twice if the effect re-runs after the token
    // arrives but before the session finishes presenting.
    let cancelled = false;

    createPlaidLinkSession({
      token: linkToken,
      onSuccess: async (success: LinkSuccess) => {
        const result = await complete(success.publicToken);
        if (result) onLinked?.();
      },
      onExit: (exit: LinkExit) => {
        if (exit.error) {
          console.warn('Plaid Link exited with an error', exit.error);
        }
        reset();
      },
      onEvent: () => {},
    })
      .then((session) => {
        if (!cancelled) return session.open();
      })
      .catch((caught) => {
        console.warn('Could not open Plaid Link', caught);
        reset();
      });

    return () => {
      cancelled = true;
    };
  }, [linkToken, complete, reset, onLinked]);

  return (
    <View>
      <Button
        label={label}
        variant={variant}
        loading={isBusy}
        onPress={() => begin(itemId)}
      />
      {error ? (
        <Text className="text-sm text-negative mt-2 text-center">{error}</Text>
      ) : null}
    </View>
  );
}
