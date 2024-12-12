import { parseArgs } from "jsr:@std/cli/parse-args";
import { ParseArgsParam, ParseArgsReturn, Docable } from "./type.ts";
import { mergeOpts } from "./func.ts";
import { run as webui } from "../commands/webui.ts";
import * as persistent from "./persistent.ts";
export const common_options: ParseArgsParam & Docable = {
  string: ["basedir", "verbose"],
  boolean: ["webui", "telegram", "help"],
  default: { basedir: "./userdata", verbose: "0" },
  alias: { v: "verbose", b: "basedir", u: "webui", h: "help" },
  doc: {
    basedir: "specify the directory where all user data is stored",
    verbose:
      "specify the level of debugging information to be output, could be 1,2,3",
    webui:
      "whether to start the web UI service while running other commands simultaneously",
    telegram: "specify whether to enable Telegram notifications",
    help: "this help",
  },
};

export let args: ParseArgsReturn = { _: [] };

export async function parse(opts: ParseArgsParam) {
  args = parseArgs(Deno.args.slice(1), mergeOpts(common_options, opts));
  if (args.webui && !args.help) {
    webui();
  }
  if (!args.help) {
    await persistent.init();
  }
  return args;
}
