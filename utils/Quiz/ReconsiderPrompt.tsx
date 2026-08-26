// Save as: app/components/Exercise/ReconsiderPrompt.tsx
"use client";

import Link from "next/link";

export default function ReconsiderPrompt({
  categoryCode,
  onDismiss,
}: {
  categoryCode: string;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-6 rounded-md border border-[#F0883E]/40 bg-[#F0883E]/10 px-5 py-4">
      <p className="text-sm font-medium text-[#F0883E]">Sepertinya latihan ini cukup menantang.</p>
      <p className="mt-1 text-sm text-[#C9D1D9]">
        Kamu sudah memakai beberapa hint atau gagal beberapa kali berturut-turut. Mau meninjau ulang materinya dulu,
        atau tetap lanjut mencoba?
      </p>
      <div className="mt-3 flex gap-3">
        <Link
          href={`/materi/${categoryCode}`}
          className="rounded border border-[#21262D] px-3 py-1.5 text-xs text-[#E6EDF3] hover:border-[#F0883E]/50"
        >
          Tinjau materi
        </Link>
        <button
          onClick={onDismiss}
          className="rounded border border-[#21262D] px-3 py-1.5 text-xs text-[#8B949E] hover:border-[#F0883E]/50"
        >
          Lanjut mencoba
        </button>
      </div>
    </div>
  );
}