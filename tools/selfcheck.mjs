// Проверка проверки: внедряем в живую страницу заведомые нарушения и убеждаемся, что
// checkLayout/checkA11y их видят. Без этого «всё чисто» ничего не значит — проверка могла
// просто не работать. Запуск: node tools/selfcheck.mjs
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { CHECK_LAYOUT, NAV_FONT_CSS } from './page-checks.mjs';
const ROOT = new URL('../app/', import.meta.url).pathname;
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.webmanifest':'application/manifest+json'};
// INJECT_GUIDE — подмена адреса инструкции в support.js, как в screens.mjs (кадр settingsguide).
let INJECT_GUIDE=false;

const FONTS=new URL('./fonts/',import.meta.url).pathname;
const server=createServer(async(req,res)=>{const u=req.url.split('?')[0];const f=u.startsWith('/__fonts/')?join(FONTS,normalize(u.slice(9))):join(ROOT,normalize(u==='/'?'/index.html':u));
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

// Замер checkLabels (подпись не наезжает на поле): на чистом первом экране — ничего, а когда
// у поля отнять зазор под подписью (как было до правки), обязан сработать.
{
  const c4=await browser.newContext({viewport:{width:360,height:780}});
  await c4.addInitScript(CHECK_LAYOUT);
  const p4=await c4.newPage();
  await p4.goto(base,{waitUntil:'networkidle'}); await p4.waitForTimeout(250);
  const clean=await p4.evaluate(()=>checkLabels());
  await p4.addStyleTag({content:'#name{margin-top:0 !important}'});
  const glued=await p4.evaluate(()=>checkLabels());
  const found=clean.pairs>0&&clean.problems.length===0&&glued.problems.length>0;
  console.log(`${found?'✓':'✗'} ловится: поле вплотную к подписи (наезд обводки на «Как вас зовут?»)${found?'  → «'+glued.problems[0]+'»':'  — НЕ ПОЙМАНО (пар '+clean.pairs+', чисто до: '+clean.problems.length+')'}`);
  found?ok++:bad++;
  await c4.close();
}

// Замер checkInsideCards («Дальше» не торчит из карточки разбора ошибки, 390 точек):
// на настоящем разборе — чисто, а если вернуть кнопкам прежние широкие поля и запретить
// перенос (как было до правки 20.10.2026), обязан сработать.
{
  const c5=await browser.newContext({viewport:{width:390,height:844}});
  await c5.addInitScript(CHECK_LAYOUT);
  const p5=await c5.newPage();
  await p5.goto(base,{waitUntil:'networkidle'}); await p5.waitForTimeout(250);
  await p5.evaluate(()=>{document.querySelector('#screen').innerHTML=`<div class="card reveal"><div class="reveal-char">Это «С»</div>
    <div class="reveal-actions"><button class="btn secondary" id="relisten">Послушать звук</button><button class="btn" id="nextbtn">Дальше</button></div></div>`;});
  const clean=await p5.evaluate(()=>checkInsideCards());
  await p5.addStyleTag({content:'.reveal-actions{flex-wrap:nowrap !important} .reveal-actions .btn{padding-left:22px !important; padding-right:22px !important; width:auto !important; flex:none !important}'});
  const out=await p5.evaluate(()=>checkInsideCards());
  const found=clean.length===0&&out.length>0;
  console.log(`${found?'✓':'✗'} ловится: «Дальше» выходит из карточки разбора ошибки${found?'  → «'+out[0]+'»':'  — НЕ ПОЙМАНО (чисто до: '+clean.length+')'}`);
  found?ok++:bad++;
  await c5.close();
}
// Замер checkNav (нижнее меню, 23.10.2026): на настоящей вёрстке — чисто на 360, 320 и
// на компьютере; если вернуть прежние равные ячейки с жирной активной вкладкой в один ряд
// (320 точек), подписи обязаны «слипнуться», а растянутое на весь экран меню — попасться.
{
  const seed=await page.evaluate(()=>localStorage.getItem('boni_m_state'));
  const res=[];
  for (const [w,h,css] of [[360,780,''],[320,640,''],[1280,800,''],
    [320,640,'nav#tabs{flex-wrap:nowrap !important} nav#tabs button{flex:1 1 0 !important; margin:0 1px !important} nav#tabs button .ic{display:block !important} nav#tabs button.active{font-weight:700 !important}'],
    [1280,800,'nav#tabs{max-width:none !important}']]) {
    const c6=await browser.newContext({viewport:{width:w,height:h}});
    await c6.addInitScript((s)=>localStorage.setItem('boni_m_state',s),seed);
    await c6.addInitScript(CHECK_LAYOUT);
    await c6.addInitScript((css)=>document.addEventListener('DOMContentLoaded',()=>{const st=document.createElement('style');st.textContent=css;document.head.append(st);}),NAV_FONT_CSS);
    const p6=await c6.newPage();
    await p6.goto(base,{waitUntil:'networkidle'}); await p6.evaluate(()=>document.fonts.ready); await p6.waitForTimeout(200);
    if(css) await p6.addStyleTag({content:css});
    res.push(await p6.evaluate(()=>checkNav()));
    await c6.close();
  }
  const found=res.slice(0,3).every((r)=>r.length===0)&&res[3].some((m)=>m.includes('слиплись'))&&res[4].some((m)=>m.includes('растянуто'));
  console.log(`${found?'✓':'✗'} ловится: подписи нижнего меню слиплись / меню растянуто на компьютере${found?'  → «'+res[3][0]+'»':'  — НЕ ПОЙМАНО: '+JSON.stringify(res)}`);
  found?ok++:bad++;
}// Замер checkInsideCards на клетках «Азбуки»: цифры на 320 точках чисты, а с прежними
// полными пробелами в коде и полями клеток (до 23.10.2026) «— — — — —» заезжает в соседнюю.
{
  const seed=await page.evaluate(()=>localStorage.getItem('boni_m_state'));
  const c8=await browser.newContext({viewport:{width:320,height:640}});
  await c8.addInitScript((s)=>localStorage.setItem('boni_m_state',s),seed);
  await c8.addInitScript(CHECK_LAYOUT);
  const p8=await c8.newPage();
  await p8.goto(base,{waitUntil:'networkidle'}); await p8.waitForTimeout(250);
  await p8.click('[data-tab="ref"]'); await p8.waitForTimeout(200); await p8.click('.seg [data-s="digits"]'); await p8.waitForTimeout(200);
  const clean=await p8.evaluate(()=>checkInsideCards());
  await p8.addStyleTag({content:'.cell small{word-spacing:normal !important; letter-spacing:.5px !important} .grid{gap:10px !important} .cell{padding:10px 6px !important}'});
  const out=await p8.evaluate(()=>checkInsideCards());
  const found=clean.length===0&&out.length>0;
  console.log(`${found?'✓':'✗'} ловится: код цифры заезжает в соседнюю клетку «Азбуки»${found?'  → «'+out[0]+'»':'  — НЕ ПОЙМАНО (чисто до: '+JSON.stringify(clean)+')'}`);
  found?ok++:bad++;
  await c8.close();
}
// Замер checkHeroGlow: на главной — чисто, а с прежним кругом света в 92% ширины — ловится.
{
  const seed=await page.evaluate(()=>localStorage.getItem('boni_m_state'));
  const c7=await browser.newContext({viewport:{width:390,height:844}});
  await c7.addInitScript((s)=>localStorage.setItem('boni_m_state',s),seed);
  await c7.addInitScript(CHECK_LAYOUT);
  const p7=await c7.newPage();
  await p7.goto(base,{waitUntil:'networkidle'}); await p7.waitForTimeout(250);
  const clean=await p7.evaluate(()=>checkHeroGlow());
  await p7.addStyleTag({content:'.heroblock::before{width:min(92%,420px) !important; height:auto !important}'});
  const out=await p7.evaluate(()=>checkHeroGlow());
  const found=clean.length===0&&out.length>0;
  console.log(`${found?'✓':'✗'} ловится: круг света за Боней шире рисунка («коврик»)${found?'  → «'+out[0]+'»':'  — НЕ ПОЙМАНО (чисто до: '+JSON.stringify(clean)+')'}`);
  found?ok++:bad++;
  await c7.close();
}
console.log(`\n${bad?'✗ проверка неполная':'✓ проверка рабочая'}: поймано ${ok} из ${ok+bad}`);
await browser.close(); server.close();
process.exit(bad?1:0);
