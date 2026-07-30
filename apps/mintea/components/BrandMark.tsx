import { Text, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

export function MinteaMark({
  size = 44,
  accessibilityLabel = 'Mintea',
}: {
  size?: number;
  accessibilityLabel?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Defs>
        <LinearGradient id="minteaMarkBackground" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#2CC596" />
          <Stop offset="0.55" stopColor="#138661" />
          <Stop offset="1" stopColor="#0C5A46" />
        </LinearGradient>
      </Defs>

      <Rect
        x="1"
        y="1"
        width="62"
        height="62"
        rx="18"
        fill="url(#minteaMarkBackground)"
      />
      <Path
        d="M14.5 43.5 22.5 18 32 37.5 41.5 18l8 25.5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M41.5 13.5c4-4.6 8.2-4.8 11.7-3.2-1 5.6-4.3 8.8-10.4 9.2"
        fill="none"
        stroke="#BFF6E3"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function MinteaLockup({
  compact = false,
  subtitle,
}: {
  compact?: boolean;
  subtitle?: string;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <MinteaMark size={compact ? 36 : 48} />
      <View>
        <Text
          className={`font-bold tracking-tight text-ink-900 dark:text-ink-50 ${
            compact ? 'text-xl' : 'text-2xl'
          }`}
        >
          Mintea
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
