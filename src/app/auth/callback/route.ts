import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

async function getOrigin(request: Request): Promise<string> {
  const headersList = await headers();
  const forwardedHost = headersList.get('x-forwarded-host');
  const forwardedProto = headersList.get('x-forwarded-proto') ?? 'https';
  const host = headersList.get('host');

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  if (host) {
    const proto = host.includes('localhost') ? 'http' : 'https';
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = await getOrigin(request);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/chat';
  const type = searchParams.get('type');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      if (type === 'recovery' || next === '/reset-password') {
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error('[/auth/callback] exchangeCodeForSession error:', error.message, error.status);
    const reason = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed&reason=${reason}`);
  }

  console.error('[/auth/callback] missing code param');
  return NextResponse.redirect(`${origin}/login?error=auth_failed&reason=missing_code`);
}

