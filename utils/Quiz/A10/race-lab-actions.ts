// Save as: utils/Quiz/race-lab-actions.ts
"use server";

import { createClient } from "@/../utils/supabase/server";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type RaceRunState = {
  id: string;
  mode: "vulnerable" | "fixed";
  withdrawal_amount: number;
  balance: number;
  successful_withdrawals: number;
};

export async function startRaceLabRun(
  exerciseId: string,
  mode: "vulnerable" | "fixed",
  startingBalance: number,
  withdrawalAmount: number
): Promise<RaceRunState | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("race_lab_runs")
    .insert({
      user_id: user.id,
      exercise_id: exerciseId,
      mode,
      withdrawal_amount: withdrawalAmount,
      balance: startingBalance,
      successful_withdrawals: 0,
    })
    .select("id, mode, withdrawal_amount, balance, successful_withdrawals")
    .single();

  if (error) throw error;
  return data;
}

export type WithdrawResult = { success: boolean; balanceAfter?: number };

// --- VULNERABLE: check-then-act, dipisah jadi 2 round-trip dengan delay
// buatan di antaranya — inilah celah race condition-nya (TOCTOU).
// Save as: utils/Quiz/race-lab-actions.ts (ubah withdrawVulnerable)

async function withdrawVulnerable(runId: string, delayMs: number): Promise<WithdrawResult> {
  const supabase = await createClient();
  const t0 = performance.now();
  console.log(`[race-lab] SELECT start  t=${t0.toFixed(0)}ms  run=${runId.slice(0, 8)}`);

  const { data: run } = await supabase
    .from("race_lab_runs")
    .select("balance, withdrawal_amount")
    .eq("id", runId)
    .single();
  if (!run) return { success: false };

  const t1 = performance.now();
  const balanceAtCheckTime = run.balance;
  console.log(`[race-lab] SELECT done   t=${t1.toFixed(0)}ms  balance_read=${balanceAtCheckTime}`);

  await delay(delayMs);

  const t2 = performance.now();
  if (balanceAtCheckTime < run.withdrawal_amount) {
    console.log(`[race-lab] REJECTED     t=${t2.toFixed(0)}ms  (balance was already ${balanceAtCheckTime})`);
    return { success: false };
  }

  const { data: updated, error } = await supabase.rpc("race_lab_decrement_naive", {
    p_run_id: runId,
    p_amount: run.withdrawal_amount,
  });
  if (error) throw error;

  const t3 = performance.now();
  console.log(`[race-lab] SUCCESS      t=${t3.toFixed(0)}ms  new_balance=${updated}`);
  return { success: true, balanceAfter: updated };
}
// --- FIXED: satu statement atomic — kondisi "balance >= amount" ada di
// WHERE clause yang sama dengan UPDATE-nya, dievaluasi oleh Postgres
// dengan row lock, jadi request lain harus antre.
async function withdrawFixed(runId: string, delayMs: number): Promise<WithdrawResult> {
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("race_lab_runs")
    .select("withdrawal_amount")
    .eq("id", runId)
    .single();
  if (!run) return { success: false };

  // Delay tetap disertakan di sini biar perbandingannya adil — bedanya
  // BUKAN di delay-nya, tapi di mana pengecekan saldo dilakukan.
  await delay(delayMs);

  const { data: updated, error } = await supabase.rpc("race_lab_decrement_atomic", {
    p_run_id: runId,
    p_amount: run.withdrawal_amount,
  });
  if (error) throw error;

  if (updated === null) {
    return { success: false }; // ditolak: saldo tidak cukup saat update dieksekusi
  }
  return { success: true, balanceAfter: updated };
}

export async function fireWithdrawal(
  runId: string,
  mode: "vulnerable" | "fixed",
  delayMs: number
): Promise<WithdrawResult> {
  return mode === "vulnerable" ? withdrawVulnerable(runId, delayMs) : withdrawFixed(runId, delayMs);
}

export async function getRaceRunState(runId: string): Promise<RaceRunState | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("race_lab_runs")
    .select("id, mode, withdrawal_amount, balance, successful_withdrawals")
    .eq("id", runId)
    .single();
  return data ?? null;
}

// Dipanggil sekali setelah peserta berhasil mendemonstrasikan overdraft
// (successful_withdrawals > 1 pada saldo yang harusnya cuma cukup untuk 1),
// untuk menandai exercise selesai di user_progress.
export async function markRaceLabDemonstrated(categoryId: string, exerciseId: string) {
  return recordAttempt(categoryId, exerciseId, true);
}