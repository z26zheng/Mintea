import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { usePlaidLink } from 'react-plaid-link';

import { usePlaidConnect } from '../lib/usePlaidConnect';
import { Button } from './ui';

/**
 * Web implementation. Metro picks this over `PlaidLink.tsx` for the web
 * bundle, which keeps `react-native-plaid-link-sdk` (native-only) out of it.
 */
export function LinkAccountButton({
  label = 'Connect an account',
  itemId,
  phoneNumber,
  variant = 'primary',
  disabled = false,
  onLinked,
}: {
  label?: string;
  /** Provide to re-authenticate an existing connection (Plaid update mode). */
  itemId?: string;
  /** Provide to verify a different Plaid returning-user profile. */
  phoneNumber?: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  onLinked?: () => void;
}) {
  const { linkToken, error, isBusy, begin, complete, reset } = usePlaidConnect();

  const { open, ready } = usePlaidLink({
    // `usePlaidLink` accepts a null token and simply stays un-ready until one
    // arrives, which is exactly the two-step flow we want.
    token: linkToken,
    onSuccess: async (publicToken) => {
      // Typed as nullable by react-plaid-link, but always present on success.
      if (!publicToken) return;
      const result = await complete(publicToken, phoneNumber);
      if (result) onLinked?.();
    },
    onExit: () => reset(),
  });

  // Link is opened as soon as the token lands, so the user sees one click.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  return (
    <View>
      <Button
        label={label}
        variant={variant}
        loading={isBusy}
        disabled={disabled}
        onPress={() => begin({ itemId, phoneNumber })}
      />
      {error ? (
        <Text className="text-sm text-negative mt-2 text-center">{error}</Text>
      ) : null}
    </View>
  );
}
