import 'dotenv/config';
import wolfjs from 'wolf.js';

const { WOLF } = wolfjs;
const client = new WOLF();

const ROOM_ID = 123456;
const GUESS_BOT_ID = 987654321;

client.on('ready', async () => {
  console.log('✅ Logged In');

  try {
    await client.messaging.sendGroupMessage(
      ROOM_ID,
      '!ج'
    );

    console.log('📤 Sent !ج');
  } catch (err) {
    console.error(err);
  }
});

client.on('message', async (message) => {

  try {

    if (!message.isGroup) return;

    if (message.groupId !== ROOM_ID) return;

    if (message.senderId !== GUESS_BOT_ID) return;

    console.log('\n==============================');
    console.log('📩 MESSAGE FROM GUESS BOT');
    console.log('==============================\n');

    console.log('TYPE:', message.type);

    console.dir(message, {
      depth: null,
      colors: true
    });

    console.log('\n========== JSON ==========\n');

    try {
      console.log(
        JSON.stringify(message, null, 2)
      );
    } catch (e) {
      console.log('Cannot stringify message');
    }

    console.log('\n==========================\n');

  } catch (err) {
    console.error(err);
  }

});

client.login(
  process.env.U_MAIL_1,
  process.env.U_PASS_1
);
