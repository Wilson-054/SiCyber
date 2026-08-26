// Save as: utils/Quiz/docker-socket-evaluator.ts

// Mensimulasikan Docker daemon socket (/var/run/docker.sock) yang secara
// tidak sengaja ter-mount ke dalam sebuah container lain atau ter-expose
// lewat reverse proxy tanpa autentikasi. Semua respons di sini adalah data
// tiruan yang ditulis di success_criteria - tidak ada Docker Engine API
// nyata yang dipanggil.

export type MisconfigDockerSocketCriteria = {
  type: "misconfig_docker_socket_exposed";
  app_name: string;
  valid_api_paths: string[]; // contoh: ["/containers/json", "/version", "/containers/create"]
  leaked_info: Record<string, string>; // contoh: { "host_root_mounted": "true", "privileged_containers": "2" }
};

export type DockerSocketAttemptResult = {
  success: boolean;
  reason: "path_found" | "path_not_found";
  leakedInfo?: Record<string, string>;
};

function normalizeApiPath(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^(get|post|put|delete)\s+/i, "") // buang method HTTP kalau ditulis
    .replace(/^\/v[\d.]+/, ""); // buang prefix versi API seperti /v1.41
}

export function evaluateDockerSocketAccess(
  criteria: MisconfigDockerSocketCriteria,
  requestedPath: string
): DockerSocketAttemptResult {
  const normalized = normalizeApiPath(requestedPath);
  const matched = criteria.valid_api_paths.some(
    (p) => normalizeApiPath(p) === normalized
  );

  if (matched) {
    return { success: true, reason: "path_found", leakedInfo: criteria.leaked_info };
  }
  return { success: false, reason: "path_not_found" };
}