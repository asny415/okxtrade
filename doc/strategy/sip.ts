import moment from "https://deno.land/x/momentjs@2.29.1-deno/mod.ts";
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
    const now = new Date(current_time);
    const trade_tag = moment(now).format("YYYYMMDDHH");
    if (now.getMinutes() == 55 && now.getHours() % 12 == 10) {
      if (trades.filter((t) => t.tag == trade_tag).length > 0) return {};
    } else {
      return {};
    }
    const open_trades = trades.filter((t) => t.is_open);
    const total_value =
      wallet.balance +
      open_trades.reduce((r, t) => (r += trade_left(t) * t.open_rate), 0);
    const split_total = 6;
    const left_rate = wallet.balance / total_value;
    if (left_rate < 1 / split_total) return {};
    return {
      price: current_price,
      amount: total_value / split_total / current_price,
      tag: trade_tag,
    };
  },
};
