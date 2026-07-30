import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  accountDisplayBalance,
  type AccountRow,
  type AccountType,
} from "@mintea/core";

import { useBreakpoint } from "../lib/breakpoints";
import { useTheme } from "../lib/theme";
import { IconBadge, Money } from "./ui";

const TYPE_LABELS: Record<AccountType, string> = {
  depository: "Cash account",
  investment: "Investment",
  credit: "Credit card",
  loan: "Loan",
  real_estate: "Property",
  other: "Other asset",
};

export function AccountPicker({
  visible,
  accounts,
  selectedId,
  onSelect,
  onClose,
  returnFocusRef,
}: {
  visible: boolean;
  accounts: AccountRow[];
  selectedId?: string | null;
  onSelect: (account: AccountRow) => void;
  onClose: () => void;
  returnFocusRef?: RefObject<unknown>;
}) {
  const { isWide } = useBreakpoint();
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return accounts;

    return accounts.filter((account) =>
      [account.name, account.mask, TYPE_LABELS[account.type]]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term)),
    );
  }, [accounts, search]);

  const restoreFocus = useCallback(() => {
    if (Platform.OS === "web") {
      const explicitTarget = returnFocusRef?.current as {
        focus?: () => void;
      } | null;
      const target =
        typeof explicitTarget?.focus === "function"
          ? explicitTarget
          : lastFocusedRef.current;
      requestAnimationFrame(() => target?.focus?.());
    }
  }, [returnFocusRef]);

  const close = () => {
    setSearch("");
    onClose();
    restoreFocus();
  };

  useEffect(() => {
    if (visible || Platform.OS !== "web") return;

    const rememberFocus = (event: FocusEvent) => {
      if (
        event.target instanceof HTMLElement &&
        !event.target.closest('[role="dialog"], [aria-modal="true"]')
      ) {
        lastFocusedRef.current = event.target;
      }
    };

    if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
    ) {
      lastFocusedRef.current = document.activeElement;
    }

    document.addEventListener("focus", rememberFocus, true);
    return () => document.removeEventListener("focus", rememberFocus, true);
  }, [visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setSearch("");
      onClose();
      restoreFocus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, restoreFocus, visible]);

  return (
    <Modal
      visible={visible}
      transparent={isWide}
      animationType={isWide ? "fade" : "slide"}
      onRequestClose={close}
    >
      <View
        className={`flex-1 ${
          isWide
            ? "items-center justify-center bg-ink-950/55 p-6"
            : "bg-ink-50 dark:bg-ink-950"
        }`}
      >
        {isWide ? (
          <Pressable
            onPress={close}
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="absolute inset-0"
          />
        ) : null}

        <View
          accessibilityViewIsModal
          className={`w-full overflow-hidden bg-ink-50 dark:bg-ink-950 ${
            isWide
              ? "max-h-[720px] max-w-xl rounded-3xl border border-ink-200 shadow-2xl dark:border-ink-800"
              : "flex-1"
          }`}
        >
          <View className="min-h-16 flex-row items-center gap-3 border-b border-ink-200 bg-white px-4 py-2.5 dark:border-ink-800 dark:bg-ink-900">
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close account picker"
              className="h-10 w-10 items-center justify-center rounded-xl border border-ink-200 bg-ink-50 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 dark:border-ink-700 dark:bg-ink-800 dark:hover:bg-ink-700"
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
            <View className="min-w-0 flex-1">
              <Text
                accessibilityRole="header"
                className="text-base font-semibold text-ink-900 dark:text-ink-50"
              >
                Choose an account
              </Text>
              <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                Where this transaction should live
              </Text>
            </View>
          </View>

          <View className="p-4 pb-3">
            <View className="h-12 flex-row items-center gap-2 rounded-xl border border-ink-300 bg-white px-3 focus-within:border-mint-500 focus-within:ring-2 focus-within:ring-mint-500/20 dark:border-ink-700 dark:bg-ink-900">
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                onKeyPress={(event) => {
                  if (event.nativeEvent.key === "Escape") close();
                }}
                placeholder="Search accounts"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus={isWide}
                accessibilityLabel="Search accounts"
                className="min-w-0 flex-1 text-base text-ink-900 outline-none dark:text-ink-50"
              />
              {search ? (
                <Pressable
                  onPress={() => setSearch("")}
                  accessibilityRole="button"
                  accessibilityLabel="Clear account search"
                  className="h-9 w-9 items-center justify-center rounded-lg"
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.textMuted}
                  />
                </Pressable>
              ) : null}
            </View>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(account) => account.id}
            keyboardShouldPersistTaps="handled"
            accessibilityRole="radiogroup"
            contentContainerClassName="px-4 pb-8"
            ListEmptyComponent={
              <View className="items-center px-6 py-12">
                <IconBadge name="search-outline" size={46} tone="neutral" />
                <Text className="mt-3 text-base font-semibold text-ink-900 dark:text-ink-50">
                  No matching accounts
                </Text>
                <Text className="mt-1 text-center text-sm text-ink-500 dark:text-ink-400">
                  Try another name, type, or last four digits.
                </Text>
              </View>
            }
            renderItem={({ item: account }) => {
              const selected = selectedId === account.id;
              const displayBalance = accountDisplayBalance(account);

              return (
                <Pressable
                  onPress={() => {
                    onSelect(account);
                    close();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  aria-checked={selected}
                  className={`mb-2 min-h-16 flex-row items-center gap-3 rounded-2xl border p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 ${
                    selected
                      ? "border-mint-500 bg-mint-50 dark:bg-mint-950/50"
                      : "border-ink-200 bg-white hover:bg-ink-50 active:bg-ink-100 dark:border-ink-800 dark:bg-ink-900 dark:hover:bg-ink-800"
                  }`}
                >
                  <IconBadge
                    name={
                      account.type === "credit" || account.type === "loan"
                        ? "card-outline"
                        : account.type === "investment"
                          ? "trending-up-outline"
                          : account.type === "real_estate"
                            ? "home-outline"
                            : "wallet-outline"
                    }
                    size={38}
                    tone={selected ? "accent" : "neutral"}
                  />
                  <View className="min-w-0 flex-1">
                    <Text
                      numberOfLines={1}
                      className={`text-sm ${
                        selected
                          ? "font-semibold text-mint-700 dark:text-mint-300"
                          : "font-medium text-ink-900 dark:text-ink-50"
                      }`}
                    >
                      {account.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="mt-0.5 text-xs text-ink-500 dark:text-ink-400"
                    >
                      {TYPE_LABELS[account.type]}
                      {account.mask ? ` · ••${account.mask}` : ""}
                    </Text>
                  </View>
                  <View className="shrink-0 items-end">
                    <Money
                      cents={displayBalance.cents}
                      currency={account.currency}
                      size="sm"
                    />
                    {selected ? (
                      <Text className="mt-0.5 text-xs font-semibold text-mint-700 dark:text-mint-300">
                        Selected
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
