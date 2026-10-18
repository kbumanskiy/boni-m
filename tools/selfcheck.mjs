// Проверка проверки: внедряем в живую страницу заведомые нарушения и убеждаемся, что
// checkLayout/checkA11y их видят. Без этого «всё чисто» ничего не значит — проверка могла
// просто не работать. Запуск: node tools/selfcheck.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { CHECK_LAYOUT } from './page-checks.mjs';
const ROOT = new URL('../app/', import.meta.url).pathname;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.webmanifest':'application/manifest+json'};
// INJECT_GUIDE — подмена адреса инструкции в support.js, как в screens.mjs (кадр settingsguide).
let INJECT_GUIDE=false;

const server=createServer(async(req,res)=>{const f=join(ROOT,normalize(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
  try{let b=await readFile(f);
    if(INJECT_GUIDE&&f.endsWith('/js/support.js')) b=Buffer.from(String(b).replace("export const GUIDE_URL = '';","export const GUIDE_URL = 'https://example.org/instrukciya/';"));
    res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,r));
const base=`http://127.0.0.1:${server.address().port}/`;
const args=['--autoplay-policy=no-user-gesture-required'];
let browser; try{browser=await chromium.launch({args});}catch{
  const {glob}=await import('node:fs/promises');
  for await(const p of glob('/root/.cache/ms-playwright/chromium-*/chrome-linux64/chrome')) browser=await chromium.launch({executablePath:p,args});}
const ctx=await browser.newContext({viewport:{width:390,height:844}});
await ctx.addInitScript(()=>localStorage.setItem('boni_m_state',JSON.stringify({version:2,profile:{name:'Тест',callsign:'Boney M',points:0},
  progress:{ru:{learnedCount:9,digitsLearned:0,perChar:{},recent:[],parked:[],lastFirst:null},en:{learnedCount:0,digitsLearned:0,perChar:{},recent:[],parked:[]}},
  settings:{alphabet:'ru',charWpm:18,effWpm:9,keyWpm:12,toneHz:600,volume:0.5,showChants:true,vibration:true,keyMode:'train',theme:'auto'},
  streak:{current:1,longest:1,lastActiveDate:'2026-07-30'},totalSeconds:0,history:[],milestones:{}})));
await ctx.addInitScript(CHECK_LAYOUT);
const page=await ctx.newPage();
await page.goto(base,{waitUntil:'networkidle'});
await page.waitForTimeout(300);

const cases = [
  ['кнопка без названия', () => { const b=document.createElement('button'); b.id='bare'; document.querySelector('#screen').append(b); }],
  ['картинка без alt',    () => { const i=document.createElement('img'); i.src='assets/icon-192.png'; document.querySelector('#screen').append(i); }],
  ['мелкий шрифт',        () => { const d=document.createElement('div'); d.style.fontSize='12px'; d.textContent='мелко'; document.querySelector('#screen').append(d); }],
  ['выход за край',       () => { const d=document.createElement('div'); d.style.cssText='position:absolute;left:500px;width:200px;height:20px;background:red'; d.textContent='за краем'; document.querySelector('#screen').append(d); }],
  ['поле без подписи',    () => { const i=document.createElement('input'); i.type='text'; i.id='nolabel'; document.querySelector('#screen').append(i); }],
  ['повтор id',           () => { const d=document.createElement('div'); d.id='screen'; document.body.append(d); }],
];
let ok=0, bad=0;
for (const [label, inject] of cases) {
  await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(250);
  const before = await page.evaluate(()=>[...checkLayout(),...checkA11y()]);
  await page.evaluate(inject);
  // Подсадная картинка попадает под проверку, только когда у неё появились размеры:
  // до загрузки файла она ничем не отличается от невидимой, и «нет alt» проходит мимо.
  await page.waitForTimeout(150);
  const after = await page.evaluate(()=>[...checkLayout(),...checkA11y()]);
  const found = after.length > before.length;
  console.log(`${found?'✓':'✗'} ловится: ${label}${found?'  → «'+after.filter(x=>!before.includes(x))[0]+'»':'  — НЕ ПОЙМАНО'}`);
  found?ok++:bad++;
}
// Кадр settingsguide: карточка «Как пользоваться» видна только с подставленным адресом.
// Проверка «карточка есть» обязана уметь падать: без подмены карточки быть не должно,
// с подменой — должна. Иначе кадр снялся бы без карточки, а замеры сказали бы «чисто».
for (const inject of [false, true]) {
  INJECT_GUIDE=inject;
  const c2=await browser.newContext({viewport:{width:390,height:844}});
  const p2=await c2.newPage();
  await p2.goto(base,{waitUntil:'networkidle'}); await p2.waitForTimeout(250);
  await p2.evaluate(()=>{localStorage.setItem('boni_m_state',JSON.stringify({version:2,profile:{name:'Тест',callsign:'',points:0}}));});
  await p2.reload({waitUntil:'networkidle'}); await p2.waitForTimeout(250);
  await p2.click('#gear'); await p2.waitForTimeout(250);
  const has=await p2.locator('#guide-card').count()>0;
  const right=has===inject;
  console.log(`${right?'✓':'✗'} кадр settingsguide: ${inject?'с подменой адреса карточка есть':'без подмены карточки нет — проверка «есть карточка» упала бы'}`);
  right?ok++:bad++;
  await c2.close();
}
INJECT_GUIDE=false;

// Замер learnsilent («Послушать ещё раз» и сетка букв выше нижнего меню на 360×780):
// на заведомо длинной надписи он обязан сработать.
{
  const c3=await browser.newContext({viewport:{width:360,height:780}});
  await c3.addInitScript(()=>localStorage.setItem('boni_m_state',JSON.stringify({version:2,profile:{name:'Тест',callsign:'',points:0},
    progress:{ru:{learnedCount:9,digitsLearned:0,perChar:{},recent:[],parked:[],lastFirst:null}}})));
  await c3.addInitScript(CHECK_LAYOUT);
  const p3=await c3.newPage();
  await p3.goto(base,{waitUntil:'networkidle'}); await p3.waitForTimeout(250);
  await p3.click('[data-tab="learn"]'); await p3.waitForTimeout(400);
  const sels=['#again','#opts .opt:last-child'];
  const clean=await p3.evaluate((x)=>checkAboveNav(x),sels);
  await p3.evaluate(()=>{document.querySelector('#fb').innerHTML='<b>Звук не включился.</b><span class="nosound-more">'+'Очень длинное пояснение. '.repeat(30)+'</span>';});
  const long=await p3.evaluate((x)=>checkAboveNav(x),sels);
  const found=clean.length===0&&long.length>0;
  console.log(`${found?'✓':'✗'} ловится: длинная надпись выдавливает «Послушать ещё раз» под меню${found?'  → «'+long[0]+'»':'  — НЕ ПОЙМАНО (чисто до: '+clean.length+')'}`);
  found?ok++:bad++;
  await c3.close();
}


console.log(`\n${bad?'✗ проверка неполная':'✓ проверка рабочая'}: поймано ${ok} из ${ok+bad}`);
await browser.close(); server.close();
process.exit(bad?1:0);
