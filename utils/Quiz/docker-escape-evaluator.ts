// Save as: utils/Quiz/docker-escape-evaluator.ts

// Mensimulasikan proxy internal yang meneruskan body JSON dari
// POST /containers/create ke Docker Engine API tanpa validasi. Untuk
// kesederhanaan lab, skema body disederhanakan (flat, tidak nested di
// bawah HostConfig seperti Docker API asli). Player harus meng-craft body
// yang membuat container baru berjalan privileged dan mem-bind mount root
// filesystem host - kombinasi klasik untuk container escape.
//
// Tidak ada Docker Engine nyata yang dipanggil - murni evaluasi terhadap
// struktur JSON yang dikirim.

export type MisconfigDockerEscapeCriteria = {
  type: "misconfig_docker_container_escape";
  app_name: string;
  leaked_info: Record<string, string>;
};

export type DockerEscapeAttemptResult = {
  success: boolean;
  reason:
    | "invalid_json"
    | "missing_privileged"
    | "missing_host_root_bind"
    | "success";
  leakedInfo?: Record<string, string>;
};

function isHostRootBind(bind: unknown): boolean {
  if (typeof bind !== "string") return false;
  const [hostPath] = bind.split(":");
  return hostPath?.trim() === "/";
}

export function evaluateDockerContainerEscape(
  criteria: MisconfigDockerEscapeCriteria,
  rawJsonBody: string
): DockerEscapeAttemptResult {
  let body: unknown;
  try {
    body = JSON.parse(rawJsonBody);
  } catch {
    return { success: false, reason: "invalid_json" };
  }

  if (typeof body !== "object" || body === null) {
    return { success: false, reason: "invalid_json" };
  }

  const parsed = body as Record<string, unknown>;

  if (parsed.Privileged !== true) {
    return { success: false, reason: "missing_privileged" };
  }

  const binds = Array.isArray(parsed.Binds) ? parsed.Binds : [];
  const hasHostRootBind = binds.some(isHostRootBind);
  if (!hasHostRootBind) {
    return { success: false, reason: "missing_host_root_bind" };
  }

  return { success: true, reason: "success", leakedInfo: criteria.leaked_info };
}
