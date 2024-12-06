import * as download from "./commands/download.ts";
import * as backtesting from "./commands/backtesting.ts";
import * as dryrun from "./commands/dryrun.ts";
import * as webui from "./commands/webui.ts";
import { getLog } from "./common/func.ts";
import { parse } from "./common/args.ts";

const log = getLog("main");

if (import.meta.main) {
  const cmd = Deno.args[0];
  if (cmd == "download") {
    parse(download.options);
    download.run();
  } else if (cmd == "backtesting") {
    parse(backtesting.options);
    backtesting.run();
  } else if (cmd == "dryrun") {
    parse(dryrun.options);
    dryrun.run();
  } else if (cmd == "webui") {
    parse(webui.options);
    webui.run();
  } else {
    log.error("unknown command", cmd);
  }
}
