import 'dotenv/config';
import wolfjs from 'wolf.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

const { WOLF } = wolfjs;

const ROOM_ID = 70505;        
const GAME_BOT_ID = 26491704;  
const START_COMMAND = '!ج';    

let service = null;
let isBotReady = false;
let currentCategory = '';      
let watchdogTimer = null;      

// البحث الدقيق في بينج (تم تحديثه)
async function search(imageUrl) {
  try {
    const url = `https://www.bing.com/images/searchbyimage?cbir=sbi&imgurl=${encodeURIComponent(imageUrl)}&setlang=ar`;
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
    const $ = cheerio.load(res.data);
    
    // استهداف العنوان المباشر للشيء المصور
    let result = $('.vstitle a').first().text().trim() || $('.b_focusText').text().trim() || $('title').text().split('-')[0].trim();
    
    // تنظيف النتيجة من كلمات الحشو
    return result.replace(/بحث|Bing|Images|Visual/gi, '').trim();
  } catch { return ''; }
}

// الترجمة
async function translateText(text) {
  if (!text || /[\u0600-\u06FF]/.test(text)) return text;
  try {
    const res = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ar`, { timeout: 3000 });
    return res.data.responseData.translatedText || text;
  } catch { return text; }
}

// التصفية النهائية (كلمة أو كلمتين)
function cleanResult(text) {
  if (!text) return '';
  let clean = text.replace(/[^\u0600-\u06FF\s]/g, '').replace(/\s+/g, ' ').trim();
  let words = clean.split(' ').filter(w => w.length > 1);
  let unique = [...new Set(words)];
  return unique.length > 1 ? unique.slice(0, 2).join(' ') : (unique[0] || '');
}

async function handleMessage(message) {
  if (message.type === 'text/plain') {
    if (message.body.includes('الفئة:')) currentCategory = message.body.split('الفئة:')[1].trim();
    if (message.body.includes('خمنت ذلك في') || message.body.includes('انتهى الوقت')) startWatchdog();
  }

  if (message.type === 'text/image_link') {
    stopWatchdog();
    const raw = await search(message.body);
    const trans = await translateText(raw);
    const final = cleanResult(trans);
    
    if (final) {
      console.log(`🎯 الإجابة: [ ${final} ]`);
      await service.messaging.sendGroupMessage(ROOM_ID, final);
      startWatchdog();
    }
  }
}

function startWatchdog() {
  clearTimeout(watchdogTimer);
  watchdogTimer = setTimeout(async () => {
    if (isBotReady) {
      await service.messaging.sendGroupMessage(ROOM_ID, START_COMMAND);
      startWatchdog();
    }
  }, 25000);
}

function stopWatchdog() { clearTimeout(watchdogTimer); }

function init() {
  service = new WOLF();
  service.on('message', handleMessage);
  service.on('ready', async () => {
    isBotReady = true;
    await service.messaging.sendGroupMessage(ROOM_ID, START_COMMAND);
    startWatchdog();
  });
  service.login(process.env.U_MAIL_1, process.env.U_PASS_1).catch(() => process.exit(1));
}

init();
