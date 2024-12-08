import * as path from "jsr:@std/path";
import { DataFrame, Trade } from "./strategy.ts";
import { args } from "./args.ts";
import { ensureDir } from "jsr:@std/fs@1.0.5/ensure-dir";

export let db: Deno.Kv;

export async function init() {
  const dbpath = path.join(args.basedir, "db", "data");
  await ensureDir(path.dirname(dbpath));
  db = await Deno.openKv(dbpath);
}

export function list(arg: Deno.KvListSelector) {
  return db.list(arg);
}
export async function persistent_signal(
  robot: string,
  dfs: {
    name: string;
    dfs: DataFrame;
  }[]
) {
  for (const tf of dfs) {
    const path = ["signal", robot, tf.name, tf.dfs.ts];
    const value = { ...tf.dfs };
    await db.set(path, value);
  }
}
export async function persistent_trades(robot: string, trades: Trade[]) {
  for (const trade of trades) {
    const path = ["trade", robot, trade.id];
    await db.set(path, trade);
  }
}
