import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/../utils/supabase/middleware'
import { PW_RESET_COOKIE, isResetCookieValid } from '@/../utils/auth-rules'

const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password']

const NEW_PASSWORD_PATH = '/new-password'
const ONBOARDED_COOKIE = 'onboarded'

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, supabase, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  if (!user) {
    if (isPublicPath(pathname)) return supabaseResponse
    const url = request.nextUrl.clone()
    if (pathname === NEW_PASSWORD_PATH) {
      url.pathname = '/forgot-password'
      url.search = ''
      return NextResponse.redirect(url)
    }
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  if (pathname === NEW_PASSWORD_PATH) {
    const marker = request.cookies.get(PW_RESET_COOKIE)?.value
    if (isResetCookieValid(marker, user.id)) return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = '/materi'
    url.search = ''
    return NextResponse.redirect(url)
  }
  if (isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/materi'
    return NextResponse.redirect(url)
  }

  if (pathname === '/onboarding') return supabaseResponse

  // Fast path: onboarding already verified for this user, skip the DB call
  if (request.cookies.get(ONBOARDED_COOKIE)?.value === user.id) {
    return supabaseResponse
  }

  const { data: onboarding, error: onboardingError } = await supabase
    .from('quiz_results')
    .select('id, quizzes!inner(kind)')
    .eq('user_id', user.id)
    .eq('quizzes.kind', 'interest')
    .limit(1)

  if (onboardingError) {
    console.error('[middleware] gagal cek onboarding', onboardingError)
    return supabaseResponse
  }

  if (!onboarding || onboarding.length === 0) {
    const url = request.nextUrl.clone()
    url.pathname = '/onboarding'
    return NextResponse.redirect(url)
  }

  supabaseResponse.cookies.set(ONBOARDED_COOKIE, user.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}