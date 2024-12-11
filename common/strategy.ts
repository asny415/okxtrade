export interface Wallet {
  robot: string;
  pair: string; // TON-USDT
  balance: number; // 10000.0
  goods: number;
}

export enum OrderState {
  opened,
  part_filled,
  full_filled,
  canceled,
}

export enum OrderSide {
  buy,
  sell,
}

export interface Order {
  id: string;
  state: OrderState;
  side: OrderSide;
  price: number; // place price: 3 USDT
  average: number; // average price of filled : 2.8 USDT
  amount: number; // 1 TON
  filled: number; // 0.5 TON
  fee: number;
  place_at: number; // timestamp when order placed
  update_at?: number; // timestamp when cancel if canceld
}

export interface Trade {
  id: string;
  pair: string; // TON-USDT
  is_open: boolean;
  open_rate: number;
  amount: number;
  orders: [Order];
  tag: string;
}

export enum DataFrameState {
  uncompleted,
  completed,
}

export interface DataFrame {
  ts: number; //timestamp
  o: number; // open price
  h: number; // high price
  l: number; // low price
  c: number; //close price
  vol: number; //amount in base currency 1000 TON
  volCcy: number; //amount int quote currency 3000 USDT
  confirm: DataFrameState;
}

export interface TimeFrame {
  timeframe: string;
  depth: number;
}

export interface Signal {
  amount?: number;
  price?: number;
  tag?: string;
}

export interface Strategy {
  name?: string;
  timeframes: TimeFrame[];
  minimal_roi?: Record<string, number> | number;
  stoploss?: number;
  populate_buy_trend?: (
    current_time: number,
    current_price: number,
    wallet: Wallet,
    trades: Trade[],
    dfs: DataFrame[][]
  ) => Signal;
  populate_sell_trend?: (
    current_time: number,
    current_price: number,
    wallet: Wallet,
    trades: Trade[],
    dfs: DataFrame[][]
  ) => Signal;
}
