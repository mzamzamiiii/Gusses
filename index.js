import 'dotenv/config';
import wolfjs from 'wolf.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

const { WOLF } = wolfjs;

// ================== ⚙️ الثوابت والإعدادات الأساسية ==================
const ROOM_ID = 70505;        // آيدي الروم المستهدف
const GAME_BOT_ID = 26491704;  // آيدي بوت خمن
const START_COMMAND = '!ج';    // أمر تشغيل اللعبة

let service = null;
let isBotReady = false;
let reconnecting = false;

// 🧠 الذاكرة المؤقتة للبوت
let currentCategory = '';      // لحفظ الفئة الحالية (انمي، معالم، إلخ)
let watchdogTimer = null;      // 🐕 حارس الأمان ذو الـ 25 ثانية

// 👤 قائمة هويات متصفح حقيقية للمحاكاة البشرية (User-Agents)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

// دالة لجلب هيدرز تحاكي تصفح إنسان حقيقي بالكامل
function getHumanHeaders() {
  const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  return {
    'User-Agent': randomUA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Upgrade-Insecure-Requests': '1'
  };
}

// ================== 🐕 منظومة حارس الأمان والإنعاش التلقائي ==================

function startWatchdog() {
  clearTimeout(watchdogTimer);
  watchdogTimer = setTimeout(async () => {
    if (isBotReady) {
      console.log(`🐕 [حارس الأمان]: مرت 25 ثانية من الركود! إنعاش الروم بإرسال [ ${START_COMMAND} ]...`);
      await sendGroupMessageWithRetry(ROOM_ID, START_COMMAND);
      startWatchdog(); // إعادة تشغيل المؤقت للحماية المستمرة
    }
  }, 25000);
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

// ================== 🔍 منظومة القنص العكسي المطور ==================

async function searchYandex(imageUrl) {
  try {
    const searchUrl = `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(imageUrl)}`;
    const headers = getHumanHeaders();
    headers['Referer'] = 'https://www.google.com/'; 

    const response = await axios.get(searchUrl, { headers, timeout: 7000 });
    const $ = cheerio.load(response.data);
    
    const pageTitle = $('title').text().trim();
    console.log(`🤖 [تشخيص Yandex]: عنوان الصفحة المستلمة هو [ ${pageTitle} ]`);

    if (pageTitle.includes('Captcha') || pageTitle.includes('Robot') || pageTitle.includes('Access Denied')) {
      console.log('⚠️ [Yandex]: انصدمنا بكابتشا ياندكس الحذر.');
      return '';
    }

    let foundTexts = [];

    // جلب النصوص من الكلاسات المحدثة للتعرف البصري في ياندكس
    $('.CbirTags-Item, .CbirObjectResponse-Title, .CbirItem-Title, .CbirPage-Title').each((i, el) => {
      foundTexts.push($(el).text().trim());
    });

    // حيلة إضافية: سحب العناوين من الصور المشابهة تماماً (Similar Images)
    $('.Thumb-Image').each((i, el) => {
      const altText = $(el).attr('alt');
      if (altText) foundTexts.push(altText.trim());
    });

    return foundTexts.join(' ');
  } catch (err) {
    console.log(`⚠️ [Yandex]: خطأ في الاتصال أو انتهت مهلة طلب ياندكس.`);
    return '';
  }
}

async function searchBing(imageUrl) {
  try {
    const searchUrl = `https://www.bing.com/images/searchbyimage?cbir=sbi&imgurl=${encodeURIComponent(imageUrl)}`;
    const headers = getHumanHeaders();
    headers['Referer'] = 'https://www.bing.com/';

    const response = await axios.get(searchUrl, { headers, timeout: 7000 });
    const $ = cheerio.load(response.data);
    
    const pageTitle = $('title').text().trim();
    console.log(`🤖 [تشخيص Bing]: عنوان الصفحة المستلمة هو [ ${pageTitle} ]`);

    let bingResults = [];
    // قشط كلاسات بينج للتعرف البصري
    $('.cb_title, .b_focusText, .vsc_title').each((i, el) => {
      bingResults.push($(el).text().trim());
    });

    return bingResults.join(' ');
  } catch (err) {
    console.log('⚠️ [Bing]: فشل قشط محرك بينج أو انتهت المهلة.');
    return '';
  }
}

// ================== 🧼 فلترة وتصفية الكلمات وتجهيز الحل البشري ==================

function cleanAndFilterResult(rawText, category) {
  if (!rawText) return '';

  console.log(`📋 [نص المحركات الخام]: ${rawText.substring(0, 150)}...`);

  // تنظيف النص بالكامل وحذف الرموز الحشوية المعيقة
  let text = rawText
    .replace(/[❌⭕⭐✨🔍🔴🔵🆚|,\-_()/\\:.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // الكلمات الممنوعة والمصفاة لتجنب الأجوبة الغريبة
  const blacklistedWords = ['صورة', 'البحث', 'خمن', 'لعبة', 'انمي', 'الفئة', 'تحميل', 'جوجل', 'ياندكس', 'شخصية', 'الفنان', 'الممثل', 'تصوير', 'images', 'yandex', 'google', 'captcha'];
  
  let words = text.split(' ').filter(word => {
    return word.length > 1 && !blacklistedWords.includes(word.toLowerCase());
  });

  if (words.length === 0) return '';

  // سحب أول كلمتين لضمان تقديم إجابة سريعة وموجزة تناسب نظام بوت خمن
  let finalAnswer = words.slice(0, 2).join(' ');

  console.log(`🧠 [تصفية الذكاء البصري]: الفئة [ ${category} ] ⬅️ الحل المستخرج [ ${finalAnswer} ]`);
  return finalAnswer;
}

// ================== 🎮 معالجة البيانات وإدارة جولات اللعبة ==================

async function handleIncomingData(message) {
  const bodyText = message.body || '';

  // 1️⃣ التقاط الفئة (الرسالة النصية الأولى)
  if (message.type === 'text/plain') {
    if (bodyText.includes('الفئة:')) {
      stopWatchdog(); // إيقاف مؤقت الأمان لأن اللعبة بدأت بالفعل ولن يتجمد الآن
      
      const match = bodyText.match(/الفئة:\s*([^\r\n]+)/);
      if (match) {
        currentCategory = match[1].trim();
        console.log(`📝 [ذاكرة الفئة]: تم رصد الفئة وتخزينها بنجاح ⬅️ [ ${currentCategory} ]`);
      }
    }
    
    // 2️⃣ رصد نهاية اللعبة لبدء مؤقت الـ 25 ثانية لإنعاش الروم تلقائياً
    if (bodyText.includes('خمنت ذلك في') || bodyText.includes('انتهى الوقت')) {
      console.log('🏁 [نهاية الجولة]: رصد إعلان انتهاء اللعبة، بدء عداد الأمان الـ 25 ثانية...');
      currentCategory = ''; // تصفير الفئة للجولة القادمة
      startWatchdog();
    }
    return;
  }

  // 3️⃣ التقاط رابط الصورة وبدء عملية القنص الفوري عبر المحركات
  if (message.type === 'text/image_link') {
    stopWatchdog(); // أمان إضافي أثناء معالجة الصور
    const imageUrl = bodyText.trim();
    console.log(`📸 [صيد الهدف]: تم استلام رابط الصورة بنجاح: ${imageUrl}`);

    console.log('🚀 [السباق الذكي]: تفعيل المحركات بالتوازي لمحاكاة تصفح بشري...');
    
    // إطلاق محركات البحث العكسي بالتوازي لسرعة خارقة
    const [yandexResult, bingResult] = await Promise.all([
      searchYandex(imageUrl),
      searchBing(imageUrl)
    ]);

    // تجميع نتائج السباق العكسي
    const combinedRawResult = `${yandexResult} ${bingResult}`.trim();
    const finalDecision = cleanAndFilterResult(combinedRawResult, currentCategory);

    if (finalDecision) {
      // ⏳ تأخير بشري عشوائي (تفكير مابين 2.5 إلى 4.5 ثوانٍ) حماية للحساب من باند السرعة التلقائية
      const humanDelay = Math.floor(Math.random() * (4500 - 2500 + 1)) + 2500;
      console.log(`⏳ محاكاة تفكير بشري، إرسال الحل [ ${finalDecision} ] بعد [ ${humanDelay}ms ]...`);
      
      setTimeout(async () => {
        await sendGroupMessageWithRetry(ROOM_ID, finalDecision);
        startWatchdog(); // تشغيل حارس الأمان بعد رمي الإجابة لانتظار الجولة القادمة
      }, humanDelay);
    } else {
      console.log('❌ [فشل القنص]: لم تخرج المحركات بنتيجة واضحة، الصمت البشري هو الحل لتفادي الخطأ.');
      startWatchdog(); // إعادة الحارس لحماية اللعبة من التوقف
    }
  }
}

// ================== ✉️ منظومة الإرسال الموثوق والمحصن ==================

async function sendGroupMessageWithRetry(roomId, text, attempt = 1) {
  if (!service || !isBotReady) return;
  try {
    const response = await service.messaging.sendGroupMessage(roomId, text);
    if (!response || response.isSuccess === false) {
      throw new Error(`كود الرفض أو فشل الإرسال المباشر`);
    }
    console.log(`✅ تم إرسال النص بنجاح في القناة: [ ${text} ]`);
  } catch (err) {
    console.log(`⚠️ فشل إرسال [ ${text} ]، محاولة جولة ثانية [ ${attempt}/3 ]: ${err.message}`);
    if (attempt < 3) {
      setTimeout(() => sendGroupMessageWithRetry(roomId, text, attempt + 1), 2000);
    }
  }
}

// ================== 📶 ربط الأحداث وتشغيل المنظومة الميكانيكية ==================

function startBot() {
  service = new WOLF();

  // الاستماع للرسائل داخل الغرف والتحقق من الهويات المستهدفة
  service.on('message', async (message) => {
    const senderId = Number(message.sourceSubscriberId);
    const groupId = Number(message.targetGroupId);
    if (groupId === ROOM_ID && senderId === GAME_BOT_ID) {
      handleIncomingData(message);
    }
  });

  service.on('ready', async () => {
    console.log('🚀 [الجاهزية]: بوت قناص خمن يعمل الآن بكفاءة بشرية قصوى ومجاني 100%.');
    isBotReady = true;
    reconnecting = false;
    
    // بدء الشرارة الأولى فور الدخول للروم بنجاح
    await sleep(2000);
    console.log(`🔥 إشعال اللعبة لأول مرة عبر إرسال: [ ${START_COMMAND} ]`);
    await sendGroupMessageWithRetry(ROOM_ID, START_COMMAND);
    startWatchdog();
  });

  // إعادة الاتصال التلقائي الصارم في حال حدوث أي دروب بالشبكة لضمان عمله 24/7
  const restart = () => {
    if (reconnecting) return;
    reconnecting = true;
    isBotReady = false;
    stopWatchdog();
    console.log('🚨 [اتصال]: تم قطع الاتصال! جاري محاولة إعادة الإنعاش والاتصال بعد 5 ثوانٍ...');
    setTimeout(startBot, 5000);
  };

  service.on('error', restart);
  service.on('disconnected', restart);
  service.on('close', restart);

  // الدخول بحساب البوت المخصص من ملف الـ .env
  service.login(process.env.U_MAIL_1, process.env.U_PASS_1).catch(restart);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// انطلاق!
startBot();
