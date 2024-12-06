import { serveFile } from "jsr:@std/http/file-server";
import { join, fromFileUrl } from "jsr:@std/path";
import { dirname } from "jsr:@std/path";
import { ParseArgsParam } from "../common/type.ts";
import { getLog } from "../common/func.ts";
import { args } from "../common/args.ts";
import { list } from "../common/persistent.ts";
import { DataFrame, Trade } from "../common/strategy.ts";

export const DOC = "webui";
export const options: ParseArgsParam = {
  string: ["robot"],
  alias: { r: "robot" },
};

const log = getLog("webui");
export function run() {
  // 启动服务器
  const port = 8000;
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
    let body = { robot: false, after: 0 };
    try {
      body = await request.json();
    } catch (_err) {
      // ignore json parse error on get
    }

    const robot = url.searchParams.get("robot") || body.robot || args.robot;
    const after = body.after || 0;
    const tfs: Record<string, DataFrame[]> = {};
    {
      const prefix = ["signal", robot];
      const entries = list({ prefix });
      for await (const entry of entries) {
        const ts = entry.key.slice(-1)[0].toString();
        const name = entry.key[2].toString();
        if (parseInt(ts) > after) {
          if (!tfs[name]) {
            tfs[name] = [];
          }
          tfs[name].push(entry.value as DataFrame);
        }
      }
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
      after,
      tfs,
      trades,
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
