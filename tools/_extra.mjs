import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = '/root/Projects/MorseTrainer/app/';
const OUT = '/tmp/claude-0/-root-Projects-MorseTrainer/bd88d722-2c99-470d-863f-c73330edf9eb/scratchpad/';
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.webmanifest':'application/manifest+json' };
const server = createServer(async (req,res)=>{
  const p = req.url.split('?')[0];
  const f = join(ROOT, normalize(p==='/'?'/index.html':p));
  try { const b = await readFile(f); res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'}); res.end(b); }
  catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r=>server.listen(0,r));
const base = `http://127.0.0.1:${server.address().port}/`;

const SEED = {
  version:2,
  profile:{name:'Бонислав',callsign:'Boney M',points:148},
  progress:{ ru:{learnedCount:9,digitsLearned:0,parked:[],lastFirst:'Н',
      recent:[1,1,1,0,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1],
      perChar:{'Е':{correct:31,total:34},'Т':{correct:28,total:30},'И':{correct:26,total:29},'М':{correct:24,total:27},'А':{correct:19,total:22},'Н':{correct:17,total:20},'С':{correct:14,total:17},'О':{correct:11,total:13},'У':{correct:5,total:7}}},
    en:{learnedCount:0,digitsLearned:0,perChar:{},recent:[],parked:[],lastFirst:null}},
  settings:{alphabet:'ru',charWpm:18,effWpm:9,keyWpm:12,toneHz:600,volume:0.5,showChants:true,vibration:true,keyMode:'train',theme:'auto'},
  streak:{current:4,longest:7,lastActiveDate:'2026-07-30'},
  totalSeconds:3420,
  history:[{date:'2026-07-26',answers:22,accuracyPct:82},{date:'2026-07-27',answers:19,accuracyPct:89},{date:'2026-07-28',answers:26,accuracyPct:91},{date:'2026-07-29',answers:24,accuracyPct:87},{date:'2026-07-30',answers:20,accuracyPct:94}],
  milestones:{first4:true,tenMin:true},
};

const browser = await chromium.launch({ channel: undefined, executablePath: '/root/.cache/ms-playwright/chromium-1234/chrome-linux/chrome' });
const ctx = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:'light',locale:'ru-RU'});
const page = await ctx.newPage();
await page.addInitScript((s)=>{ localStorage.setItem('boni_m_state', JSON.stringify(s)); localStorage.setItem('boni_m_onboarded','1'); }, SEED);
await page.goto(base); await page.waitForTimeout(600);

const shot = async (name, full=false) => { await page.screenshot({path:OUT+name+'.png', fullPage:full}); console.log('saved',name); };

// Азбука: цифры и знаки
await page.click('[data-tab="ref"]'); await page.waitForTimeout(300);
await page.click('.seg [data-s="digits"]'); await page.waitForTimeout(300); await shot('x-ref-digits');
await page.click('.seg [data-s="punct"]'); await page.waitForTimeout(300); await shot('x-ref-punct', true);
// карточка знака
await page.click('.cell'); await page.waitForTimeout(300); await shot('x-ref-card');
await page.click('#x'); await page.waitForTimeout(200);
// English буквы
await page.click('.seg [data-s="letters"]'); await page.waitForTimeout(200);
await page.click('.seg [data-a="en"]'); await page.waitForTimeout(300); await shot('x-ref-en');

// Кабинет целиком
await page.click('[data-tab="cabinet"]'); await page.waitForTimeout(400); await shot('x-cabinet-full', true);

// Учиться: разбор ошибки (текущий код)
await page.click('[data-tab="learn"]'); await page.waitForTimeout(1200);
for (let i=0;i<14;i++){
  const btn = page.locator('#opts .opt:not([disabled])').first();
  if(!(await btn.count())){ await page.waitForTimeout(400); continue; }
  await btn.click(); await page.waitForTimeout(300);
  if (await page.locator('#nextbtn').count()) break;
  await page.waitForTimeout(600);
}
await shot('x-learnwrong-now');
// подсказка
await page.locator('#nextbtn').click().catch(()=>{});
await page.waitForTimeout(900);
if (await page.locator('#help').count()) { await page.click('#help'); await page.waitForTimeout(300); await shot('x-learnhelp-now'); await shot('x-learnhelp-now-full', true); }

// Ключ: верный ответ
await page.click('[data-tab="key"]'); await page.waitForTimeout(400);
const target = await page.locator('.taskchar').innerText();
console.log('target', target);
await shot('x-key-now');
await browser.close(); server.close();
