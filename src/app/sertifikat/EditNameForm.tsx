// Save as: app/components/Sertifikat/EditNameForm.tsx
"use client";

import { useState, useTransition } from "react";
import { updateUsername } from "@/app/sertifikat/actions";

export default function EditNameForm({ currentName }: { currentName: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const res = await updateUsername(value);
      if (res.ok) {
        setValue(res.username);
        setEditing(false);
      } else {
        setError(res.error);
      }
    });
  }

  function handleCancel() {
    setValue(currentName);
    setError(null);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{currentName}</h1>
        <button
          onClick={() => setEditing(true)}
          className="rounded-md border border-[#21262D] px-3 py-1.5 text-xs text-[#8B949E] transition-colors hover:border-[#F0883E]/50 hover:text-[#F0883E]"
        >
          Ubah Nama
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={50}
          autoFocus
          disabled={isPending}
          className="w-full max-w-sm rounded-md border border-[#21262D] bg-[#0D1117] px-3 py-2 text-lg text-[#E6EDF3] outline-none focus:border-[#F0883E]"
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-md bg-[#F0883E] px-3 py-2 text-xs font-medium text-[#0D1117] hover:bg-[#F0883E]/90 disabled:opacity-60"
        >
          {isPending ? "Menyimpan…" : "Simpan"}
        </button>
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="px-2 py-2 text-xs text-[#8B949E] hover:text-[#C9D1D9]"
        >
          Batal
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-[#F85149]">{error}</p>}
    </div>
  );
}