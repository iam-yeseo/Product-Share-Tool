const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');

function load(){const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../js/xlsxImport.js'),'utf8'),context);return context.XlsxImport;}

test('price headers map to the requested five mall prices',()=>{
 const importer=load();
 assert.deepEqual(Array.from(importer.mapColumn('소매몰','정가')),['price_retail_regular']);
 assert.deepEqual(Array.from(importer.mapColumn('소매몰','판매가 (도매몰 정가)')),['price_retail']);
 assert.deepEqual(Array.from(importer.mapColumn('도매몰','베이직')),['price_wholesale']);
 assert.deepEqual(Array.from(importer.mapColumn('도매몰','마스터')),['price_wholesale_master']);
 assert.deepEqual(Array.from(importer.mapColumn('네이버 스마트스토어','가격')),['price_naver']);
});

test('legacy content columns are no longer imported',()=>{assert.deepEqual(Array.from(load().mapColumn('내용','')),[]);});
