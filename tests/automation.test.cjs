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
test('saving the draft includes retail regular price, excludes completion fields, and derives HTML',async()=>{
 let called;
 const context={AutomationCore:C,supabaseClient:{async rpc(name,args){called={name,args};return {data:null,error:null};}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../js/api.js'),'utf8'),context);
 const images=C.generate({brand:'Brand',product:'Model',folder:'audio',extension:'jpg',count:1});
 await context.Api.saveDraft({id:'list'},[{id:'item',done:true,done_at:'stamp',price_retail_regular:120000,automation:{detailImages:images}}],[]);
 assert.equal(called.name,'save_product_draft');assert.equal('done' in called.args.p_items[0],false);assert.equal('done_at' in called.args.p_items[0],false);
 assert.equal(called.args.p_items[0].price_retail_regular,120000);
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
test('origin is trimmed on normalize and included in the export payload',()=>{
 assert.equal(C.normalize({origin:'  Made in China '}).origin,'Made in China');
 assert.equal(C.normalize({origin:42}).origin,'');
 const row={id:'o',name_own:'상품',need_retail:'필요',need_wholesale:'불필요',automation:{categoryCodes:{retail:'020001',wholesale:''},detailImages:[],origin:'Made in Korea'}};
 assert.equal(C.exportItem(row,settings).origin,'Made in Korea');
});
test('a completed item stays ready after its retained thumbnail is automatically deleted',()=>{
 const item={done:true,name_own:'상품',need_retail:'불필요',need_wholesale:'불필요',image_url:'',automation:{thumbnail:{deletedAt:'2026-09-08T00:00:00Z'},detailImages:[]}};
 assert.equal(C.readyIssues(item,settings).includes('썸네일 미등록'),false);
 item.done=false;assert.equal(C.readyIssues(item,settings).includes('썸네일 미등록'),true);
});
test('brand list: initial data, case/space-insensitive matching, and duplicate/format validation',()=>{
 assert.equal(settings.brands.length,84);
 assert.equal(C.matchBrand(settings.brands,' tilta ').name,'TILTA');
 assert.equal(C.matchBrand(settings.brands,'electro voice').name,'Electro-Voice');
 assert.equal(C.matchBrand(settings.brands,'IO DATA').name,'I-O DATA');
 assert.equal(C.matchBrand(settings.brands,'커넥터'),null);
 assert.equal(C.matchBrand(settings.brands,''),null);
 assert.equal(C.matchBrand(undefined,'TILTA'),null);
 assert.equal(settings.brands.filter(b=>C.brandKey(b.name)==='panasonic').length,1);
 const s=C.clone(settings);s.brands.push({code:'',name:'Tilta',active:true});assert.throws(()=>C.validateSettings(s),/이미 있습니다/);
 s.brands.pop();s.brands.push({code:'165',name:'NEWBRAND',active:true});assert.throws(()=>C.validateSettings(s),/중복/);
 s.brands.pop();s.brands.push({code:'',name:' spaced',active:true});assert.throws(()=>C.validateSettings(s));
 s.brands.pop();s.brands.push({code:'x y',name:'OK',active:true});assert.throws(()=>C.validateSettings(s));
 s.brands.pop();s.brands.push({code:'',name:'한글 브랜드',active:false});C.validateSettings(s);
 const legacy={categories:{retail:[],wholesale:[]},folders:[]};C.validateSettings(legacy);assert.deepEqual(legacy.brands,[]);
});
test('brand search supports aliases and Hangul initials',()=>{
 const b={code:'086001',name:'CONNECTER',aliases:['커넥터'],active:true};
 assert.equal(C.brandMatches(b,'커넥터'),true);
 assert.equal(C.brandMatches(b,'ㅋㄴㅌ'),true);
 assert.equal(C.brandMatches(b,'086001'),true);
 assert.equal(C.brandMatches(b,'없는 브랜드'),false);
});
test('export marks registered brands and strips transient UI flags',()=>{
 const row={id:'b',brand:'tilta',brand_custom:false,link_np:true,content:'legacy',name_own:'상품',price_retail_regular:500000,need_retail:'불필요',need_wholesale:'불필요',automation:{}};
 const out=C.exportItem(row,settings);
 assert.equal(out.brand,'tilta');assert.equal(out.brandCode,'165');assert.equal(out.brandRegistered,true);
 assert.equal(out.price_retail_regular,500000);assert.equal('content' in JSON.parse(JSON.stringify(out)),false);
 assert.equal('brand_custom' in JSON.parse(JSON.stringify(out)),false);assert.equal('link_np' in JSON.parse(JSON.stringify(out)),false);
 const custom=C.exportItem({...row,brand:'Unknown Maker'},settings);assert.equal(custom.brandCode,'');assert.equal(custom.brandRegistered,false);
 assert.equal(C.exportItem({...row,brand:''},{categories:settings.categories,folders:[]}).brandRegistered,false);
});
test('new rows no longer carry image_usage and brand custom state derives from the list',()=>{
 const context={AutomationCore:C,uuid:()=>'id',document:{getElementById:()=>null}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../js/state.js'),'utf8'),context);
 const it=context.makeItem(1);assert.equal('image_usage' in it,false);assert.equal(context.COPY_FIELDS.includes('image_usage'),false);assert.equal(it.price_retail_regular,null);assert.equal(context.COPY_FIELDS.includes('price_retail_regular'),true);
 assert.equal(context.HIDEABLE_COLS.some(c=>c.key==='image_usage'),false);
 assert.equal(context.isBrandCustom({brand:''},settings.brands),false);
 assert.equal(context.isBrandCustom({brand:'Tilta'},settings.brands),false);
 assert.equal(context.isBrandCustom({brand:'Unknown'},settings.brands),true);
 assert.equal(context.isBrandCustom({brand:'Tilta',brand_custom:true},settings.brands),true);
});
test('brand matching on import selects registered names and keeps unknown names as custom text',()=>{
 const context={AutomationCore:C,AutomationEditor:{brands:()=>settings.brands},State:{items:[]}};
 vm.createContext(context);
 const app=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
 const start=app.indexOf('function applyBrandMatching'),end=app.indexOf('/* ---------- 체크한 행 일괄 처리');
 vm.runInContext(app.slice(start,end),context);
 const items=[{brand:'tilta '},{brand:'Unknown Maker'},{brand:''},{brand:'Electro Voice'}];
 const stat=context.applyBrandMatching(items);
 assert.equal(JSON.stringify(stat),JSON.stringify({matched:2,custom:1,empty:1}));
 assert.equal(items[0].brand,'TILTA');assert.equal(items[0].brand_custom,false);
 assert.equal(items[1].brand,'Unknown Maker');assert.equal(items[1].brand_custom,true);
 assert.equal(items[2].brand,'');assert.equal(items[3].brand,'Electro-Voice');
});
test('settings without a brands key fall back to the built-in defaults; an explicit empty list is kept',async()=>{
 const defaults=JSON.parse(fs.readFileSync(require.resolve('../js/brand-defaults.js'),'utf8').match(/var BRAND_DEFAULTS = (\[.*\]);/)[1]);
 assert.equal(defaults.length,settings.brands.length);
 function api(value,withDefaults){
  const context={AutomationCore:C,supabaseClient:{from(){return {select(){return this;},eq(){return this;},async single(){return {data:{value,updated_at:'rev'},error:null};}};}}};
  if(withDefaults)context.BRAND_DEFAULTS=defaults;
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../js/api.js'),'utf8'),context);return context.Api.fetchAutomationSettings();
 }
 const legacy={categories:settings.categories,folders:settings.folders};
 assert.equal((await api(C.clone(legacy),true)).value.brands.length,84);
 assert.equal((await api(C.clone(legacy),false)).value.brands.length,0);
 assert.equal((await api({...C.clone(legacy),brands:[]},true)).value.brands.length,0);
 assert.equal((await api({...C.clone(legacy),brands:[{code:'',name:'Only',active:true}]},true)).value.brands[0].name,'Only');
});
test('product names keep their HTML source while the list shows readable text',()=>{
 const raw='<font color="#ff0000">빨강</font> 스피커 &amp; 마이크';
 assert.equal(C.displayName(raw),'빨강 스피커 & 마이크');
 assert.equal(C.hasMarkup(raw),true);
 assert.equal(C.displayName('<img src=x onerror="alert(1)">이름'),'이름');
 assert.equal(C.displayName('<script>alert(1)</script>이름'),'이름');
 assert.equal(C.displayName('일반 상품명'),'일반 상품명');
 assert.equal(C.hasMarkup('일반 상품명'),false);
 assert.equal(C.displayName('A &lt;b&gt; B'),'A <b> B');
 assert.equal(C.displayName(null),'');
 const row={id:'x',name_own:raw,name_naver:raw,need_retail:'불필요',need_wholesale:'불필요',automation:{}};
 const out=C.exportItem(row,settings);
 assert.equal(out.name_own,raw);
 assert.equal(out.name_naver,raw);
});
test('image address generation follows product info until 직접 입력 overrides it',()=>{
 const item={brand:'ROXTONE',model:'PSS130',automation:{generator:{folder:'audio',extension:'jpg',count:1}}};
 assert.equal(C.generate(C.generatorValues(item))[0].filename,'roxtone-pss130.jpg');
 item.automation.generator.brandManual=true;item.automation.generator.brand='rox';
 assert.equal(C.generate(C.generatorValues(item))[0].filename,'rox-pss130.jpg');
 item.brand='NEW BRAND';
 assert.equal(C.generate(C.generatorValues(item))[0].filename,'rox-pss130.jpg');
 const legacy=C.normalize({generator:{brand:'tilta',product:'t1'}});
 assert.equal(legacy.generator.brandManual,true);assert.equal(legacy.generator.productManual,true);
 const fresh=C.normalize({});
 assert.equal(fresh.generator.brandManual,false);assert.equal(fresh.generator.productManual,false);
});
test('smartstore product names replace slashes with a single space',()=>{
 assert.equal(C.smartName('ABC/DEF 상품명'),'ABC DEF 상품명');
 assert.equal(C.smartName('A / B //C'),'A B C');
 assert.equal(C.smartName('  앞뒤 공백  '),'앞뒤 공백');
 assert.equal(C.smartName('슬래시없음'),'슬래시없음');
 assert.equal(C.smartName(null),'');
 /* 원문의 닫는 태그(`</font>`)가 규칙에 걸려 깨지지 않아야 합니다. */
 const raw='<font color="#ff0000">특가</font> 제이비엘/JBL 스피커';
 assert.equal(C.smartName(raw),'특가 제이비엘 JBL 스피커');
 assert.equal(C.displayName(raw),'특가 제이비엘/JBL 스피커');
 /* 직접 입력 중에는 `/` 만 바꾸고 공백은 건드리지 않습니다. */
 assert.equal(C.smartNameInput('A/B '),'A B ');
});
test('image links preserve mixed-case destinations, escape attributes and keep legacy HTML',()=>{
 const plain={folder:'system',filename:'promo.png'};
 const linked={...plain,linkEnabled:true,linkUrl:'https://www.callamedia.co.kr/Goods/View?goodsNo=1000007906&Code=AbC"<x>'};
 assert.match(C.html([linked,plain]), /<a href="https:\/\/www.callamedia.co.kr\/Goods\/View\?goodsNo=1000007906&amp;Code=AbC&quot;&lt;x&gt;" target="_blank" rel="noopener noreferrer"><img src="https:\/\/calla.hgodo.com\/product\/system\/promo.png"><\/a>\n  <img/);
 assert.equal(C.html([{...linked,linkEnabled:false}]),C.html([plain]));
 const item={automation:{detailImages:[linked]}};
 const restored=C.normalize(JSON.parse(JSON.stringify(item.automation)));
 assert.deepEqual(restored.detailImages,[linked]);
 const exported=C.exportItem(item,settings);
 assert.equal(exported.detailImages[0].linkUrl,linked.linkUrl);
 assert.equal(exported.detailImages[0].linkEnabled,true);
 assert.equal(exported.detailHtml,C.html([linked]));
});
test('enabled invalid image links block HTML and surface readiness issues',()=>{
 for (const linkUrl of ['', 'javascript:alert(1)', 'data:text/html,test', '//example.com', 'https://', 'https://exa mple.com','https://example.com/\npath','https://user:pass@example.com']) {
  const image={folder:'system',filename:'promo.png',linkEnabled:true,linkUrl};
  assert.equal(C.html([image]),'');
  assert.ok(C.readyIssues({automation:{detailImages:[image]}},settings).some(x=>x.includes('바로가기 링크')));
  assert.notEqual(C.html([{...image,linkEnabled:false}]),'');
 }
 assert.equal(C.imageLinkUrl({linkUrl:' https://example.com/Path?Key=AbC '}),'https://example.com/Path?Key=AbC');
});
