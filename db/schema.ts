/**
 * DB 스키마 (Drizzle).
 * - 허브 공용: profiles, settings
 * - 프로젝트별 테이블은 접두사로 구분: hangul_*
 * 아이 개인정보는 최소로: 별명 + 아바타 + 학습 기록만.
 */
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { Progress } from "../projects/hangul/lib/progress";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ---------- 허브 공용 ----------

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  nickname: varchar("nickname", { length: 20 }).notNull(),
  avatar: varchar("avatar", { length: 32 }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** 부모 PIN 해시 등 허브 설정 (key → value) */
export const settings = pgTable("settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});

// ---------- 한글 모험 ----------

/** 프로필별 진도 (별/정답률, 복습 큐, 세션, 오늘 시간, 날짜별 시간). 잠금/펫/스티커는 여기서 계산 */
export const hangulProgress = pgTable("hangul_progress", {
  profileId: uuid("profile_id")
    .primaryKey()
    .references(() => profiles.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Progress>().notNull(),
  revision: integer("revision").notNull().default(0),
  /** 부모가 초기화할 때마다 +1. 브라우저 캐시가 옛 진도를 다시 올리지 못하게 한다 */
  epoch: integer("epoch").notNull().default(0),
  updatedAt: updatedAt(),
});

/** 스테이지 한 판 기록 (부모 화면용). id는 브라우저가 만든 UUID라 중복 전송돼도 한 번만 저장 */
export const hangulPlays = pgTable(
  "hangul_plays",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    id: uuid("id").notNull(),
    stageId: varchar("stage_id", { length: 16 }).notNull(),
    correct: smallint("correct").notNull(),
    total: smallint("total").notNull(),
    stars: smallint("stars").notNull(),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.id] }), index("hangul_plays_profile_time").on(t.profileId, t.playedAt)],
);

/** 날짜별 학습 시간 (초) */
export const hangulDailyTime = pgTable(
  "hangul_daily_time",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    seconds: integer("seconds").notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.day] })],
);
