# Re: ESP32 PWM 文档初稿 / draft review

From: 张工
To: docs team
Subject: Re: ESP32 PWM 文档初稿 / draft review

Hi all,

附上这周整理的素材，麻烦按下面的口径写：

1. 术语用 "duty cycle"（不要写成 duty ratio），中文统一「占空比」。
2. 死区时间写成 dead time，别用 dead band。
3. PWM 频率和分辨率的关系要给一张表（table）。
4. reset 之后要重新配置 channel，可以在 troubleshooting 里说明。
5. 固件升级（firmware update）期间禁止断电。

另外 watchdog timer 的部分我先留空，等下版补。

BR
张工
