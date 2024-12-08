import { list } from "../common/persistent.ts";
import { Trade } from "../common/strategy.ts";
import * as persistent from "../common/persistent.ts";
import { parse } from "../common/args.ts";

if (import.meta.main) {
  const robot = Deno.args[0];
  await parse({});
  await persistent.init();
  const trades = [];
  const entries = list({ prefix: ["trade", robot] });
  for await (const entry of entries) {
    trades.push(entry.value as Trade);
  }
  console.log(JSON.stringify(trades));
}
