-- Seed initial quests for Phase 1.

insert into public.quests (id, title, description, reward_tokens, kind, active) values
  ('daily_login',       '오늘 출석체크',          '하루 한 번 앱에 접속하면 보상.',                    5,   'daily_login',    true),
  ('first_hello',       '캐릭터 4명에게 인사',     '써니/레인/클라우디/썬더 모두에게 한 번씩 인사하기.',   30,  'first_hello',    true),
  ('weather_report',    '오늘 날씨 제보',         '현재 위치의 날씨와 사진을 함께 제보하기.',           30,  'weather_report', true),
  ('invite_friend',     '친구 초대',              '초대 코드로 가입 완료된 친구 1명당 보상.',          100, 'invite_friend',  true),
  ('chat_streak_3',     '3일 연속 대화',          '연속 3일 동안 캐릭터와 대화하기.',                  50,  'chat_streak',    true)
on conflict (id) do nothing;
