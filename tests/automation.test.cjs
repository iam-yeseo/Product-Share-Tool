const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../js/automation-core.js');
const settings=require('../data/automation-settings.json');
test('mall-specific codes stay strings and have distinct meanings',()=>{
 assert.equal(settings.categories.retail.length,144);assert.equal(settings.categories.wholesale.length,135);
 assert.equal(C.path(settings.categories.retail,'009006'),'시스템장비-PTZ카메라 > Canon');
 assert.equal(C.path(settings.categories.wholesale,'009006'),'시스템장비-PTZ카메라 > BOLIN');
 assert.match(C.path(settings.categories.retail,'020001'),/오디오 믹서$/);
 C.validateSettings(settings);
});
test('one image omits suffix; multiple images retain order and lowercase dash-free product',()=>{
 const g={brand:'TILTA',product:'TA-T108-C-B',folder:'tilta',extension:'webp',count:1};
 assert.equal(C.generate(g)[0].filename,'tilta-tat108cb.webp');
 const images=C.generate({...g,count:2});
 assert.deepEqual(images.map(i=>i.filename),['tilta-tat108cb-1.webp','tilta-tat108cb-2.webp']);
 assert.equal(C.html(images),'<div align="center">\n  <img src="https://calla.hgodo.com/product/tilta/tilta-tat108cb-1.webp">\n  <img src="https://calla.hgodo.com/product/tilta/tilta-tat108cb-2.webp">\n</div>');
 assert.match(C.html(images.reverse()),/tat108cb-2.webp[\s\S]*tat108cb-1.webp/);
});
test('manual filenames preserve existing hyphens and reject URL/HTML injection and traversal',()=>{
 assert.equal(C.imageUrl({folder:'system',filename:'avmatrix-sd1242-4k-1.jpg'}),'https://calla.hgodo.com/product/system/avmatrix-sd1242-4k-1.jpg');
 for(const filename of ['../x.jpg','x.jpg" onerror="alert(1)','https://evil.test/x.jpg','x.svg','x..jpg',''])assert.equal(C.imageUrl({folder:'audio',filename}),'');
 assert.equal(C.imageUrl({folder:'../audio',filename:'x.jpg'}),'');
 assert.equal(C.html([{folder:'audio',filename:'bad.svg'}]),'');
 assert.throws(()=>C.generate({brand:'',product:'x',count:1,extension:'jpg',folder:'audio'}));
});
test('editing a URL invalidates a previous check and blank drafts remain exportable',()=>{
 const img={folder:'audio',filename:'a-b.jpg'};
 img.validation={url:C.imageUrl(img),status:'valid',width:900,height:1000,checkedAt:'2026-09-07T00:00:00Z'};
 assert.equal(C.validation(img).status,'valid');img.filename='a-c.jpg';assert.equal(C.validation(img).status,'unchecked');
 const row={id:'one',name_own:'상품',need_retail:'필요',need_wholesale:'필요',automation:{categoryCodes:{retail:'020001',wholesale:'009006'},detailImages:[img]}};
 const out=C.exportItem(row,settings);assert.equal(out.categoryCodes.retail,'020001');assert.match(out.categoryPaths.wholesale,/BOLIN$/);assert.equal(out.detailImages[0].order,1);assert.ok(out.issues.length);
 assert.equal(C.normalize(null).detailImages.length,0);
});
test('up to four levels, parent integrity, duplicates and folder mapping',()=>{
 const s=C.clone(settings);s.categories.retail.push({code:'020001001',name:'디지털',parentCode:'020001',folder:'audio'},{code:'020001001001',name:'소형',parentCode:'020001001',folder:''});
 C.validateSettings(s);assert.equal(C.defaultFolder(s.categories.retail,'020001001001'),'audio');
 assert.match(C.path(s.categories.retail,'020001001001'),/오디오 믹서 > 디지털 > 소형$/);
 const duplicate=C.clone(s);duplicate.categories.retail.push(duplicate.categories.retail[0]);assert.throws(()=>C.validateSettings(duplicate));
 s.categories.retail.at(-1).parentCode='019';assert.throws(()=>C.validateSettings(s));
});
const fs=require('node:fs'),vm=require('node:vm');
function validator(Image){const ctx={Image,setTimeout,clearTimeout,Promise,Date};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../js/image-validator.js'),'utf8'),ctx);return ctx.ImageValidator;}
test('image check rejects broken content even if load fired; times out; detects decoded images',async()=>{
 class Good {naturalWidth=900;naturalHeight=1000;set src(v){if(v)queueMicrotask(()=>this.onload?.());} async decode(){}}
 assert.equal((await validator(Good).check('good')).status,'valid');
 class Broken extends Good{async decode(){throw Error('corrupt');}}
 assert.equal((await validator(Broken).check('broken')).status,'error');
 class Stuck{set src(v){}}
 assert.equal((await validator(Stuck).check('stuck',5)).status,'timeout');
});
test('saving the draft never sends completion fields and includes derived HTML',async()=>{
 let called;
 const context={AutomationCore:C,supabaseClient:{async rpc(name,args){called={name,args};return {data:null,error:null};}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../js/api.js'),'utf8'),context);
 const images=C.generate({brand:'Brand',product:'Model',folder:'audio',extension:'jpg',count:1});
 await context.Api.saveDraft({id:'list'},[{id:'item',done:true,done_at:'stamp',automation:{detailImages:images}}],[]);
 assert.equal(called.name,'save_product_draft');assert.equal('done' in called.args.p_items[0],false);assert.equal('done_at' in called.args.p_items[0],false);
 assert.equal(called.args.p_items[0].automation.detailHtml,C.html(images));
});
test('copied rows have independent image data and completion state',()=>{
 let next=0;
 const context={AutomationCore:C,uuid:()=>String(++next),document:{getElementById:()=>null}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../js/state.js'),'utf8'),context);
 const src=context.makeItem(1);src.done=true;src.automation.detailImages=[{id:'original-image',folder:'audio',filename:'a-b.jpg'}];
 const copy=context.copyItem(src);copy.automation.detailImages[0].filename='different.jpg';
 assert.equal(copy.done,false);assert.notEqual(copy.id,src.id);assert.notEqual(copy.automation.detailImages[0].id,src.automation.detailImages[0].id);assert.equal(src.automation.detailImages[0].filename,'a-b.jpg');
});
test('a delayed list response cannot overwrite the currently selected list',async()=>{
 const waiting=new Map();
 const context={State:{items:[]},Api:{fetchList:id=>new Promise(resolve=>waiting.set(id,resolve)),fetchItems:async id=>[{id:'item-'+id,automation:{}}]},AutomationCore:C,AutomationEditor:{publish(){},clearPending(){},afterLoad(){}},UI:{renderAll(){}},setDirty(){},clearSelection(){},updatePageLinks(){},URL,location:{href:'https://example.test/edit/'},history:{replaceState(){}},toast(){},console};
 vm.createContext(context);
 const app=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
 vm.runInContext(app.slice(0,app.indexOf('async function reloadCurrent()')),context);
 const first=context.loadList('old'),second=context.loadList('new');
 waiting.get('new')({id:'new'});await second;
 waiting.get('old')({id:'old'});await first;
 assert.equal(context.State.currentListId,'new');assert.equal(context.State.items[0].id,'item-new');assert.equal(context.State.loading,false);
});
