// Save as: utils/Quiz/cloud-storage-evaluator.ts

// Mensimulasikan cloud storage bucket (mis. S3-compatible) yang permission
// sharing-nya dibiarkan default terbuka ke publik, sehingga bisa
// ditemukan lewat penebakan nama bucket dan isinya bisa dilist tanpa
// autentikasi. Tidak ada storage provider nyata yang dipanggil.

export type MisconfigOpenBucketCriteria = {
  type: "misconfig_open_bucket";
  app_name: string;
  valid_bucket_names: string[]; // contoh: ["sicyber-prod-backup", "sicyber-assets-public"]
  leaked_objects: string[]; // contoh: ["database_dump_2025.sql", "customers.csv"]
};

export type OpenBucketAttemptResult = {
  success: boolean;
  reason: "bucket_found" | "bucket_not_found";
  leakedObjects?: string[];
};

function normalizeBucketName(raw: string): string {
  return raw.trim().toLowerCase().replace(/^https?:\/\/[^/]*\/?/, "");
}

export function evaluateOpenBucketAccess(
  criteria: MisconfigOpenBucketCriteria,
  requestedBucket: string
): OpenBucketAttemptResult {
  const normalized = normalizeBucketName(requestedBucket);
  const matched = criteria.valid_bucket_names.some(
    (b) => normalizeBucketName(b) === normalized
  );

  if (matched) {
    return { success: true, reason: "bucket_found", leakedObjects: criteria.leaked_objects };
  }
  return { success: false, reason: "bucket_not_found" };
}