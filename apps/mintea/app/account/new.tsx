import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createManualAccount,
  isAssetType,
  parseMoney,
  profileQuery,
  type AccountType,
} from "@mintea/core";

import { useClient } from "../../lib/auth";
import {
  Badge,
  Card,
  ErrorNotice,
  Field,
  IconBadge,
  Money,
  ModalHeader,
  Screen,
} from "../../components/ui";
import { RequireAuth } from "../../components/RequireAuth";
import { useBreakpoint } from "../../lib/breakpoints";
import { useDismiss } from "../../lib/useDismiss";
import { useTheme } from "../../lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TYPES: Array<{
  value: AccountType;
  label: string;
  hint: string;
  icon: IconName;
}> = [
  {
    value: "depository",
    label: "Cash",
    hint: "Checking, savings, or cash on hand",
    icon: "wallet-outline",
  },
  {
    value: "investment",
    label: "Investment",
    hint: "Brokerage, retirement, or crypto",
    icon: "trending-up-outline",
  },
  {
    value: "other",
    label: "Other asset",
    hint: "Vehicle, valuables, or private holdings",
    icon: "diamond-outline",
  },
  {
    value: "credit",
    label: "Credit",
    hint: "A credit-card balance you owe",
    icon: "card-outline",
  },
  {
    value: "loan",
    label: "Loan",
    hint: "Mortgage, student, or vehicle loan",
    icon: "document-text-outline",
  },
];

/**
 * Manual accounts cover everything Plaid can't see — a house, a car, a private
 * investment. They still contribute to net worth and get balance snapshots, so
 * the chart treats them exactly like linked accounts.
 */
function NewAccount() {
  const client = useClient();
  const router = useRouter();
  const dismiss = useDismiss("/(tabs)/accounts");
  const queryClient = useQueryClient();
  const { isLarge } = useBreakpoint();
  const { colors } = useTheme();

  const profile = useQuery(profileQuery(client));

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("depository");
  const [balance, setBalance] = useState("");
  const [error, setError] = useState<string | null>(null);

  const balanceCents = parseMoney(balance);
  const isAsset = isAssetType(type);
  const canSave = name.trim().length > 0 && balanceCents !== null;

  const create = useMutation({
    mutationFn: async () => {
      if (!profile.data) throw new Error("Profile not loaded yet");
      if (balanceCents === null) throw new Error("Enter a valid balance");

      return createManualAccount(client, {
        householdId: profile.data.household_id,
        name: name.trim(),
        type,
        balanceCents,
        isAsset,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      dismiss();
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : "Could not save"),
  });

  const selected = TYPES.find((option) => option.value === type);

  return (
    <Screen maxWidth="5xl">
      <ModalHeader
        title="Add account"
        subtitle="Track something that is not connected through Plaid"
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
          <View className={isLarge ? "w-[330px] shrink-0 gap-4" : "gap-4"}>
            <Card className="overflow-hidden">
              <View
                className={`h-1 ${isAsset ? "bg-mint-500" : "bg-amber-500"}`}
              />
              <View className="p-4">
                <View className="flex-row items-start justify-between gap-3">
                  <IconBadge
                    name={selected?.icon ?? "wallet-outline"}
                    size={44}
                    tone={isAsset ? "accent" : "warning"}
                  />
                  <Badge
                    label={isAsset ? "Asset" : "Liability"}
                    tone={isAsset ? "accent" : "warning"}
                  />
                </View>
                <Text className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  {isAsset ? "Current value" : "Amount owed"}
                </Text>
                <Money
                  cents={Math.abs(balanceCents ?? 0)}
                  currency={profile.data?.currency ?? "USD"}
                  size="xl"
                  className="mt-1"
                />
                <Text className="mt-2 text-sm leading-5 text-ink-500 dark:text-ink-400">
                  {isAsset
                    ? "This balance increases household net worth."
                    : "This balance is shown as money owed and reduces household net worth."}
                </Text>
              </View>
            </Card>

            {/* Real estate has its own flow because the address drives an
                automatic valuation instead of a one-time balance. */}
            <Pressable
              onPress={() => router.replace("/account/new-property")}
              accessibilityRole="button"
              className="min-h-20 flex-row items-center gap-3 rounded-2xl border border-mint-200 bg-mint-50 p-4 shadow-sm hover:bg-mint-100 active:bg-mint-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 dark:border-mint-900 dark:bg-mint-950/50 dark:hover:bg-mint-950"
            >
              <IconBadge name="home-outline" size={42} />
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold text-mint-900 dark:text-mint-100">
                  Adding real estate?
                </Text>
                <Text className="mt-0.5 text-xs leading-4 text-mint-800 dark:text-mint-200">
                  Search by address and keep its estimated value up to date.
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.accent}
              />
            </Pressable>
          </View>

          <Card className={isLarge ? "min-w-0 flex-1 p-4" : "p-4"}>
            <View className="flex-row items-start gap-3">
              <IconBadge name="create-outline" size={40} />
              <View className="min-w-0 flex-1">
                <Text className="text-lg font-semibold text-ink-900 dark:text-ink-50">
                  Manual account details
                </Text>
                <Text className="mt-0.5 text-sm leading-5 text-ink-500 dark:text-ink-400">
                  You can edit the name and value whenever they change.
                </Text>
              </View>
            </View>

            <Field
              label="Account name"
              value={name}
              onChangeText={setName}
              placeholder="Emergency fund"
              autoFocus
              className="mt-6"
            />

            <Text className="mb-2 mt-6 text-sm font-medium text-ink-600 dark:text-ink-300">
              Account type
            </Text>
            <View
              accessibilityRole="radiogroup"
              className="flex-row flex-wrap gap-2"
            >
              {TYPES.map((option) => {
                const active = type === option.value;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setType(option.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    aria-checked={active}
                    className={`min-h-20 min-w-28 flex-1 rounded-xl border p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 ${
                      active
                        ? "border-mint-500 bg-mint-50 shadow-sm dark:bg-mint-950/50"
                        : "border-ink-200 bg-ink-50 hover:bg-ink-100 active:bg-ink-200 dark:border-ink-700 dark:bg-ink-800 dark:hover:bg-ink-700"
                    }`}
                  >
                    <Ionicons
                      name={option.icon}
                      size={19}
                      color={active ? colors.accent : colors.textMuted}
                    />
                    <Text
                      className={`mt-2 text-sm font-semibold ${
                        active
                          ? "text-mint-700 dark:text-mint-300"
                          : "text-ink-800 dark:text-ink-100"
                      }`}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {selected ? (
              <Text className="mt-2 text-xs text-ink-500 dark:text-ink-400">
                {selected.hint}
              </Text>
            ) : null}

            <Field
              label={isAsset ? "Current balance" : "Amount owed"}
              value={balance}
              onChangeText={setBalance}
              placeholder="0.00"
              keyboardType="decimal-pad"
              inputMode="decimal"
              className="mt-6"
              error={
                balance.length > 0 && balanceCents === null
                  ? "Enter a number, like 1250.00"
                  : undefined
              }
            />

            <View className="mt-3 flex-row items-start gap-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-800">
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={colors.textMuted}
              />
              <Text className="min-w-0 flex-1 text-xs leading-4 text-ink-500 dark:text-ink-400">
                {isAsset
                  ? "Enter what this account is worth today. Mintea creates the first balance-history point when you save."
                  : "Enter a positive number. Mintea displays it as money owed and subtracts it from net worth."}
              </Text>
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

export default function NewAccountRoute() {
  return (
    <RequireAuth>
      <NewAccount />
    </RequireAuth>
  );
}
