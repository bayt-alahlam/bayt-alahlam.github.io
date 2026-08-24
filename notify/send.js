/* فاتورة ٢٧٥ — يشتغل يومياً ٧ صباحاً بتوقيت الرياض عبر GitHub Actions:
   - يفحص فاتورة الشهر الحالي ويرسل تذكيراً بالمستحق حسب تصنيفه (يومي/أسبوعي/نصف شهري/شهري)
   - يوم ٢٧: يرسل تذكير فتح فاتورة الشهر الجديد 💰 */
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

const FREQ_DAYS = { daily: 1, weekly: 7, biweekly: 15, monthly: 30 };
const FREQ_LABEL = { daily: 'يومي', weekly: 'أسبوعي', biweekly: 'نصف شهري', monthly: 'شهري' };

/* توقيت الرياض UTC+3 */
const riyadh = new Date(Date.now() + 3 * 3600 * 1000);
const monthKey = riyadh.toISOString().slice(0, 7);
const dayOfMonth = riyadh.getUTCDate();

const isDue = it => !it.lastDone ||
  (Date.now() - it.lastDone) / 86400000 >= (FREQ_DAYS[it.freq] || 30);

async function sendToHouse(houseRef, payload) {
  const subs = await houseRef.collection('subs').get();
  for (const s of subs.docs) {
    try {
      await webpush.sendNotification(s.data(), payload);
      console.log('sent ✓');
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await s.ref.delete();
        console.log('cleaned expired sub');
      } else {
        console.error('push error:', err.statusCode || err.message);
      }
    }
  }
}

const houses = await db.collection('houses').get();
for (const house of houses.docs) {
  const d = house.data();
  const month = (d.months || {})[monthKey];
  const items = month ? (month.items || []) : [];
  const due = items.filter(isDue);

  /* تذكير المستحقات */
  if (due.length) {
    const byFreq = {};
    for (const it of due) {
      (byFreq[it.freq] = byFreq[it.freq] || []).push(it.name);
    }
    const parts = Object.entries(byFreq)
      .map(([f, names]) => FREQ_LABEL[f] + ': ' + names.join('، '));
    const body = ('عندكم ' + due.length + ' مستحق — ' + parts.join(' | ')).slice(0, 170);
    await sendToHouse(house.ref, JSON.stringify({ title: 'فاتورة ٢٧٥ 🧾', body }));
  }

  /* تذكير يوم ٢٧: فاتورة الشهر الجديد */
  if (dayOfMonth === 27) {
    await sendToHouse(house.ref, JSON.stringify({
      title: 'فاتورة ٢٧٥ 💰',
      body: 'اليوم ٢٧! الراتب نزل — افتحوا فاتورة الشهر الجديد وراجعوا القائمة'
    }));
  }
}
console.log('done');
process.exit(0);
