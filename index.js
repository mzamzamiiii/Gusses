import 'dotenv/config';
import wolfjs from 'wolf.js';

const { WOLF } = wolfjs;

// ================== إعدادات الفحص ==================
const ROOM_ID = 70505;        // آيدي الروم اللي فيها اللعبة
const GAME_BOT_ID = 26491704;    // ضع هنا آيدي بوت "خمن" بدلاً من آيدي الأكس أو

const service = new WOLF();

// دالة تحليل وتفكيك هيكل الرسالة
function analyzeMessage(message) {
  // تصفية الرسائل لتظهر فقط القادمة من بوت اللعبة داخل الروم المستهدف
  const senderId = Number(message.sourceSubscriberId);
  const groupId = Number(message.targetGroupId);

  if (groupId !== ROOM_ID || senderId !== GAME_BOT_ID) return;

  console.log('\n🎯 ======= [ تم التقاط رسالة من بوت خمن ] =======');
  console.log(`🆔 نوع الرسالة الأساسي (Type): ${message.type}`);
  console.log(`👤 آيدي المرسل: ${senderId}`);
  
  console.log('\n📝 محتوى نص الرسالة (Body):');
  console.log(message.body);

  // إذا كانت منصة ولف ترسل الصورة كمرفق مدمج (Embeds)
  if (message.embeds && message.embeds.length > 0) {
    console.log('\n🔗 تم العثور على ملاحق مدمجة (Embeds):');
    console.log(JSON.stringify(message.embeds, null, 2));
  }

  // طباعة الكائن (Object) كاملاً بصيغة JSON لمعرفة كل خباياه
  console.log('\n🔍 تفكيك الكائن كاملاً (Full Message Object):');
  console.log(JSON.stringify(message, null, 2));
  console.log('==================================================\n');
}

// التنصت على الرسائل الجديدة
service.on('message', async (message) => {
  analyzeMessage(message);
});

// التنصت على تحديثات الرسائل (لو البوت يعدل رسالته ليضع الصورة)
service.on('messageUpdate', async (message) => {
  console.log('🔄 [تنبيه]: حدث تعديل على رسالة قائمة!');
  analyzeMessage(message);
});

service.on('ready', () => {
  console.log('🚀 كاشف ومحلل الرسائل يعمل الآن بنجاح...');
  console.log(`📡 يتم الآن مراقبة الروم [ ${ROOM_ID} ] وبوت اللعبة [ ${GAME_BOT_ID} ]`);
});

service.on('error', (err) => {
  console.error('❌ حدث خطأ في الاتصال:', err);
});

// تسجيل الدخول بالحساب التجريبي
service.login(process.env.U_MAIL_1, process.env.U_PASS_1).catch((err) => {
  console.error('❌ فشل تسجيل الدخول:', err);
});
