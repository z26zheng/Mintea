import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import { area, curveMonotoneX, line } from 'd3-shape';
import {
  formatMoney,
  formatMoneyCompact,
  formatMonthLabel,
  type NetWorthPoint,
} from '@mintea/core';

import { useTheme } from '../lib/theme';

/**
 * Net worth over time.
 *
 * Built from `react-native-svg` and `d3-shape` rather than a charting library
 * so it renders identically on web, iOS and Android with no per-platform
 * fallback. Scales are two lines of arithmetic, so d3-scale isn't pulled in.
 */

const PADDING = { top: 16, right: 8, bottom: 24, left: 8 };

export function NetWorthChart({
  series,
  height = 200,
}: {
  series: NetWorthPoint[];
  height?: number;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);

  const plot = useMemo(() => {
    if (series.length < 2 || width === 0) return null;

    const innerWidth = width - PADDING.left - PADDING.right;
    const innerHeight = height - PADDING.top - PADDING.bottom;

    const values = series.map((point) => point.netCents);
    const min = Math.min(...values);
    const max = Math.max(...values);

    // A perfectly flat series would divide by zero; give it a nominal band so
    // the line lands in the middle instead of at the top.
    const span = max - min || Math.max(Math.abs(max), 100);
    const paddedMin = min - span * 0.1;
    const paddedMax = max + span * 0.1;

    const scaleX = (index: number) =>
      PADDING.left + (index / (series.length - 1)) * innerWidth;

    const scaleY = (value: number) =>
      PADDING.top +
      innerHeight -
      ((value - paddedMin) / (paddedMax - paddedMin)) * innerHeight;

    const points = series.map((point, index) => ({
      x: scaleX(index),
      y: scaleY(point.netCents),
    }));

    const linePath =
      line<{ x: number; y: number }>()
        .x((d) => d.x)
        .y((d) => d.y)
        .curve(curveMonotoneX)(points) ?? '';

    const areaPath =
      area<{ x: number; y: number }>()
        .x((d) => d.x)
        .y0(PADDING.top + innerHeight)
        .y1((d) => d.y)
        .curve(curveMonotoneX)(points) ?? '';

    return { points, linePath, areaPath, min, max, innerWidth, innerHeight };
  }, [series, width, height]);

  // Map a touch anywhere on the chart to the nearest data point.
  const scrubTo = (locationX: number) => {
    if (!plot || series.length === 0) return;

    const ratio = Math.min(
      Math.max((locationX - PADDING.left) / plot.innerWidth, 0),
      1,
    );

    setActiveIndex(Math.round(ratio * (series.length - 1)));
  };

  const active = activeIndex === null ? null : series[activeIndex];
  const activePoint = activeIndex === null ? null : plot?.points[activeIndex];

  const latest = series[series.length - 1];
  const headline = active ?? latest;
  const monthTickIndices = plot
    ? [
        ...new Set([
          0,
          Math.floor((series.length - 1) / 2),
          series.length - 1,
        ]),
      ]
    : [];

  return (
    <View onLayout={onLayout}>
      <View className="px-4 pb-2">
        <Text className="text-sm text-ink-500 dark:text-ink-400">
          {active ? formatMonthLabel(active.date) : 'Monthly net worth'}
        </Text>
        <Text className="text-3xl font-bold tabular-nums text-ink-900 dark:text-ink-50 mt-0.5">
          {headline ? formatMoney(headline.netCents) : '—'}
        </Text>
      </View>

      <View
        style={{ height }}
        // The RN responder system works on web too, so one implementation
        // covers mouse drag and touch scrub on all three platforms.
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => scrubTo(event.nativeEvent.locationX)}
        onResponderMove={(event) => scrubTo(event.nativeEvent.locationX)}
        onResponderRelease={() => setActiveIndex(null)}
        onResponderTerminate={() => setActiveIndex(null)}
      >
        {plot && width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.accent} stopOpacity="0.28" />
                <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
              </LinearGradient>
            </Defs>

            <Path d={plot.areaPath} fill="url(#netWorthFill)" />
            <Path
              d={plot.linePath}
              stroke={colors.accent}
              strokeWidth={2}
              strokeLinecap="round"
              fill="none"
            />

            {activePoint ? (
              <>
                <Line
                  x1={activePoint.x}
                  y1={PADDING.top}
                  x2={activePoint.x}
                  y2={PADDING.top + plot.innerHeight}
                  stroke={colors.border}
                  strokeWidth={1}
                />
                <Circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r={5}
                  fill={colors.surface}
                  stroke={colors.accent}
                  strokeWidth={2.5}
                />
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>

      {plot ? (
        <>
          <View className="flex-row justify-between px-4">
            {monthTickIndices.map((index) => {
              const point = series[index];
              return point ? (
                <Text
                  key={point.date}
                  className="text-xs text-ink-400 dark:text-ink-500"
                >
                  {formatMonthLabel(point.date)}
                </Text>
              ) : null;
            })}
          </View>
          <View className="flex-row justify-between px-4 pt-1">
            <Text className="text-xs text-ink-400 dark:text-ink-500 tabular-nums">
              {formatMoneyCompact(plot.min)}
            </Text>
            <Text className="text-xs text-ink-400 dark:text-ink-500 tabular-nums">
              {formatMoneyCompact(plot.max)}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}
