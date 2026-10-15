// Save as: app/reset-password/page.tsx

import Link from "next/link";
import { requestPasswordReset, verifyResetCode } from "@/app/auth/actions";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; sent?: string; error?: string }>;
}) {
  const { email = "", sent, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0D1117] px-6 text-[#E6EDF3]">
      <div className="w-full max-w-sm">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[#F0883E]">
          Pemulihan Akun
        </p>
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">Masukkan kode</h1>

        {sent === "1" && !error && (
          <div className="mb-6 rounded-md border border-[#21262D] bg-[#161B22] px-4 py-3 text-sm leading-relaxed text-[#8B949E]">
            Jika email terdaftar, kode verifikasi sudah dikirim. Cek juga folder spam. Kalau belum masuk, tunggu sekitar 1 menit sebelum kirim ulang.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-md border border-[#F0883E]/40 bg-[#F0883E]/10 px-4 py-3 text-sm text-[#F0883E]">
            {error}
          </div>
        )}

        <form action={verifyResetCode} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs uppercase tracking-wide text-[#8B949E]">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={email}
              autoComplete="email"
              className="w-full rounded-md border border-[#21262D] bg-[#161B22] px-3 py-2 text-sm text-[#E6EDF3] outline-none focus:border-[#F0883E]"
            />
          </div>
          <div>
            <label htmlFor="code" className="mb-1.5 block text-xs uppercase tracking-wide text-[#8B949E]">
              Kode verifikasi
            </label>
            <input
              id="code"
              name="code"
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,12}"
              minLength={6}
              maxLength={12}
              className="w-full rounded-md border border-[#21262D] bg-[#161B22] px-3 py-2 text-sm text-[#E6EDF3] outline-none focus:border-[#F0883E] font-mono tracking-[0.3em]"
            />
          </div>

          <button type="submit" className="w-full rounded-md bg-[#F0883E] px-4 py-2.5 text-sm font-medium text-[#0D1117] transition-colors hover:bg-[#F0883E]/90">
            Verifikasi
          </button>
        </form>

        {email && (
          <form action={requestPasswordReset} className="mt-4">
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              className="w-full text-center text-sm text-[#8B949E] hover:text-[#F0883E]"
            >
              Belum menerima kode? Kirim ulang
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-[#8B949E]">
          <Link href="/login" className="text-[#F0883E] hover:underline">
            Kembali ke halaman masuk
          </Link>
        </p>
      </div>
    </main>
  );
}