// Save as: utils/Quiz/A01/lab1/idor-profile-evaluator.ts

// Mensimulasikan endpoint profil yang cuma cek status login, bukan
// kepemilikan data. User mengetik ID bebas; sukses kalau ID yang
// diminta BEDA dari ID user sendiri DAN memang ID valid yang punya
// data (di sini cuma target_user_id yang kita siapkan datanya, mirip
// pola "cari data fake" di lab plaintext-credential).

export type IdorProfileCriteria = {
  type: "idor_profile_access";
  app_name: string;
  logged_in_as_user_id: number;
  target_user_id: number;
  leaked_fields: string[];
};

const FAKE_PROFILE_DATA: Record<number, Record<string, string>> = {
  124: {
    email: "target.user@mail.example",
    phone_number: "+62 812-3456-7890",
    home_address: "Jl. Melati No. 12, Surabaya",
  },
};

export type IdorProfileFailureReason = "no_id_entered" | "same_as_own_id" | "id_not_found";

export type IdorProfileAttemptResult = {
  success: boolean;
  reason: IdorProfileFailureReason | "ok";
  leakedData?: Record<string, string>;
};

export function evaluateIdorProfileAttempt(
  criteria: IdorProfileCriteria,
  requestedIdInput: string
): IdorProfileAttemptResult {
  const trimmed = requestedIdInput.trim();
  if (!trimmed) {
    return { success: false, reason: "no_id_entered" };
  }

  const requestedId = Number(trimmed);
  if (Number.isNaN(requestedId)) {
    return { success: false, reason: "id_not_found" };
  }

  if (requestedId === criteria.logged_in_as_user_id) {
    return { success: false, reason: "same_as_own_id" };
  }

  const data = FAKE_PROFILE_DATA[requestedId];
  if (!data) {
    return { success: false, reason: "id_not_found" };
  }

  // Filter cuma field yang memang didefinisikan sebagai leaked_fields
  const leakedData: Record<string, string> = {};
  for (const field of criteria.leaked_fields) {
    if (data[field]) leakedData[field] = data[field];
  }

  return { success: true, reason: "ok", leakedData };
}