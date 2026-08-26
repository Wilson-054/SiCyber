// Save as: app/components/AuthNav.tsx
// Drop <AuthNav /> into your app/layout.tsx header. It's a Server
// Component, so it reads the session directly — no client-side flicker.

import Link from "next/link";
import { createClient } from '@/../utils/supabase/server'
import { logout } from "@/app/auth/actions";

export default async function AuthNav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <nav className="flex items-center gap-4 text-sm">
      <Link href="/materi" className="text-[#8B949E] hover:text-[#E6EDF3]">
        Materi
      </Link>
      {user ? (
        <form action={logout}>
          <button
            type="submit"
            className="text-[#8B949E] hover:text-[#F0883E]"
          >
            Keluar
          </button>
        </form>
      ) : (
        <Link href="/login" className="text-[#8B949E] hover:text-[#F0883E]">
          Masuk
        </Link>
      )}
    </nav>
  );
}