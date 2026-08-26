// Save as: utils/Quiz/insecure-design-evaluator.ts

// Mensimulasikan alur checkout yang salah desain: server mempercayai field
// "total" yang dikirim dari klien alih-alih menghitung ulang dari
// unit_price × quantity di sisi server. Ini bukan bug implementasi kecil,
// tapi cacat desain — celah bisnis logic yang lolos dari validasi input
// biasa. Simulasi murni di memori, tidak ada transaksi nyata.

export type InsecureDesignPriceCriteria = {
  type: "insecure_design_price_tamper";
  app_name: string;
  product_name: string;
  unit_price: number;
};

export type InsecureDesignAttemptResult = {
  success: boolean;
  reason: "price_tampered" | "negative_quantity_refund" | "matches_expected" | "invalid_input";
  correctTotal?: number;
  claimedTotal?: number;
};

export function evaluatePriceTamperAttempt(
  criteria: InsecureDesignPriceCriteria,
  quantity: number,
  claimedTotal: number
): InsecureDesignAttemptResult {
  if (!Number.isFinite(quantity) || !Number.isFinite(claimedTotal)) {
    return { success: false, reason: "invalid_input" };
  }

  const correctTotal = criteria.unit_price * quantity;

  // Server "seharusnya" mengabaikan claimedTotal dan hitung ulang sendiri.
  // Simulasi ini sengaja mempercayai claimedTotal untuk mendemonstrasikan
  // kerentanannya — makanya berhasil kalau claimedTotal < correctTotal
  // (checkout lebih murah dari seharusnya), atau quantity negatif (refund).
  if (quantity < 0) {
    return { success: true, reason: "negative_quantity_refund", correctTotal, claimedTotal };
  }

  if (claimedTotal < correctTotal) {
    return { success: true, reason: "price_tampered", correctTotal, claimedTotal };
  }

  return { success: false, reason: "matches_expected", correctTotal, claimedTotal };
}