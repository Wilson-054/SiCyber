
import { createClient } from "@/../utils/supabase/server";
import { redirect } from "next/navigation";
import { getUserCertificates } from "@/../utils/certifications";
import CertificateCard from "@/app/sertifikat/CertificateCard";
import EditNameForm from "@/app/sertifikat/EditNameForm";
export const revalidate = 0;

export default async function SertifikatPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  const list = await getUserCertificates(supabase, user.id);
  const displayName = profile?.username ?? user.email ?? "Pengguna";

  return (
    <main className="min-h-screen bg-[#0D1117] text-[#E6EDF3]">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <header className="mb-10 border-b border-[#21262D] pb-8">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-[#F0883E]">
            Sertifikat Saya
          </p>
          <EditNameForm currentName={displayName} />
           <p className="mt-3 text-sm text-[#8B949E]">
            Nama ini akan tercetak di sertifikat. Pastikan sudah benar sebelum
            mengunduh.
          </p>
        </header>

        {list.length === 0 ? (
          <div className="rounded-md border border-[#21262D] bg-[#161B22] px-4 py-6 text-sm text-[#8B949E]">
            Belum ada sertifikat. Selesaikan sebuah latihan (exercise) untuk
            mendapatkan sertifikat pertamamu.
          </div>
        ) : (
          <div className="space-y-4">
            {list.map((cert) => (
              <CertificateCard
                key={`${cert.type}-${cert.code}`}
                cert={cert}
                displayName={displayName}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}