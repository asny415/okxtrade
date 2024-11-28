import { parseArgs } from "jsr:@std/cli/parse-args";
import { ParseArgsParam, ParseArgsReturn } from "./type.ts";
import { mergeOpts } from "./func.ts";
const common_options: ParseArgsParam = {
  string: ["basedir"],
  boolean: ["verbose"],
  default: { basedir: "./userdata" },
  alias: { v: "verbose", b: "basedir" },
};

export let args: ParseArgsReturn = { _: [] };

export function parse(opts: ParseArgsParam) {
  args = parseArgs(Deno.args.slice(1), mergeOpts(common_options, opts));
  return args;
}
