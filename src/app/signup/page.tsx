// Save as: app/signup/page.tsx

import Link from "next/link";
import { signup } from "@/app/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/../utils/auth-rules";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0D1117] px-6 text-[#E6EDF3]">
      <div className="w-full max-w-sm">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[#F0883E]">
          Buat Akun
        </p>
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">
          Mulai belajar keamanan aplikasi web
        </h1>

        {error && (
          <div className="mb-6 rounded-md border border-[#F0883E]/40 bg-[#F0883E]/10 px-4 py-3 text-sm text-[#F0883E]">
            {error}
          </div>
        )}

        <form action={signup} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block text-xs uppercase tracking-wide text-[#8B949E]"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              autoComplete="username"
              className="w-full rounded-md border border-[#21262D] bg-[#161B22] px-3 py-2 text-sm text-[#E6EDF3] outline-none focus:border-[#F0883E]"
            />
          </div>
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs uppercase tracking-wide text-[#8B949E]"
            >
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
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs uppercase tracking-wide text-[#8B949E]"
            >
              Password
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

          <button
            type="submit"
            className="w-full rounded-md bg-[#F0883E] px-4 py-2.5 text-sm font-medium text-[#0D1117] transition-colors hover:bg-[#F0883E]/90"
          >
            Daftar
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#8B949E]">
          Sudah punya akun?{" "}
          <Link href="/login" className="text-[#F0883E] hover:underline">
            Masuk
          </Link>
        </p>
      </div>
    </main>
  );
}