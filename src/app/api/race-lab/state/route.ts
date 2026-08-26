// Save as: src/app/api/race-lab/state/route.ts

import { createClient } from "@/../utils/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  if (!runId) return Response.json(null, { status: 400 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("race_lab_runs")
    .select("id, mode, withdrawal_amount, balance, successful_withdrawals")
    .eq("id", runId)
    .single();

  return Response.json(data ?? null);
}