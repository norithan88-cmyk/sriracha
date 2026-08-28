import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const OUTPUT_PATH = fileURLToPath(new URL('./air.json', import.meta.url));
const SOURCE_URL = 'https://air4thai.pcd.go.th/services/getNewAQI_JSON.php';

// air4thai.pcd.go.th は中間証明書を正しく送出しておらず、標準のTLS検証だと
// 「unable to verify the first certificate」で失敗する(タイの政府系サイトでよくある
// サーバー側の設定不備)。読み取り専用の公開APIで機密情報も扱わないため、
// この取得だけ検証を緩めて対応する。
function fetchJsonInsecure(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'user-agent': 'sriracha-navi-air-collector/1.0 (+https://sriracha.sunsun.live/)' },
      rejectUnauthorized: false,
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`取得失敗: ${res.statusCode}`));
        res.resume();
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
  });
}

const STATIONS = [
  { id: '33t', label: 'Bo Win (Health Promotion Hospital Bankhaohin)' },
  { id: 'o61', label: 'Thung Sukhla (Laem Chabang Municipal Stadium)' },
];

function numOrNull(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return n;
}

function aqiLevel(aqi) {
  if (aqi == null) return null;
  if (aqi <= 25) return { label: '良好', labelJa: '良好（安全）' };
  if (aqi <= 50) return { label: '普通', labelJa: '普通' };
  if (aqi <= 100) return { label: '敏感な人は注意', labelJa: '敏感な人は屋外活動に注意' };
  if (aqi <= 200) return { label: '健康に影響', labelJa: '健康への影響あり、外出を控えめに' };
  return { label: '危険', labelJa: '危険、屋外活動を避ける' };
}

async function main() {
  const data = await fetchJsonInsecure(SOURCE_URL);
  const all = data.stations || [];

  const stations = STATIONS.map((target) => {
    const found = all.find((s) => s.stationID === target.id);
    if (!found) return null;
    const last = found.AQILast || {};
    const pm25 = last.PM25 || {};
    const aqiInfo = last.AQI || {};
    const aqiValue = numOrNull(aqiInfo.aqi);
    return {
      station_id: found.stationID,
      label: target.label,
      area_th: found.areaTH,
      area_en: found.areaEN,
      lat: Number(found.lat),
      lon: Number(found.long),
      date: last.date || null,
      time: last.time || null,
      pm25_value: numOrNull(pm25.value),
      aqi: aqiValue,
      aqi_level: aqiLevel(aqiValue),
    };
  }).filter(Boolean);

  if (stations.length === 0) throw new Error('シラチャの観測局データを1件も取得できなかったため、既存データを保持します。');

  const payload = {
    updated_at: new Date().toISOString(),
    source_name: 'Air4Thai（タイ公害管理局 公式API）',
    source_url: SOURCE_URL,
    stations,
  };
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`${stations.length}件の観測局データを更新しました。`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
