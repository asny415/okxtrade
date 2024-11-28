import * as path from "jsr:@std/path";
import { getLog } from "../common/func.ts";
import { ParseArgsParam } from "../common/type.ts";
import { args } from "../common/args.ts";

const log = getLog("backtesting");
export const DOC = "backtesting";
export const options: ParseArgsParam = {
  string: ["timerange", "pair", "timeframes", "strategy"],
  default: {
    pair: "TON-USDT",
    timeframes: "5m",
    timerange: "20240901-20241125",
    strategy: "hello",
  },
  alias: { r: "timerange", t: "timeframes", p: "pair", s: "strategy" },
};

export async function run() {
  const strategy_path = Deno.realPathSync(
    path.join(args.basedir, "strategy", `${args.s}.js`)
  );
  const module_path = path.relative(
    path.dirname(path.fromFileUrl(import.meta.url)),
    strategy_path
  );
  const strategy = await import(`./${module_path}`);
  log.info("test", strategy.name);
}
