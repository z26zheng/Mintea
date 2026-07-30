import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  accountsQuery,
  buildImportRows,
  detectColumns,
  fetchImportMatchCandidates,
  formatMoney,
  importTransactions,
  parseCsv,
  planImport,
  profileQuery,
  rowDateRange,
  type DateOrder,
  type ImportPlan,
  type ParseResult,
} from "@mintea/core";

import { useClient } from "../../lib/auth";
import { useBreakpoint } from "../../lib/breakpoints";
import { useDismiss } from "../../lib/useDismiss";
import { useTheme } from "../../lib/theme";
import {
  Badge,
  Button,
  Card,
  Divider,
  ErrorNotice,
  IconBadge,
  ModalHeader,
  Screen,
} from "../../components/ui";
import { RequireAuth } from "../../components/RequireAuth";

const DATE_ORDERS: Array<{ value: DateOrder; label: string }> = [
  { value: "mdy", label: "Month / Day" },
  { value: "dmy", label: "Day / Month" },
  { value: "iso", label: "Year-Month-Day" },
];

function StepTitle({
  number,
  title,
  description,
  complete = false,
}: {
  number: number;
  title: string;
  description: string;
  complete?: boolean;
}) {
  return (
    <View className="flex-row items-start gap-3">
      <View
        className={`h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          complete ? "bg-mint-600" : "bg-ink-100 dark:bg-ink-800"
        }`}
      >
        <Text
          className={`text-sm font-bold ${
            complete ? "text-white" : "text-ink-600 dark:text-ink-300"
          }`}
        >
          {complete ? "✓" : number}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
          {title}
        </Text>
        <Text className="mt-0.5 text-sm leading-5 text-ink-500 dark:text-ink-400">
          {description}
        </Text>
      </View>
    </View>
  );
}

function Import() {
  const client = useClient();
  const queryClient = useQueryClient();
  const dismiss = useDismiss("/(tabs)/settings");
  const { isLarge } = useBreakpoint();
  const { colors } = useTheme();

  const profile = useQuery(profileQuery(client));
  const accounts = useQuery(accountsQuery(client));

  const [fileName, setFileName] = useState<string | null>(null);
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [dateOrder, setDateOrder] = useState<DateOrder | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const parsed = useMemo<ParseResult | null>(() => {
    if (!grid || grid.length === 0) return null;
    return buildImportRows(grid, detectColumns(grid[0]!), {
      ...(dateOrder ? { dateOrder } : {}),
    });
  }, [grid, dateOrder]);

  // Manual accounts first: importing into a Plaid-fed account is legitimate
  // but far more likely to double up, so it should not be the easy default.
  const importable = useMemo(
    () =>
      [...(accounts.data ?? [])].sort(
        (a, b) => Number(b.is_manual) - Number(a.is_manual),
      ),
    [accounts.data],
  );
  const selectedAccount = importable.find(
    (account) => account.id === accountId,
  );

  const pickFile = () => {
    setError(null);
    setDone(null);
    setPlan(null);

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        setFileName(file.name);
        setGrid(parseCsv(text));
        setDateOrder(null);
      } catch {
        setError("Could not read that file");
      }
    };
    input.click();
  };

  const check = useMutation({
    mutationFn: async () => {
      if (!parsed || !accountId)
        throw new Error("Choose a file and an account");
      const range = rowDateRange(parsed.rows);
      if (!range) throw new Error("Nothing in this file could be read");

      const existing = await fetchImportMatchCandidates(
        client,
        accountId,
        range,
      );
      return planImport(parsed.rows, existing);
    },
    onSuccess: setPlan,
    onError: (caught) =>
      setError(
        caught instanceof Error ? caught.message : "Could not check the file",
      ),
  });

  const commit = useMutation({
    mutationFn: async () => {
      if (!plan || !accountId || !profile.data)
        throw new Error("Nothing to import");
      return importTransactions(client, {
        householdId: profile.data.household_id,
        accountId,
        currency: profile.data.currency,
        rows: plan.toImport,
      });
    },
    onSuccess: async (count: number) => {
      setDone(`Imported ${count} transaction${count === 1 ? "" : "s"}.`);
      setPlan(null);
      setGrid(null);
      setFileName(null);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : "Could not import"),
  });

  if (Platform.OS !== "web") {
    return (
      <Screen maxWidth="5xl">
        <ModalHeader
          title="Import transactions"
          subtitle="Bring bank history into Mintea"
          onClose={dismiss}
        />
        <Card className="m-4 flex-row items-start gap-3 p-4">
          <IconBadge name="desktop-outline" tone="neutral" />
          <View className="min-w-0 flex-1">
            <Text className="font-semibold text-ink-900 dark:text-ink-50">
              Continue on the web
            </Text>
            <Text className="mt-1 text-sm leading-5 text-ink-600 dark:text-ink-300">
              CSV importing is only available in the web app right now.
            </Text>
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen maxWidth="5xl">
      <ModalHeader
        title="Import transactions"
        subtitle="Bring bank history into Mintea"
        onClose={dismiss}
      />

      <ScrollView
        contentContainerClassName="p-4 pb-16"
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorNotice message={error} /> : null}

        {done ? (
          <Card className="mb-4 flex-row items-start gap-3 border-mint-300 bg-mint-50 p-4 dark:border-mint-800 dark:bg-mint-950/40">
            <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
            <View className="min-w-0 flex-1">
              <Text
                accessibilityLiveRegion="polite"
                className="font-semibold text-mint-900 dark:text-mint-100"
              >
                {done}
              </Text>
              <Text className="mt-1 text-sm leading-5 text-mint-800 dark:text-mint-200">
                Imported transactions are ready for review, just like new bank
                activity.
              </Text>
            </View>
          </Card>
        ) : null}

        <View className={`gap-4 ${isLarge ? "flex-row items-start" : ""}`}>
          <View className={isLarge ? "w-[310px] shrink-0 gap-4" : "gap-4"}>
            <Card className="overflow-hidden">
              <View className="h-1 bg-mint-500" />
              <View className="p-4">
                <IconBadge name="cloud-upload-outline" size={44} />
                <Text className="mt-4 text-lg font-semibold text-ink-900 dark:text-ink-50">
                  Bring your history with confidence
                </Text>
                <Text className="mt-1 text-sm leading-5 text-ink-500 dark:text-ink-400">
                  Mintea reads the file first, checks the destination account,
                  and shows exactly what will be added before anything changes.
                </Text>
                <View className="mt-4 flex-row flex-wrap gap-2">
                  <Badge label="CSV only" tone="neutral" />
                  <Badge label="Duplicate check" tone="accent" />
                  <Badge label="Reviewable" tone="neutral" />
                </View>
              </View>
            </Card>

            <Card className="p-4">
              <View className="flex-row items-start gap-3">
                <IconBadge
                  name="shield-checkmark-outline"
                  size={38}
                  tone="neutral"
                />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    Safer destination
                  </Text>
                  <Text className="mt-1 text-xs leading-4 text-ink-500 dark:text-ink-400">
                    Manual accounts appear first. Importing into a connected
                    account works, but deserves a closer duplicate review.
                  </Text>
                </View>
              </View>
            </Card>
          </View>

          <View className={isLarge ? "min-w-0 flex-1 gap-4" : "gap-4"}>
            <Card className="p-4">
              <StepTitle
                number={1}
                title="Choose a CSV file"
                description="Use the download from your bank or another finance app."
                complete={Boolean(parsed)}
              />
              {fileName && parsed ? (
                <View className="mt-4 flex-row items-center gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-800">
                  <IconBadge
                    name="document-text-outline"
                    size={36}
                    tone="neutral"
                  />
                  <View className="min-w-0 flex-1">
                    <Text
                      numberOfLines={1}
                      className="text-sm font-semibold text-ink-900 dark:text-ink-50"
                    >
                      {fileName}
                    </Text>
                    <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                      {parsed.rows.length.toLocaleString()} readable row
                      {parsed.rows.length === 1 ? "" : "s"}
                      {parsed.problems.length
                        ? ` · ${parsed.problems.length.toLocaleString()} skipped`
                        : ""}
                    </Text>
                  </View>
                </View>
              ) : null}
              <Button
                label={fileName ? "Choose a different file" : "Choose CSV file"}
                variant={fileName ? "secondary" : "primary"}
                onPress={pickFile}
                className="mt-4"
              />
              <Text className="mt-3 text-xs leading-4 text-ink-400 dark:text-ink-500">
                Expected columns include a date, description, and amount. Your
                file stays in this browser until you confirm the import.
              </Text>
            </Card>

            {parsed ? (
              <>
                <Card className="overflow-hidden">
                  <View className="p-4">
                    <StepTitle
                      number={2}
                      title="Choose the destination account"
                      description="Every imported row will belong to this account."
                      complete={Boolean(selectedAccount)}
                    />
                  </View>
                  <Divider />
                  <View accessibilityRole="radiogroup">
                    {importable.map((account, index) => {
                      const selected = accountId === account.id;
                      return (
                        <View key={account.id}>
                          {index > 0 ? <Divider /> : null}
                          <Pressable
                            onPress={() => {
                              setAccountId(account.id);
                              setPlan(null);
                            }}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: selected }}
                            aria-checked={selected}
                            className={`min-h-14 flex-row items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mint-500 ${
                              selected
                                ? "bg-mint-50 dark:bg-mint-950/50"
                                : "hover:bg-ink-50 active:bg-ink-100 dark:hover:bg-ink-800/70"
                            }`}
                          >
                            <View
                              className={`h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                                selected
                                  ? "border-mint-600 dark:border-mint-400"
                                  : "border-ink-300 dark:border-ink-600"
                              }`}
                            >
                              {selected ? (
                                <View className="h-2.5 w-2.5 rounded-full bg-mint-600 dark:bg-mint-400" />
                              ) : null}
                            </View>
                            <View className="min-w-0 flex-1">
                              <Text
                                numberOfLines={1}
                                className={`text-base ${
                                  selected
                                    ? "font-semibold text-mint-700 dark:text-mint-300"
                                    : "text-ink-900 dark:text-ink-50"
                                }`}
                              >
                                {account.name}
                              </Text>
                              <Text className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
                                {account.is_manual
                                  ? "Manual account · preferred for imported history"
                                  : "Bank connected · review matches carefully"}
                              </Text>
                            </View>
                            {account.is_manual ? (
                              <Badge label="Manual" tone="neutral" />
                            ) : (
                              <Ionicons
                                name="link-outline"
                                size={18}
                                color={colors.textMuted}
                              />
                            )}
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </Card>

                {parsed.dateOrderAssumed ? (
                  <Card className="border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
                    <View className="flex-row items-start gap-3">
                      <IconBadge
                        name="calendar-outline"
                        size={38}
                        tone="warning"
                      />
                      <View className="min-w-0 flex-1">
                        <Text className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                          Confirm the date order
                        </Text>
                        <Text className="mt-1 text-sm leading-5 text-amber-800 dark:text-amber-300">
                          Dates such as 03/04 can mean March 4 or April 3. Pick
                          the format your bank uses.
                        </Text>
                      </View>
                    </View>
                    <View
                      accessibilityRole="radiogroup"
                      className="mt-4 flex-row flex-wrap gap-2"
                    >
                      {DATE_ORDERS.map((option) => {
                        const selected =
                          (dateOrder ?? parsed.dateOrder) === option.value;
                        return (
                          <Pressable
                            key={option.value}
                            onPress={() => {
                              setDateOrder(option.value);
                              setPlan(null);
                            }}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: selected }}
                            aria-checked={selected}
                            className={`min-h-10 items-center justify-center rounded-xl border px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 ${
                              selected
                                ? "border-mint-600 bg-mint-600"
                                : "border-amber-300 bg-white/70 hover:bg-white dark:border-amber-800 dark:bg-amber-950/20"
                            }`}
                          >
                            <Text
                              className={`text-sm font-medium ${
                                selected
                                  ? "text-white"
                                  : "text-amber-900 dark:text-amber-200"
                              }`}
                            >
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Card>
                ) : null}

                <Card className="p-4">
                  <StepTitle
                    number={3}
                    title="Check what Mintea found"
                    description="Unreadable rows are skipped; possible duplicates are compared only inside the selected account."
                    complete={Boolean(plan)}
                  />
                  <View className="mt-4 flex-row gap-2">
                    <View className="min-w-0 flex-1 rounded-xl bg-mint-50 px-3 py-3 dark:bg-mint-950/50">
                      <Text className="text-xl font-bold tabular-nums text-mint-700 dark:text-mint-300">
                        {parsed.rows.length.toLocaleString()}
                      </Text>
                      <Text className="text-xs text-mint-700 dark:text-mint-300">
                        Readable
                      </Text>
                    </View>
                    <View className="min-w-0 flex-1 rounded-xl bg-ink-50 px-3 py-3 dark:bg-ink-800">
                      <Text className="text-xl font-bold tabular-nums text-ink-900 dark:text-ink-50">
                        {parsed.problems.length.toLocaleString()}
                      </Text>
                      <Text className="text-xs text-ink-500 dark:text-ink-400">
                        Skipped
                      </Text>
                    </View>
                  </View>

                  {parsed.problems.slice(0, 5).map((problem) => (
                    <Text
                      key={problem.line}
                      className="mt-2 text-xs text-ink-500 dark:text-ink-400"
                    >
                      Line {problem.line}: {problem.reason}
                    </Text>
                  ))}

                  <Button
                    label={
                      check.isPending ? "Checking…" : "Check for duplicates"
                    }
                    onPress={() => check.mutate()}
                    loading={check.isPending}
                    disabled={!accountId || parsed.rows.length === 0}
                    className="mt-4"
                  />
                </Card>

                {plan ? (
                  <Card className="overflow-hidden">
                    <View className="h-1 bg-mint-500" />
                    <View className="p-4">
                      <StepTitle
                        number={4}
                        title="Review and import"
                        description="Only the new rows below will be written to Mintea."
                      />
                      <View className="mt-4 flex-row gap-2">
                        <View className="min-w-0 flex-1 rounded-xl bg-mint-50 px-3 py-3 dark:bg-mint-950/50">
                          <Text className="text-2xl font-bold tabular-nums text-mint-700 dark:text-mint-300">
                            {plan.toImport.length.toLocaleString()}
                          </Text>
                          <Text className="text-xs text-mint-700 dark:text-mint-300">
                            New
                          </Text>
                        </View>
                        <View className="min-w-0 flex-1 rounded-xl bg-ink-50 px-3 py-3 dark:bg-ink-800">
                          <Text className="text-2xl font-bold tabular-nums text-ink-900 dark:text-ink-50">
                            {plan.duplicates.length.toLocaleString()}
                          </Text>
                          <Text className="text-xs text-ink-500 dark:text-ink-400">
                            Already present
                          </Text>
                        </View>
                      </View>
                      <Text className="mt-3 text-xs leading-4 text-ink-500 dark:text-ink-400">
                        A row matches when this account already has the same
                        amount on the same day, regardless of its description.
                      </Text>

                      {plan.duplicates.slice(0, 4).map((row) => (
                        <Text
                          key={`${row.line}`}
                          numberOfLines={1}
                          className="mt-1 text-xs text-ink-400 dark:text-ink-500"
                        >
                          Skipping {row.date} · {row.description} ·{" "}
                          {formatMoney(row.amountCents)}
                        </Text>
                      ))}

                      <Button
                        label={`Import ${plan.toImport.length.toLocaleString()} transaction${
                          plan.toImport.length === 1 ? "" : "s"
                        }`}
                        onPress={() => commit.mutate()}
                        loading={commit.isPending}
                        disabled={plan.toImport.length === 0}
                        className="mt-4"
                      />
                    </View>
                  </Card>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

export default function ImportRoute() {
  return (
    <RequireAuth>
      <Import />
    </RequireAuth>
  );
}
