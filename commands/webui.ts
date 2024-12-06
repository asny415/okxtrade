import { serveFile } from "jsr:@std/http/file-server";
import { join, fromFileUrl } from "jsr:@std/path";
import { dirname } from "jsr:@std/path";
import { ParseArgsParam } from "../common/type.ts";
import { getLog } from "../common/func.ts";
import { args } from "../common/args.ts";

export const DOC = "webui";
export const options: ParseArgsParam = {
  string: ["bot"],
  alias: { b: "bot" },
};

const log = getLog("webui");
export function run() {
  if (!args.b) throw new Error("Bot name not specified");
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
    const updateData = {
      timestamp: new Date().toISOString(),
      status: "success",
      message: "数据已成功更新",
      details: {
        version: "1.0.0",
        lastUpdated: new Date().toLocaleString(),
      },
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
