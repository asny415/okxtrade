import { parseArgs } from "jsr:@std/cli/parse-args";
import { ParseArgsParam, ParseArgsReturn } from "./type.ts";
import { mergeOpts } from "./func.ts";
import { run as webui } from "../commands/webui.ts";
import * as persistent from "./persistent.ts";
const common_options: ParseArgsParam = {
  string: ["basedir", "verbose"],
  boolean: ["webui"],
  default: { basedir: "./userdata", verbose: "1" },
  alias: { v: "verbose", b: "basedir", u: "webui" },
};

export let args: ParseArgsReturn = { _: [] };

export async function parse(opts: ParseArgsParam) {
  args = parseArgs(Deno.args.slice(1), mergeOpts(common_options, opts));
  if (args.webui) {
    webui();
  }
  await persistent.init();
  return args;
}
