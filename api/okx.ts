import { args } from "../common/args.ts";
import { getLog, load_candles, okx2df } from "../common/func.ts";
import { DataFrame } from "../common/strategy.ts";
import { TimeFrame } from "../common/strategy.ts";

const log = getLog("api");
export async function get(entry: string, params: Record<string, string>) {
  const query = (Object.keys(params) as [string])
    .map((key) => `${key}=${encodeURIComponent(params[key])}`)
    .join("&");
  const fullpath = `https://www.okx.com${entry}?${query}`;
  const rsp = await fetch(fullpath, {
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (args.v) {
    log.info("api request", { fullpath });
  }
  const json = await rsp.json();
  if (json.code != "0") {
    log.error(`api error`, { json, fullpath });
  }
  return json.data;
}

function keep_ws(
  url: string,
  instId: string,
  channel: string,
  callback: (e: MessageEvent) => undefined
) {
  let last_event_ts: number = 0;
  function connect(
    url: string,
    instId: string,
    channel: string,
    callback: (e: MessageEvent) => undefined
  ) {
    const ws = new WebSocket(url);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          op: "subscribe",
          args: [
            {
              channel,
              instId,
            },
          ],
        })
      );
    };
    ws.onmessage = (event) => {
      last_event_ts = new Date().getTime();
      callback(event);
    };
    return ws;
  }
  let ws = connect(url, instId, channel, callback);
  setInterval(() => {
    if (new Date().getTime() - last_event_ts >= 30000) {
      ws.close();
      ws = connect(url, instId, channel, callback);
    }
  }, 5000);
}

// 通过websocket方式获取ticker或者candle数据并且在新数据到来的时候回调
export async function okxws(
  pair: string,
  timeframes: TimeFrame[],
  callback: (ct: number, cp: number, dfs: DataFrame[][]) => undefined
) {
  let current_time: number = 0;
  let current_price: number = 0;
  const current_dataframes: Record<string, [string, DataFrame]> = {};
  const history_dataframes: Record<string, [string, DataFrame[]]> = {};
  let last_callback_ts: number = 0;

  keep_ws("wss://ws.okx.com:8443/ws/v5/public", pair, "tickers", (event) => {
    const data = JSON.parse(event.data);
    if (data.data) {
      current_time = parseInt(data.data[0].ts);
      current_price = parseFloat(data.data[0].last);
    }
  });
  for (const tf of timeframes) {
    keep_ws(
      "wss://ws.okx.com:8443/ws/v5/business",
      pair,
      `candle${tf.timeframe}`,
      (event) => {
        const data = JSON.parse(event.data);
        if (data.data) {
          current_dataframes[tf.timeframe] = [
            data.data[0][0],
            okx2df(data.data[0]),
          ];
        }
      }
    );
  }
  while (true) {
    if (
      current_time == 0 ||
      Object.keys(current_dataframes).length != timeframes.length ||
      last_callback_ts == current_time
    ) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    last_callback_ts = current_time;
    for (const tf of timeframes) {
      if (
        !history_dataframes[tf.timeframe] ||
        history_dataframes[tf.timeframe][0] !=
          current_dataframes[tf.timeframe][0]
      ) {
        const ts = current_dataframes[tf.timeframe][0];
        const list = await load_candles(pair, tf.timeframe, ts, tf.depth);
        if (args.v) {
          log.info("reload candles", { pair, tf: tf.timeframe, ts });
        }
        if (list[0][0] == ts) {
          list.splice(0, 1);
        }
        history_dataframes[tf.timeframe] = [
          ts,
          list.map((r: string[]) => okx2df(r)),
        ];
      }
    }

    await callback(
      current_time,
      current_price,
      timeframes.map((tf) => [
        current_dataframes[tf.timeframe][1],
        ...history_dataframes[tf.timeframe][1],
      ])
    );
  }
}
