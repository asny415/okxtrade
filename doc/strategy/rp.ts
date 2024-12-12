import moment from "https://deno.land/x/momentjs@2.29.1-deno/mod.ts";
import {
  Strategy,
  Wallet,
  Trade,
  DataFrame,
  Signal,
} from "../../common/strategy.ts";
import { trade_left } from "../../common/func.ts";

interface MySignal {
  ma5: number;
  ma20: number;
}

export const strategy: Strategy = {
  name: "reversal_point",
  timeframes: [{ timeframe: "5m", depth: 30 }],
  populate_sell_trend(
    _current_time: number,
    _current_price: number,
    _wallet: Wallet,
    _trade: Trade,
    dfs: DataFrame[][],
    signal: Signal
  ): Signal {
    if (dfs[0].length < 21) throw new Error("should not happen");
    //dfs里面只包含一个5m蜡烛数据，长度不超过30，按照时间从新到旧排序
    //判断当前是否处于下跌的拐点。
    const ma5 = dfs[0].slice(0, 5).reduce((r, i) => r + i.c, 0) / 5;
    const ma20 = dfs[0].slice(0, 20).reduce((r, i) => r + i.c, 0) / 20;
    const should_sell = ma5 < ma20;
    if (should_sell) {
      return signal;
    }
    return {};
  },
  populate_buy_trend(
    current_time: number,
    current_price: number,
    wallet: Wallet,
    trades: Trade[],
    dfs: DataFrame[][]
  ): Signal & MySignal {
    if (dfs[0].length < 21) throw new Error("should not happen");

    //dfs里面只包含一个5m蜡烛数据，长度不超过30，按照时间从新到旧排序
    //判断当前是否处于下跌的拐点。
    const ma5 = dfs[0].slice(0, 5).reduce((r, i) => r + i.c, 0) / 5;
    const lastma5 = dfs[0].slice(1, 6).reduce((r, i) => r + i.c, 0) / 5;
    const ma20 = dfs[0].slice(0, 20).reduce((r, i) => r + i.c, 0) / 20;
    const lastma20 = dfs[0].slice(1, 21).reduce((r, i) => r + i.c, 0) / 20;
    const isBRP = ma5 > ma20 && lastma5 < lastma20;
    if (!isBRP) return { ma5, ma20 };
    const MIN_BUY = 100;
    if (wallet.balance < MIN_BUY) return { ma5, ma20 };

    //两次购买价格差必须超过2%
    const last_open_trade = [...trades]
      .filter((t) => t.is_open)
      .sort((a, b) => b.orders[0].place_at - a.orders[0].place_at)[0];
    if (last_open_trade) {
      if (last_open_trade.open_rate <= current_price * 1.02)
        return { ma5, ma20 };
    }

    const now = new Date(current_time);
    const trade_tag = moment(now).format("YYYYMMDDHH");

    const open_trades = trades.filter((t) => t.is_open);
    const total_value =
      wallet.balance +
      open_trades.reduce((r, t) => (r += trade_left(t) * t.open_rate), 0);
    const split_total = 3;
    const money = Math.min(wallet.balance, total_value / split_total); //最多购买1份
    return {
      price: current_price,
      amount: Math.floor((money * 1000) / current_price) / 1000,
      tag: trade_tag,
      ma5,
      ma20,
    };
  },
};
