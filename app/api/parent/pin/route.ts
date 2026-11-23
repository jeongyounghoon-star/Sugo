import { z } from "zod";
import { getDb } from "@/db/client";
import { KB, guard, handle, json, readJson } from "@/lib/server/http";
import { isPinSet, pinSchema, setPin } from "@/lib/server/pin";

export async function GET(req: Request) {
  return handle(async () => {
    guard(req, { write: false });
    return json({ isSet: await isPinSet(getDb()) });
  });
}

const bodySchema = z.object({ newPin: pinSchema, currentPin: z.string().max(6).optional() }).strict();

/** 처음이면 PIN 만들기, 이미 있으면 현재 PIN을 확인하고 바꾸기 */
export async function POST(req: Request) {
  return handle(async () => {
    guard(req, { write: true });
    const { newPin, currentPin } = await readJson(req, bodySchema, 1 * KB);
    await setPin(getDb(), newPin, currentPin);
    return json({ ok: true });
  });
}
