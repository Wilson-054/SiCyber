// Save as: utils/Quiz/misconfig-evaluator.ts

// Mensimulasikan endpoint debug/actuator yang sengaja ditinggalkan aktif di
// "production" dan bisa diakses tanpa autentikasi, membocorkan konfigurasi
// internal. Semua data di sini adalah data tiruan yang ditulis di
// success_criteria — tidak ada endpoint nyata yang dipanggil.

export type MisconfigDebugCriteria = {
  type: "misconfig_debug_endpoint";
  app_name: string;
  valid_debug_paths: string[];   // mis. ["/actuator/env", "/debug", "/_debug/config"]
  leaked_env_vars: Record<string, string>; // mis. { "DB_PASSWORD": "...", "AWS_SECRET_KEY": "..." }
};

export type MisconfigAttemptResult = {
  success: boolean;
  reason: "path_found" | "path_not_found";
  leakedEnv?: Record<string, string>;
};

export function evaluateMisconfigDebugAccess(
  criteria: MisconfigDebugCriteria,
  requestedPath: string
): MisconfigAttemptResult {
  const normalized = requestedPath.trim().toLowerCase();
  const matched = criteria.valid_debug_paths.some((p) => p.toLowerCase() === normalized);

  if (matched) {
    return { success: true, reason: "path_found", leakedEnv: criteria.leaked_env_vars };
  }
  return { success: false, reason: "path_not_found" };
}