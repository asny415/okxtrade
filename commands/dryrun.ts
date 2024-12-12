import { getLog, load_stragegy, trade_left } from "../common/func.ts";
import { Docable, ParseArgsParam } from "../common/type.ts";
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
import {
  db,
  list,
  persistent_signal,
  persistent_trades,
} from "../common/persistent.ts";

const log = getLog("dryrun");
export const DOC =
  "validate a strategy with real-time live data using a simulated wallet";
export const options: ParseArgsParam & Docable = {
  string: ["pair", "strategy", "wallet"],
  default: {
    pair: "TON-USDT",
    strategy: "sip",
    wallet: "10000",
  },
  alias: { p: "pair", s: "strategy", w: "wallet" },
  doc: {
    pair: "the currency pairs to be retrieved, separated by commas",
    strategy: "the strategy to be used",
    wallet: "the initial amount of the simulated wallet",
  },
};

export async function init_wallet(robot: string, pair: string) {
  const init_value = parseFloat(args.w);
  const wallet: Wallet = {
    robot,
    pair,
    balance: init_value,
    goods: 0,
  };
  const entry = await db.get(["wallet", robot]);
  if (entry) {
    const value = entry.value as number;
    if (value || value === 0) {
      wallet.balance = value;
    }
  } else {
    if (init_value <= 0) {
      throw new Error("wallet balance not set");
    }
    await persistent_wallet(wallet);
  }
  log.info("init balance", wallet.balance);
  return wallet;
}

export async function persistent_wallet(wallet: {
  robot: string;
  balance: number;
}) {
  await db.set(["wallet", wallet.robot], wallet.balance);
}

export async function init_trades(robot: string): Promise<Trade[]> {
  const trades: Trade[] = [];
  const entries = list({ prefix: ["trade", robot] });
  for await (const entry of entries) {
    trades.push(entry.value as Trade);
  }
  return trades;
}

export async function run() {
  const strategy = await load_stragegy();
  const robot = `dryrun-${strategy.name}`;
  args.robot = robot;
  log.info("start dryrun ...", { strategy: strategy.name, args });
  const pairs = args.p.split(",");
  if (pairs.length != 1) {
    throw new Error("only 1 pair allowed");
  }
  const pair = pairs[0];
  const wallet = await init_wallet(robot, pair);
  const trades = await init_trades(robot);

  okxws(
    pair,
    strategy.timeframes,
    async (current_time: number, current_price: number, dfs: DataFrame[][]) => {
      await go(
        robot,
        strategy,
        current_time,
        current_price,
        wallet,
        trades,
        dfs,
        true
      );
    }
  );
}

export async function go(
  robot: string,
  strategy: Required<Strategy>,
  current_time: number,
  current_price: number,
  wallet: Wallet,
  trades: Trade[],
  dfs: DataFrame[][],
  persistent = false
) {
  const buy_signal = strategy.populate_buy_trend(
    current_time,
    current_price,
    wallet,
    trades,
    dfs
  );
  log.debug3("tick test", current_time, current_price, dfs, buy_signal);
  if (buy_signal.amount) {
    await go_buy(strategy, buy_signal, current_time, wallet, trades);
    await persistent_trades(robot, trades);
    await persistent_wallet(wallet);
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
        await persistent_wallet(wallet);
      }
    }
  }
  if (persistent) {
    await persistent_signal(
      robot,
      strategy.timeframes.map((tf, idx) => ({
        name: tf.timeframe,
        dfs: { ...dfs[idx][0], signal: buy_signal },
      }))
    );
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

export function check_roi(
  strategy: Required<Strategy>,
  current_price: number,
  current_time: number,
  trade: Trade
): Signal {
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
  return {};
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
