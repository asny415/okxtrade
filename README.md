# OKXTrade

**此软件仅用于演示目的，投资有风险，请谨慎使用。**

[![一个简单的基于Deno的量化交易软件](https://img.youtube.com/vi/-03dBL68gwc/0.jpg)](https://www.youtube.com/watch?v=-03dBL68gwc)


## 如何开始

克隆这个仓库

```bash
git clone https://github.com/asny415/okxtrade.git
```

安装或升级最新版本的deno，请参考[deno官网](https://deno.com/)

```bash
curl -fsSL https://deno.land/install.sh | sh
```

下载你需要的数据

```bash
deno run --allow-write --unstable-kv --allow-read --allow-net main.ts download -p TON-USDT -r 20240901-20241001 -t 1H
```

复制并修改自己的投资策略

```bash
cp doc/strategy/sip.ts ./userdata/strategy/
```

执行backtesting

```bash
deno run --allow-write --unstable-kv --allow-read --allow-net main.ts backtesting -p TON-USDT -r 20240901-20241001 --webui
```

添加并编辑 ./userdata/.env 文件，增加以下环境变量

>OKX_ACCESSKEY=[在OKX申请的AccessKey]
>
>OKX_SECRET=[在OKX申请的SECRET]
>
>OKX_PASSPHRASE=[在OKX指定的PASSPHRASE]
>
>TG_TOKEN=[Telegram机器人Token]
>
>TG_CHATID=[Telegram通知发往何处]
>
>HEALTH_PING=[一个好用的心跳网站用于检测你的程序是否存活](https://healthchecks.i)

如果你对一切充满信心，可以开始你的量化之旅了，建议一开始使用小资金量测试.

```bash
deno run --allow-env --allow-write --unstable-kv --allow-read --allow-net main.ts trade -p TON-USDT -s sip  --webui --verbose=2 --telegram
```

本项目源自[一个简单的想法](https://t.me/yygqg/25)，感谢[freqtrade](https://www.freqtrade.io/en/stable/)提供灵感.
