// Save as: utils/Quiz/xxe-evaluator.ts

// Mensimulasikan endpoint yang menerima input XML (misalnya untuk import
// data) dan diparsing oleh parser XML dengan konfigurasi default yang
// tidak menonaktifkan DTD/external entity. Evaluasi dilakukan murni lewat
// pattern-matching terhadap teks payload - tidak ada parser XML nyata
// yang dijalankan.

export type XxeFileReadCriteria = {
  type: "xxe_file_read";
  app_name: string;
  target_file_path: string; // contoh: "/etc/passwd" atau "/app/config/database.yml"
  file_content: string; // isi tiruan file yang akan "bocor" kalau berhasil
};

export type XxeAttemptResult = {
  success: boolean;
  reason:
    | "no_doctype"
    | "no_external_entity"
    | "entity_not_referenced"
    | "wrong_target_path"
    | "success";
  leakedContent?: string;
};

export function evaluateXxeFileRead(
  criteria: XxeFileReadCriteria,
  payload: string
): XxeAttemptResult {
  const hasDoctype = /<!DOCTYPE/i.test(payload);
  if (!hasDoctype) {
    return { success: false, reason: "no_doctype" };
  }

  // Cari deklarasi entity eksternal: <!ENTITY nama SYSTEM "target">
  const entityMatch = payload.match(
    /<!ENTITY\s+(\w+)\s+SYSTEM\s+["']([^"']+)["']/i
  );
  if (!entityMatch) {
    return { success: false, reason: "no_external_entity" };
  }

  const [, entityName, entityTarget] = entityMatch;

  // Normalisasi target: izinkan dengan atau tanpa prefix file://
  const normalizedTarget = entityTarget.replace(/^file:\/\//i, "");
  if (normalizedTarget !== criteria.target_file_path) {
    return { success: false, reason: "wrong_target_path" };
  }

  // Pastikan entity yang dideklarasikan benar-benar direferensikan di body
  const referencePattern = new RegExp(`&${entityName};`);
  if (!referencePattern.test(payload.replace(entityMatch[0], ""))) {
    return { success: false, reason: "entity_not_referenced" };
  }

  return { success: true, reason: "success", leakedContent: criteria.file_content };
}