import { useEffect, useRef, useState } from 'react';
import { FlatList } from 'react-native';
import { spacing } from '../theme/colors';
import { AdBanner } from './AdBanner';

const CARD_WIDTH = 280;
const CARD_GAP = spacing.sm;
const SLIDE_WIDTH = CARD_WIDTH + CARD_GAP;
const AUTO_SCROLL_INTERVAL = 4000;

const listContentStyle = { paddingRight: spacing.md };
const cardStyle = { marginRight: CARD_GAP };
const viewabilityConfig = { itemVisiblePercentThreshold: 60 };

export function AdCarousel({ ads }) {
  const flatListRef = useRef(null);
  const indexRef = useRef(0);
  const timerRef = useRef(null);
  const [activeId, setActiveId] = useState(ads[0]?.id);

  const startAutoScroll = () => {
    clearInterval(timerRef.current);
    if (ads.length < 2) return;
    timerRef.current = setInterval(() => {
      const nextIndex = (indexRef.current + 1) % ads.length;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }, AUTO_SCROLL_INTERVAL);
  };

  useEffect(() => {
    startAutoScroll();
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ads.length]);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      indexRef.current = viewableItems[0].index ?? 0;
      setActiveId(viewableItems[0].item.id);
    }
  }).current;

  return (
    <FlatList
      ref={flatListRef}
      data={ads}
      keyExtractor={(item) => item.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={listContentStyle}
      getItemLayout={(_, index) => ({ length: SLIDE_WIDTH, offset: SLIDE_WIDTH * index, index })}
      onScrollBeginDrag={() => clearInterval(timerRef.current)}
      onMomentumScrollEnd={startAutoScroll}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      renderItem={({ item }) => (
        <AdBanner ad={item} isActive={item.id === activeId} style={cardStyle} />
      )}
    />
  );
}
