import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProperty,
  isValidIsoDate,
  parseMoney,
  profileQuery,
  refreshPropertyValue,
  PROPERTY_TYPES,
  type PropertyType,
} from '@mintea/core';

import { useClient } from '../../lib/auth';
import {
  ErrorNotice,
  Field,
  ModalHeader,
  Screen,
} from '../../components/ui';

/**
 * Adding a property.
 *
 * The address is what makes automatic valuation possible, and purchase price
 * and date are what let the net worth chart show years of appreciation instead
 * of a flat line that jumps on the day the property was added.
 */
export default function NewProperty() {
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();

  const profile = useQuery(profileQuery(client));

  const [name, setName] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [propertyType, setPropertyType] = useState<PropertyType>('Single Family');
  const [value, setValue] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [squareFootage, setSquareFootage] = useState('');

  const valueCents = parseMoney(value);
  const purchaseCents = parseMoney(purchasePrice);
  const dateValid = purchaseDate === '' || isValidIsoDate(purchaseDate);

  const canSave =
    name.trim().length > 0 &&
    addressLine.trim().length > 0 &&
    valueCents !== null &&
    valueCents > 0 &&
    dateValid;

  const toNumber = (raw: string): number | null => {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!profile.data) throw new Error('Profile not loaded yet');
      if (valueCents === null) throw new Error('Enter an estimated value');

      const { account } = await createProperty(client, {
        householdId: profile.data.household_id,
        name: name.trim(),
        addressLine: addressLine.trim(),
        city: city.trim() || null,
        state: state.trim() || null,
        postalCode: postalCode.trim() || null,
        propertyType,
        bedrooms: toNumber(bedrooms),
        bathrooms: toNumber(bathrooms),
        squareFootage: toNumber(squareFootage),
        estimatedValueCents: valueCents,
        purchasePriceCents: purchaseCents,
        purchaseDate: purchaseDate || null,
      });

      // Try for a real valuation straight away. A missing API key or an
      // unrecognised address is not a failure — the property is already saved
      // with the user's own estimate, and they can refresh later.
      try {
        await refreshPropertyValue(client, account.id);
      } catch {
        // Deliberately swallowed; the detail screen surfaces the reason.
      }

      return account;
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

        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Home on Elm Street"
          autoFocus
          className="mb-5"
        />

        <Field
          label="Street address"
          value={addressLine}
          onChangeText={setAddressLine}
          placeholder="123 Elm St"
          autoCapitalize="words"
          className="mb-4"
        />

        <View className="flex-row gap-3 mb-4">
          <Field
            label="City"
            value={city}
            onChangeText={setCity}
            placeholder="Austin"
            autoCapitalize="words"
            className="flex-1"
          />
          <Field
            label="State"
            value={state}
            onChangeText={setState}
            placeholder="TX"
            autoCapitalize="characters"
            maxLength={2}
            className="w-20"
          />
        </View>

        <Field
          label="ZIP code"
          value={postalCode}
          onChangeText={setPostalCode}
          placeholder="78701"
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={10}
          className="mb-5"
        />

        <Text className="text-sm font-medium text-ink-600 dark:text-ink-300 mb-1.5">
          Property type
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-5">
          {PROPERTY_TYPES.map((option) => {
            const active = option === propertyType;

            return (
              <Pressable
                key={option}
                onPress={() => setPropertyType(option)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={`px-3 py-2 rounded-xl border ${
                  active
                    ? 'bg-mint-600 border-mint-600'
                    : 'bg-white dark:bg-ink-900 border-ink-300 dark:border-ink-700'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    active ? 'text-white' : 'text-ink-600 dark:text-ink-300'
                  }`}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Field
          label="Estimated value today"
          value={value}
          onChangeText={setValue}
          placeholder="0.00"
          keyboardType="decimal-pad"
          inputMode="decimal"
          className="mb-2"
          error={
            value.length > 0 && valueCents === null
              ? 'Enter a number, like 615000'
              : undefined
          }
        />
        <Text className="text-xs text-ink-400 dark:text-ink-500 mb-6 leading-5">
          Your best guess is fine — it's replaced by an automatic valuation as
          soon as one is available.
        </Text>

        <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-2">
          Purchase
        </Text>

        <View className="flex-row gap-3 mb-2">
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
        <Text className="text-xs text-ink-400 dark:text-ink-500 mb-6 leading-5">
          Optional, but with both the net worth chart can show the property
          growing from the day you bought it instead of appearing all at once.
        </Text>

        <Pressable
          onPress={() => setShowDetails((shown) => !shown)}
          accessibilityRole="button"
          className="py-2"
        >
          <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
            {showDetails ? '− Hide' : '+ Add'} beds, baths and size
          </Text>
        </Pressable>

        {showDetails ? (
          <>
            <View className="flex-row gap-3 mt-3">
              <Field
                label="Beds"
                value={bedrooms}
                onChangeText={setBedrooms}
                placeholder="3"
                keyboardType="decimal-pad"
                inputMode="decimal"
                className="flex-1"
              />
              <Field
                label="Baths"
                value={bathrooms}
                onChangeText={setBathrooms}
                placeholder="2"
                keyboardType="decimal-pad"
                inputMode="decimal"
                className="flex-1"
              />
              <Field
                label="Sq ft"
                value={squareFootage}
                onChangeText={setSquareFootage}
                placeholder="1800"
                keyboardType="number-pad"
                inputMode="numeric"
                className="flex-1"
              />
            </View>
            <Text className="text-xs text-ink-400 dark:text-ink-500 mt-2 leading-5">
              Sharpens the estimate. Left blank, these are looked up from public
              records.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
