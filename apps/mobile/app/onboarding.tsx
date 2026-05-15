import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getItem, setItem } from '@/lib/storage';

export default function OnboardingScreen() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');

  useEffect(() => {
    void (async () => {
      const existing = await getItem('wi.nickname');
      if (existing) setNickname(existing);
    })();
  }, []);

  async function complete() {
    const v = nickname.trim();
    if (!v) return;
    await setItem('wi.nickname', v);
    await setItem('wi.onboarded', '1');
    router.replace('/');
  }

  return (
    <SafeAreaView className="flex-1 bg-brand-paper">
      <View className="flex-1 justify-center px-6">
        <Text className="text-xs uppercase tracking-widest text-brand-primary">
          PRISM STATION
        </Text>
        <Text className="mt-2 text-3xl font-bold leading-tight">뭐라고{'\n'}부르면 좋을까?</Text>
        <Text className="mt-3 text-sm text-neutral-500">
          4명의 아이돌이 너를 부를 닉네임이 필요해.
        </Text>

        <TextInput
          autoFocus
          value={nickname}
          onChangeText={setNickname}
          placeholder="예: 창민"
          maxLength={20}
          className="mt-8 rounded-lg border bg-white px-4 py-3 text-lg"
          returnKeyType="done"
          onSubmitEditing={complete}
        />

        <Pressable
          disabled={!nickname.trim()}
          onPress={complete}
          className="mt-4 rounded-lg bg-brand-primary px-4 py-3"
          style={{ opacity: nickname.trim() ? 1 : 0.4 }}
        >
          <Text className="text-center text-sm font-semibold text-white">시작하기 →</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
