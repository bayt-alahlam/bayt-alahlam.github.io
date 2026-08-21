/* يشتغل يومياً عبر GitHub Actions:
   يقرأ القوائم من Firestore، يحسب المستحق، ويرسل إشعار لجوالات البيت */
import admin from 'firebase-admin';
import webpush from 'web-push';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

webpush.setVapidDetails(
  'mailto:home@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const FREQ_DAYS = { weekly: 7, biweekly: 14, monthly: 30 };
const isDue = it => !it.lastDone ||
  (Date.now() - it.lastDone) / 86400000 >= FREQ_DAYS[it.freq];

const houses = await db.collection('houses').get();
for (const house of houses.docs) {
  const items = (house.data().items || []).filter(isDue);
  if (!items.length) continue;

  const names = items.map(i => i.name).join('، ');
  const payload = JSON.stringify({
    title: 'مذكّرة البيت 🏠',
    body: `تذكير: عندكم ${items.length} حان موعدها — ${names}`.slice(0, 180)
  });

  const subs = await house.ref.collection('subs').get();
  for (const s of subs.docs) {
    try {
      await webpush.sendNotification(s.data(), payload);
      console.log('sent ✓');
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await s.ref.delete(); // اشتراك قديم/ملغي — ننظفه
        console.log('cleaned expired sub');
      } else {
        console.error('push error:', err.statusCode || err.message);
      }
    }
  }
}
console.log('done');
process.exit(0);
