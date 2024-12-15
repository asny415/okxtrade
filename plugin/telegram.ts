import { args } from "../modules/args.ts";
import { getLog } from "../common/func.ts";
const log = getLog("telegram");
export async function notify(msg: string) {
  if (!args.telegram) return;
  if (!Deno.env.get("TG_TOKEN") || !Deno.env.get("TG_CHATID")) {
    log.error("telegram enabled but no config", {
      token: Deno.env.get("TG_TOKEN"),
      chatid: Deno.env.get("TG_CHATID"),
    });
    return;
  }
  try {
    const rsp = await fetch(
      `https://api.telegram.org/bot${Deno.env.get("TG_TOKEN")}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: Deno.env.get("TG_CHATID"),
          text: msg,
        }),
      }
    );
    const json = await rsp.json();
    log.info("send telegram", { json });
  } catch (err) {
    log.error("error send telegram msg", { err });
  }
}
