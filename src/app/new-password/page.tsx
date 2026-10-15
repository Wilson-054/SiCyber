// Save as: app/new-password/page.tsx
//
// Halaman ini dijaga middleware.ts DAN aksi updatePassword: hanya bisa dibuka
// tepat setelah kode reset diverifikasi (cookie penanda, berlaku 10 menit).

import { updatePassword } from "@/app/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/../utils/auth-rules";

export default async function NewPasswordPage({
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
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">Buat password baru</h1>

        {error && (
          <div className="mb-6 rounded-md border border-[#F0883E]/40 bg-[#F0883E]/10 px-4 py-3 text-sm text-[#F0883E]">
            {error}
          </div>
        )}

        <form action={updatePassword} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs uppercase tracking-wide text-[#8B949E]">
              Password baru
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="w-full rounded-md border border-[#21262D] bg-[#161B22] px-3 py-2 text-sm text-[#E6EDF3] outline-none focus:border-[#F0883E]"
            />
            <p className="mt-1 text-xs text-[#8B949E]">Minimal {MIN_PASSWORD_LENGTH} karakter.</p>
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1.5 block text-xs uppercase tracking-wide text-[#8B949E]">
              Ulangi password baru
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="w-full rounded-md border border-[#21262D] bg-[#161B22] px-3 py-2 text-sm text-[#E6EDF3] outline-none focus:border-[#F0883E]"
            />
          </div>

          <button type="submit" className="w-full rounded-md bg-[#F0883E] px-4 py-2.5 text-sm font-medium text-[#0D1117] transition-colors hover:bg-[#F0883E]/90">
            Simpan Password
          </button>
        </form>
      </div>
    </main>
  );
}