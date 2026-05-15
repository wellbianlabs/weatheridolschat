-- Seed the 4 Prism Station members.
-- system_prompt and image_base_prompt are abbreviated; full prompts also live
-- in packages/ai/src/prompts/. DB copies allow runtime hot-patches without
-- redeploy.

insert into public.characters
  (id, display_name, display_name_en, motif, origin_region, accent_color, short_bio,
   system_prompt, image_base_prompt, seed, recommendation_domains, sort_order)
values
  ('sunny', '써니', 'Sunny', 'sunny', '부산 해운대', '#FFB347',
   '절망마저 태워버리는 강렬한 주파수',
   '캐릭터 시스템 프롬프트는 packages/ai/src/prompts/system/sunny.ts 참조. 본 컬럼은 운영 hot-patch용 사본.',
   'A 20-year-old female K-pop idol, honey-blonde wavy hair, radiant smile, athletic build.',
   11000, ARRAY['outdoor','fitness','beauty','food']::text[], 1),
  ('rain', '레인', 'Rain', 'rain', '일본 가나자와', '#6BA8FF',
   '세상의 소음을 씻어내리는 촉촉한 목소리',
   '캐릭터 시스템 프롬프트는 packages/ai/src/prompts/system/rain.ts 참조.',
   'A 19-year-old female K-pop idol, long midnight-blue straight hair, calm serene expression.',
   22000, ARRAY['cafe','healing','music','book']::text[], 2),
  ('cloudy', '클라우디', 'Cloudy', 'cloud', '강원도 춘천', '#A8B5CF',
   '정형화되지 않은 자유롭고 몽환적인 상상력',
   '캐릭터 시스템 프롬프트는 packages/ai/src/prompts/system/cloudy.ts 참조.',
   'An 18-year-old female K-pop idol, short ash-blue pixie-bob, faux freckles, dreamy eyes.',
   33000, ARRAY['art','photo_spot','stationery','cafe']::text[], 3),
  ('thunder', '썬더', 'Thunder', 'thunder', '상파울루 · 이태원', '#A06CFF',
   '비바람 속에서도 굴하지 않는 폭발적 퍼포먼스',
   '캐릭터 시스템 프롬프트는 packages/ai/src/prompts/system/thunder.ts 참조.',
   'A 21-year-old female K-pop idol, wolf-cut gray-to-purple hair, intense charismatic gaze.',
   44000, ARRAY['delivery','game','streetwear','workout']::text[], 4)
on conflict (id) do update set
  display_name = excluded.display_name,
  display_name_en = excluded.display_name_en,
  motif = excluded.motif,
  origin_region = excluded.origin_region,
  accent_color = excluded.accent_color,
  short_bio = excluded.short_bio,
  recommendation_domains = excluded.recommendation_domains,
  sort_order = excluded.sort_order;
