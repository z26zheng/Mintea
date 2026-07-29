import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tagColor, type TagRow } from '@mintea/core';

/**
 * A tag as it appears on a transaction.
 *
 * The colour is carried by a dot rather than the whole chip: a row can hold
 * several tags next to a category and an amount, and filling each chip with a
 * saturated colour makes the row unreadable.
 */
export function TagChip({
  tag,
  size = 'base',
  onRemove,
}: {
  tag: TagRow;
  size?: 'sm' | 'base';
  onRemove?: () => void;
}) {
  const compact = size === 'sm';

  return (
    <View
      className={`flex-row items-center rounded-full border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800 shrink-0 ${
        compact ? 'px-1.5 py-0.5 gap-1' : 'px-2.5 py-1 gap-1.5'
      }`}
    >
      <View
        style={{ backgroundColor: tagColor(tag) }}
        className={compact ? 'w-1.5 h-1.5 rounded-full' : 'w-2 h-2 rounded-full'}
      />
      <Text
        numberOfLines={1}
        className={`${
          compact ? 'text-xs' : 'text-sm'
        } text-ink-700 dark:text-ink-200`}
      >
        {tag.name}
      </Text>

      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove tag ${tag.name}`}
        >
          <Ionicons name="close" size={compact ? 11 : 13} color="#74808E" />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Horizontal run of tags, used on transaction rows and detail headers. */
export function TagList({
  tags,
  size = 'sm',
  max,
}: {
  tags: TagRow[];
  size?: 'sm' | 'base';
  /** Caps how many render; the rest collapse into a "+N" chip. */
  max?: number;
}) {
  if (tags.length === 0) return null;

  const shown = max ? tags.slice(0, max) : tags;
  const hidden = tags.length - shown.length;

  return (
    <View className="flex-row items-center gap-1 flex-wrap">
      {shown.map((tag) => (
        <TagChip key={tag.id} tag={tag} size={size} />
      ))}
      {hidden > 0 ? (
        <Text className="text-xs text-ink-400 dark:text-ink-500">
          +{hidden}
        </Text>
      ) : null}
    </View>
  );
}
