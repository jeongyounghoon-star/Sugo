/** 서버가 켜질 때 한 번: DB 마이그레이션 자동 적용 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerNode } = await import("./instrumentation-node");
  await registerNode();
}
