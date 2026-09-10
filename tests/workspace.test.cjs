const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),AutomationCore=require('../js/automation-core.js');
const brands=[{name:'TILTA',code:'165',active:true},{name:'Legacy',code:'',active:false}];
function setup(){const naver={};const context={AutomationCore,isBrandCustom:(it,list)=>!!it.brand_custom||(!AutomationCore.matchBrand(list,it.brand)&&!!it.brand),UI:{BRAND_CUSTOM:'__custom__'},esc:v=>String(v==null?'':v),document:{addEventListener(){},querySelector(){return naver;}},State:{items:[],registrations:{}},AutomationEditor:{readiness(it){return {key:it.key,issues:[]};},brands(){return brands;}},withComma(v){return v==null?'':String(v).replace(/,/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,',');},toNumberOrNull(v){return v===''?null:Number(v.replace(/,/g,''));}};vm.createContext(context);vm.runInContext(fs.readFileSync('js/workspace.js','utf8'),context);return {workspace:context.Workspace,naver};}
test('drawer retail price updates linked Naver price without changing completion',()=>{const {workspace,naver}=setup();const it={need_naver:'필요',link_np:true,price_retail:100,price_naver:100,done:true,done_at:'saved'};workspace.editField(it,{dataset:{productField:'price_retail'},value:'25000'});assert.equal(it.price_naver,25000);assert.equal(naver.value,'25,000');assert.equal(naver.disabled,true);assert.equal(it.done,true);assert.equal(it.done_at,'saved');workspace.editField(it,{dataset:{productField:'link_np'},checked:false});workspace.editField(it,{dataset:{productField:'price_retail'},value:'30000'});assert.equal(it.price_naver,25000);assert.equal(naver.disabled,false);});
test('drawer wholesale grades remain independent and clearing price preserves null',()=>{const {workspace}=setup();const it={price_wholesale:9000,price_wholesale_master:8000,price_retail:10000};workspace.editField(it,{dataset:{productField:'price_wholesale'},value:''});assert.equal(it.price_wholesale,null);assert.equal(it.price_wholesale_master,8000);assert.equal(it.price_retail,10000);});
test('product modal follows the Figma layout and keeps brand selection separate from direct input',()=>{
 const {workspace}=setup();
 const it={brand:'tilta',name_own:'Own',name_naver:'Naver',model:'M',ref_link:'https://example.com',note:'memo',automation:{origin:'Made in China'}};
 const category=store=>'<div class="field w-third">'+(store==='retail'?'소비자몰 카테고리':'도매몰 카테고리')+'</div>';
 const html=workspace.fields(it,false,{categoryField:category});
 assert.doesNotMatch(html,/undefined|브랜드 검색|자사몰 상품명|네이버 상품명|이미지 사용 여부/);
 assert.doesNotMatch(html,/data-product-field="price_naver"/);
 assert.match(html,/data-brand-value>TILTA</);
 const labels=['상품명','스마트스토어 전용 상품명','브랜드','모델명','원산지','참고링크','비고','상품 등록 여부','카테고리 및 금액','소비자몰 카테고리','소비자몰 정가','소비자몰 판매가','도매몰 카테고리','도매몰(베이직) 금액','도매몰(마스터) 금액'];
 labels.reduce((position,label)=>{const next=html.indexOf(label);assert.ok(next>position,label+' 순서');return next;},-1);
 [['need_retail','소비자몰'],['need_wholesale','도매몰'],['need_naver','스마트스토어']].forEach(([field,label])=>assert.match(html,new RegExp('data-need-field="'+field+'"[^>]*><span>'+label+'<')));
 workspace.selectBrand(it,'__custom__');assert.equal(it.brand,'tilta');assert.equal(it.brand_custom,true);
 workspace.selectBrand(it,'TILTA');assert.equal(it.brand,'TILTA');assert.equal(it.brand_custom,false);
});
test('retail regular price is blank by default and only editable through 직접 입력',()=>{
 const {workspace}=setup();
 const blank=workspace.fields({automation:{}},false);
 assert.match(blank,/data-product-field="price_retail_regular" value="" disabled placeholder="정가 입력 안 함"/);
 assert.match(blank,/data-regular-manual><span>직접 입력/);
 const existing=workspace.fields({price_retail_regular:30000,automation:{}},false);
 assert.match(existing,/data-product-field="price_retail_regular" value="30,000" placeholder/);
 assert.match(existing,/data-regular-manual checked/);
});
test('drawer brand selection returns from direct input to a canonical registered brand',()=>{const {workspace}=setup(),it={brand:'My Brand',brand_custom:true};workspace.selectBrand(it,'TILTA');assert.equal(it.brand,'TILTA');assert.equal(it.brand_custom,false);});
test('compact table gives remaining width to readable text columns',()=>{const {workspace}=setup();
 const fitted=workspace.fitWidths([{key:'check',width:40},{key:'brand',width:96},{key:'name_own',width:300},{key:'need_retail',width:64},{key:'note',width:120}],1000);
 assert.equal(fitted.reduce((sum,col)=>sum+col.width,0),1000);
 assert.equal(fitted.find(col=>col.key==='check').width,40);
 assert.equal(fitted.find(col=>col.key==='need_retail').width,64);
 assert.ok(fitted.find(col=>col.key==='name_own').width>300);
 assert.ok(fitted.find(col=>col.key==='note').width>120);});
test('drawer retail regular price does not affect linked sale and Naver prices',()=>{const {workspace}=setup();const it={need_retail:'필요',need_naver:'필요',price_retail_regular:30000,price_retail:25000,price_naver:25000,link_np:true};workspace.editField(it,{dataset:{productField:'price_retail_regular'},value:'40000'});assert.equal(it.price_retail_regular,40000);assert.equal(it.price_retail,25000);assert.equal(it.price_naver,25000);});
