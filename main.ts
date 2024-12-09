import * as download from "./commands/download.ts";
import * as backtesting from "./commands/backtesting.ts";
import * as dryrun from "./commands/dryrun.ts";
import * as trade from "./commands/trade.ts";
import * as webui from "./commands/webui.ts";
import { getLog } from "./common/func.ts";
import { args, parse } from "./common/args.ts";
import { Command } from "./common/type.ts";
import { help } from "./common/help.ts";

const log = getLog("main");

if (import.meta.main) {
  const commands: Record<string, Command> = {
    download,
    backtesting,
    dryrun,
    trade,
    webui,
  };
  const cmd = Deno.args[0];
  if (cmd in commands) {
    await parse(commands[cmd].options);
    if (args.help) {
      help(commands, cmd);
    } else {
      commands[cmd].run();
    }
  } else if (cmd == "-h" || cmd == "--help") {
    help(commands);
  } else {
    log.error("unknown command", cmd);
  }
}
