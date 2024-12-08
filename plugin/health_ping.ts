export async function ping() {
  if (!Deno.env.get("HEALTH_PING")) return;
  await fetch(Deno.env.get("HEALTH_PING") as string, {});
}
