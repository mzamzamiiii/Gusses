
import 'dotenv/config';
import wolfjs from 'wolf.js';

const { WOLF } = wolfjs;

// ================== الإعدادات ==================
const ROOM_ID = 18595726;

// ID حسابك الثاني / البوت اللي يرسل رسالة:
// اكتب {الان} بعد مرور 5 ثانية للفوز!
const TARGET_USER_ID = 26494626;

// الأمر يرسل مرة واحدة فقط عند تشغيل البوت
const START_COMMAND = '!وقت';

// تعويض تأخير وولف
// إذا النتيجة تطلع 0.12 ثانية متأخر، حط 120
// إذا تبيه بدون تعويض، خله 0
const SEND_LEAD_MS = 100;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let service = null;
let reconnecting = false;
let isBotReady = false;
let activeTimer = null;

// ================== قراءة نص الرسالة ==================
function getMessageText(message) {
  return (message.body || message.content || message.text || message.message || '').trim();
}

// ================== استخراج رقم الغرفة ==================
function getRoomId(message) {
  return Number(
    message.targetGroupId ||
    message.groupId ||
    message.channelId ||
    message.recipientGroupId ||
    message.group?.id ||
    0
  );
}

// ================== تحويل الأرقام العربية إلى إنجليزية ==================
function normalizeNumbers(text) {
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  const hindi = '۰۱۲۳۴۵۶۷۸۹';

  return text.replace(/[٠-٩۰-۹]/g, (d) => {
    if (arabic.includes(d)) return arabic.indexOf(d);
    if (hindi.includes(d)) return hindi.indexOf(d);
    return d;
  });
}

// ================== استخراج الكلمة والوقت ==================
function parseTimingMessage(text) {
  const cleanText = normalizeNumbers(text);

  const wordMatch = cleanText.match(/\{([^}]+)\}/);
  if (!wordMatch) return null;

  const answer = wordMatch[1].trim();

  const timeMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*(ثانية|ثواني|ثوان|second|seconds)/i);
  if (!timeMatch) return null;

  const seconds = Number(timeMatch[1]);
  if (!answer || !seconds || seconds <= 0) return null;

  return {
    answer,
    delayMs: seconds * 1000
  };
}

// ================== إرسال رسالة ==================
async function send(roomId, text) {
  try {
    if (!service || !isBotReady) return false;

    await service.messaging.sendGroupMessage(roomId, text);

    console.log(`🚀 تم الإرسال: ${text}`);
    return true;

  } catch (err) {
    console.log('❌ فشل الإرسال:', err.message);
    return false;
  }
}

// ================== جدولة إرسال الإجابة فقط ==================
function scheduleAnswer(roomId, answer, delayMs) {
  if (activeTimer) {
    console.log('⚠️ يوجد مؤقت شغال، تم تجاهل السؤال الجديد');
    return;
  }

  const finalDelay = Math.max(0, delayMs - SEND_LEAD_MS);

  console.log('--------------------');
  console.log('✅ الكلمة المطلوبة:', answer);
  console.log('⏱️ الوقت المطلوب:', delayMs / 1000, 'ثانية');
  console.log('⚡ التعويض:', SEND_LEAD_MS, 'ms');
  console.log('🚀 سيتم الإرسال بعد:', finalDelay, 'ms');

  activeTimer = setTimeout(async () => {
    await send(roomId, answer);

    activeTimer = null;

    // مهم:
    // لا يتم إرسال !وقت هنا
    // لأنك طلبت أن !وقت يرسل مرة واحدة فقط عند التشغيل

  }, finalDelay);
}

// ================== إعادة تشغيل البوت ==================
async function restartBot(reason) {
  if (reconnecting) return;

  reconnecting = true;
  isBotReady = false;

  console.log('🔄 إعادة تشغيل البوت بسبب:', reason);

  try {
    if (activeTimer) {
      clearTimeout(activeTimer);
      activeTimer = null;
    }

    if (service) {
      service.removeAllListeners();
      await service.logout().catch(() => {});
    }
  } catch {}

  await sleep(5000);
  startBot();
}

// ================== تشغيل البوت ==================
function startBot() {
  service = new WOLF();

  service.on('message', async (message) => {
    try {
      const senderId = Number(message.sourceSubscriberId);
      const roomId = getRoomId(message);
      const text = getMessageText(message);

      if (!text || !message.isGroup) return;
      if (roomId !== ROOM_ID) return;
      if (senderId !== TARGET_USER_ID) return;

      const parsed = parseTimingMessage(text);
      if (!parsed) return;

      scheduleAnswer(roomId, parsed.answer, parsed.delayMs);

    } catch (err) {
      console.log('❌ Message Error:', err.message);
    }
  });

  service.on('ready', async () => {
    console.log('✅ الحساب جاهز');

    isBotReady = true;
    reconnecting = false;

    await sleep(2000);

    // يرسل !وقت مرة واحدة فقط عند تشغيل البوت
    await send(ROOM_ID, START_COMMAND);
  });

  service.on('error', () => restartBot('service error'));
  service.on('disconnected', () => restartBot('disconnected'));
  service.on('close', () => restartBot('close'));

  service.login(process.env.U_MAIL_1, process.env.U_PASS_1).catch(() => {
    reconnecting = false;
    restartBot('login failed');
  });
}

startBot();
