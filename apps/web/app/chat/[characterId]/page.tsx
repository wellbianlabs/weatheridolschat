import { notFound } from 'next/navigation';

import { getCharacter } from '@wi/core/characters';

import ChatClient from './chat-client';

export default function ChatPage({ params }: { params: { characterId: string } }) {
  const character = getCharacter(params.characterId);
  if (!character) notFound();
  return <ChatClient character={character} />;
}
