import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/../utils/supabase/middleware'
import { PW_RESET_COOKIE, isResetCookieValid } from '@/../utils/auth-rules'

// Halaman yang boleh dibuka tanpa login. User yang SUDAH login dilempar ke /materi.
const PUBLIC_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password']

// Hanya bisa dibuka tepat setelah kode reset password diverifikasi.
const NEW_PASSWORD_PATH = '/new-password'

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, supabase, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  // --- Belum login: hanya boleh akses halaman publik -----------------
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

  // --- /new-password: wajib punya cookie penanda hasil verifikasi kode.
  //     Tanpa itu (mis. user login biasa), kembalikan ke /materi. Halaman ini
  //     juga dilewatkan dari gate onboarding supaya tidak terpental.
  if (pathname === NEW_PASSWORD_PATH) {
    const marker = request.cookies.get(PW_RESET_COOKIE)?.value
    if (isResetCookieValid(marker, user.id)) return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = '/materi'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // --- Sudah login tapi masih buka halaman publik --------------------
  if (isPublicPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/materi'
    return NextResponse.redirect(url)
  }

  // --- Biarkan halaman onboarding lolos, biar tidak redirect loop ----
  if (pathname === '/onboarding') return supabaseResponse

  // --- Sudah login: wajib sudah pernah selesai onboarding quiz -------
  const { data: onboarding } = await supabase
    .from('quiz_results')
    .select('id')
    .eq('user_id', user.id)
    .eq('kind', 'interest')
    .limit(1)

  if (!onboarding || onboarding.length === 0) {
    const url = request.nextUrl.clone()
    url.pathname = '/onboarding'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}