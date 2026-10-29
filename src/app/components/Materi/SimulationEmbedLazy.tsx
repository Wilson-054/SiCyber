"use client";

import dynamic from "next/dynamic";
import type { SimulationRow } from "@/app/components/Materi/SimulationEmbed";

// Materials without a simulation never download the engine chunk.
const SimulationEmbed = dynamic(() => import("@/app/components/Materi/SimulationEmbed"), {
  loading: () => (
    <div className="my-8 h-64 animate-pulse rounded-md border border-[#21262D] bg-[#161B22]" />
  ),
});

export default function SimulationEmbedLazy({ sim }: { sim: SimulationRow | undefined }) {
  return <SimulationEmbed sim={sim} />;
}