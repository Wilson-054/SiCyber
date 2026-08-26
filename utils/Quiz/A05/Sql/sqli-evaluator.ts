// Save as: utils/Quiz/sqli-evaluator.ts (replaces existing file)

// Semua evaluator di sini murni string-matching/regex terhadap query yang
// "dibangun" lewat concatenation — tidak ada mesin SQL sungguhan yang
// dieksekusi, tidak ada data pengguna nyata yang tersentuh.

export type SqliLoginCriteria = {
  type: "sqli_login_bypass";
  table_name: string;
  valid_username: string;
  valid_password: string;
  query_template: string;
};

export type SqliSearchUnionCriteria = {
  type: "sqli_search_union";
  table_name: string;
  columns: string[];       // kolom tabel produk, mis. ["id","name","price"]
  secret_table: string;    // mis. "admin_notes"
  secret_column: string;   // mis. "content"
  query_template: string;  // "SELECT {columns} FROM {table} WHERE name LIKE '%{term}%'"
};

export type SqliIdFilterCriteria = {
  type: "sqli_id_filter";
  table_name: string;
  total_row_count: number; // dipakai buat mensimulasikan "seluruh baris terekspos"
  query_template: string;  // "SELECT * FROM {table} WHERE id = {id}"
};

export type SqliCriteria = SqliLoginCriteria | SqliSearchUnionCriteria | SqliIdFilterCriteria;

export type SqliAttemptResult = {
  success: boolean;
  builtQuery: string;
  reason: string;
  leakedInfo?: string; // ditampilkan ke peserta kalau berhasil bocorin data
};

// --- 1. Login bypass (sudah ada sebelumnya) ---
export function evaluateSqliLoginAttempt(
  criteria: SqliLoginCriteria,
  username: string,
  password: string
): SqliAttemptResult {
  const builtQuery = criteria.query_template
    .replace("{table}", criteria.table_name)
    .replace("{username}", username)
    .replace("{password}", password);

  if (username === criteria.valid_username && password === criteria.valid_password) {
    return { success: true, builtQuery, reason: "exact_credentials" };
  }

  const tautologyPattern = /'\s*or\s*'?1'?\s*=\s*'?1'?/i;
  if (tautologyPattern.test(username) || tautologyPattern.test(password)) {
    return { success: true, builtQuery, reason: "tautology_bypass" };
  }

  const commentPattern = /'\s*(--|#)/;
  if (commentPattern.test(username)) {
    return { success: true, builtQuery, reason: "comment_bypass" };
  }

  return { success: false, builtQuery, reason: "no_match" };
}

// --- 2. Search box vulnerable to UNION-based data exfiltration ---
export function evaluateSqliSearchUnion(
  criteria: SqliSearchUnionCriteria,
  term: string
): SqliAttemptResult {
  const builtQuery = criteria.query_template
    .replace("{columns}", criteria.columns.join(", "))
    .replace("{table}", criteria.table_name)
    .replace("{term}", term);

  const unionMatch = term.match(/union\s+select\s+([^-;]+?)(--|#|$)/i);
  if (unionMatch) {
    const selectedCols = unionMatch[1].split(",").map((c) => c.trim());
    const mentionsSecretTable = new RegExp(criteria.secret_table, "i").test(term);
    const correctColumnCount = selectedCols.length === criteria.columns.length;

    if (correctColumnCount && mentionsSecretTable) {
      return {
        success: true,
        builtQuery,
        reason: "union_leak",
        leakedInfo: `Data dari tabel "${criteria.secret_table}" (kolom "${criteria.secret_column}") berhasil ditarik dan ditampilkan bersama hasil pencarian.`,
      };
    }
    if (!correctColumnCount) {
      return { success: false, builtQuery, reason: "union_column_mismatch" };
    }
  }

  const tautologyPattern = /'\s*or\s*'?1'?\s*=\s*'?1'?/i;
  if (tautologyPattern.test(term)) {
    return {
      success: true,
      builtQuery,
      reason: "tautology_bypass",
      leakedInfo: "Semua baris di tabel produk ikut tampil, termasuk yang seharusnya tidak cocok dengan pencarian.",
    };
  }

  return { success: false, builtQuery, reason: "no_match" };
}

// --- 3. Numeric ID param (tanpa quote) — konteks injeksi berbeda dari string context ---
export function evaluateSqliIdFilter(
  criteria: SqliIdFilterCriteria,
  idParam: string
): SqliAttemptResult {
  const builtQuery = criteria.query_template
    .replace("{table}", criteria.table_name)
    .replace("{id}", idParam);

  // Tanpa tanda kutip karena parameter numerik langsung disisipkan ke query.
  const tautologyPattern = /^\s*-?\d+\s+or\s+1\s*=\s*1/i;
  if (tautologyPattern.test(idParam)) {
    return {
      success: true,
      builtQuery,
      reason: "numeric_tautology",
      leakedInfo: `Seluruh ${criteria.total_row_count} baris di tabel "${criteria.table_name}" ikut terekspos, bukan cuma satu baris dengan id yang diminta.`,
    };
  }

  const unionMatch = idParam.match(/^\s*-?\d+\s+union\s+select/i);
  if (unionMatch) {
    return {
      success: true,
      builtQuery,
      reason: "numeric_union",
      leakedInfo: "Query berhasil digabung dengan SELECT tambahan lewat UNION tanpa perlu tanda kutip sama sekali.",
    };
  }

  return { success: false, builtQuery, reason: "no_match" };
}

// --- Dispatcher generik dipakai kalau perlu evaluasi tanpa tahu tipe spesifik ---
export function evaluateSqliAttempt(
  criteria: SqliCriteria,
  input: Record<string, string>
): SqliAttemptResult {
  switch (criteria.type) {
    case "sqli_login_bypass":
      return evaluateSqliLoginAttempt(criteria, input.username ?? "", input.password ?? "");
    case "sqli_search_union":
      return evaluateSqliSearchUnion(criteria, input.term ?? "");
    case "sqli_id_filter":
      return evaluateSqliIdFilter(criteria, input.id ?? "");
  }
}