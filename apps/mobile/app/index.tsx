import { Link, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CHARACTER_LIST } from '@wi/core/characters';

import { getItem } from '@/lib/storage';

export default function CharactersScreen() {
  const router = useRouter();
  const [nickname, setNickname] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const stored = await getItem('wi.nickname');
      if (!stored) {
        router.replace('/onboarding');
        return;
      }
      setNickname(stored);
    })();
  }, [router]);

  if (!nickname) {
    return <SafeAreaView className="flex-1 bg-brand-paper" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-brand-paper">
      <ScrollView contentContainerClassName="px-5 pb-10 pt-4">
        <Text className="text-xs uppercase tracking-widest text-brand-primary">PRISM STATION</Text>
        <Text className="mt-2 text-2xl font-bold text-brand-ink">
          {nickname}, 오늘 누구랑 얘기할까?
        </Text>
        <Text className="mt-1 text-sm text-neutral-500">탭하면 1:1 채팅으로 이동합니다.</Text>

        <View className="mt-6 flex-row flex-wrap -mx-2">
          {CHARACTER_LIST.map((c) => (
            <View key={c.id} className="w-1/2 p-2">
              <Link href={`/chat/${c.id}`} asChild>
                <Pressable
                  className="overflow-hidden rounded-2xl border bg-white p-4"
                  style={{ borderColor: `${c.accentColor}55` }}
                >
                  <View
                    className="absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-30"
                    style={{ backgroundColor: c.accentColor }}
                  />
                  <View
                    className="mb-3 h-1.5 w-12 rounded-full"
                    style={{ backgroundColor: c.accentColor }}
                  />
                  <Text className="text-xl font-bold" style={{ color: c.accentColor }}>
                    {c.displayName}
                  </Text>
                  <Text className="mt-0.5 text-[10px] uppercase tracking-widest text-neutral-400">
                    {c.displayNameEn} · {c.originRegion}
                  </Text>
                  <Text className="mt-2 text-xs leading-snug text-neutral-700">{c.shortBio}</Text>
                </Pressable>
              </Link>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
