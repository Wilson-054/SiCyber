// Save as: utils/Quiz/A02/xxe/xxe-evaluator.ts

// Mensimulasikan parser XML yang mengizinkan external entity. Tidak ada
// parser XML sungguhan dan tidak ada akses filesystem/network nyata di sini
// — semua "file" datang dari criteria.simulated_files (data simulasi).
// Deteksi DOCTYPE/ENTITY dan penggunaannya di elemen murni lewat regex.

export type XxeSimulatedFile = {
  path: string;
  content: string;
};

export type XxeLocalFileReadCriteria = {
  type: "xxe_local_file_read";
  app_name: string;
  feature_context: string;
  endpoint: string;
  default_xml: string;
  reflected_element: string;
  allowed_uri_scheme: string; // mis. "file"
  simulated_files: XxeSimulatedFile[];
  target_files: string[];
};

export type XxeFailureReason =
  | "no_xml_entered"
  | "malformed_xml"
  | "no_doctype_or_entity"
  | "entity_not_used"
  | "unsupported_scheme"
  | "file_not_found"
  | "non_target_file";

export type XxeAttemptResult = {
  success: boolean;
  reason: XxeFailureReason | "ok";
  // Isi file yang berhasil "dibaca" dan dipantulkan ke elemen refleksi —
  // tetap ditampilkan walau reason === "non_target_file", supaya peserta
  // tahu mereka di jalur yang benar tapi belum menyasar file yang tepat.
  revealedElement?: string;
  revealedContent?: string;
  resolvedPath?: string;
};

function extractDoctypeEntity(
  xml: string
): { entityName: string; entityUri: string } | null {
  // Ambil internal subset DOCTYPE: <!DOCTYPE root [ ... ]>
  const doctypeMatch = xml.match(/<!DOCTYPE[^[>]*\[([\s\S]*?)\]\s*>/i);
  if (!doctypeMatch) return null;

  const internalSubset = doctypeMatch[1];
  // <!ENTITY nama SYSTEM "uri">  (atau pakai tanda kutip tunggal)
  const entityMatch = internalSubset.match(
    /<!ENTITY\s+(\w+)\s+SYSTEM\s+["']([^"']+)["']\s*>/i
  );
  if (!entityMatch) return null;

  return { entityName: entityMatch[1], entityUri: entityMatch[2] };
}

function extractReflectedUsage(
  xml: string,
  reflectedElement: string,
  entityName: string
): string | null {
  const elRegex = new RegExp(
    `<${reflectedElement}>([\\s\\S]*?)</${reflectedElement}>`,
    "i"
  );
  const elMatch = xml.match(elRegex);
  if (!elMatch) return null;

  const content = elMatch[1].trim();
  const refRegex = new RegExp(`&${entityName};`);
  if (!refRegex.test(content)) return null;

  return content;
}

export function evaluateXxeAttempt(
  criteria: XxeLocalFileReadCriteria,
  xmlInput: string
): XxeAttemptResult {
  const trimmed = xmlInput.trim();
  if (!trimmed) {
    return { success: false, reason: "no_xml_entered" };
  }

  // Cek sangat ringan: dokumen minimal harus terlihat seperti XML.
  if (!trimmed.startsWith("<")) {
    return { success: false, reason: "malformed_xml" };
  }

  const entity = extractDoctypeEntity(trimmed);
  if (!entity) {
    return { success: false, reason: "no_doctype_or_entity" };
  }

  const reflectedRaw = extractReflectedUsage(
    trimmed,
    criteria.reflected_element,
    entity.entityName
  );
  if (reflectedRaw === null) {
    return { success: false, reason: "entity_not_used" };
  }

  const schemeMatch = entity.entityUri.match(/^(\w+):\/\/(.*)$/);
  if (!schemeMatch) {
    return { success: false, reason: "malformed_xml" };
  }
  const [, scheme, rest] = schemeMatch;
  if (scheme.toLowerCase() !== criteria.allowed_uri_scheme.toLowerCase()) {
    return { success: false, reason: "unsupported_scheme" };
  }

  // file:///etc/hostname -> rest = "/etc/hostname" (tiga slash: host kosong)
  const resolvedPath = rest.startsWith("/") ? rest : `/${rest}`;

  const file = criteria.simulated_files.find((f) => f.path === resolvedPath);
  if (!file) {
    return { success: false, reason: "file_not_found", resolvedPath };
  }

  const revealedContent = file.content;
  const isTargetFile = criteria.target_files.includes(file.path);

  if (!isTargetFile) {
    return {
      success: false,
      reason: "non_target_file",
      resolvedPath,
      revealedElement: criteria.reflected_element,
      revealedContent,
    };
  }

  return {
    success: true,
    reason: "ok",
    resolvedPath,
    revealedElement: criteria.reflected_element,
    revealedContent,
  };
}