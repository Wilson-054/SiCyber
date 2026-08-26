// Save as: src/app/api/race-lab/withdraw/route.ts

import { createClient } from "@/../utils/supabase/server";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withdrawVulnerable(runId: string, delayMs: number) {
  const supabase = await createClient();
  const t0 = performance.now();
  console.log(`[race-lab] SELECT start  t=${t0.toFixed(0)}ms  run=${runId.slice(0, 8)}`);

  const { data: run } = await supabase
    .from("race_lab_runs")
    .select("balance, withdrawal_amount")
    .eq("id", runId)
    .single();
  if (!run) return { success: false };

  const balanceAtCheckTime = run.balance;
  console.log(`[race-lab] SELECT done   t=${performance.now().toFixed(0)}ms  balance_read=${balanceAtCheckTime}`);

  await delay(delayMs);

  if (balanceAtCheckTime < run.withdrawal_amount) {
    console.log(`[race-lab] REJECTED     t=${performance.now().toFixed(0)}ms`);
    return { success: false };
  }

  const { data: updated, error } = await supabase.rpc("race_lab_decrement_naive", {
    p_run_id: runId,
    p_amount: run.withdrawal_amount,
  });
  if (error) throw error;

  console.log(`[race-lab] SUCCESS      t=${performance.now().toFixed(0)}ms  new_balance=${updated}`);
  return { success: true, balanceAfter: updated };
}

async function withdrawFixed(runId: string, delayMs: number) {
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("race_lab_runs")
    .select("withdrawal_amount")
    .eq("id", runId)
    .single();
  if (!run) return { success: false };

  await delay(delayMs);

  const { data: updated, error } = await supabase.rpc("race_lab_decrement_atomic", {
    p_run_id: runId,
    p_amount: run.withdrawal_amount,
  });
  if (error) throw error;

  if (updated === null) return { success: false };
  return { success: true, balanceAfter: updated };
}

export async function POST(request: Request) {
  const { runId, mode, delayMs } = await request.json();
  const result = mode === "vulnerable" ? await withdrawVulnerable(runId, delayMs) : await withdrawFixed(runId, delayMs);
  return Response.json(result);
}