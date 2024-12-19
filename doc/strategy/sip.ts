import {
  Strategy,
  Wallet,
  Trade,
  DataFrame,
  Signal,
} from "../../common/strategy.ts";
import { trade_left } from "../../common/func.ts";

// 定投策略，每12小时花费总资金的1/6进行定投，增加1%以后卖出
export const strategy: Strategy = {
  name: "sip",
  timeframes: [{ timeframe: "5m", depth: 1 }],
  populate_buy_trend(
    current_time: number,
    current_price: number,
    wallet: Wallet,
    trades: Trade[],
    _dfs: DataFrame[][]
  ): Signal {
    const last_valid_trade = trades
      .filter((t) => !(!t.is_open && t.orders.length == 1))
      .sort((a, b) => b.orders[0].place_at - a.orders[0].place_at)[0];
    if (
      last_valid_trade &&
      current_time - last_valid_trade.orders[0].place_at < 12 * 60 * 60 * 1000
    ) {
      //间隔不到12小时
      return {};
    }
    //钱太少不值当买
    if (wallet.balance < 100) return {};
    const open_trades = trades.filter((t) => t.is_open);
    const total_value =
      wallet.balance +
      open_trades.reduce((r, t) => (r += trade_left(t) * t.open_rate), 0);
    const split_total = 6;
    const money = Math.min(wallet.balance, total_value / split_total); //最多购买1份
    return {
      price: current_price,
      amount: Math.floor((money * 1000) / current_price) / 1000,
    };
  },
};
