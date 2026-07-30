import { useState } from "react";
import { Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  equityGain,
  formatFullDate,
  formatMoney,
  propertyAddress,
  propertyQuery,
  refreshPropertyValue,
  valuationRange,
  type AccountRow,
} from "@mintea/core";

import { useClient } from "../lib/auth";
import { Badge, Button, Card, Divider, IconBadge, Money } from "./ui";

/**
 * Valuation panel on a property's detail screen.
 *
 * Shows where the number came from and when, because an automatic estimate
 * that silently goes stale is worse than no estimate at all.
 */
export function PropertyCard({ account }: { account: AccountRow }) {
  const client = useClient();
  const queryClient = useQueryClient();

  const property = useQuery(propertyQuery(client, account.id));
  const [error, setError] = useState<string | null>(null);

  const refresh = useMutation({
    mutationFn: () => refreshPropertyValue(client, account.id),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries();
    },
    onError: (caught) =>
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not refresh the value",
      ),
  });

  const details = property.data;
  if (!details) return null;

  const range = valuationRange(details);
  const gain = equityGain(details, account.current_balance_cents);
  const isAutomatic = details.valuation_source === "rentcast";

  return (
    <Card className="mb-5 overflow-hidden">
      <View className="h-1 bg-mint-500" />
      <View className="p-4">
        <View className="flex-row items-start gap-3">
          <IconBadge name="home-outline" size={42} />
          <View className="min-w-0 flex-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-xs font-semibold uppercase tracking-wider text-mint-700 dark:text-mint-300">
                Property
              </Text>
              <Badge
                label={isAutomatic ? "Automatic value" : "Manual value"}
                tone={isAutomatic ? "accent" : "neutral"}
              />
            </View>
            <Text className="mt-1 text-base font-semibold text-ink-900 dark:text-ink-50">
              {propertyAddress(details)}
            </Text>

            {details.property_type ? (
              <Text className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
                {[
                  details.property_type,
                  details.bedrooms ? `${details.bedrooms} bd` : null,
                  details.bathrooms ? `${details.bathrooms} ba` : null,
                  details.square_footage
                    ? `${details.square_footage.toLocaleString()} sq ft`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <Divider />

      <View className="p-4">
        <View className="flex-row flex-wrap items-end justify-between gap-2">
          <Text className="text-sm text-ink-500 dark:text-ink-400">
            {isAutomatic ? "Estimated value" : "Value you set"}
          </Text>
          {range ? (
            <Text className="text-xs text-ink-400 dark:text-ink-500 tabular-nums">
              {formatMoney(range.lowCents, { hideCents: true })} –{" "}
              {formatMoney(range.highCents, { hideCents: true })}
            </Text>
          ) : null}
        </View>

        <Money
          cents={account.current_balance_cents}
          currency={account.currency}
          size="lg"
          className="mt-1"
        />

        {gain ? (
          <Text className="mt-1 text-sm">
            <Text
              className={
                gain.changeCents >= 0
                  ? "text-positive dark:text-emerald-400 font-semibold"
                  : "text-negative dark:text-red-400 font-semibold"
              }
            >
              {gain.changeCents >= 0 ? "↑" : "↓"}{" "}
              {formatMoney(Math.abs(gain.changeCents))} (
              {(Math.abs(gain.changeRatio) * 100).toFixed(1)}%)
            </Text>
            <Text className="text-ink-500 dark:text-ink-400">
              {" "}
              since purchase
              {details.purchase_date
                ? ` in ${formatFullDate(details.purchase_date)}`
                : ""}
            </Text>
          </Text>
        ) : null}

        <Text className="mt-2 text-xs text-ink-400 dark:text-ink-500">
          {details.last_valued_at
            ? `${isAutomatic ? "Valued by RentCast" : "Set"} ${formatFullDate(
                details.last_valued_at.slice(0, 10),
              )}`
            : "Not valued yet"}
        </Text>

        {details.valuation_error ? (
          <View className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
            <Text className="text-sm text-amber-800 dark:text-amber-200">
              {details.valuation_error}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
            <Text className="text-sm text-red-700 dark:text-red-300">
              {error}
            </Text>
          </View>
        ) : null}

        <Button
          label={
            isAutomatic ? "Refresh valuation" : "Get an automatic valuation"
          }
          variant="secondary"
          onPress={() => {
            setError(null);
            refresh.mutate();
          }}
          loading={refresh.isPending}
          className="mt-4"
        />
      </View>
    </Card>
  );
}
