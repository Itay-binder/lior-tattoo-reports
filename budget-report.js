const https = require('https');

const META_TOKEN = process.env.META_TOKEN;
const GREENAPI_INSTANCE = process.env.GREENAPI_INSTANCE || '7105326802';
const GREENAPI_TOKEN = process.env.GREENAPI_TOKEN;
const AD_ACCOUNT = process.env.AD_ACCOUNT || 'act_1026356652124107';
const TARGET = process.env.TARGET || '120363422423851402@g.us';

function metaGet(path, params) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ ...params, access_token: META_TOKEN }).toString();
    https.get('https://graph.facebook.com/v21.0/' + path + '?' + qs, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

function greenSend(message) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ chatId: TARGET, message });
    const opts = {
      hostname: 'api.green-api.com',
      path: '/waInstance' + GREENAPI_INSTANCE + '/sendMessage/' + GREENAPI_TOKEN,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function dateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

function categorize(name) {
  if (/שיעור.*מתנה|giftlesson/i.test(name)) return 'gift';
  if (/תנועה.*פרופיל|CBO.*תנועה|תנועה.*CBO/i.test(name)) return 'traffic';
  if (/מעורבות|engagement/i.test(name)) return 'engagement';
  if (/לידים|leads?/i.test(name)) return 'leads';
  return 'other';
}

async function main() {
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const since = new Date(today.getFullYear(), today.getMonth(), 7);
  const timeRange = JSON.stringify({ since: dateStr(since), until: dateStr(today) });
  const monthLabel = `${dateStr(since)} — ${dateStr(today)}`;

  // קבל spend לפי קמפיין לשתי תקופות
  const [camY, camM] = await Promise.all([
    metaGet(AD_ACCOUNT + '/insights', {
      fields: 'campaign_id,campaign_name,spend',
      date_preset: 'yesterday',
      level: 'campaign',
      limit: 50
    }),
    metaGet(AD_ACCOUNT + '/insights', {
      fields: 'campaign_id,campaign_name,spend',
      time_range: timeRange,
      level: 'campaign',
      limit: 50
    }),
  ]);

  const cats = { gift: 0, traffic: 0, engagement: 0, leads: 0, other: 0 };
  const catsM = { gift: 0, traffic: 0, engagement: 0, leads: 0, other: 0 };

  for (const row of (camY.data || [])) {
    const cat = categorize(row.campaign_name);
    cats[cat] += parseFloat(row.spend) || 0;
  }
  for (const row of (camM.data || [])) {
    const cat = categorize(row.campaign_name);
    catsM[cat] += parseFloat(row.spend) || 0;
  }

  const r = n => '₪' + Math.round(n);
  const totalY = cats.gift + cats.traffic + cats.engagement + cats.leads + cats.other;
  const totalM = catsM.gift + catsM.traffic + catsM.engagement + catsM.leads + catsM.other;

  const msg =
    '\u{1F4CA} *סיכום תקציבים יומי — Tattoo Story*\n\n' +
    `*אתמול (${dateStr(yesterday)}):*\n` +
    `• תנועה לשיעור מתנה: ${r(cats.gift)}\n` +
    `• תנועה לפרופיל: ${r(cats.traffic)}\n` +
    `• מעורבות/חימום: ${r(cats.engagement)}\n` +
    `• לידים: ${r(cats.leads)}\n` +
    `*סה״כ אתמול: ${r(totalY)}*\n\n` +
    `*מה-7 לחודש (${monthLabel}):*\n` +
    `• תנועה לשיעור מתנה: ${r(catsM.gift)}\n` +
    `• תנועה לפרופיל: ${r(catsM.traffic)}\n` +
    `• מעורבות/חימום: ${r(catsM.engagement)}\n` +
    `• לידים: ${r(catsM.leads)}\n` +
    `*סה״כ החודש: ${r(totalM)}*`;

  console.log(msg);
  const result = await greenSend(msg);
  console.log('Sent:', result);
}

main().catch(err => { console.error(err); process.exit(1); });
