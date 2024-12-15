import { Logger } from "jsr:@deno-library/logger";
import { ParseArgsParam } from "./type.ts";
import { args } from "../modules/args.ts";
import * as path from "jsr:@std/path";
import { DataFrame, DataFrameState, Trade, OrderSide } from "./strategy.ts";
import { get } from "../api/okx.ts";

export function getLog(_name: string) {
  class Debugable extends Logger {
    async debug(...arg: unknown[]) {
      if (args.verbose && args.verbose > 0) {
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

export function fileExistsSync(filePath: string): boolean {
  try {
    Deno.statSync(filePath);
    return true; // 文件存在
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return false; // 文件不存在
    }
    throw error; // 其他错误
  }
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
