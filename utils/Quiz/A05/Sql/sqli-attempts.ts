// Save as: utils/Quiz/sqli-attempts.ts (replaces existing file)
"use server";

import {
  evaluateSqliLoginAttempt,
  evaluateSqliSearchUnion,
  evaluateSqliIdFilter,
  type SqliLoginCriteria,
  type SqliSearchUnionCriteria,
  type SqliIdFilterCriteria,
} from "../Sql/sqli-evaluator";
import { recordAttempt } from "@/../utils/Quiz/exercise-progress";

export async function attemptSqliLogin(
  categoryId: string,
  exerciseId: string,
  criteria: SqliLoginCriteria,
  username: string,
  password: string
) {
  const evalResult = evaluateSqliLoginAttempt(criteria, username, password);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}

export async function attemptSqliSearchUnion(
  categoryId: string,
  exerciseId: string,
  criteria: SqliSearchUnionCriteria,
  term: string
) {
  const evalResult = evaluateSqliSearchUnion(criteria, term);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}

export async function attemptSqliIdFilter(
  categoryId: string,
  exerciseId: string,
  criteria: SqliIdFilterCriteria,
  idParam: string
) {
  const evalResult = evaluateSqliIdFilter(criteria, idParam);
  const counters = await recordAttempt(categoryId, exerciseId, evalResult.success);
  return { ...evalResult, counters };
}