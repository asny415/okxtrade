import * as path from "jsr:@std/path";
import { Signal, Strategy, Trade } from "../common/strategy.ts";
import { args } from "./args.ts";
import { trade_left } from "../common/func.ts";

export let strategy: Strategy;
export const MIN_SELL = 0.001;

export function check_roi(
  strategy: Strategy,
  current_price: number,
  current_time: number,
  trade: Trade
): Signal {
  const left = trade_left(trade);
  if (left > MIN_SELL) {
    const roi = (current_price - trade.open_rate) / trade.open_rate;
    let roi_expected = strategy.minimal_roi;
    if (typeof strategy.minimal_roi !== "number") {
      const minutes = (current_time - trade.orders[0].place_at) / 60000;
      for (const v of Object.keys(strategy.minimal_roi!)
        .map((m) => parseInt(m))
        .sort((a, b) => a - b)) {
        if (minutes >= v) {
          roi_expected = strategy.minimal_roi![v];
        } else {
          break;
        }
      }
    }
    if (roi >= (roi_expected as number)) {
      return {
        amount: left,
        price: current_price,
        tag: "roi",
      };
    }
    if (roi < strategy.stoploss!) {
      return {
        amount: left,
        price: current_price,
        tag: "stoploss",
      };
    }
  }
  return {};
}

export async function load_stragegy() {
  const strategy_path = Deno.realPathSync(
    path.join(args.basedir, "strategy", `${args.s}.ts`)
  );
  const module_path = path.relative(
    path.dirname(path.fromFileUrl(import.meta.url)),
    strategy_path
  );
  const _strategy = await import(`./${module_path}`);
  const default_strategy: Strategy = {
    name: "helloworld",
    timeframes: [
      {
        timeframe: "5m",
        depth: 1,
      },
    ],
    minimal_roi: 0.01, // 默认超过1%利润卖出
    stoploss: -1, // 默认不设置止损线
  };
  strategy = Object.assign(default_strategy, _strategy.strategy);
}
