import { z } from "zod";
import { getDb } from "@/db/client";
import { PIN_MAX, SETUP_CODE_MAX } from "@/lib/profiles/shared";
import { KB, guard, handle, json, readJson } from "@/lib/server/http";
import { isPinSet, isSetupCodeRequired, pinSchema, setPin } from "@/lib/server/pin";

export async function GET(req: Request) {
  return handle(async () => {
    guard(req, { write: false });
    const isSet = await isPinSet(getDb());
    return json({ isSet, setupCodeRequired: !isSet && isSetupCodeRequired() });
  });
}

const bodySchema = z
  .object({
    newPin: pinSchema,
    currentPin: z.string().max(PIN_MAX).optional(),
    setupCode: z.string().max(SETUP_CODE_MAX).optional(),
  })
  .strict();

/** 처음이면 PIN 만들기(설치 코드 필요), 이미 있으면 현재 PIN을 확인하고 바꾸기 */
export async function POST(req: Request) {
  return handle(async () => {
    guard(req, { write: true });
    const { newPin, currentPin, setupCode } = await readJson(req, bodySchema, 1 * KB);
    await setPin(getDb(), newPin, { currentPin, setupCode });
    return json({ ok: true });
  });
}
