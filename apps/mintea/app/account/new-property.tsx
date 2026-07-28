import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProperty,
  formatMoney,
  isValidIsoDate,
  parseMoney,
  previewPropertyValue,
  profileQuery,
  type AddressMatch,
  type ValuePreview,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import {
  Card,
  ErrorNotice,
  Field,
  ModalHeader,
  Screen,
} from '../../components/ui';
import { RequireAuth } from '../../components/RequireAuth';
import { AddressSearch } from '../../components/AddressSearch';

/**
 * Add a property by searching for its address.
 *
 * Picking a match immediately fetches a valuation, so the common case is
 * search → tap → save with nothing to type. Everything else — name, purchase
 * history, a manual override — is optional and pre-filled.
 */
function NewProperty() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  const profile = useQuery(profileQuery(client));

  const [match, setMatch] = useState<AddressMatch | null>(null);
  const [preview, setPreview] = useState<ValuePreview | null>(null);
  const [valueError, setValueError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [overrideValue, setOverrideValue] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const valuation = useMutation({
    mutationFn: (selected: AddressMatch) =>
      previewPropertyValue(client, { address: selected.formatted }),
    onSuccess: (result) => {
      setPreview(result);
      setValueError(null);
    },
    onError: (caught) => {
      setPreview(null);
      // Not fatal: the address is still valid, the user just supplies the
      // value themselves.
      setValueError(
        caught instanceof Error ? caught.message : 'Could not value that address',
      );
    },
  });

  const selectAddress = (selected: AddressMatch) => {
    setMatch(selected);
    setPreview(null);
    setValueError(null);
    setError(null);
    // Default the name to the street line; it's what people call the place.
    setName((current) => (current === '' ? selected.line : current));
    valuation.mutate(selected);
  };

  const overrideCents = parseMoney(overrideValue);
  const purchaseCents = parseMoney(purchasePrice);
  const dateValid = purchaseDate === '' || isValidIsoDate(purchaseDate);
  const usingOverride = overrideValue.trim() !== '';

  // What actually gets stored: the override if the user typed one, otherwise
  // the automatic valuation.
  const valueCents = usingOverride ? overrideCents : (preview?.priceCents ?? null);

  const canSave =
    match !== null &&
    valueCents !== null &&
    valueCents > 0 &&
    name.trim().length > 0 &&
    dateValid &&
    !valuation.isPending;

  const create = useMutation({
    mutationFn: async () => {
      if (!profile.data) throw new Error('Profile not loaded yet');
      if (!match) throw new Error('Pick an address first');
      if (valueCents === null) throw new Error('Enter a value');

      const automatic = preview !== null && !usingOverride;

      return createProperty(client, {
        householdId: profile.data.household_id,
        name: name.trim(),
        addressLine: match.line,
        city: match.city,
        state: match.state,
        postalCode: match.postalCode,
        estimatedValueCents: valueCents,
        purchasePriceCents: purchaseCents,
        purchaseDate: purchaseDate || null,
        latitude: match.latitude,
        longitude: match.longitude,
        // Only claim it's an automatic valuation when it actually is —
        // otherwise the monthly sweep would overwrite a number the user chose.
        valuationSource: automatic ? 'rentcast' : 'manual',
        ...(automatic
          ? {
              valuationLowCents: preview.lowCents,
              valuationHighCents: preview.highCents,
              formattedAddress: preview.formattedAddress,
            }
          : {}),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      router.back();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not save'),
  });

  return (
    <Screen>
      <ModalHeader
        title="Add property"
        onClose={() => router.back()}
        action={{
          label: create.isPending ? 'Saving…' : 'Save',
          onPress: () => {
            setError(null);
            create.mutate();
          },
          disabled: !canSave || create.isPending,
        }}
      />

      <ScrollView
        contentContainerClassName="p-4 pb-16"
        keyboardShouldPersistTaps="handled"
      >
        {error ? <ErrorNotice message={error} /> : null}

        <Text className="text-sm font-medium text-ink-600 dark:text-ink-300 mb-1.5">
          Find your property
        </Text>
        <AddressSearch onSelect={selectAddress} autoFocus />

        {match ? (
          <>
            <Card className="p-4 mt-5">
              {valuation.isPending ? (
                <View className="flex-row items-center gap-3 py-2">
                  <ActivityIndicator size="small" color="#1FA678" />
                  <Text className="text-base text-ink-500 dark:text-ink-400">
                    Getting a valuation…
                  </Text>
                </View>
              ) : preview ? (
                <>
                  <Text className="text-sm text-ink-500 dark:text-ink-400">
                    Estimated value
                  </Text>
                  <Text className="text-3xl font-bold tabular-nums text-ink-900 dark:text-ink-50 mt-1">
                    {formatMoney(preview.priceCents, { hideCents: true })}
                  </Text>
                  {preview.lowCents !== null && preview.highCents !== null ? (
                    <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1">
                      Range {formatMoney(preview.lowCents, { hideCents: true })} –{' '}
                      {formatMoney(preview.highCents, { hideCents: true })}
                    </Text>
                  ) : null}
                  <Text className="text-xs text-ink-400 dark:text-ink-500 mt-2">
                    {preview.formattedAddress ?? match.formatted} · RentCast
                  </Text>
                </>
              ) : (
                <>
                  <Text className="text-base font-medium text-ink-900 dark:text-ink-50">
                    No automatic valuation
                  </Text>
                  <Text className="text-sm text-ink-500 dark:text-ink-400 mt-1">
                    {valueError ??
                      'Enter the value yourself below — you can retry later.'}
                  </Text>
                  <Pressable
                    onPress={() => valuation.mutate(match)}
                    accessibilityRole="button"
                    className="mt-3 self-start py-1"
                  >
                    <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                      Try again
                    </Text>
                  </Pressable>
                </>
              )}
            </Card>

            <Field
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Home"
              className="mt-5"
            />

            <Field
              label={preview ? 'Override the value' : 'Value'}
              value={overrideValue}
              onChangeText={setOverrideValue}
              placeholder={
                preview
                  ? formatMoney(preview.priceCents, { hideCents: true })
                  : '0.00'
              }
              keyboardType="decimal-pad"
              inputMode="decimal"
              className="mt-5"
              error={
                overrideValue.length > 0 && overrideCents === null
                  ? 'Enter a number'
                  : undefined
              }
            />
            {preview ? (
              <Text className="text-xs text-ink-400 dark:text-ink-500 mt-1.5">
                Leave blank to track the automatic valuation. Setting a number
                here stops it updating on its own.
              </Text>
            ) : null}

            <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 mt-8 mb-2">
              Purchase (optional)
            </Text>

            <View className="flex-row gap-3">
              <Field
                label="Price paid"
                value={purchasePrice}
                onChangeText={setPurchasePrice}
                placeholder="0.00"
                keyboardType="decimal-pad"
                inputMode="decimal"
                className="flex-1"
              />
              <Field
                label="Date"
                value={purchaseDate}
                onChangeText={setPurchaseDate}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                className="flex-1"
                error={dateValid ? undefined : 'Use YYYY-MM-DD'}
              />
            </View>
            <Text className="text-xs text-ink-400 dark:text-ink-500 mt-2 leading-5">
              With both, the net worth chart shows the property growing from the
              day you bought it instead of appearing all at once.
            </Text>
          </>
        ) : (
          <Text className="text-sm text-ink-500 dark:text-ink-400 mt-4 leading-5">
            Search for the address and pick it from the list. We'll look up what
            it's worth automatically.
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

export default function NewPropertyRoute() {
  return (
    <RequireAuth>
      <NewProperty />
    </RequireAuth>
  );
}
