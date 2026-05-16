import Link from 'next/link';

import { Eyebrow } from '@wi/ui/web';

import LoginForm from './login-form';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12 bg-dreamy-vertical">
      <Link
        href="/"
        className="mb-8 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink"
      >
        ← Home
      </Link>

      <Eyebrow>★ Sign in</Eyebrow>
      <h1 className="mt-3 font-display text-4xl font-medium leading-tight tracking-tight text-brand-ink">
        다시 만나서 반가워.
      </h1>
      <p className="mt-3 font-sans text-[15px] leading-relaxed text-brand-ink-soft">
        이메일로 보내드리는 매직 링크 한 번이면 로그인돼요.
        비밀번호를 따로 만들 필요는 없어요.
      </p>

      <div className="mt-8">
        {configured ? (
          <LoginForm />
        ) : (
          <div className="rounded-2xl border border-dashed border-brand-ink/20 bg-white/50 p-5 font-sans text-[13px] leading-relaxed text-brand-ink-soft">
            로그인이 아직 설정되지 않았어요. <code>NEXT_PUBLIC_SUPABASE_URL</code> 과{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> 환경변수를 Vercel에 추가하고
            재배포하면 활성화됩니다.
          </div>
        )}
      </div>

      <p className="mt-12 font-sans text-[12px] leading-relaxed text-brand-ink-soft">
        로그인 없이도 캐릭터들과 대화는 가능해요. 셀카 / 날씨송 / 음성 듣기 같은
        프리미엄 기능을 쓰려면 계정이 필요합니다.
      </p>
    </main>
  );
}
