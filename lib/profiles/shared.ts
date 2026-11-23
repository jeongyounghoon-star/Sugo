/**
 * 허브 공용 아이 프로필 (브라우저/서버 공용 정의).
 * 개인정보 최소화: 별명(실명 대신 권장)과 펫 아바타만 저장한다.
 */
import { z } from "zod";
import { PETS } from "@/projects/hangul/data/pets";

export const AVATARS = PETS.map((p) => p.id) as [string, ...string[]];
export const MAX_PROFILES = 10;
export const NICKNAME_MAX = 20;

export interface Profile {
  id: string;
  nickname: string;
  avatar: string;
}

// 제어문자/꺾쇠 없이, 앞뒤 공백 제거, 1~20자
const nickname = z
  .string()
  .trim()
  .min(1)
  .max(NICKNAME_MAX)
  .refine((s) => !/[\p{Cc}<>]/u.test(s), "invalid characters");

export const profileIdSchema = z.uuid();

export const createProfileSchema = z.object({ nickname, avatar: z.enum(AVATARS) }).strict();

export const updateProfileSchema = z
  .object({ nickname: nickname.optional(), avatar: z.enum(AVATARS).optional(), pin: z.string().max(6) })
  .strict();

export const pinOnlySchema = z.object({ pin: z.string().max(6) }).strict();
