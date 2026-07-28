import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { area, curveMonotoneX, line } from 'd3-shape';
import {
  formatMoney,
  formatMoneyCompact,
  formatMonthLabel,
  formatShortDate,
  type ChartGranularity,
  type FinancialChartPoint,
} from '@mintea/core';

import { useTheme } from '../lib/theme';

export type FinancialChartType = 'line' | 'bar';

const PADDING = { top: 12, right: 10, bottom: 12, left: 10 };

export function FinancialChart({
  series,
  chartType,
  granularity,
  label,
  headlineLabel,
  headlineCents,
  includeZero = false,
  height = 200,
}: {
  series: FinancialChartPoint[];
  chartType: FinancialChartType;
  granularity: ChartGranularity;
  label: string;
  headlineLabel: string;
  headlineCents: number;
  includeZero?: boolean;
  height?: number;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);

  const plot = useMemo(() => {
    if (series.length === 0 || width === 0) return null;

    const innerWidth = width - PADDING.left - PADDING.right;
    const innerHeight = height - PADDING.top - PADDING.bottom;
    const values = series.map((point) => point.valueCents);
    const actualMin = Math.min(...values);
    const actualMax = Math.max(...values);
    const crossesZero = actualMin < 0 && actualMax > 0;
    const anchorAtZero = includeZero || chartType === 'bar' || crossesZero;
    const domainMin = anchorAtZero ? Math.min(actualMin, 0) : actualMin;
    const domainMax = anchorAtZero ? Math.max(actualMax, 0) : actualMax;

    let paddedMin: number;
    let paddedMax: number;

    if (domainMin === domainMax) {
      const band = Math.max(Math.abs(domainMax) * 0.1, 100);
      paddedMin = domainMin === 0 && anchorAtZero ? -band : domainMin - band;
      paddedMax = domainMax + band;
    } else {
      const span = domainMax - domainMin;
      paddedMin =
        anchorAtZero && domainMin === 0 ? 0 : domainMin - span * 0.1;
      paddedMax =
        anchorAtZero && domainMax === 0 ? 0 : domainMax + span * 0.1;
    }

    const scaleX = (index: number) =>
      series.length === 1
        ? PADDING.left + innerWidth / 2
        : PADDING.left + (index / (series.length - 1)) * innerWidth;

    const scaleY = (value: number) =>
      PADDING.top +
      innerHeight -
      ((value - paddedMin) / (paddedMax - paddedMin)) * innerHeight;

    const points = series.map((point, index) => ({
      x: scaleX(index),
      y: scaleY(point.valueCents),
    }));

    const linePath =
      series.length > 1
        ? line<{ x: number; y: number }>()
            .x((point) => point.x)
            .y((point) => point.y)
            .curve(curveMonotoneX)(points) ?? ''
        : '';

    const zeroY = scaleY(0);
    const areaBaseline =
      anchorAtZero && zeroY >= PADDING.top && zeroY <= PADDING.top + innerHeight
        ? zeroY
        : PADDING.top + innerHeight;

    const areaPath =
      series.length > 1
        ? area<{ x: number; y: number }>()
            .x((point) => point.x)
            .y0(areaBaseline)
            .y1((point) => point.y)
            .curve(curveMonotoneX)(points) ?? ''
        : '';

    const slotWidth = innerWidth / Math.max(series.length, 1);
    const barWidth = Math.min(Math.max(slotWidth * 0.65, 2), 40);
    const bars = series.map((point, index) => {
      const y = scaleY(point.valueCents);
      const centerX = PADDING.left + slotWidth * index + slotWidth / 2;

      return {
        x: centerX - barWidth / 2,
        y: Math.min(y, zeroY),
        width: barWidth,
        height: Math.max(Math.abs(zeroY - y), 1),
      };
    });

    return {
      points,
      bars,
      linePath,
      areaPath,
      zeroY,
      actualMin,
      actualMax,
      innerWidth,
      innerHeight,
      anchorAtZero,
    };
  }, [chartType, height, includeZero, series, width]);

  const scrubTo = (locationX: number) => {
    if (!plot || series.length === 0) return;
    // Nothing is plotted for a single-point line, so scrubbing would put the
    // cursor dot back on an otherwise empty chart.
    if (chartType === 'line' && series.length < 2) return;
    if (series.length === 1) {
      setActiveIndex(0);
      return;
    }

    const ratio = Math.min(
      Math.max((locationX - PADDING.left) / plot.innerWidth, 0),
      1,
    );

    setActiveIndex(Math.round(ratio * (series.length - 1)));
  };

  const active = activeIndex === null ? null : series[activeIndex];
  const activePoint = activeIndex === null ? null : plot?.points[activeIndex];
  const tickIndices = plot
    ? [
        ...new Set([
          0,
          Math.floor((series.length - 1) / 2),
          series.length - 1,
        ]),
      ]
    : [];
  const formatDate =
    granularity === 'daily' ? formatShortDate : formatMonthLabel;

  /**
   * A line needs two points. With one, `linePath` and `areaPath` are both
   * empty, so the plot area would render completely blank — previously a lone
   * dot floated there instead, which read as a rendering glitch rather than a
   * chart. Say what's happening instead, and point at the Bars toggle, which
   * renders a single point perfectly well.
   */
  const tooShortForLine = chartType === 'line' && series.length < 2;

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${label} ${chartType} chart with ${series.length} data points`}
    >
      <View className="px-4 pb-2">
        <Text className="text-sm text-ink-500 dark:text-ink-400">
          {active ? formatDate(active.date) : headlineLabel}
        </Text>
        <Text className="text-3xl font-bold tabular-nums text-ink-900 dark:text-ink-50 mt-0.5">
          {formatMoney(active?.valueCents ?? headlineCents)}
        </Text>
      </View>

      <View
        style={{ height }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => scrubTo(event.nativeEvent.locationX)}
        onResponderMove={(event) => scrubTo(event.nativeEvent.locationX)}
        onResponderRelease={() => setActiveIndex(null)}
        onResponderTerminate={() => setActiveIndex(null)}
      >
        {tooShortForLine ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-sm text-ink-500 dark:text-ink-400 text-center">
              Not enough history to draw a line yet.
            </Text>
            <Text className="text-xs text-ink-400 dark:text-ink-500 text-center mt-1.5">
              Switch to Bars to see the point you have.
            </Text>
          </View>
        ) : plot && width > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient
                id="financialChartFill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <Stop offset="0" stopColor={colors.accent} stopOpacity="0.28" />
                <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
              </LinearGradient>
            </Defs>

            {plot.anchorAtZero &&
            plot.zeroY >= PADDING.top &&
            plot.zeroY <= PADDING.top + plot.innerHeight ? (
              <Line
                x1={PADDING.left}
                y1={plot.zeroY}
                x2={width - PADDING.right}
                y2={plot.zeroY}
                stroke={colors.grid}
                strokeWidth={1}
              />
            ) : null}

            {chartType === 'line' ? (
              <>
                {plot.areaPath ? (
                  <Path
                    d={plot.areaPath}
                    fill="url(#financialChartFill)"
                  />
                ) : null}
                {plot.linePath ? (
                  <Path
                    d={plot.linePath}
                    stroke={colors.accent}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    fill="none"
                  />
                ) : null}
              </>

            ) : (
              plot.bars.map((bar, index) => (
                <Rect
                  key={series[index]?.date ?? index}
                  x={bar.x}
                  y={bar.y}
                  width={bar.width}
                  height={bar.height}
                  rx={Math.min(bar.width / 3, 4)}
                  fill={
                    includeZero && (series[index]?.valueCents ?? 0) < 0
                      ? colors.negative
                      : colors.accent
                  }
                  opacity={
                    activeIndex === null || activeIndex === index ? 0.9 : 0.35
                  }
                />
              ))
            )}

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
                {chartType === 'line' ? (
                  <Circle
                    cx={activePoint.x}
                    cy={activePoint.y}
                    r={5}
                    fill={colors.surface}
                    stroke={colors.accent}
                    strokeWidth={2.5}
                  />
                ) : null}
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>

      {/* With one point the min and max axis labels are the same number
          printed twice, and the date row is a single label pinned left. Both
          only make sense once there's a range to describe. */}
      {plot && !tooShortForLine ? (
        <>
          <View className="flex-row justify-between px-4">
            {tickIndices.map((index) => {
              const point = series[index];
              return point ? (
                <Text
                  key={`${point.date}-${index}`}
                  className="text-xs text-ink-400 dark:text-ink-500"
                >
                  {formatDate(point.date)}
                </Text>
              ) : null;
            })}
          </View>
          <View className="flex-row justify-between px-4 pt-1">
            <Text className="text-xs text-ink-400 dark:text-ink-500 tabular-nums">
              {formatMoneyCompact(plot.actualMin)}
            </Text>
            <Text className="text-xs text-ink-400 dark:text-ink-500 tabular-nums">
              {formatMoneyCompact(plot.actualMax)}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}
