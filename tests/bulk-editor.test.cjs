const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const AutomationCore=require('../js/automation-core.js'),settings=require('../data/automation-settings.json');

function load(){
 const context={AutomationCore,document:{addEventListener(){}},module:{exports:{}},esc:v=>String(v==null?'':v)};
 vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../js/bulk-editor.js'),'utf8'),context);return context.module.exports;
}

test('bulk changes only enabled settings and preserve completion and product-specific data',()=>{
 const bulk=load(),items=[{id:'1',brand:'Old',name_own:'Product A',model:'A',done:true,done_at:'saved',price_retail:100,price_naver:100,link_np:true,automation:{categoryCodes:{retail:'001',wholesale:'002'},detailImages:[{id:'img',folder:'old',filename:'a.jpg'}],thumbnail:{path:'keep'}}},{id:'2',brand:'Old 2',name_own:'Product B',model:'B',done:false,price_retail:200,price_naver:50,link_np:false,automation:{detailImages:[]}}];
 bulk.applyChanges(items,{content:'기존 제품',origin:' Made in Korea ',category_retail:'020001',need_retail:'불필요'},settings);
 assert.deepEqual(items.map(i=>i.content),['기존 제품','기존 제품']);
 assert.deepEqual(items.map(i=>i.automation.categoryCodes.retail),['020001','020001']);
 assert.deepEqual(items.map(i=>i.automation.categoryCodes.wholesale),['002','']);
 assert.equal(items[0].automation.generator.folder,'');
 assert.equal(items[0].price_naver,100);assert.equal(items[1].price_naver,50);
 assert.equal(items[0].done,true);assert.equal(items[0].done_at,'saved');assert.equal(items[0].name_own,'Product A');assert.equal(items[0].model,'A');
 assert.deepEqual(items[0].automation.detailImages,[{id:'img',folder:'old',filename:'a.jpg'}]);assert.equal(items[0].automation.thumbnail.path,'keep');
});

test('bulk price linking follows the same retail to Naver rules as individual editing',()=>{
 const bulk=load(),linked={price_retail:100,price_naver:100,link_np:true,automation:{}},separate={price_retail:100,price_naver:80,link_np:false,automation:{}};
 bulk.applyChanges([linked,separate],{price_retail:250},settings);assert.equal(linked.price_naver,250);assert.equal(separate.price_naver,80);
 bulk.applyChanges([linked,separate],{link_np:false,price_naver:300},settings);assert.equal(linked.price_naver,300);assert.equal(separate.price_naver,300);
 bulk.applyChanges([linked,separate],{link_np:true,price_naver:999},settings);assert.equal(linked.price_naver,250);assert.equal(separate.price_naver,250);
});

test('bulk brand uses canonical settings names and explicit generator values win over category defaults',()=>{
 const bulk=load(),item={brand:'custom',price_retail:null,automation:{generator:{folder:'',extension:'jpg'}}};
 bulk.applyChanges([item],{brand:' tilta ',category_retail:'020001',generator_folder:'video',generator_extension:'webp'},settings);
 assert.equal(item.brand,'TILTA');assert.equal(item.brand_custom,false);assert.equal(item.automation.generator.folder,'video');assert.equal(item.automation.generator.extension,'webp');
 bulk.applyChanges([item],{brand:'New Maker'},settings);assert.equal(item.brand,'New Maker');assert.equal(item.brand_custom,true);
});
