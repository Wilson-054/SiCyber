// Save as: utils/Quiz/crypto-evaluator.ts
import { createHash } from "crypto";

// Mensimulasikan sistem yang menyimpan password dengan hashing cepat &
// tanpa salt (MD5 telanjang) — bukan algoritma lambat khusus password
// (bcrypt/argon2/scrypt). Peserta diberi hash target dan mencoba menebak
// plaintext-nya. Hash dihitung sungguhan di server pakai modul `crypto`
// bawaan Node hanya untuk demonstrasi algoritma; tidak ada password
// pengguna nyata yang tersentuh — semuanya data tiruan dari success_criteria.

export type CryptoWeakHashCriteria = {
  type: "crypto_weak_hash_crack";
  app_name: string;
  account_label: string;   // mis. "akun admin"
  target_hash: string;     // MD5 hex dari password rahasia, precomputed
  algorithm: "md5";        // dibiarkan eksplisit biar kelihatan di UI kenapa ini lemah
};

export type CryptoAttemptResult = {
  success: boolean;
  reason: "hash_match" | "hash_mismatch";
  computedHash?: string;
};

export function evaluateWeakHashGuess(
  criteria: CryptoWeakHashCriteria,
  guessedPassword: string
): CryptoAttemptResult {
  const computedHash = createHash(criteria.algorithm).update(guessedPassword).digest("hex");

  if (computedHash === criteria.target_hash) {
    return { success: true, reason: "hash_match", computedHash };
  }
  return { success: false, reason: "hash_mismatch", computedHash };
}   