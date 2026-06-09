import React, { ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, ListRenderItem, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Card } from '../common/Card';
import { colors, spacing } from '../../theme';

interface AdminPagedListProps<T> {
  data: T[];
  emptyState: ReactElement;
  keyExtractor: (item: T, index: number) => string;
  renderItem: ListRenderItem<T>;
  headerComponent?: ReactElement | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
  pageSize?: number;
}

export function AdminPagedList<T>({
  data,
  emptyState,
  keyExtractor,
  renderItem,
  headerComponent,
  contentContainerStyle,
  pageSize = 20,
}: AdminPagedListProps<T>) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [data.length, pageSize]);

  const visibleData = useMemo(() => data.slice(0, visibleCount), [data, visibleCount]);
  const hasMore = visibleCount < data.length;

  const handleEndReached = useCallback(() => {
    if (!hasMore) {
      return;
    }

    setVisibleCount((current) => Math.min(current + pageSize, data.length));
  }, [data.length, hasMore, pageSize]);

  if (data.length === 0) {
    return (
      <FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={headerComponent}
        ListEmptyComponent={emptyState}
        keyExtractor={(_, index) => `empty-${index}`}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <FlatList
      data={visibleData}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={headerComponent}
      ListFooterComponent={
        hasMore ? (
          <View style={styles.footerWrap}>
            <Card style={styles.footerCard}>
              <Text style={styles.footerText}>{`Showing ${visibleData.length} of ${data.length} records. Scroll to load more.`}</Text>
            </Card>
          </View>
        ) : null
      }
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
      initialNumToRender={pageSize}
      maxToRenderPerBatch={pageSize}
      windowSize={5}
      updateCellsBatchingPeriod={50}
      removeClippedSubviews={false}
      onEndReachedThreshold={0.35}
      onEndReached={handleEndReached}
    />
  );
}

const styles = StyleSheet.create({
  footerWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  footerCard: {
    backgroundColor: colors.surfaceMuted,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
});
