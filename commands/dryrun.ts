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
import { okxws } from "../api/okx.ts";

const log = getLog("dryrun");
export const DOC = "dryrun";
export const options: ParseArgsParam = {
  string: ["pair", "strategy", "wallet"],
  default: {
    pair: "TON-USDT",
    strategy: "hello",
    wallet: "10000",
  },
  alias: { p: "pair", s: "strategy", w: "wallet" },
};

export async function run() {
  const strategy = await load_stragegy();
  log.info("start dryrun ...", { strategy: strategy.name });
  const pairs = args.p.split(",");
  if (pairs.length != 1) {
    throw new Error("only 1 pair allowed");
  }
  const pair = pairs[0];
  const init_value = parseFloat(args.w);
  if (init_value <= 0) {
    throw new Error("wallet balance not set");
  }
  log.info("init balance", init_value);
  const wallet: Wallet = {
    pair,
    balance: init_value,
  };
  const trades: Trade[] = [];

  okxws(
    pair,
    strategy.timeframes,
    (current_time: number, current_price: number, dfs: DataFrame[][]) => {
      if (args.v) {
        log.info("tick test", current_time, current_price, dfs);
      }
      go(strategy, current_time, current_price, wallet, trades, dfs);
    }
  );
}

export async function go(
  strategy: Required<Strategy>,
  current_time: number,
  current_price: number,
  wallet: Wallet,
  trades: Trade[],
  dfs: DataFrame[][]
) {
  const bug_signal = strategy.populate_buy_trend(
    current_time,
    current_price,
    wallet,
    trades,
    dfs
  );
  if (bug_signal) {
    await go_buy(strategy, bug_signal, current_time, wallet, trades);
  }

  for (const trade of trades) {
    const sell_signal = check_roi(strategy, current_price, current_time, trade);
    if (sell_signal) {
      await go_sell(strategy, sell_signal, current_time, wallet, trade);
    }
  }
}

export function go_buy(
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
  const order: Order = {
    state: OrderState.full_filled,
    side: OrderSide.buy,
    price: signal.price,
    average: signal.price,
    amount: signal.amount,
    filled: signal.amount,
    fee: 0,
    place_at: current_time,
    last_fill_at: current_time,
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

export function check_roi(
  strategy: Required<Strategy>,
  current_price: number,
  current_time: number,
  trade: Trade
): Signal | undefined {
  const left = trade_left(trade);
  if (left > 0) {
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
  return;
}

export function go_sell(
  _strategy: Required<Strategy>,
  signal: Signal,
  current_time: number,
  wallet: Wallet,
  trade: Trade
) {
  if (!signal.amount || !signal.price) throw new Error("bad signal for sell");
  const order: Order = {
    state: OrderState.full_filled,
    side: OrderSide.sell,
    price: signal.price,
    average: signal.price,
    amount: signal.amount,
    filled: signal.amount,
    fee: 0,
    place_at: current_time,
    last_fill_at: current_time,
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
