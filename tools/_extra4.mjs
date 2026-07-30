import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT='/root/Projects/MorseTrainer/app/';
const OUT='/tmp/claude-0/-root-Projects-MorseTrainer/bd88d722-2c99-470d-863f-c73330edf9eb/scratchpad/';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{const p=req.url.split('?')[0];const f=join(ROOT,normalize(p==='/'?'/index.html':p));try{const b=await readFile(f);res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(0,r));
const base=`http://127.0.0.1:${server.address().port}/`;
const SEED={version:2,profile:{name:'Бонислав',callsign:'Boney M',points:148},progress:{ru:{learnedCount:9,digitsLearned:0,parked:[],lastFirst:'Н',recent:[1,1,1,0,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1],perChar:{'Е':{correct:31,total:34},'Т':{correct:28,total:30},'И':{correct:26,total:29},'М':{correct:24,total:27},'А':{correct:19,total:22},'Н':{correct:17,total:20},'С':{correct:14,total:17},'О':{correct:11,total:13},'У':{correct:5,total:7}}},en:{learnedCount:0,digitsLearned:0,perChar:{},recent:[],parked:[],lastFirst:null}},settings:{alphabet:'ru',charWpm:18,effWpm:9,keyWpm:12,toneHz:600,volume:0.5,showChants:true,vibration:true,keyMode:'train',theme:'auto'},streak:{current:4,longest:7,lastActiveDate:'2026-07-30'},totalSeconds:3420,history:[{date:'2026-07-30',answers:20,accuracyPct:94}],milestones:{first4:true,tenMin:true}};
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'});
const shots=async(scheme, seeded)=>{
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:scheme,locale:'ru-RU'});
  const page=await ctx.newPage();
  page.on('pageerror',e=>console.log('ERR',scheme,seeded,e.message));
  if (seeded) await page.addInitScript((s)=>{localStorage.setItem('boni_m_state',JSON.stringify(s));},SEED);
  await page.goto(base);await page.waitForTimeout(900);
  if (seeded) {
    await page.screenshot({path:`${OUT}y-home-${scheme}.png`});
    await page.click('[data-tab="key"]');await page.waitForTimeout(400);
    const pad=page.locator('#pad');
    await pad.dispatchEvent('pointerdown');await page.waitForTimeout(70);await pad.dispatchEvent('pointerup');await page.waitForTimeout(900);
    await page.screenshot({path:`${OUT}y-keyverdict-${scheme}.png`});
    await page.click('.seg [data-m="free"]');await page.waitForTimeout(300);
    for (let i=0;i<3;i++){ await pad.dispatchEvent('pointerdown'); await page.waitForTimeout(70); await pad.dispatchEvent('pointerup'); await page.waitForTimeout(500); }
    await page.waitForTimeout(1400);
    await pad.dispatchEvent('pointerdown'); await page.waitForTimeout(320); await pad.dispatchEvent('pointerup'); await page.waitForTimeout(1600);
    await page.screenshot({path:`${OUT}y-keyfree-${scheme}.png`});
  } else {
    await page.screenshot({path:`${OUT}y-onboarding-${scheme}.png`});
    await page.locator('#name').fill('Бонислав'); await page.waitForTimeout(300);
    await page.screenshot({path:`${OUT}y-onboarding2-${scheme}.png`});
    await page.click('#next'); await page.waitForTimeout(500);
    await page.screenshot({path:`${OUT}y-onboarding3-${scheme}.png`});
  }
  await ctx.close();
};
await shots('light', true); await shots('dark', true); await shots('light', false);
await browser.close();server.close();console.log('done');
