import { Trade } from "../common/strategy.ts";
import * as persistent from "../modules/persistent.ts";
import { parse } from "../modules/args.ts";
import { load_json } from "../common/func.ts";

if (import.meta.main) {
  const robot = Deno.args[0];
  const path = Deno.args[1];
  await parse({});
  await persistent.init();
  const trades: Trade[] = await load_json(path);
  await persistent.persistent_trades(robot, trades);
}
