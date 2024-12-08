import { Logger } from "jsr:@deno-library/logger";
import { ParseArgsParam } from "./type.ts";
import { args } from "./args.ts";
import * as path from "jsr:@std/path";
import {
  Signal,
  DataFrame,
  DataFrameState,
  Strategy,
  Wallet,
  Trade,
  OrderSide,
} from "./strategy.ts";
import { get } from "../api/okx.ts";

export function getLog(_name: string) {
  class Debugable extends Logger {
    async debug(...arg: unknown[]) {
      if (args.verbose) {
        return await this.info(...arg);
      }
    }
    async debug2(...arg: unknown[]) {
      if (args.verbose > 1) {
        return await this.info(...arg);
      }
    }
    async debug3(...arg: unknown[]) {
      if (args.verbose > 2) {
        return await this.info(...arg);
      }
    }
  }
  return new Debugable();
}

export function mergeOpts(a: ParseArgsParam, b: ParseArgsParam) {
  return {
    string: [...(a?.string || []), ...(b?.string || [])],
    boolean: [
      ...((a?.boolean as [string]) || []),
      ...((b?.boolean as [string]) || []),
    ],
    default: { ...a?.default, ...b?.default },
    alias: { ...a?.alias, ...b?.alias },
  };
}
export async function load_json(filePath: string) {
  const jsonText = await Deno.readTextFile(filePath);
  return JSON.parse(jsonText);
}

export async function load_stragegy(): Promise<Required<Strategy>> {
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
    populate_buy_trend(
      _current_time: number,
      _current_price: number,
      _wallet: Wallet,
      _trades: Trade[],
      _dfs: DataFrame[][]
    ): Signal {
      return {};
    },
  };
  return Object.assign(default_strategy, _strategy.strategy);
}

export function okx2df(arr: string[]): DataFrame {
  const r = arr as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string
  ];
  return {
    ts: parseInt(r[0]),
    o: parseFloat(r[1]),
    h: parseFloat(r[2]),
    l: parseFloat(r[3]),
    c: parseFloat(r[4]),
    vol: parseFloat(r[5]),
    volCcy: parseFloat(r[6]),
    confirm:
      parseInt(r[8]) == 0
        ? DataFrameState.uncompleted
        : DataFrameState.completed,
  };
}

export async function load_dataframes(pair: string, tf: string) {
  const tr: [string] = args.r.split("-");
  const data_path = path.join(
    args.basedir,
    "data",
    `${pair}-${tr[0]}-${tr.slice(-1)[0]}-${tf}.json`
  );
  const data = await load_json(data_path);
  const rows: DataFrame[] = (data as [string[]]).map((r) => okx2df(r));
  return rows;
}

export async function load_candles(
  pair: string,
  timeframe: string,
  offset: string,
  limit: number
) {
  return await get("/api/v5/market/history-candles", {
    instId: pair,
    bar: timeframe,
    after: offset,
    limit: `${limit}`,
  });
}

export function trade_left(trade: Trade) {
  return trade.orders.reduce(
    (r, o) => (r += o.side == OrderSide.sell ? -o.filled : o.filled + o.fee),
    0
  );
}
