import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const read = f => readFile(new URL('../'+f,import.meta.url),'utf8');
const maps = 'https://maps.app.goo.gl/kv8LRzvJqHKnKVfq5?g_st=ic';
test('customer website and PWA are Cera Day & Night',async()=>{
 const [html,manifest,icon,worker,js] = await Promise.all([read('index.html'),read('guest.webmanifest'),read('icon.svg'),read('guest-sw.js'),read('venue.js')]);
 assert.match(html,/Cera Day &amp; Night/);
 assert.equal(JSON.parse(manifest).name,'Cera Day & Night');
 assert.match(icon,/Cera Day and Night/);
 assert.match(worker,/cera-day-night-shell-v3/);
 assert.match(js,/Cera Day & Night/);
 for(const file of [html,manifest,icon,worker,js])assert.doesNotMatch(file,/Tân Design|Cera Bar & Lounge/);
});
test('owner supplied Maps link is used for every navigation and JSON-LD',async()=>{
 const html=await read('index.html');
 assert.ok(html.includes(maps));
 assert.match(html,/"hasMap":"https:\/\/maps\.app\.goo\.gl\/kv8LRzvJqHKnKVfq5/);
 assert.doesNotMatch(html,/aKr6zDGaxRdEsH2n6|B2-02S05A/);
});
test('red-black glassmorphism remains accessible and photos are authentic',async()=>{
 const [html,css,base] = await Promise.all([read('index.html'),read('cera-theme.css'),read('venue.css')]);
 assert.ok(html.includes('cera-theme.css'));
 assert.match(css,/--cera-red:#f04465/);
 assert.match(css,/backdrop-filter:blur/);
 assert.match(css,/prefers-reduced-transparency/);
 assert.match(css,/prefers-reduced-motion/);
 assert.match(base,/\.hero/);
 assert.doesNotMatch(html,/images\.unsplash\.com/);
 for(const file of ['assets/cera-hero.avif','assets/cera-gallery-02.avif','assets/cera-gallery-03.avif']){
   assert.ok((await stat(new URL('../'+file,import.meta.url))).size>2000,'Missing real photo: '+file);
   assert.ok(html.includes(file.split('/').at(-1)));
 }
});
