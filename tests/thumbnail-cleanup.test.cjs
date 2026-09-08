const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const corePromise=import(pathToFileURL(path.resolve('supabase/functions/cleanup-product-thumbnails/cleanup-core.mjs')));

test('thumbnail cleanup waits exactly three days',async()=>{
  const core=await corePromise;
  assert.equal(core.cutoffIso(Date.parse('2026-09-08T12:00:00.000Z')),'2026-09-05T12:00:00.000Z');
});

test('thumbnail cleanup accepts only the object path owned by the item row',async()=>{
  const core=await corePromise;
  const list='11111111-1111-4111-8111-111111111111',item='22222222-2222-4222-8222-222222222222',file='33333333-3333-4333-8333-333333333333.jpg';
  assert.equal(core.isOwnedThumbnailPath({list_id:list,item_id:item,thumbnail_path:`${list}/${item}/${file}`}),true);
  assert.equal(core.isOwnedThumbnailPath({list_id:list,item_id:item,thumbnail_path:`${list}/44444444-4444-4444-8444-444444444444/${file}`}),false);
  assert.equal(core.isOwnedThumbnailPath({list_id:list,item_id:item,thumbnail_path:`${list}/${item}/../../other.jpg`}),false);
});

test('thumbnail cleanup batches Storage API removals',async()=>{
  const core=await corePromise,items=Array.from({length:205},(_,index)=>index);
  assert.deepEqual(core.chunks(items).map((part)=>part.length),[100,100,5]);
});

test('migration schedules the Edge Function and never deletes Storage metadata directly',()=>{
  const sql=require('node:fs').readFileSync('supabase/migrations/20260908013550_cleanup_completed_thumbnails.sql','utf8');
  assert.match(sql,/cron\.schedule[\s\S]*cleanup-product-thumbnails-daily/);
  assert.match(sql,/grant execute on function public\.finalize_product_thumbnail_cleanup[\s\S]*to service_role/);
  assert.doesNotMatch(sql,/delete\s+from\s+storage\.objects/i);
});
