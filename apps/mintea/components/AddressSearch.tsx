import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { searchAddresses, type AddressMatch } from '@mintea/core';

import { useClient } from '../lib/auth';
import { useTheme } from '../lib/theme';

/**
 * Address search box with a results list.
 *
 * Matching runs against the free Census geocoder rather than the valuation
 * provider, so typing costs nothing — a RentCast call happens only once the
 * user picks a result.
 */
export function AddressSearch({
  onSelect,
  autoFocus = false,
}: {
  onSelect: (match: AddressMatch) => void;
  autoFocus?: boolean;
}) {
  const client = useClient();
  const { colors } = useTheme();

  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [dismissed, setDismissed] = useState(false);

  // Debounced so a search doesn't fire on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 350);
    return () => clearTimeout(timer);
  }, [input]);

  const results = useQuery({
    queryKey: ['address-search', query],
    queryFn: () => searchAddresses(client, query),
    // The geocoder wants something close to a whole address; below this it
    // only returns noise.
    enabled: query.length >= 6,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const matches = results.data ?? [];
  const showResults = !dismissed && query.length >= 6;

  return (
    <View>
      <View className="flex-row items-center bg-white dark:bg-ink-900 border border-ink-300 dark:border-ink-700 rounded-xl h-12 px-3 gap-2">
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={input}
          onChangeText={(value) => {
            setInput(value);
            setDismissed(false);
          }}
          placeholder="123 Main St, Austin, TX"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus={autoFocus}
          accessibilityLabel="Search for a property address"
          className="flex-1 text-base text-ink-900 dark:text-ink-50"
        />
        {results.isFetching ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : input.length > 0 ? (
          <Pressable
            onPress={() => {
              setInput('');
              setQuery('');
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear address"
          >
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {showResults ? (
        <View className="mt-2 rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 overflow-hidden">
          {results.isError ? (
            <Text className="text-sm text-negative p-3">
              {results.error instanceof Error
                ? results.error.message
                : 'Address lookup failed'}
            </Text>
          ) : results.isFetching && matches.length === 0 ? (
            <Text className="text-sm text-ink-500 dark:text-ink-400 p-3">
              Searching…
            </Text>
          ) : matches.length === 0 ? (
            <Text className="text-sm text-ink-500 dark:text-ink-400 p-3">
              No match. Include the street number, city and state — the lookup
              needs a full address, not a fragment.
            </Text>
          ) : (
            matches.map((match, index) => (
              <Pressable
                key={`${match.formatted}-${index}`}
                onPress={() => {
                  setInput(match.formatted);
                  setDismissed(true);
                  onSelect(match);
                }}
                accessibilityRole="button"
                className="flex-row items-center gap-3 px-3 py-3 active:bg-ink-100 dark:active:bg-ink-800"
              >
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={colors.textMuted}
                />
                <Text className="flex-1 text-base text-ink-900 dark:text-ink-50">
                  {match.formatted}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
