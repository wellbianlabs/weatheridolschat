import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    /* swallow */
  }
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const raw = await getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJSON<T>(key: string, value: T): Promise<void> {
  await setItem(key, JSON.stringify(value));
}

export async function getTodayCount(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const storedDay = await getItem('wi.usage.day');
  if (storedDay !== today) {
    await setItem('wi.usage.day', today);
    await setItem('wi.usage.messagesToday', '0');
    return 0;
  }
  const c = await getItem('wi.usage.messagesToday');
  return c ? Number.parseInt(c, 10) : 0;
}

export async function bumpTodayCount(): Promise<number> {
  const n = (await getTodayCount()) + 1;
  await setItem('wi.usage.messagesToday', String(n));
  return n;
}
