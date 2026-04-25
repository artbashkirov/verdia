import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const CASES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CASES === 'true';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cases flow is gated behind NEXT_PUBLIC_FEATURE_CASES.
  // When the flag is off, redirect UI routes and 404 the API.
  if (!CASES_ENABLED) {
    if (pathname === '/cases' || pathname.startsWith('/cases/')) {
      const url = request.nextUrl.clone();
      url.pathname = '/chat';
      url.search = '';
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith('/api/cases')) {
      return new NextResponse(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api routes (general)
     * - public files
     * Plus explicitly include /api/cases for feature-flag gating.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '/api/cases/:path*',
  ],
};
