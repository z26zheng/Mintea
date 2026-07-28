import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { normalizePlaidPhoneNumber } from '@mintea/core';

import { LinkAccountButton } from './PlaidLink';
import { Field } from './ui';

/**
 * New Link sessions normally let Plaid reuse the returning-user profile it
 * recognizes on the device. This gives households an explicit path to verify
 * another Plaid profile and label every account imported from that connection.
 */
export function PlaidConnectOptions({
  primaryLabel = 'Connect an account',
}: {
  primaryLabel?: string;
}) {
  const [showDifferentAccount, setShowDifferentAccount] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');

  const normalizedPhoneNumber = normalizePlaidPhoneNumber(phoneNumber);
  const phoneError =
    phoneNumber.trim() && !normalizedPhoneNumber
      ? 'Enter a valid phone number. Include + and the country code outside the US or Canada.'
      : undefined;

  const closeDifferentAccount = () => {
    setShowDifferentAccount(false);
    setPhoneNumber('');
  };

  return (
    <View className="gap-3">
      <LinkAccountButton label={primaryLabel} />

      {showDifferentAccount ? (
        <View className="rounded-2xl border border-ink-200 dark:border-ink-800 bg-ink-50 dark:bg-ink-950 p-4 gap-3">
          <View>
            <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
              Different Plaid account
            </Text>
            <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1">
              Enter the phone number associated with the other Plaid profile.
              Mintea saves it on this connection so each imported account shows
              which Plaid profile it uses.
            </Text>
          </View>

          <Field
            label="Plaid phone number"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            autoComplete="tel"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            placeholder="(415) 555-0010"
            error={phoneError}
          />

          <LinkAccountButton
            label="Continue with this number"
            phoneNumber={normalizedPhoneNumber ?? undefined}
            disabled={!normalizedPhoneNumber}
            onLinked={closeDifferentAccount}
          />

          <Pressable
            onPress={closeDifferentAccount}
            accessibilityRole="button"
            className="self-center px-3 py-1"
          >
            <Text className="text-sm font-semibold text-ink-500 dark:text-ink-400">
              Cancel
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => setShowDifferentAccount(true)}
          accessibilityRole="button"
          className="self-center px-3 py-1"
        >
          <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400 text-center">
            Connect to a different Plaid account
          </Text>
        </Pressable>
      )}
    </View>
  );
}
