import { serveFile } from "jsr:@std/http/file-server";
import { join, fromFileUrl } from "jsr:@std/path";
import { dirname } from "jsr:@std/path";
import { Docable, ParseArgsParam } from "../common/type.ts";
import { getLog } from "../common/func.ts";
import { args } from "../modules/args.ts";
import { list } from "../modules/persistent.ts";
import { DataFrame, Trade } from "../common/strategy.ts";
import { strategy } from "../modules/strategy.ts";

export const DOC =
  "view the historical process of a specific execution in a graphical interface";
export const options: ParseArgsParam & Docable = {
  string: ["robot", "strategy"],
  alias: { r: "robot" },
  doc: {
    strategy: "open which db to read from",
    robot: "the default robot name for the chart",
  },
};

const log = getLog("webui");
export function run() {
  // 启动服务器
  const port = parseInt(args.webui);
  log.info(`服务器正在运行，监听端口 ${port}`);
  Deno.serve({ port }, handleRequest);
}

// 处理请求的主函数
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const __filename = fromFileUrl(import.meta.url);
  const __dirname = dirname(__filename);

  // 处理静态文件请求 (根路径)
  if (url.pathname === "/") {
    try {
      const filePath = join(__dirname, "..", "webui", "index.html");
      return await serveFile(request, filePath);
    } catch (_err) {
      return new Response("File not found", { status: 404 });
    }
  }

  // 处理API更新请求
  if (url.pathname === "/api/update") {
    let body = { robot: false };
    try {
      body = await request.json();
    } catch (_err) {
      // ignore json parse error on get
    }

    const robot = url.searchParams.get("robot") || body.robot || args.robot;
    log.info("update request", { robot });
    const tfs: Record<string, DataFrame[]> = {};
    let now = 0;
    for (const tf of strategy.timeframes) {
      const prefix = ["signal", robot, tf.timeframe];
      const entries = list({ prefix });
      for await (const entry of entries) {
        const ts = parseInt(entry.key.slice(-1)[0].toString());
        if (now < ts) now = ts;
        if (!tfs[tf.timeframe]) {
          tfs[tf.timeframe] = [];
        }
        tfs[tf.timeframe].push(entry.value as DataFrame);
      }
      //只返回最近三天的蜡烛数据
      tfs[tf.timeframe] = tfs[tf.timeframe].filter(
        (v) => v.ts > now - 3 * 24 * 3600 * 1000
      );
    }

    const trades: Trade[] = [];
    {
      const prefix = ["trade", robot];
      const entries = list({ prefix });
      for await (const entry of entries) {
        const trade = entry.value as Trade;
        trades.push(trade);
      }
    }

    const updateData = {
      robot,
      tfs,
      trades,
      wallet: args.wallet ? parseFloat(args.wallet) : null,
    };

    return new Response(JSON.stringify(updateData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  // 处理其他未知路径
  return new Response("Not Found", { status: 404 });
}
