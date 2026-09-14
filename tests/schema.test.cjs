const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

test('retail regular price migration extends the draft function without completion fields',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260908083101_add_retail_regular_price.sql'),'utf8');
 assert.match(sql,/add column if not exists price_retail_regular bigint/);
 assert.match(sql,/price_retail_regular,price_retail,price_wholesale,price_wholesale_master,price_naver/);
 assert.match(sql,/security invoker set search_path = ''/);
 const insert=sql.match(/insert into public\.product_items \(([^)]+)\)/)[1];
 assert.doesNotMatch(insert,/done|done_at/);
});

test('product indexing migration is exposed through RLS and realtime without definer triggers',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260914000000_product_indexing.sql'),'utf8');
 assert.match(sql,/create table if not exists public\.product_indexing/);
 assert.match(sql,/grant select, insert, update, delete on table public\.product_indexing to anon, authenticated/);
 assert.match(sql,/create policy product_indexing_anon_all/);
 assert.match(sql,/alter publication supabase_realtime add table public\.product_indexing/);
 assert.doesNotMatch(sql,/security definer/);
});
