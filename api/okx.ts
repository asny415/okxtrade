import { args } from "../common/args.ts";
import { getLog } from "../common/func.ts";

const log = getLog("api");
export async function get(entry: string, params: Record<string, string>) {
  const query = (Object.keys(params) as [string])
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
    .join("&");
  const fullpath = `https://www.okx.com${entry}?${query}`;
  const rsp = await fetch(fullpath, {
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (args.v) {
    log.info("api request", { fullpath });
  }
  const json = await rsp.json();
  if (json.code != "0") {
    log.error(`api error`, { json, fullpath });
  }
  return json.data;
}
