import 'dotenv/config';
import wolfjs from 'wolf.js';

const { WOLF } = wolfjs;

const client = new WOLF();

// ================== CONFIG ==================
const ROOM_ID = 215022;
const TARGET_USER_ID = 26491704;

let waitingForImage = false;

// ================== LOGIN ==================
client.on('ready', async () => {
  try {
    console.log('✅ Logged in');

    await client.messaging.sendGroupMessage(
      ROOM_ID,
      '!ج'
    );

    console.log('📤 Sent !ج');

    waitingForImage = true;

  } catch (err) {
    console.error('❌ ready error:', err);
  }
});

// ================== FREE AI (HuggingFace) ==================
async function analyzeImage(imageUrl) {
  try {
    const buffer = await fetch(imageUrl).then(r => r.arrayBuffer());

    const res = await fetch(
      "https://api-inference.huggingface.co/models/nlpconnect/vit-gpt2-image-captioning",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/octet-stream"
        },
        body: Buffer.from(buffer)
      }
    );

    const data = await res.json();

    let text = data?.[0]?.generated_text || "Unknown";

    // ✂️ تحويلها لكلمة أو كلمتين فقط
    text = text
      .toLowerCase()
      .replace("a photo of", "")
      .replace("an image of", "")
      .replace("a picture of", "")
      .trim()
      .split(" ")
      .slice(0, 2)
      .join(" ");

    return text || "Unknown";

  } catch (err) {
    console.log("AI ERROR:", err);
    return "Unknown";
  }
}

// ================== GET IMAGE ==================
function getImageUrl(message) {
  return (
    message.imageUrl ||
    message.url ||
    message?.attachment?.url ||
    (typeof message.body === "string" && message.body.startsWith("http")
      ? message.body
      : null)
  );
}

// ================== LISTENER ==================
client.on('groupMessage', async (message) => {
  try {

    // 🔥 شرط العضو + القناة
    if (
      message.sourceSubscriberId !== TARGET_USER_ID ||
      message.targetGroupId !== ROOM_ID
    ) return;

    if (!waitingForImage) return;

    const imageUrl = getImageUrl(message);

    if (!imageUrl) return;

    console.log("🖼️ Image received");

    const result = await analyzeImage(imageUrl);

    console.log("RESULT =", result);

    await client.messaging.sendGroupMessage(
      ROOM_ID,
      result
    );

    waitingForImage = false;

  } catch (err) {
    console.error('❌ error:', err);
  }
});

// ================== START ==================
(async () => {
  try {
    await client.login(
      process.env.U_MAIL_1,
      process.env.U_PASS_1
    );

    console.log('🚀 Bot started');
  } catch (err) {
    console.error('❌ login error:', err);
  }
})();
