import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT='/root/Projects/MorseTrainer/app/';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{const p=req.url.split('?')[0];const f=join(ROOT,normalize(p==='/'?'/index.html':p));try{const b=await readFile(f);res.writeHead(200,{'content-type':MIME[extname(f)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(0,r));
const base=`http://127.0.0.1:${server.address().port}/`;
const SEED={version:2,profile:{name:'Бонислав',callsign:'Boney M',points:148},progress:{ru:{learnedCount:9,digitsLearned:0,parked:[],lastFirst:'Н',recent:[1,1,1,0,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1],perChar:{'Е':{correct:31,total:34},'Т':{correct:28,total:30},'И':{correct:26,total:29},'М':{correct:24,total:27},'А':{correct:19,total:22},'Н':{correct:17,total:20},'С':{correct:14,total:17},'О':{correct:11,total:13},'У':{correct:5,total:7}}},en:{learnedCount:0,digitsLearned:0,perChar:{},recent:[],parked:[],lastFirst:null}},settings:{alphabet:'ru',charWpm:18,effWpm:9,keyWpm:12,toneHz:600,volume:0.5,showChants:true,vibration:true,keyMode:'train',theme:'auto'},streak:{current:4,longest:7,lastActiveDate:'2026-07-30'},totalSeconds:3420,history:[{date:'2026-07-30',answers:20,accuracyPct:94}],milestones:{first4:true,tenMin:true}};
const browser=await chromium.launch({executablePath:'/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,colorScheme:'light',locale:'ru-RU'});
const page=await ctx.newPage();
await page.addInitScript((s)=>{localStorage.setItem('boni_m_state',JSON.stringify(s));},SEED);
await page.goto(base);await page.waitForTimeout(700);
// подписи в нижнем меню
console.log('TABS', JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('nav#tabs button')].map(b=>{const r=b.getBoundingClientRect();const t=document.createRange();t.selectNodeContents(b.childNodes[1]);const tr=t.getBoundingClientRect();return {label:b.textContent.trim(),btn:[Math.round(r.left),Math.round(r.right)],text:[Math.round(tr.left),Math.round(tr.right)],fs:getComputedStyle(b).fontSize};}))));
await page.click('[data-tab="learn"]');await page.waitForTimeout(1300);
const before=await page.evaluate(()=>[...document.querySelectorAll('.opt')].map(b=>{const r=b.getBoundingClientRect();return {c:b.textContent,top:Math.round(r.top),bottom:Math.round(r.bottom)};}));
console.log('OPTS до ответа', JSON.stringify(before));
for(let i=0;i<14;i++){const btn=page.locator('#opts .opt:not([disabled])').first();if(!(await btn.count())){await page.waitForTimeout(400);continue;}await btn.click();await page.waitForTimeout(250);if(await page.locator('#nextbtn').count())break;await page.waitForTimeout(600);}
console.log('ПОСЛЕ неверного:', JSON.stringify(await page.evaluate(()=>{const g=(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.top),Math.round(r.bottom)];};return {nextbtn:g('#nextbtn'),relisten:g('#relisten'),opt1:g('.opt'),again:g('#again')};})));
await browser.close();server.close();
