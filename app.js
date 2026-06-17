import 'dotenv/config';
import wolfjs from 'wolf.js';

const { WOLF } = wolfjs;
const client = new WOLF();

const ROOM_ID = 215022;
const ALLOWED_USER_ID = 26491704;

async function start() {
  try {
    console.log('🚀 Starting login...');

    await client.login({
      email: process.env.U_MAIL_1,
      password: process.env.U_PASS_1
    });

    console.log('✅ Logged In');

    // ❌ لا تستخدم rooms.join (غير موجود)
    // ✅ إرسال مباشر
    await client.messaging.sendGroupMessage(
      ROOM_ID,
      '!ج'
    );

    console.log('📤 Sent !ج');

  } catch (err) {
    console.error('❌ Error:', err);
  }
}

start();

// 👇 استقبال الرسائل
client.on('message', (msg) => {
  try {
    const senderId =
      msg.sender?.id ||
      msg.sender ||
      msg.from ||
      msg.user;

    if (!senderId) return;
    if (senderId !== ALLOWED_USER_ID) return;

    console.log('✅ Allowed user:', msg.text);

  } catch (e) {
    console.error(e);
  }
});
