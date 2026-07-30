import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  accountsQuery,
  createManualTransaction,
  isValidIsoDate,
  parseMoney,
  profileQuery,
  todayIso,
  type CategoryRow,
} from "@mintea/core";

import { useClient } from "../../lib/auth";
import {
  Card,
  ErrorNotice,
  Field,
  IconBadge,
  Money,
  ModalHeader,
  Screen,
  SegmentedControl,
} from "../../components/ui";
import { RequireAuth } from "../../components/RequireAuth";
import { useBreakpoint } from "../../lib/breakpoints";
import { useDismiss } from "../../lib/useDismiss";
import { useTheme } from "../../lib/theme";
import { AccountPicker } from "../../components/AccountPicker";
import { CategoryPicker } from "../../components/CategoryPicker";

function NewTransaction() {
  const client = useClient();
  const dismiss = useDismiss("/(tabs)/transactions");
  const queryClient = useQueryClient();
  const { isLarge } = useBreakpoint();
  const { colors } = useTheme();

  const profile = useQuery(profileQuery(client));
  const accounts = useQuery(accountsQuery(client));

  const [accountId, setAccountId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayIso());
  const [category, setCategory] = useState<CategoryRow | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickingAccount, setPickingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const categoryTriggerRef = useRef<View>(null);
  const accountTriggerRef = useRef<View>(null);

  const availableAccounts = (accounts.data ?? []).filter(
    (account) => !account.is_hidden,
  );
  const selectedAccountId =
    accountId ??
    accounts.data?.find((account) => !account.is_hidden)?.id ??
    null;
  const selectedAccount =
    availableAccounts.find((account) => account.id === selectedAccountId) ??
    null;

  const magnitude = parseMoney(amount);
  const signedAmount =
    magnitude === null
      ? 0
      : direction === "expense"
        ? -Math.abs(magnitude)
        : Math.abs(magnitude);
  const canSave =
    magnitude !== null &&
    magnitude !== 0 &&
    description.trim().length > 0 &&
    selectedAccountId !== null &&
    isValidIsoDate(date);

  const create = useMutation({
    mutationFn: async () => {
      if (!profile.data) throw new Error("Profile not loaded yet");
      if (magnitude === null) throw new Error("Enter a valid amount");
      if (!selectedAccountId) throw new Error("Pick an account");

      // Sign is set by the direction toggle, so the user never types a minus.
      const signed =
        direction === "expense" ? -Math.abs(magnitude) : Math.abs(magnitude);

      return createManualTransaction(client, {
        householdId: profile.data.household_id,
        accountId: selectedAccountId,
        date,
        amountCents: signed,
        description: description.trim(),
        categoryId: category?.id ?? null,
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
        title="New transaction"
        subtitle="Add activity that was not imported from a bank"
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
                className={`h-1 ${
                  direction === "income" ? "bg-mint-500" : "bg-ink-400"
                }`}
              />
              <View className="items-center p-5">
                <IconBadge
                  name={
                    direction === "income"
                      ? "arrow-down-outline"
                      : "arrow-up-outline"
                  }
                  size={44}
                  tone={direction === "income" ? "accent" : "neutral"}
                />
                <Text className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  {direction === "income" ? "Money in" : "Money out"}
                </Text>
                <Money
                  cents={signedAmount}
                  currency={profile.data?.currency ?? "USD"}
                  size="xl"
                  colorize="income-only"
                  className="mt-1"
                />
                <SegmentedControl
                  options={[
                    { value: "expense", label: "Expense" },
                    { value: "income", label: "Income" },
                  ]}
                  value={direction}
                  onChange={setDirection}
                  className="mt-5 w-full"
                />
              </View>
            </Card>

            <Card className="p-4">
              <View className="flex-row items-start gap-3">
                <IconBadge name="create-outline" size={38} tone="neutral" />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    Manual entry
                  </Text>
                  <Text className="mt-1 text-xs leading-4 text-ink-500 dark:text-ink-400">
                    This changes transaction history and reports, but never the
                    balance reported by a connected bank.
                  </Text>
                </View>
              </View>
            </Card>
          </View>

          <Card className={isLarge ? "min-w-0 flex-1 p-4" : "p-4"}>
            <View className="flex-row items-start gap-3">
              <IconBadge name="receipt-outline" size={40} />
              <View className="min-w-0 flex-1">
                <Text className="text-lg font-semibold text-ink-900 dark:text-ink-50">
                  Transaction details
                </Text>
                <Text className="mt-0.5 text-sm leading-5 text-ink-500 dark:text-ink-400">
                  Add enough context to make reports useful later.
                </Text>
              </View>
            </View>

            <Field
              label="Amount"
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              inputMode="decimal"
              autoFocus
              className="mt-6"
              error={
                amount.length > 0 && (magnitude === null || magnitude === 0)
                  ? "Enter a non-zero number"
                  : undefined
              }
            />

            <Field
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Coffee"
              className="mt-5"
            />

            <Text className="mb-1.5 mt-5 text-sm font-medium text-ink-600 dark:text-ink-300">
              Category
            </Text>
            <Pressable
              ref={categoryTriggerRef}
              onPress={() => setPicking(true)}
              accessibilityRole="button"
              accessibilityLabel={`Category, ${
                category?.name ?? "Uncategorized"
              }`}
              className="min-h-14 flex-row items-center gap-3 rounded-xl border border-ink-300 bg-white px-3 py-2.5 hover:bg-ink-50 active:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 dark:border-ink-700 dark:bg-ink-900 dark:hover:bg-ink-800"
            >
              <View className="h-9 w-9 items-center justify-center rounded-xl bg-ink-100 dark:bg-ink-800">
                <Text className="text-lg">{category?.icon ?? "❓"}</Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                  {category?.name ?? "Uncategorized"}
                </Text>
                <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                  Used in spending and income reports
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </Pressable>

            <Text className="mb-1.5 mt-5 text-sm font-medium text-ink-600 dark:text-ink-300">
              Account
            </Text>
            <Pressable
              ref={accountTriggerRef}
              onPress={() => setPickingAccount(true)}
              disabled={availableAccounts.length === 0}
              accessibilityRole="button"
              accessibilityLabel={
                selectedAccount
                  ? `Account, ${selectedAccount.name}`
                  : "Choose an account"
              }
              className={`min-h-14 flex-row items-center gap-3 rounded-xl border border-ink-300 bg-white px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 dark:border-ink-700 dark:bg-ink-900 ${
                availableAccounts.length
                  ? "hover:bg-ink-50 active:bg-ink-100 dark:hover:bg-ink-800"
                  : "opacity-60"
              }`}
            >
              <IconBadge
                name="wallet-outline"
                size={36}
                tone={selectedAccount ? "accent" : "neutral"}
              />
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                  {selectedAccount?.name ??
                    (accounts.isPending
                      ? "Loading accounts…"
                      : "No accounts yet")}
                </Text>
                <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                  {selectedAccount
                    ? selectedAccount.is_manual
                      ? "Manual account"
                      : `Connected account${
                          selectedAccount.mask
                            ? ` · ••${selectedAccount.mask}`
                            : ""
                        }`
                    : "Add an account before creating a transaction"}
                </Text>
              </View>
              {availableAccounts.length ? (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textMuted}
                />
              ) : null}
            </Pressable>

            <Field
              label="Date"
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              className="mt-5"
              error={
                date.length > 0 && !isValidIsoDate(date)
                  ? "Use the format YYYY-MM-DD"
                  : undefined
              }
            />
          </Card>
        </View>
      </ScrollView>

      <CategoryPicker
        visible={picking}
        onClose={() => setPicking(false)}
        selectedId={category?.id}
        onSelect={setCategory}
        returnFocusRef={categoryTriggerRef}
      />
      <AccountPicker
        visible={pickingAccount}
        accounts={availableAccounts}
        selectedId={selectedAccountId}
        onClose={() => setPickingAccount(false)}
        onSelect={(account) => setAccountId(account.id)}
        returnFocusRef={accountTriggerRef}
      />
    </Screen>
  );
}

export default function NewTransactionRoute() {
  return (
    <RequireAuth>
      <NewTransaction />
    </RequireAuth>
  );
}
