import 'dotenv/config';
import wolfjs from 'wolf.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { translate } from '@vitalets/google-translate-api';

const { WOLF } = wolfjs;

// ================== ⚙️ الثوابت والإعدادات الأساسية ==================
const ROOM_ID = 70505;        // آيدي الروم المستهدف
const GAME_BOT_ID = 26491704;  // آيدي بوت خمن
const START_COMMAND = '!ج';    // أمر تشغيل اللعبة

let service = null;
let isBotReady = false;
let reconnecting = false;

let currentCategory = '';      
let watchdogTimer = null;      

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0'
];

function getHumanHeaders() {
  const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  return {
    'User-Agent': randomUA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0'
  };
}

// ================== 🌍 منظومة الترجمة الفورية الفكية ==================

async function forceArabicTranslation(text) {
  if (!text) return '';
  const isArabic = /[\u0600-\u06FF]/.test(text);
  if (isArabic) return text;

  try {
    console.log(`🌍 [المترجم]: اكتشاف نص أجنبي [ ${text} ]... جاري التعريب سياقياً...`);
    const { text: translatedText } = await translate(text, { to: 'ar' });
    return translatedText;
  } catch (err) {
    console.log(`⚠️ [المترجم]: فشل خادم الترجمة، استخدام النص الخام.`);
    return text;
  }
}

// ================== 🧼 فلترة وتطهير النص العربي المستخرج ==================

function cleanArabicText(text, category) {
  if (!text) return '';

  // 🚫 قائمة الكلمات المترجمة صوتياً خطأ أو الكلمات الحشوية التي تفسد الحلول
  const arabicJunk = [
    'بانديرا', 'دي', 'أوف', 'ذا', 'سي', 'لا', 'لو', 'بحث', 'صورة', 'صور', 
    'شعار', 'لوجو', 'ويكيبيديا', 'تحميل', 'تنزيل', 'موقع', 'جوجل', 'بينج', 'ياندكس'
  ];

  // تنظيف الرموز
  let clean = text
    .replace(/[❌⭕⭐✨🔍🔴🔵🆚|,\-_()/\\:.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // فك الكلمات وفلترتها بناءً على القائمة السوداء
  let words = clean.split(' ').filter(word => {
    return word.length > 1 && !arabicJunk.includes(word.toLowerCase());
  });

  if (words.length === 0) return '';

  // أخذ أول 3 كلمات كحد أقصى (وهي زبدة الإجابة دائماً مثل: "السويد"، "برج بيزا"، "كريستيانو رونالدو")
  return words.slice(0, 3).join(' ');
}

// ================== 🐕 منظومة حارس الأمان ==================

function startWatchdog() {
  clearTimeout(watchdogTimer);
  watchdogTimer = setTimeout(async () => {
    if (isBotReady) {
      console.log(`🐕 [حارس الأمان]: مرت 25 ثانية! إنعاش الروم بإرسال [ ${START_COMMAND} ]...`);
      await sendGroupMessageWithRetry(ROOM_ID, START_COMMAND);
      startWatchdog();
    }
  }, 25000);
}

function stopWatchdog() {
  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }
}

// ================== 🔍 منظومة القنص العكسي ==================

async function searchYandex(imageUrl) {
  try {
    const searchUrl = `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(imageUrl)}&lang=ar`;
    const headers = getHumanHeaders();
    headers['Referer'] = 'https://www.google.com/'; 

    const response = await axios.get(searchUrl, { headers, timeout: 7000 });
    const $ = cheerio.load(response.data);
    
    const pageTitle = $('title').text().trim();
    console.log(`🤖 [تشخيص Yandex]: عنوان الصفحة هو [ ${pageTitle} ]`);

    if (pageTitle.includes('Captcha') || pageTitle.includes('Robot') || pageTitle.includes('Access Denied')) {
      return '';
    }

    let foundTexts = [];
    $('.CbirTags-Item, .CbirObjectResponse-Title, .CbirItem-Title, .CbirPage-Title').each((i, el) => {
      foundTexts.push($(el).text().trim());
    });

    return foundTexts.join(' ');
  } catch (err) {
    return '';
  }
}

async function searchBing(imageUrl) {
  try {
    const searchUrl = `https://www.bing.com/images/searchbyimage?cbir=sbi&imgurl=${encodeURIComponent(imageUrl)}&setlang=ar&cc=SA`;
    const headers = getHumanHeaders();
    headers['Referer'] = 'https://www.bing.com/';

    const response = await axios.get(searchUrl, { headers, timeout: 7000 });
    const $ = cheerio.load(response.data);
    
    const pageTitle = $('title').text().trim();
    console.log(`🤖 [تشخيص Bing]: عنوان الصفحة هو [ ${pageTitle} ]`);

    let bingResults = [];
    
    if (pageTitle && pageTitle.includes('-')) {
      const cleanGuess = pageTitle.split('-')[0].trim();
      if (!['Bing', 'Search', 'بحث', 'Images', 'صورة', 'Visual'].includes(cleanGuess)) {
        bingResults.push(cleanGuess);
      }
    }

    $('.cb_title, .b_focusText, .vsc_title, .VisualSearchCaptionTitle').each((i, el) => {
      bingResults.push($(el).text().trim());
    });

    return bingResults.join(' ');
  } catch (err) {
    return '';
  }
}

// ================== 🧼 الفلترة والدمج الذكي للمحركات ==================

async function cleanAndFilterResult(rawText, category) {
  if (!rawText) return '';

  console.log(`📋 [نص المحركات الخام]: ${rawText.substring(0, 120)}...`);

  let text = rawText
    .replace(/[❌⭕⭐✨🔍🔴🔵🆚|,\-_()/\\:.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let words = text.split(' ');
  if (words.length === 0 || words[0] === '') return '';

  // 🧠 نأخذ أول 5 كلمات أجنبية كاملة للحفاظ على تماسك الجملة أمام المترجم
  let foreignPhrase = words.slice(0, 5).join(' ');

  // 🌍 ترجمة العبارة بشكل كامل وذكي
  let arabicTranslation = await forceArabicTranslation(foreignPhrase);

  // 🧼 غسيل وتطهير النص العربي من العبارات الصوتية المشوهة
  let finalAnswer = cleanArabicText(arabicTranslation, category);

  console.log(`🧠 [تصفية الذكاء البصري]: الفئة [ ${category} ] ⬅️ الحل المستخرج النهائي [ ${finalAnswer} ]`);
  return finalAnswer;
}

// ================== 🎮 معالجة جولات اللعبة ==================

async function handleIncomingData(message) {
  const bodyText = message.body || '';

  if (message.type === 'text/plain') {
    if (bodyText.includes('الفئة:')) {
      stopWatchdog();
      const match = bodyText.match(/الفئة:\s*([^\r\n]+)/);
      if (match) {
        currentCategory = match[1].trim();
        console.log(`📝 [ذاكرة الفئة]: تم التخزين ⬅️ [ ${currentCategory} ]`);
      }
    }
    
    if (bodyText.includes('خمنت ذلك في') || bodyText.includes('انتهى الوقت')) {
      console.log('🏁 [نهاية الجولة]: بدء عداد الأمان الـ 25 ثانية...');
      currentCategory = ''; 
      startWatchdog();
    }
    return;
  }

  if (message.type === 'text/image_link') {
    stopWatchdog(); 
    const imageUrl = bodyText.trim();
    console.log(`📸 [صيد الهدف]: رابط الصورة: ${imageUrl}`);
    
    const [yandexResult, bingResult] = await Promise.all([
      searchYandex(imageUrl),
      searchBing(imageUrl)
    ]);

    const combinedRawResult = `${yandexResult} ${bingResult}`.trim();
    
    // استدعاء دالة الفلترة المتزامنة
    const finalDecision = await cleanAndFilterResult(combinedRawResult, currentCategory);

    if (finalDecision) {
      const humanDelay = Math.floor(Math.random() * (4500 - 2500 + 1)) + 2500;
      console.log(`⏳ تأخير تفكير بشري [ ${humanDelay}ms ]... إرسال الحل [ ${finalDecision} ]`);
      
      setTimeout(async () => {
        await sendGroupMessageWithRetry(ROOM_ID, finalDecision);
        startWatchdog(); 
      }, humanDelay);
    } else {
      console.log('❌ [فشل القنص]: لم يتم استخراج نتيجة واضحة للصمت البشري.');
      startWatchdog(); 
    }
  }
}

// ================== ✉️ منظومة الإرسال الموثوق ==================

async function sendGroupMessageWithRetry(roomId, text, attempt = 1) {
  if (!service || !isBotReady) return;
  try {
    const response = await service.messaging.sendGroupMessage(roomId, text);
    if (!response || response.isSuccess === false) throw new Error(`رفض السيرفر`);
    console.log(`✅ تم الإرسال بنجاح في القناة: [ ${text} ]`);
  } catch (err) {
    if (attempt < 3) {
      setTimeout(() => sendGroupMessageWithRetry(roomId, text, attempt + 1), 2000);
    }
  }
}

// ================== 📶 ربط الأحداث ==================

function startBot() {
  service = new WOLF();

  service.on('message', async (message) => {
    const senderId = Number(message.sourceSubscriberId);
    const groupId = Number(message.targetGroupId);
    if (groupId === ROOM_ID && senderId === GAME_BOT_ID) {
      handleIncomingData(message);
    }
  });

  service.on('ready', async () => {
    console.log('🚀 [الجاهزية]: بوت قناص خمن المحصن ضد الترجمات العشوائية يعمل الآن.');
    isBotReady = true;
    reconnecting = false;
    
    await sleep(2000);
    await sendGroupMessageWithRetry(ROOM_ID, START_COMMAND);
    startWatchdog();
  });

  const restart = () => {
    if (reconnecting) return;
    reconnecting = true;
    isBotReady = false;
    stopWatchdog();
    console.log('🚨 [اتصال]: انقطاع! محاولة العودة بعد 5 ثوانٍ...');
    setTimeout(startBot, 5000);
  };

  service.on('error', restart);
  service.on('disconnected', restart);
  service.on('close', restart);

  service.login(process.env.U_MAIL_1, process.env.U_PASS_1).catch(restart);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

startBot();
