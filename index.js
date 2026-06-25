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

let currentCategory = '';      
let watchdogTimer = null;      

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
];

function getHumanHeaders() {
  const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  return {
    'User-Agent': randomUA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
  };
}

// ================== 🌍 منظومة الترجمة المستقرة والسريعة (MyMemory API) ==================

async function stableTranslateToArabic(text) {
  if (!text) return '';
  // إذا كان النص يحتوي على حروف عربية بالفعل، لا داعي لترجمته
  const isArabic = /[\u0600-\u06FF]/.test(text);
  if (isArabic) return text;

  try {
    console.log(`🌍 [المترجم المستقر]: جاري ترجمة [ ${text} ] عبر API...`);
    const response = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ar`, { timeout: 4000 });
    
    if (response.data && response.data.responseData) {
      const translated = response.data.responseData.translatedText;
      console.log(`✅ [المترجم]: النتيجة المترجمة ⬅️ [ ${translated} ]`);
      return translated;
    }
    return text;
  } catch (err) {
    console.log(`⚠️ [المترجم]: تعذر الاتصال بالـ API، استخدام النص الأصلي.`);
    return text;
  }
}

// ================== 🧼 تنظيف وتطهير العبارات العربية العشوائية ==================

function cleanArabicText(text, category) {
  if (!text) return '';

  // تنظيف الرموز والأقواس والكلمات الإنجليزية المتبقية
  let clean = text
    .replace(/[❌⭕⭐✨🔍🔴🔵🆚|,\-_()/\\:?؟[\]]/g, ' ')
    .replace(/[a-zA-Z]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // الكلمات غير المرغوبة في غرف الألعاب العربية
  const blacklisted = [
    'بحث', 'صورة', 'صور', 'شعار', 'لوجو', 'ويكيبيديا', 'تحميل', 'تنزيل', 'موقع', 
    'جوجل', 'بينج', 'ياندكس', 'بانديرا', 'دي', 'أوف', 'ذا', 'من', 'على', 'في'
  ];
  
  let words = clean.split(' ').filter(word => word.length > 1 && !blacklisted.includes(word));

  if (words.length === 0) return '';

  // لتجنب تكرار الكلمات مثل "نملة سنجاب نملة"، سنقوم بحذف الكلمات المكررة سياقياً
  let uniqueWords = [...new Set(words)];

  // لضمان إرسال إجابة مركزة، نأخذ أول كلمتين فقط
  return uniqueWords.slice(0, 2).join(' ');
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

// ================== 🔍 منظومة القنص العكسي المحدثة ==================

async function searchYandex(imageUrl) {
  try {
    const searchUrl = `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(imageUrl)}&lang=ar`;
    const response = await axios.get(searchUrl, { headers: getHumanHeaders(), timeout: 6000 });
    const $ = cheerio.load(response.data);
    
    const pageTitle = $('title').text().trim();
    if (pageTitle.includes('Captcha') || pageTitle.includes('Robot')) return '';

    let foundTexts = [];
    $('.CbirTags-Item, .CbirObjectResponse-Title, .CbirItem-Title').each((i, el) => {
      foundTexts.push($(el).text().trim());
    });
    return foundTexts.join(' ');
  } catch (err) {
    return '';
  }
}

async function searchBing(imageUrl) {
  try {
    const searchUrl = `https://www.bing.com/images/searchbyimage?cbir=sbi&imgurl=${encodeURIComponent(imageUrl)}&setlang=ar`;
    const response = await axios.get(searchUrl, { headers: getHumanHeaders(), timeout: 6000 });
    const $ = cheerio.load(response.data);
    
    const pageTitle = $('title').text().trim();
    let bingResults = [];
    
    if (pageTitle && pageTitle.includes('-')) {
      const cleanGuess = pageTitle.split('-')[0].trim();
      if (!['Bing', 'Search', 'بحث', 'Images', 'Visual'].includes(cleanGuess)) {
        bingResults.push(cleanGuess);
      }
    }

    $('.cb_title, .b_focusText, .vsc_title').each((i, el) => {
      bingResults.push($(el).text().trim());
    });

    return bingResults.join(' ');
  } catch (err) {
    return '';
  }
}

// ================== 🧼 معالجة وتصفية النتائج الذكية ==================

async function cleanAndFilterResult(rawText, category) {
  if (!rawText) return '';

  console.log(`📋 [نص المحركات الخام]: ${rawText.substring(0, 100)}...`);

  // فلترة أولية للنص الأجنبي قبل إرساله للترجمة لضمان عدم إرسال كلمات حشوية
  let text = rawText.replace(/[^a-zA-Z\u0600-\u06FF\s]/g, ' ').replace(/\s+/g, ' ').trim();
  let words = text.split(' ').filter(w => w.length > 1);
  if (words.length === 0) return '';

  // نأخذ الكلمات الـ 4 الأولى للترجمة السياقية النظيفة
  let cleanPhrase = words.slice(0, 4).join(' ');

  // الترجمة المضمونة والمستقرة
  let translatedText = await stableTranslateToArabic(cleanPhrase);

  // التطهير النهائي للعربية وإزالة التكرار والحشو
  let finalAnswer = cleanArabicText(translatedText, category);

  console.log(`🧠 [القرار البرمجي النهائي]: الفئة [ ${category} ] ⬅️ [ ${finalAnswer} ]`);
  return finalAnswer;
}

// ================== 🎮 إدارة الأحداث وجولات اللعبة ==================

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
    const finalDecision = await cleanAndFilterResult(combinedRawResult, currentCategory);

    if (finalDecision) {
      const humanDelay = Math.floor(Math.random() * (4000 - 2000 + 1)) + 2000;
      console.log(`⏳ تأخير تفكير بشري [ ${humanDelay}ms ]... إرسال الحل [ ${finalDecision} ]`);
      
      setTimeout(async () => {
        await sendGroupMessageWithRetry(ROOM_ID, finalDecision);
        startWatchdog(); 
      }, humanDelay);
    } else {
      console.log('❌ [فشل القنص]: النتيجة غير واضحة.');
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
    console.log(`✅ تم الإرسال: [ ${text} ]`);
  } catch (err) {
    if (attempt < 3) {
      setTimeout(() => sendGroupMessageWithRetry(roomId, text, attempt + 1), 2000);
    }
  }
}

// ================== 📶 تشغيل المنظومة الميكانيكية ==================

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
    console.log('🚀 [الجاهزية]: بوت قناص خمن المستقر فائق السرعة جاهز الآن.');
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
    console.log('🚨 [اتصال]: جاري إعادة الاتصال التلقائي...');
    setTimeout(startBot, 5000);
  };

  service.on('error', restart);
  service.on('disconnected', restart);
  service.on('close', restart);

  service.login(process.env.U_MAIL_1, process.env.U_PASS_1).catch(restart);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

startBot();
