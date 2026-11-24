/**
 * 서버 API 입력 검증 (zod). 브라우저가 보낸 값은 모두 여기서 범위/형식을 확인한다.
 */
import { z } from "zod";
import { getStage } from "../data/curriculum";
import { HISTORY_DAYS } from "./progress";
import { MAX_PLAYS_PER_SYNC } from "./sync";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TS = 4102444800000; // 2100-01-01
const DAY_MS = 86_400_000;
/** 서버에 남길 수 있는 날짜 범위: 오늘 기준 과거 HISTORY_DAYS*2일 ~ 미래 2일 (시간대 차이 여유) */
const PAST_DAYS = HISTORY_DAYS * 2;

/** 실제로 있는 날짜(YYYY-MM-DD)이고 오늘 근처인지. 없는 날짜(9999-99-99)나 아주 먼 날짜로 행을 무한히 늘리지 못하게 */
export function isPlausibleDay(day: string, now = Date.now()): boolean {
  if (!DAY.test(day)) return false;
  const [y, m, d] = day.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return false;
  return t >= now - PAST_DAYS * DAY_MS && t <= now + 2 * DAY_MS;
}

const daySchema = z.string().regex(DAY).refine((d) => isPlausibleDay(d), "invalid day");

export const stageIdSchema = z
  .string()
  .regex(/^w[1-8]-s[1-8]$/)
  .refine((id) => getStage(id) !== undefined, "unknown stage");

function boundedRecord<K extends z.ZodType<string>, V extends z.ZodType>(key: K, value: V, max: number) {
  return z.record(key, value).refine((r) => Object.keys(r).length <= max, `too many entries (max ${max})`);
}

export const progressSchema = z
  .object({
    version: z.literal(1),
    stages: boundedRecord(
      stageIdSchema,
      z.object({
        bestStars: z.number().int().min(0).max(3),
        bestAccuracy: z.number().min(0).max(1),
        plays: z.number().int().min(0).max(1_000_000),
      }).strict(),
      100,
    ),
    review: boundedRecord(
      z.string().min(1).max(4),
      z.object({
        box: z.number().int().min(0).max(10),
        due: z.number().int().min(0).max(10_000_000),
      }).strict(),
      300,
    ),
    session: z.object({
      index: z.number().int().min(0).max(10_000_000),
      lastActive: z.number().int().min(0).max(MAX_TS).nullable(),
    }).strict(),
    daily: z.object({
      date: z.union([z.literal(""), daySchema]),
      seconds: z.number().int().min(0).max(86_400),
      dismissed: z.boolean(),
    }).strict(),
    history: boundedRecord(daySchema, z.number().int().min(0).max(86_400), HISTORY_DAYS),
  })
  .strict();

export const playEventSchema = z
  .object({
    id: z.uuid(),
    stageId: stageIdSchema,
    correct: z.number().int().min(0).max(100),
    total: z.number().int().min(1).max(100),
    stars: z.number().int().min(1).max(3),
    playedAt: z.number().int().min(0).max(MAX_TS),
  })
  .strict()
  .refine((e) => e.correct <= e.total, "correct > total");

export const syncRequestSchema = z
  .object({
    progress: progressSchema,
    plays: z.array(playEventSchema).max(MAX_PLAYS_PER_SYNC),
    /** 브라우저가 마지막으로 본 서버 epoch (처음이면 null) */
    epoch: z.number().int().min(0).max(1_000_000).nullable(),
  })
  .strict();

export type SyncRequest = z.infer<typeof syncRequestSchema>;
