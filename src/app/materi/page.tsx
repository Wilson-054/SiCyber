
  import Link from "next/link";
  import { createClient } from '@/../utils/supabase/server'
  import { logout } from "@/app/auth/actions";

  export const revalidate = 3600;

  type Category = {
    id: string;
    code: string;
    name: string;
    description: string | null;
    owasp_rank: number | null;
    order_index: number;
  };

  export default async function MateriPage() {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: categories, error } = await supabase
      .from("categories")
      .select("id, code, name, description, owasp_rank, order_index")
      .order("order_index", { ascending: true });

    return (
      <main className="min-h-screen bg-[#0D1117] text-[#E6EDF3]">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <div className="mb-6 flex items-center justify-end gap-3 text-sm">
            {user && (
              <span className="text-[#8B949E]">
                Masuk sebagai <span className="text-[#E6EDF3]">{user.email}</span>
              </span>
            )}
               {user && (
              <Link
                href="/sertifikat"
                className="rounded-md border border-[#21262D] px-3 py-1.5 text-xs font-medium text-[#8B949E] transition-colors hover:border-[#F0883E]/50 hover:text-[#F0883E]"
              >
                Sertifikat Saya
              </Link>
            )}
            <form action={logout}>
              <button
                type="submit"
                className="rounded-md border border-[#21262D] px-3 py-1.5 text-xs font-medium text-[#8B949E] transition-colors hover:border-[#F0883E]/50 hover:text-[#F0883E]"
              >
                Keluar
              </button>
            </form>
          </div>

          <header className="mb-12 border-b border-[#21262D] pb-8">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[#F0883E]">
              OWASP Top 10 · 2025
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-[#E6EDF3]">
              Jalur Belajar Keamanan Aplikasi Web
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#8B949E]">
              Setiap kategori disusun berdasarkan tingkat keparahan pada OWASP
              Top 10 2025. Pelajari materi pengantar sebelum masuk ke simulasi
              eksploitasi langsung di browser.
            </p>
          </header>

          {error && (
            <div className="rounded-md border border-[#F0883E]/40 bg-[#F0883E]/10 px-4 py-3 text-sm text-[#F0883E]">
              Gagal memuat kategori: {error.message}
            </div>
          )}

          {!error && (!categories || categories.length === 0) && (
            <div className="rounded-md border border-[#21262D] bg-[#161B22] px-4 py-6 text-sm text-[#8B949E]">
              Belum ada kategori. Pastikan migration sudah dijalankan di
              Supabase SQL Editor.
            </div>
          )}

          <ol className="space-y-3">
            {categories?.map((cat: Category) => (
              <li key={cat.id}>
                <Link
                  href={`/materi/${cat.code}`}
                  className="group flex items-center gap-5 rounded-md border border-[#21262D] bg-[#161B22] px-5 py-4 transition-colors hover:border-[#F0883E]/50 hover:bg-[#1C2128]"
                >
                  <span className="font-mono text-lg font-semibold text-[#F0883E] tabular-nums">
                    {cat.code}
                  </span>
                  <span className="h-8 w-px bg-[#21262D]" aria-hidden="true" />
                  <span className="flex-1">
                    <span className="block font-medium text-[#E6EDF3] group-hover:text-white">
                      {cat.name}
                    </span>
                    {cat.description && (
                      <span className="mt-0.5 block text-sm text-[#8B949E]">
                        {cat.description}
                      </span>
                    )}
                  </span>
                  <span
                    className="font-mono text-xs text-[#8B949E] group-hover:text-[#F0883E]"
                    aria-hidden="true"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </main>
    );
  }