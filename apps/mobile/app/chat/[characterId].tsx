import Constants from 'expo-constants';
import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCharacter } from '@wi/core/characters';
import type { ProductPayload } from '@wi/core/chat';
import type { WeatherSnapshot } from '@wi/core/weather';

import ProductCard from '@/components/ProductCard';
import WeatherBackground from '@/components/WeatherBackground';
import { bumpTodayCount, getItem, getJSON, getTodayCount, setJSON } from '@/lib/storage';

type MessageKind = 'text' | 'image' | 'product';
interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  kind: MessageKind;
  content?: string;
  imageUrl?: string;
  product?: ProductPayload;
  pending?: boolean;
}

const MAX_FREE_MESSAGES = 30;

const WEATHER_LABEL: Record<string, string> = {
  clear: '맑음',
  clouds: '흐림',
  rain: '비',
  drizzle: '이슬비',
  thunder: '천둥',
  snow: '눈',
  mist: '안개',
};

const SHORTCUTS = [
  { id: 'selfie', icon: '📷', label: '셀카', text: '오늘 셀카 보여줘!' },
  { id: 'recommend', icon: '🎁', label: '추천', text: '오늘 뭐 추천해줄래?' },
  { id: 'song', icon: '🎵', label: '노래', text: '오늘 어울리는 노래 추천해줘' },
];

const API_BASE =
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  'http://localhost:3000';

export default function ChatScreen() {
  const { characterId } = useLocalSearchParams<{ characterId: string }>();
  const character = characterId ? getCharacter(characterId) : undefined;

  const initialMessages: UIMessage[] = character
    ? [
        {
          id: 'welcome',
          role: 'assistant',
          kind: 'text',
          content: `안녕! 나는 ${character.displayName}. 첫 인사 보내봐 ✨`,
        },
      ]
    : [];

  const [nickname, setNickname] = useState('친구');
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [usage, setUsage] = useState(0);
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (!character) return;
    void (async () => {
      const n = await getItem('wi.nickname');
      if (n) setNickname(n);
      const prior = await getJSON<UIMessage[]>(`wi.chat.${character.id}`);
      if (prior && prior.length > 0) setMessages(prior);
      setUsage(await getTodayCount());
    })();
  }, [character]);

  useEffect(() => {
    if (!character) return;
    void setJSON(`wi.chat.${character.id}`, messages.slice(-50));
  }, [character, messages]);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/weather?lat=37.498&lng=127.028&label=서울 강남구`)
      .then((r) => r.json())
      .then((w: WeatherSnapshot) => {
        if (alive) setWeather(w);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  if (!character) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-brand-paper">
        <Text>Character not found</Text>
        <Link href="/">홈으로</Link>
      </SafeAreaView>
    );
  }

  async function send(text: string) {
    if (!text || sending || !character) return;
    if ((await getTodayCount()) >= MAX_FREE_MESSAGES) {
      setPaywallOpen(true);
      return;
    }
    setInput('');
    setSending(true);

    const userId = `u_${Date.now()}`;
    const assistantId = `a_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', kind: 'text', content: text },
      { id: assistantId, role: 'assistant', kind: 'text', content: '', pending: true },
    ]);

    let imageIntentTriggered = false;
    let productCard: ProductPayload | null = null;

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: character.id, text, nickname }),
      });
      const raw = await res.text();
      let assistant = '';
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;
        try {
          const evt = JSON.parse(payload) as {
            type: string;
            delta?: string;
            name?: string;
            payload?: { kind?: string } & Record<string, unknown>;
          };
          if (evt.type === 'token' && evt.delta) {
            assistant += evt.delta;
          } else if (evt.type === 'tool' && evt.name === 'request_image') {
            imageIntentTriggered = true;
          } else if (evt.type === 'attachment' && evt.payload?.kind === 'product') {
            productCard = evt.payload as unknown as ProductPayload;
          }
        } catch {
          /* partial */
        }
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: assistant || '…', pending: false }
            : m,
        ),
      );
      setUsage(await bumpTodayCount());

      if (productCard) {
        setMessages((prev) => [
          ...prev,
          {
            id: `p_${Date.now()}`,
            role: 'assistant',
            kind: 'product',
            product: productCard ?? undefined,
          },
        ]);
      }

      if (imageIntentTriggered) {
        const imageId = `i_${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          { id: imageId, role: 'assistant', kind: 'image', pending: true },
        ]);
        try {
          const imgRes = await fetch(`${API_BASE}/api/image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              characterId: character.id,
              userPrompt: text,
              intent: 'selfie',
            }),
          });
          const data = (await imgRes.json()) as { imageUrl?: string };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === imageId ? { ...m, imageUrl: data.imageUrl, pending: false } : m,
            ),
          );
        } catch {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === imageId
                ? { ...m, kind: 'text', content: '(이미지를 보내지 못했어요)', pending: false }
                : m,
            ),
          );
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: '연결이 끊어졌어요.', pending: false }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <WeatherBackground condition={weather?.condition ?? 'clear'}>
      <SafeAreaView className="flex-1" edges={['top']}>
        <View
          className="flex-row items-center justify-between border-b bg-white/85 px-4 py-3"
          style={{ borderColor: `${character.accentColor}33` }}
        >
          <Link href="/" className="text-sm text-neutral-500">
            ← 홈
          </Link>
          <View className="items-center">
            <Text className="text-base font-bold" style={{ color: character.accentColor }}>
              {character.displayName}
            </Text>
            <Text className="text-[11px] text-neutral-500">
              {weather
                ? `${weather.location.label} · ${weather.temperatureC}°C · ${WEATHER_LABEL[weather.condition] ?? weather.condition}`
                : character.originRegion}
            </Text>
          </View>
          <Text className="w-12 text-right text-[11px] text-neutral-400">
            {usage}/{MAX_FREE_MESSAGES}
          </Text>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          className="flex-1"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
          <ScrollView ref={scrollRef} className="flex-1 px-4" contentContainerClassName="py-4 gap-3">
            {messages.map((m) => {
              if (m.kind === 'image') {
                return (
                  <View
                    key={m.id}
                    className="self-start overflow-hidden rounded-2xl border bg-white"
                    style={{ borderColor: `${character.accentColor}55` }}
                  >
                    {m.pending ? (
                      <View className="h-64 w-64 items-center justify-center bg-neutral-100">
                        <Text className="text-sm text-neutral-500">··· 사진 준비 중</Text>
                      </View>
                    ) : (
                      <Image
                        source={{ uri: m.imageUrl }}
                        className="h-64 w-64"
                        resizeMode="cover"
                      />
                    )}
                  </View>
                );
              }
              if (m.kind === 'product' && m.product) {
                return (
                  <View key={m.id} className="self-start">
                    <ProductCard
                      product={m.product}
                      accent={character.accentColor}
                      from={character.displayName}
                    />
                  </View>
                );
              }
              return (
                <View
                  key={m.id}
                  className={`max-w-[80%] rounded-xl px-4 py-2 ${
                    m.role === 'user' ? 'self-end' : 'self-start border bg-white/95'
                  }`}
                  style={
                    m.role === 'user'
                      ? { backgroundColor: character.accentColor }
                      : { borderColor: `${character.accentColor}33` }
                  }
                >
                  <Text style={{ color: m.role === 'user' ? '#fff' : '#0F0F14' }}>
                    {m.pending && !m.content ? '···' : m.content}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          <View className="bg-white/90 px-3 pt-2">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              {SHORTCUTS.map((s) => (
                <Pressable
                  key={s.id}
                  disabled={sending}
                  onPress={() => void send(s.text)}
                  className="mr-2 flex-row items-center gap-1 rounded-pill border bg-neutral-50 px-3 py-1"
                  style={{ borderColor: `${character.accentColor}55`, opacity: sending ? 0.4 : 1 }}
                >
                  <Text className="text-xs">{s.icon}</Text>
                  <Text className="text-xs text-neutral-700">{s.label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View className="flex-row items-center gap-2 pb-3">
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="메시지를 입력하세요"
                editable={!sending}
                className="flex-1 rounded-lg border bg-neutral-50 px-3 py-2"
                returnKeyType="send"
                onSubmitEditing={() => void send(input.trim())}
              />
              <Pressable
                disabled={sending || !input.trim()}
                onPress={() => void send(input.trim())}
                className="rounded-lg px-4 py-2"
                style={{
                  backgroundColor: character.accentColor,
                  opacity: sending || !input.trim() ? 0.4 : 1,
                }}
              >
                <Text className="text-sm font-semibold text-white">보내기</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>

        <Modal visible={paywallOpen} transparent animationType="slide">
          <View className="flex-1 justify-end bg-black/40">
            <View className="rounded-t-2xl bg-white p-6">
              <Text className="text-lg font-bold">
                {character.displayName}랑 더 깊게 이야기하려면 ✨
              </Text>
              <Text className="mt-2 text-sm text-neutral-600">
                오늘 무료 메시지를 모두 썼어요. 프리미엄으로 무제한 대화 + 깊이 있는 모델로
                이어가요.
              </Text>
              <View className="mt-3 gap-1">
                <Text className="text-sm text-neutral-700">· 메시지 무제한</Text>
                <Text className="text-sm text-neutral-700">· 깊이 있는 Claude 모델</Text>
                <Text className="text-sm text-neutral-700">· 이미지 50/일, 장기 기억, 광고 제거</Text>
              </View>
              <View className="mt-5 flex-row gap-2">
                <Pressable
                  onPress={() => setPaywallOpen(false)}
                  className="flex-1 rounded-lg border px-4 py-2"
                >
                  <Text className="text-center text-sm">다음에</Text>
                </Pressable>
                <Pressable
                  onPress={() => setPaywallOpen(false)}
                  className="flex-1 rounded-lg px-4 py-2"
                  style={{ backgroundColor: character.accentColor }}
                >
                  <Text className="text-center text-sm font-semibold text-white">관심 등록</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </WeatherBackground>
  );
}
