# シラチャの大気質（PM2.5）自動更新

タイ公害管理局の公式API「Air4Thai」から、シラチャ管内の観測局2局
（Bo Win／Thung Sukhla）のPM2.5・AQIを毎日取得して`air.json`に保存する。

- 更新：毎日1回（GitHub Actions）
- 情報源：https://air4thai.pcd.go.th/services/getNewAQI_JSON.php
- 注意：このサイトはTLS証明書チェーンの送出に不備があり、標準の証明書検証では
  取得できない。読み取り専用の公開データのため、`collect-air.mjs`内で
  この取得だけ検証を緩めて対応している。
