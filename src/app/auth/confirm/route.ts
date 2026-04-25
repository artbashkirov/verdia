import { NextResponse, type NextRequest } from 'next/server';
import { headers } from 'next/headers';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

async function getOrigin(request: NextRequest): Promise<string> {
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

// Handles modern Supabase email links that use token_hash (verifyOtp flow).
// Unlike PKCE (/auth/callback), this works regardless of device/browser
// because it does not rely on a code_verifier cookie.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/chat';
  const origin = await getOrigin(request);

  if (!token_hash || !type) {
    console.error('[/auth/confirm] missing token_hash or type', { token_hash: !!token_hash, type });
    return NextResponse.redirect(`${origin}/login?error=auth_failed&reason=missing_params`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    console.error('[/auth/confirm] verifyOtp error:', error.message, error.status);
    const reason = encodeURIComponent(error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed&reason=${reason}`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
