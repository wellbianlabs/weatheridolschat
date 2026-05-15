import { Image, Linking, Pressable, Text, View } from 'react-native';

import type { ProductPayload } from '@wi/core/chat';

export default function ProductCard({
  product,
  accent,
  from,
}: {
  product: ProductPayload;
  accent: string;
  from: string;
}) {
  return (
    <View
      className="w-full max-w-[280px] overflow-hidden rounded-2xl border bg-white"
      style={{ borderColor: `${accent}66` }}
    >
      <View className="px-4 pt-3">
        <Text className="text-[10px] uppercase tracking-widest" style={{ color: accent }}>
          {from}의 추천 ✨
        </Text>
      </View>
      <Image source={{ uri: product.imageUrl }} className="aspect-[16/9] w-full" resizeMode="cover" />
      <View className="space-y-1 px-4 py-3">
        <Text className="text-sm font-semibold">{product.title}</Text>
        <Text className="text-sm font-bold" style={{ color: accent }}>
          {product.price.toLocaleString('ko-KR')}원
        </Text>
        <Pressable
          onPress={() => {
            void Linking.openURL(product.ctaUrl);
          }}
          className="mt-2 rounded-lg py-2"
          style={{ backgroundColor: accent }}
        >
          <Text className="text-center text-xs font-semibold text-white">지금 보기</Text>
        </Pressable>
        <Text className="pt-1 text-[10px] text-neutral-400">광고 · Nasmedia mock</Text>
      </View>
    </View>
  );
}
