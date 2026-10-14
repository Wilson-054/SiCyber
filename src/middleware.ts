import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/../utils/supabase/middleware'

const PUBLIC_PATHS = ['/login', '/signup']

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, supabase, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  // --- Belum login: hanya boleh akses /login dan /signup -------------
  if (!user) {
    if (isPublicPath(pathname)) return supabaseResponse
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  // --- Sudah login tapi masih buka /login atau /signup ---------------
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