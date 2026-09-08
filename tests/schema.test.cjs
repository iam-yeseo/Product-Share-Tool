const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

test('retail regular price migration extends the draft function without completion fields',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260908074440_add_retail_regular_price.sql'),'utf8');
 assert.match(sql,/add column if not exists price_retail_regular bigint/);
 assert.match(sql,/price_retail_regular,price_retail,price_wholesale,price_wholesale_master,price_naver/);
 assert.match(sql,/security invoker set search_path = ''/);
 const insert=sql.match(/insert into public\.product_items \(([^)]+)\)/)[1];
 assert.doesNotMatch(insert,/done|done_at/);
});
