// Save as: app/forgot-password/page.tsx

import Link from "next/link";
import { requestPasswordReset } from "@/app/auth/actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0D1117] px-6 text-[#E6EDF3]">
      <div className="w-full max-w-sm">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[#F0883E]">
          Pemulihan Akun
        </p>
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">Lupa password</h1>
        <p className="mb-8 text-sm leading-relaxed text-[#8B949E]">
          Masukkan email akunmu. Kami akan mengirim kode verifikasi untuk membuat password baru.
        </p>

        {error && (
          <div className="mb-6 rounded-md border border-[#F0883E]/40 bg-[#F0883E]/10 px-4 py-3 text-sm text-[#F0883E]">
            {error}
          </div>
        )}

        <form action={requestPasswordReset} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs uppercase tracking-wide text-[#8B949E]">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-[#21262D] bg-[#161B22] px-3 py-2 text-sm text-[#E6EDF3] outline-none focus:border-[#F0883E]"
            />
          </div>

          <button type="submit" className="w-full rounded-md bg-[#F0883E] px-4 py-2.5 text-sm font-medium text-[#0D1117] transition-colors hover:bg-[#F0883E]/90">
            Kirim Kode
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#8B949E]">
          Ingat passwordmu?{" "}
          <Link href="/login" className="text-[#F0883E] hover:underline">
            Masuk
          </Link>
        </p>
      </div>
    </main>
  );
}