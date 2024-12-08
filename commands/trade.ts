import * as dotenv from "jsr:@std/dotenv";
import * as path from "jsr:@std/path";
import { getLog, load_stragegy, trade_left } from "../common/func.ts";
import { ParseArgsParam } from "../common/type.ts";
import { args } from "../common/args.ts";
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
import { get2, post2, okxws } from "../api/okx.ts";
import {
  list,
  persistent_signal,
  persistent_trades,
} from "../common/persistent.ts";

const log = getLog("dryrun");
const MIN_SELL = 0.001;
export const DOC = "dryrun";
export const options: ParseArgsParam = {
  string: ["pair", "strategy"],
  alias: { p: "pair", s: "strategy" },
};

export async function init_trades(robot: string): Promise<Trade[]> {
  const trades: Trade[] = [];
  const entries = list({ prefix: ["trade", robot] });
  for await (const entry of entries) {
    trades.push(entry.value as Trade);
  }
  return trades;
}

async function update_wallet(wallet: {
  pair: string;
  balance: number;
  goods: number;
}) {
  const data = await get2("/api/v5/account/balance", {
    ccy: wallet.pair.replace("-", ","),
  });
  for (const detail of data[0].details || []) {
    if (detail.ccy == "USDT") {
      wallet.balance = parseFloat(detail.cashBal);
    } else {
      wallet.goods = parseFloat(detail.cashBal);
    }
  }
}

export function asset_goods_match(wallet: { goods: number }, trades: Trade[]) {
  for (const trade of trades) {
    if (trade.is_open) {
      log.debug3("do not check goods match when trade is open", {
        trade: trade.id,
      });
      return;
    }
  }
  const goods = trades.reduce(
    (r, t) =>
      r +
      t.orders.reduce(
        (r2, o) =>
          o.side == OrderSide.buy ? (r2 += o.filled + o.fee) : (r2 -= o.filled),
        0
      ),
    0
  );
  if (Math.abs(wallet.goods - goods) > MIN_SELL) {
    log.error("balance not match", {
      goods,
      wallet: wallet.goods,
      diff: Math.abs(wallet.goods - goods),
    });
    throw new Error("balance not match");
  }
}

export async function run() {
  if (!args.pair || !args.strategy) {
    throw new Error("use --help for how to use");
  }
  const env_path = path.join(args.basedir, ".env");
  await dotenv.load({ envPath: env_path, export: true });
  const strategy = await load_stragegy();
  log.info("start trade ...", { strategy: strategy.name });
  const robot = `trade-${strategy.name}`;
  args.robot = robot;
  const pairs = args.p.split(",");
  if (pairs.length != 1) {
    throw new Error("only 1 pair allowed");
  }
  const pair = pairs[0];
  const wallet = { robot, pair, balance: 0, goods: 0 };
  const trades = await init_trades(robot);
  let last_wallet_update_ts = 0;
  okxws(
    pair,
    strategy.timeframes,
    async (current_time: number, current_price: number, dfs: DataFrame[][]) => {
      log.debug3("tick test", current_time, current_price, dfs);
      if (current_time - last_wallet_update_ts > 10000) {
        await update_wallet(wallet);
        last_wallet_update_ts = current_time;
        log.debug("update wallet", {
          balance: wallet.balance,
          goods: wallet.goods,
        });
        await asset_goods_match(wallet, trades);
      }
      await go(
        robot,
        strategy,
        current_time,
        current_price,
        wallet,
        trades,
        dfs
      );
    }
  );
}

export function check_order_stable(order: Order) {
  return (
    order.state === OrderState.canceled ||
    order.state === OrderState.full_filled
  );
}

export function check_trade_stable(trade: Trade) {
  for (const order of trade.orders) {
    if (!check_order_stable(order)) {
      log.debug3("order not stable", { order: order.id });
      return false;
    }
  }
  return true;
}

export function check_trades_stable(trades: Trade[]) {
  for (const trade of trades) {
    if (!check_trade_stable(trade)) return false;
  }
  return true;
}

export async function update_order_status(
  current_time: number,
  trades: Trade[]
) {
  for (const trade of trades) {
    for (const order of trade.orders) {
      if (!check_order_stable(order)) {
        const data = await get2("/api/v5/trade/order", {
          instId: trade.pair,
          ordId: order.id,
        });
        if (data[0].state == "canceled") {
          order.state = OrderState.canceled;
        } else if (data[0].state == "filled") {
          order.state = OrderState.full_filled;
        } else if (data[0].state == "partially_filled") {
          order.state = OrderState.part_filled;
        }
        order.average = parseFloat(data[0].avgPx);
        order.filled = parseFloat(data[0].fillSz);
        order.update_at = parseInt(data[0].uTime);
        order.fee = parseFloat(data[0].fee);
      }
      if (!check_order_stable(order) && current_time - order.place_at > 30000) {
        // order timeout at 30 secs
        await post2("/api/v5/trade/cancel-order", {
          instId: trade.pair,
          ordId: order.id,
        });
        log.debug("cancel order for timeout", { order: order.id });
      }
    }
  }
}

export async function go(
  robot: string,
  strategy: Required<Strategy>,
  current_time: number,
  current_price: number,
  wallet: Wallet,
  trades: Trade[],
  dfs: DataFrame[][]
) {
  await update_order_status(current_time, trades);
  const there_is_no_open_order = check_trades_stable(trades);

  if (there_is_no_open_order) {
    asset_goods_match(wallet, trades);
    const buy_signal = strategy.populate_buy_trend(
      current_time,
      current_price,
      wallet,
      trades,
      dfs
    );
    await persistent_signal(
      robot,
      strategy.timeframes.map((tf, idx) => ({
        name: tf.timeframe,
        dfs: { ...dfs[idx].slice(-1)[0], ...buy_signal },
      }))
    );
    if (buy_signal.amount) {
      await go_buy(strategy, buy_signal, current_time, wallet, trades);
      await persistent_trades(robot, trades);
    }
  }

  for (const trade of trades) {
    if (!check_trade_stable(trade)) continue;
    const sell_signal = check_roi(strategy, current_price, current_time, trade);
    if (sell_signal.amount) {
      await go_sell(strategy, sell_signal, current_time, wallet, trade);
      await persistent_trades(robot, trades);
    }
  }
}

export async function go_buy(
  _strategy: Required<Strategy>,
  signal: Signal,
  current_time: number,
  wallet: Wallet,
  trades: Trade[]
) {
  if (!signal.amount || !signal.price || !signal.tag)
    throw new Error("bad signal for buy");
  if (wallet.balance < signal.amount * signal.price) {
    throw new Error("not enough balance");
  }

  const data = await post2("/api/v5/trade/order", {
    instId: wallet.pair,
    ordType: "limit",
    side: "buy",
    sz: `${signal.amount}`,
    tdMode: "cash",
    tgtCcy: "base_ccy",
    px: `${signal.price}`,
  });
  const id = data[0].ordId;

  const order: Order = {
    id,
    state: OrderState.opened,
    side: OrderSide.buy,
    price: signal.price,
    average: 0,
    amount: signal.amount,
    filled: 0,
    fee: 0,
    place_at: current_time,
  };
  const trade: Trade = {
    id: `${new Date().getTime()}`,
    pair: wallet.pair,
    is_open: true,
    open_rate: signal.price,
    amount: signal.amount,
    tag: signal.tag,
    orders: [order],
  };
  trades.push(trade);
  log.info("buy order", {
    trade: trade.id,
    price: order.price,
    amount: order.amount,
    tag: signal.tag,
  });
}

export function check_roi(
  strategy: Required<Strategy>,
  current_price: number,
  current_time: number,
  trade: Trade
): Signal {
  const left = trade_left(trade);
  if (left > MIN_SELL) {
    const roi = (current_price - trade.open_rate) / trade.open_rate;
    let roi_expected = strategy.minimal_roi;
    if (typeof strategy.minimal_roi !== "number") {
      const minutes = (current_time - trade.orders[0].place_at) / 60000;
      for (const v of Object.keys(strategy.minimal_roi)
        .map((m) => parseInt(m))
        .sort((a, b) => a - b)) {
        if (minutes >= v) {
          roi_expected = strategy.minimal_roi[v];
        } else {
          break;
        }
      }
    }
    if (roi >= (roi_expected as number)) {
      return {
        amount: left,
        price: current_price,
        tag: "roi",
      };
    }
    if (roi < strategy.stoploss) {
      return {
        amount: left,
        price: current_price,
        tag: "stoploss",
      };
    }
  }
  return {};
}

export async function go_sell(
  _strategy: Required<Strategy>,
  signal: Signal,
  current_time: number,
  wallet: Wallet,
  trade: Trade
) {
  if (!signal.amount || !signal.price) throw new Error("bad signal for sell");
  if (wallet.goods < signal.amount) throw new Error("balance not enough");

  const data = await post2("/api/v5/trade/order", {
    instId: wallet.pair,
    ordType: "limit",
    side: "sell",
    sz: `${signal.amount}`,
    tdMode: "cash",
    tgtCcy: "base_ccy",
    px: `${signal.price}`,
  });
  const id = data[0].ordId;

  const order: Order = {
    id,
    state: OrderState.opened,
    side: OrderSide.sell,
    price: signal.price,
    average: 0,
    amount: signal.amount,
    filled: 0,
    fee: 0,
    place_at: current_time,
  };
  log.info("sell order", {
    trade: trade.id,
    price: order.price,
    amount: order.amount,
    tag: signal.tag,
  });
  trade.orders.push(order);
  trade.is_open = trade_left(trade) > MIN_SELL;
}