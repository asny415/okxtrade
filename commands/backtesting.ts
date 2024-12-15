import moment from "https://deno.land/x/momentjs@2.29.1-deno/mod.ts";
import {
  getLog,
  load_candles,
  load_dataframes,
  trade_left,
} from "../common/func.ts";
import { ParseArgsParam } from "../common/type.ts";
import { args } from "../modules/args.ts";
import {
  DataFrame,
  Wallet,
  Order,
  Trade,
  Strategy,
  Signal,
  OrderState,
  OrderSide,
} from "../common/strategy.ts";
import { persistent_signal, persistent_trades } from "../modules/persistent.ts";
import { okx2df } from "../common/func.ts";
import { check_roi, strategy } from "../modules/strategy.ts";

const log = getLog("backtesting");
export const DOC =
  "perform a regression test on a strategy using historical data.";
export const options: ParseArgsParam = {
  string: ["timerange", "pair", "strategy", "wallet"],
  default: {
    pair: "TON-USDT",
    timerange: "20240901-20241125",
    strategy: "sip",
    wallet: "10000",
  },
  alias: { r: "timerange", p: "pair", s: "strategy", w: "wallet" },
};

export async function run() {
  log.info("start backtesting ...", { strategy: strategy.name });
  const robot = `backtesting-${strategy.name}-${moment().format(
    "YYYYMMDDHHmmss"
  )}`;
  args.robot = robot;
  const pairs = args.p.split(",");
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const dataframes: Record<string, DataFrame[]> = {};
    for (const tf of strategy.timeframes) {
      if (!dataframes[tf.timeframe]) {
        dataframes[tf.timeframe] = await load_dataframes(pair, tf.timeframe);
      }
    }
    //按照 5m 1h 这样排序，越精确的时间越排在前面
    const dfsrc = strategy.timeframes
      .map((tf) => [...dataframes[tf.timeframe]])
      .sort((a, b) => b.length - a.length);
    const dfs: DataFrame[][] = [];

    //在线获取初始的dataframe，只获取一次
    for (let idx = 0; idx < dfsrc.length; idx++) {
      const history = await load_candles(
        pair,
        strategy.timeframes[idx].timeframe,
        `${dfsrc[idx][0].ts}`,
        strategy.timeframes[idx].depth
      );
      dfs.push(history.map((r: string[]) => okx2df(r)));
    }
    const init_value = parseFloat(args.w);
    if (init_value <= 0) {
      throw new Error("wallet balance not set");
    }
    log.info("init balance", init_value);
    const wallet: Wallet = {
      robot,
      pair,
      balance: init_value,
      goods: 0,
    };
    const trades: Trade[] = [];
    while (dfsrc[0].length > 0) {
      //按照dfsrc每次递进一个frame往前演进
      const nextts = dfsrc[0][0].ts;
      //每个timeframe依此处理，比如 5m 1h之类
      for (let i = 0; i < dfsrc.length; i++) {
        while (dfsrc[i][0]?.ts <= nextts) {
          const df = dfsrc[i].splice(0, 1)[0];
          //越新的越放在前面
          dfs[i].splice(0, 0, df);
          //保证传递给go函数的depth正确
          while (dfs[i].length > strategy.timeframes[i].depth) {
            dfs[i].splice(-1, 1);
          }
        }
      }
      if (dfsrc[0].length > 1) {
        const nexttick = dfsrc[0][0];
        const thistick = dfs[0][0];
        const delta = nexttick.ts - thistick.ts;
        const avg = Math.round(delta / 3);
        await go(
          robot,
          strategy,
          thistick.ts + avg,
          nexttick.h,
          wallet,
          trades,
          dfs
        );
        await go(
          robot,
          strategy,
          thistick.ts + avg * 2,
          nexttick.l,
          wallet,
          trades,
          dfs
        );
        await go(
          robot,
          strategy,
          nexttick.ts,
          nexttick.c,
          wallet,
          trades,
          dfs,
          true
        );
      }
    }

    const current_price = dfs[0].slice(-1)[0].c;
    const left_total = trades.reduce(
      (r, t) => (r += t.is_open ? trade_left(t) : 0),
      0
    );
    log.info("bt result:", {
      balance: wallet.balance,
      goods: left_total,
      last_price: current_price,
    });
    const last_value = wallet.balance + left_total * current_price;
    result[wallet.pair] = (
      ((last_value - init_value) * 100) /
      init_value
    ).toFixed(2);
  }
  log.info("robot name is:", robot);
  Object.keys(result).forEach((pair) => {
    log.info("backtesting result:", {
      pair,
      roi: result[pair] + "%",
    });
  });
}

export async function go(
  robot: string,
  strategy: Strategy,
  current_time: number,
  current_price: number,
  wallet: Wallet,
  trades: Trade[],
  dfs: DataFrame[][],
  persistent = false
) {
  const buy_signal = strategy.populate_buy_trend!(
    current_time,
    current_price,
    wallet,
    trades,
    dfs
  );

  if (persistent) {
    await persistent_signal(
      robot,
      strategy.timeframes.map((tf, idx) => ({
        name: tf.timeframe,
        dfs: { ...dfs[idx][0], signal: buy_signal },
      }))
    );
  }

  if (buy_signal.amount) {
    await go_buy(strategy, buy_signal, current_time, wallet, trades);
    await persistent_trades(robot, trades);
  }

  for (const trade of trades) {
    const roi_signal = check_roi(strategy, current_price, current_time, trade);
    if (roi_signal.amount) {
      let sell_signal = roi_signal;
      if (strategy.populate_sell_trend) {
        sell_signal = strategy.populate_sell_trend(
          current_time,
          current_price,
          wallet,
          trade,
          dfs,
          roi_signal
        );
      }

      if (sell_signal.amount) {
        await go_sell(strategy, sell_signal, current_time, wallet, trade);
        await persistent_trades(robot, trades);
      }
    }
  }
}

export function go_buy(
  _strategy: Strategy,
  signal: Signal,
  current_time: number,
  wallet: Wallet,
  trades: Trade[]
) {
  if (!signal.amount || !signal.price) {
    throw new Error("bad signal for buy");
  }
  if (wallet.balance < signal.amount * signal.price) {
    log.error("not enough balance", {
      balance: wallet.balance,
      amount: signal.amount,
      price: signal.price,
      need: signal.amount * signal.price,
    });
    throw new Error("not enough balance");
  }
  const order: Order = {
    id: new Date().getTime().toString(),
    state: OrderState.full_filled,
    side: OrderSide.buy,
    price: signal.price,
    average: signal.price,
    amount: signal.amount,
    filled: signal.amount,
    fee: 0,
    place_at: current_time,
    update_at: current_time,
  };
  const trade: Trade = {
    id: `${trades.length + 1}`,
    pair: wallet.pair,
    is_open: true,
    open_rate: signal.price,
    amount: signal.amount,
    tag: signal.tag,
    orders: [order],
  };
  trades.push(trade);
  wallet.balance -= signal.amount * signal.price;
  log.info("buy order", {
    trade: trade.id,
    price: order.price,
    amount: order.amount,
    tag: signal.tag,
  });
}

export function go_sell(
  _strategy: Strategy,
  signal: Signal,
  current_time: number,
  wallet: Wallet,
  trade: Trade
) {
  if (!signal.amount || !signal.price) throw new Error("bad signal for sell");
  const order: Order = {
    id: new Date().getTime().toString(),
    state: OrderState.full_filled,
    side: OrderSide.sell,
    price: signal.price,
    average: signal.price,
    amount: signal.amount,
    filled: signal.amount,
    fee: 0,
    place_at: current_time,
    update_at: current_time,
  };
  log.info("sell order", {
    trade: trade.id,
    price: order.price,
    amount: order.amount,
    tag: signal.tag,
  });
  trade.orders.push(order);
  trade.is_open = trade_left(trade) > 0;
  wallet.balance += signal.amount * signal.price;
}
