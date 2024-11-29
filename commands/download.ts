import * as path from "jsr:@std/path";
import { ensureDir } from "jsr:@std/fs/ensure-dir";
import { getLog, load_candles } from "../common/func.ts";
import { ParseArgsParam } from "../common/type.ts";
import { args } from "../common/args.ts";

const log = getLog("download");
export const DOC = "download data for backtesting from okx";
export const options: ParseArgsParam = {
  string: ["timerange", "pair", "timeframes"],
  default: {
    pair: "TON-USDT",
    timeframes: "5m",
    timerange: "20240901-20241125",
  },
  alias: { r: "timerange", t: "timeframes", p: "pair" },
};

export async function run() {
  const pairs = args.p.split(",");
  const tr: [string] = args.r.split("-");
  const [ts, te] = tr.map(
    (v) => new Date(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`)
  );
  for (const p of pairs) {
    const filename = path.join(
      args.basedir,
      "data",
      `${p}-${tr[0]}-${tr.slice(-1)[0]}-${args.t}.json`
    );
    const df = [];
    let time = te.getTime();
    while (time > ts.getTime()) {
      log.info("progress", { pair: p, time, to: ts.getTime() });
      const data = await load_candles(p, args.t, time, 300);
      if (data) {
        for (const r of data) {
          const rt = parseInt(r[0]);
          if (rt >= ts.getTime()) {
            df.push(r);
            if (rt < time) {
              time = rt;
            }
          }
        }
      } else {
        log.error("api fetch no data");
        break;
      }
    }
    if (time >= ts.getTime()) {
      await ensureDir(path.dirname(filename));
      await Deno.writeTextFile(
        filename,
        JSON.stringify(df.sort((a, b) => parseInt(a[0]) - parseInt(b[0])))
      );
      log.info("succ");
    }
  }
}
