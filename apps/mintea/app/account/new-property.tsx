import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProperty,
  formatMoney,
  isValidIsoDate,
  parseMoney,
  previewPropertyValue,
  profileQuery,
  type AddressMatch,
  type ValuePreview,
} from "@mintea/core";

import { useClient } from "../../lib/auth";
import {
  Badge,
  Card,
  Divider,
  ErrorNotice,
  Field,
  IconBadge,
  ModalHeader,
  Screen,
} from "../../components/ui";
import { RequireAuth } from "../../components/RequireAuth";
import { useBreakpoint } from "../../lib/breakpoints";
import { useDismiss } from "../../lib/useDismiss";
import { useTheme } from "../../lib/theme";
import { AddressSearch } from "../../components/AddressSearch";

/**
 * Add a property by searching for its address.
 *
 * Picking a match immediately fetches a valuation, so the common case is
 * search → tap → save with nothing to type. Everything else — name, purchase
 * history, a manual override — is optional and pre-filled.
 */
function NewProperty() {
  const client = useClient();
  const dismiss = useDismiss("/(tabs)/accounts");
  const queryClient = useQueryClient();
  const { isLarge, isWide } = useBreakpoint();
  const { colors } = useTheme();

  const profile = useQuery(profileQuery(client));

  const [match, setMatch] = useState<AddressMatch | null>(null);
  const [preview, setPreview] = useState<ValuePreview | null>(null);
  const [valueError, setValueError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [overrideValue, setOverrideValue] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
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
        caught instanceof Error
          ? caught.message
          : "Could not value that address",
      );
    },
  });

  const selectAddress = (selected: AddressMatch) => {
    setMatch(selected);
    setPreview(null);
    setValueError(null);
    setError(null);
    // Default the name to the street line; it's what people call the place.
    setName((current) => (current === "" ? selected.line : current));
    valuation.mutate(selected);
  };

  const overrideCents = parseMoney(overrideValue);
  const purchaseCents = parseMoney(purchasePrice);
  const dateValid = purchaseDate === "" || isValidIsoDate(purchaseDate);
  const usingOverride = overrideValue.trim() !== "";

  // What actually gets stored: the override if the user typed one, otherwise
  // the automatic valuation.
  const valueCents = usingOverride
    ? overrideCents
    : (preview?.priceCents ?? null);

  const canSave =
    match !== null &&
    valueCents !== null &&
    valueCents > 0 &&
    name.trim().length > 0 &&
    dateValid &&
    !valuation.isPending;

  const create = useMutation({
    mutationFn: async () => {
      if (!profile.data) throw new Error("Profile not loaded yet");
      if (!match) throw new Error("Pick an address first");
      if (valueCents === null) throw new Error("Enter a value");

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
        valuationSource: automatic ? "rentcast" : "manual",
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
      dismiss();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : "Could not save"),
  });

  return (
    <Screen maxWidth="5xl">
      <ModalHeader
        title="Add property"
        subtitle="Track a home or real-estate asset in net worth"
        onClose={() => dismiss()}
        action={{
          label: create.isPending ? "Saving…" : "Save",
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
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorNotice message={error} /> : null}

        <View className={`gap-4 ${isLarge ? "flex-row items-start" : ""}`}>
          <View className={isLarge ? "w-[360px] shrink-0 gap-4" : "gap-4"}>
            <Card className="overflow-hidden">
              <View className="h-1 bg-mint-500" />
              <View className="p-4">
                <IconBadge name="home-outline" size={44} />
                <Text className="mt-4 text-lg font-semibold text-ink-900 dark:text-ink-50">
                  Add a property to net worth
                </Text>
                <Text className="mt-1 text-sm leading-5 text-ink-500 dark:text-ink-400">
                  Search by address, review the estimated market value, and add
                  purchase history if you want to see long-term growth.
                </Text>
                <View className="mt-4 flex-row flex-wrap gap-2">
                  <Badge label="Address matched" tone="neutral" />
                  <Badge label="Valuation assisted" tone="accent" />
                </View>
              </View>
            </Card>

            <Card className="p-4">
              <View className="mb-4 flex-row items-start gap-3">
                <IconBadge name="search-outline" size={38} tone="neutral" />
                <View className="min-w-0 flex-1">
                  <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                    Find your property
                  </Text>
                  <Text className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
                    Start with a street address.
                  </Text>
                </View>
              </View>
              <AddressSearch onSelect={selectAddress} autoFocus />

              {match ? (
                <View className="mt-4 flex-row items-start gap-3 rounded-xl bg-mint-50 p-3 dark:bg-mint-950/40">
                  <Ionicons name="location" size={20} color={colors.accent} />
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-semibold text-mint-900 dark:text-mint-100">
                      Address selected
                    </Text>
                    <Text className="mt-0.5 text-xs leading-4 text-mint-800 dark:text-mint-200">
                      {match.formatted}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text className="mt-3 text-xs leading-4 text-ink-400 dark:text-ink-500">
                  Pick a result from the list so Mintea can verify the address
                  and look up a value.
                </Text>
              )}
            </Card>
          </View>

          <View className={isLarge ? "min-w-0 flex-1 gap-4" : "gap-4"}>
            {match ? (
              <>
                <Card className="overflow-hidden">
                  <View
                    className={`h-1 ${
                      preview ? "bg-mint-500" : "bg-amber-500"
                    }`}
                  />
                  <View className="p-4">
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="min-w-0 flex-1">
                        <Text className="text-xs font-semibold uppercase tracking-wider text-mint-700 dark:text-mint-300">
                          Market value
                        </Text>
                        {valuation.isPending ? (
                          <View className="mt-3 flex-row items-center gap-3 py-2">
                            <ActivityIndicator size="small" color="#1FA678" />
                            <Text className="text-base text-ink-500 dark:text-ink-400">
                              Getting a valuation…
                            </Text>
                          </View>
                        ) : preview ? (
                          <>
                            <Text className="mt-1 text-4xl font-bold tabular-nums text-ink-900 dark:text-ink-50">
                              {formatMoney(preview.priceCents, {
                                hideCents: true,
                              })}
                            </Text>
                            {preview.lowCents !== null &&
                            preview.highCents !== null ? (
                              <Text className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                                Estimated range{" "}
                                {formatMoney(preview.lowCents, {
                                  hideCents: true,
                                })}{" "}
                                –{" "}
                                {formatMoney(preview.highCents, {
                                  hideCents: true,
                                })}
                              </Text>
                            ) : null}
                            <Text className="mt-2 text-xs text-ink-400 dark:text-ink-500">
                              {preview.formattedAddress ?? match.formatted} ·
                              RentCast
                            </Text>
                          </>
                        ) : (
                          <>
                            <Text className="mt-2 text-base font-semibold text-ink-900 dark:text-ink-50">
                              No automatic valuation
                            </Text>
                            <Text className="mt-1 text-sm leading-5 text-ink-500 dark:text-ink-400">
                              {valueError ??
                                "Enter the value yourself below — you can retry later."}
                            </Text>
                            <Pressable
                              onPress={() => valuation.mutate(match)}
                              accessibilityRole="button"
                              className="mt-3 min-h-11 self-start items-center justify-center rounded-xl px-3 hover:bg-mint-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 dark:hover:bg-mint-950"
                            >
                              <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                                Try valuation again
                              </Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                      <IconBadge
                        name={
                          preview ? "trending-up-outline" : "calculator-outline"
                        }
                        size={42}
                        tone={preview ? "accent" : "warning"}
                      />
                    </View>
                  </View>
                </Card>

                <Card className="overflow-hidden">
                  <View className="p-4">
                    <Text className="text-xs font-semibold uppercase tracking-wider text-mint-700 dark:text-mint-300">
                      Property details
                    </Text>
                    <Text className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">
                      Name and tracked value
                    </Text>

                    <Field
                      label="Name"
                      value={name}
                      onChangeText={setName}
                      placeholder="Home"
                      className="mt-5"
                    />

                    <Field
                      label={preview ? "Override the value" : "Value"}
                      value={overrideValue}
                      onChangeText={setOverrideValue}
                      placeholder={
                        preview
                          ? formatMoney(preview.priceCents, { hideCents: true })
                          : "0.00"
                      }
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      className="mt-5"
                      error={
                        overrideValue.length > 0 && overrideCents === null
                          ? "Enter a number"
                          : undefined
                      }
                    />
                    {preview ? (
                      <Text className="mt-1.5 text-xs leading-4 text-ink-400 dark:text-ink-500">
                        Leave blank to track the automatic valuation. Setting a
                        number here switches this property to a manual value.
                      </Text>
                    ) : null}
                  </View>

                  <Divider />

                  <View className="p-4">
                    <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                      Purchase history · optional
                    </Text>
                    <View className={`mt-4 gap-3 ${isWide ? "flex-row" : ""}`}>
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
                        error={dateValid ? undefined : "Use YYYY-MM-DD"}
                      />
                    </View>
                    <View className="mt-3 flex-row items-start gap-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-800">
                      <Ionicons
                        name="analytics-outline"
                        size={18}
                        color={colors.textMuted}
                      />
                      <Text className="min-w-0 flex-1 text-xs leading-4 text-ink-500 dark:text-ink-400">
                        With both fields, the net-worth chart shows growth from
                        the purchase date instead of adding the property all at
                        once.
                      </Text>
                    </View>
                  </View>
                </Card>
              </>
            ) : (
              <Card className="items-center justify-center px-8 py-16">
                <IconBadge name="location-outline" size={52} tone="neutral" />
                <Text className="mt-4 text-center text-lg font-semibold text-ink-900 dark:text-ink-50">
                  Start with an address
                </Text>
                <Text className="mt-1 max-w-md text-center text-sm leading-5 text-ink-500 dark:text-ink-400">
                  Property value, custom naming, and purchase history will
                  appear here after you choose a verified result.
                </Text>
              </Card>
            )}
          </View>
        </View>
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
