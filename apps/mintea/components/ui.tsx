import { useEffect, useRef, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatMoney, type Cents } from '@mintea/core';

/**
 * Shared primitives. Everything here is built from React Native components, so
 * the same file renders on web, iOS and Android — that constraint is what keeps
 * the port to native a no-op rather than a rewrite.
 */

export function Screen({
  children,
  scroll = false,
  className = '',
}: {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
}) {
  const body = scroll ? (
    <ScrollView
      className="flex-1"
      contentContainerClassName="pb-16"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View className="flex-1">{children}</View>
  );

  return (
    <SafeAreaView
      edges={['top']}
      className={`flex-1 bg-ink-50 dark:bg-ink-950 ${className}`}
    >
      {/* Wide screens get a centred column; phones fill the width. */}
      <View className="flex-1 w-full max-w-3xl self-center">{body}</View>
    </SafeAreaView>
  );
}

export function Card({
  children,
  className = '',
  testID,
}: {
  children: ReactNode;
  className?: string;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      className={`bg-white dark:bg-ink-900 rounded-2xl border border-ink-200/90 dark:border-ink-800 shadow-sm shadow-ink-950/5 ${className}`}
    >
      {children}
    </View>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <Text className="text-xs font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400 px-4 pt-6 pb-2">
      {children}
    </Text>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text
      accessibilityRole="header"
      className="text-3xl font-bold tracking-tight text-ink-900 dark:text-ink-50"
    >
      {children}
    </Text>
  );
}

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  action,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`flex-row items-start justify-between gap-4 px-4 pt-7 pb-4 ${className}`}
    >
      <View className="min-w-0 flex-1">
        {eyebrow ? (
          <Text className="mb-1 text-xs font-semibold uppercase tracking-[1.5px] text-mint-700 dark:text-mint-300">
            {eyebrow}
          </Text>
        ) : null}
        <Title>{title}</Title>
        {subtitle ? (
          <Text className="mt-1.5 max-w-2xl text-sm leading-5 text-ink-500 dark:text-ink-400">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? <View className="shrink-0 pt-0.5">{action}</View> : null}
    </View>
  );
}

/**
 * Small entrance transition used to establish hierarchy, not decorate every
 * row. It follows the platform's Reduce Motion setting and leaves layout
 * untouched while animating.
 */
export function Reveal({
  children,
  delay = 0,
  distance = 8,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  className?: string;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(distance)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    let live = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!live) return;

      if (reduceMotion) {
        opacity.setValue(1);
        translateY.setValue(0);
        return;
      }

      animation.current = Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 260,
          delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]);
      animation.current.start();
    });

    return () => {
      live = false;
      animation.current?.stop();
    };
  }, [delay, distance, opacity, translateY]);

  return (
    <Animated.View
      className={className}
      style={{ opacity, transform: [{ translateY }] }}
    >
      {children}
    </Animated.View>
  );
}

export function Skeleton({
  className = '',
  rounded = 'xl',
}: {
  className?: string;
  rounded?: 'full' | 'xl' | '2xl';
}) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    let live = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (!live || reduceMotion) {
        pulse.setValue(0.62);
        return;
      }

      animation.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 0.82,
            duration: 760,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(pulse, {
            toValue: 0.42,
            duration: 760,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]),
      );
      animation.current.start();
    });

    return () => {
      live = false;
      animation.current?.stop();
    };
  }, [pulse]);

  const radius = {
    full: 'rounded-full',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
  }[rounded];

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={`bg-ink-200 dark:bg-ink-800 ${radius} ${className}`}
      style={{ opacity: pulse }}
    />
  );
}

export function Body({
  children,
  muted = false,
  className = '',
}: {
  children: ReactNode;
  muted?: boolean;
  className?: string;
}) {
  const tone = muted
    ? 'text-ink-500 dark:text-ink-400'
    : 'text-ink-900 dark:text-ink-100';

  return <Text className={`text-base ${tone} ${className}`}>{children}</Text>;
}

/**
 * Money is tabular so columns of figures line up.
 *
 * Colour defaults to off. It means "this is money coming in", which is true of
 * a transaction amount but not of a balance — colourising by default turned
 * every asset balance and the liabilities total green.
 */
export function Money({
  cents,
  currency = 'USD',
  size = 'base',
  colorize = 'none',
  hideCents = false,
  className = '',
}: {
  cents: Cents;
  currency?: string;
  size?: 'sm' | 'base' | 'lg' | 'xl';
  colorize?: 'none' | 'income-only' | 'both';
  hideCents?: boolean;
  className?: string;
}) {
  const sizes = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-xl',
    xl: 'text-4xl',
  } as const;

  let tone = 'text-ink-900 dark:text-ink-50';

  if (colorize === 'income-only' && cents > 0) {
    tone = 'text-positive dark:text-emerald-400';
  } else if (colorize === 'both') {
    tone =
      cents >= 0
        ? 'text-positive dark:text-emerald-400'
        : 'text-negative dark:text-red-400';
  }

  return (
    <Text
      accessibilityLabel={formatMoney(cents, { currency, hideCents })}
      adjustsFontSizeToFit
      minimumFontScale={0.72}
      numberOfLines={1}
      className={`${sizes[size]} font-semibold tabular-nums ${tone} ${className}`}
    >
      {formatMoney(cents, { currency, hideCents })}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  className = '',
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const surface = {
    primary:
      'bg-mint-600 hover:bg-mint-700 active:bg-mint-800 shadow-sm shadow-mint-950/15',
    secondary:
      'bg-white dark:bg-ink-800 border border-ink-300 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-700 active:bg-ink-100',
    danger: 'bg-negative hover:opacity-90 active:opacity-80',
    ghost:
      'hover:bg-ink-100 active:bg-ink-200 dark:hover:bg-ink-800 dark:active:bg-ink-700',
  }[variant];

  const label_ = {
    primary: 'text-white',
    secondary: 'text-ink-900 dark:text-ink-50',
    danger: 'text-white',
    ghost: 'text-mint-600 dark:text-mint-400',
  }[variant];

  const isInactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isInactive, busy: loading }}
      aria-busy={loading}
      disabled={isInactive}
      onPress={onPress}
      className={`h-12 rounded-xl items-center justify-center flex-row px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-ink-950 ${surface} ${
        isInactive ? 'opacity-50' : ''
      } ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? '#54606E' : '#fff'} />
      ) : (
        <Text className={`text-base font-semibold ${label_}`}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  className = '',
  ...props
}: TextInputProps & { label?: string; error?: string; className?: string }) {
  return (
    <View className={className}>
      {label ? (
        <Text className="text-sm font-medium text-ink-600 dark:text-ink-300 mb-1.5">
          {label}
        </Text>
      ) : null}

      <TextInput
        placeholderTextColor="#A4ADB8"
        className={`h-12 px-4 rounded-xl bg-white dark:bg-ink-900 border text-base text-ink-900 dark:text-ink-50 focus:border-mint-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500/30 ${
          error ? 'border-negative' : 'border-ink-300 dark:border-ink-700'
        }`}
        {...props}
      />

      {error ? (
        <Text className="text-sm text-negative mt-1.5">{error}</Text>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: string;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <View className="items-center justify-center py-16 px-8">
      <Text className="text-5xl mb-4">{icon}</Text>
      <Text className="text-lg font-semibold text-ink-900 dark:text-ink-50 text-center">
        {title}
      </Text>
      <Text className="text-base text-ink-500 dark:text-ink-400 text-center mt-1.5">
        {message}
      </Text>
      {action ? <View className="mt-6">{action}</View> : null}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center py-16">
      <ActivityIndicator color="#1FA678" />
      {label ? (
        <Text className="text-sm text-ink-500 dark:text-ink-400 mt-3">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View className="m-4 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900">
      <Text className="text-sm text-red-700 dark:text-red-300">{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} className="mt-3 self-start">
          <Text className="text-sm font-semibold text-red-700 dark:text-red-300">
            Try again
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Row({
  children,
  onPress,
  className = '',
}: {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
}) {
  const content = (
    <View
      className={`flex-row items-center px-4 py-3 gap-3 ${className}`}
    >
      {children}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="hover:bg-ink-50 active:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mint-500 dark:hover:bg-ink-800/70 dark:active:bg-ink-800"
    >
      {content}
    </Pressable>
  );
}

export function Divider() {
  return <View className="h-px bg-ink-200 dark:bg-ink-800 ml-4" />;
}

/**
 * Header for modal routes. Uses a text button rather than a platform back
 * chevron so it reads correctly as a sheet on native and as a dialog on web.
 */
export function ModalHeader({
  title,
  onClose,
  action,
}: {
  title: string;
  onClose: () => void;
  action?: { label: string; onPress: () => void; disabled?: boolean };
}) {
  return (
    <View className="flex-row items-center justify-between px-4 h-14 border-b border-ink-200 dark:border-ink-800">
      <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
        <Text className="text-base text-ink-500 dark:text-ink-400">Cancel</Text>
      </Pressable>

      <Text
        accessibilityRole="header"
        numberOfLines={1}
        className="text-base font-semibold text-ink-900 dark:text-ink-50 flex-1 text-center mx-3"
      >
        {title}
      </Text>

      {action ? (
        <Pressable
          onPress={action.onPress}
          disabled={action.disabled}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text
            className={`text-base font-semibold ${
              action.disabled
                ? 'text-ink-300 dark:text-ink-600'
                : 'text-mint-600 dark:text-mint-400'
            }`}
          >
            {action.label}
          </Text>
        </Pressable>
      ) : (
        <View className="w-12" />
      )}
    </View>
  );
}

/** Horizontal single-choice control, used for type pickers and date ranges. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <View
      className={`flex-row bg-ink-100 dark:bg-ink-800 rounded-xl p-1 ${className}`}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={`flex-1 py-2 rounded-lg items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 ${
              selected
                ? 'bg-white shadow-sm dark:bg-ink-700'
                : 'hover:bg-white/60 dark:hover:bg-ink-700/60'
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                selected
                  ? 'text-ink-900 dark:text-ink-50'
                  : 'text-ink-500 dark:text-ink-400'
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingRow({
  label,
  description,
  right,
  onPress,
}: {
  label: string;
  description?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Row onPress={onPress}>
      <View className="flex-1">
        <Text className="text-base text-ink-900 dark:text-ink-50">{label}</Text>
        {description ? (
          <Text className="text-sm text-ink-500 dark:text-ink-400 mt-0.5">
            {description}
          </Text>
        ) : null}
      </View>
      {right}
    </Row>
  );
}

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'warning' | 'accent' | 'danger';
}) {
  const styles = {
    neutral: 'bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300',
    warning: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
    accent: 'bg-mint-100 dark:bg-mint-900 text-mint-700 dark:text-mint-200',
    danger: 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300',
  }[tone];

  return (
    <Text
      numberOfLines={1}
      // shrink-0: in a flex row a Text will happily compress to one word per
      // line, which turned "Reconnect" into a two-line blob on a phone.
      className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full overflow-hidden ${styles}`}
    >
      {label}
    </Text>
  );
}
