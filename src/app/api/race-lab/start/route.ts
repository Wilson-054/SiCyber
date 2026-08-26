// Save as: src/app/api/race-lab/start/route.ts

import { createClient } from "@/../utils/supabase/server";

export async function POST(request: Request) {
  const { exerciseId, mode, startingBalance, withdrawalAmount } = await request.json();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json(null, { status: 401 });

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

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}