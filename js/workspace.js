/* Presentation only: shared rows, persistence and registration data remain authoritative. */
var Workspace = (function () {
  var expanded = false, filter = "all", listId = null, tableResizeObserver = null;
  var compactKeys = ['seq','name_naver','model','content','price_wholesale','price_wholesale_master','price_naver','image','ref_link','note','act'];
  function compactHidden(key) { return !expanded && compactKeys.includes(key); }
  function columns() {
    document.querySelectorAll('#gridCols col').forEach(function (col,index) {
      var hide = compactHidden(col.dataset.key) || (State.view === 'registrar' && col.dataset.key === 'act');
      col.style.display = hide ? 'none' : '';
      document.querySelectorAll('#grid tbody tr[data-id]').forEach(function(row){ if(row.cells[index]) row.cells[index].hidden=hide; });
      var head=document.querySelector('#grid th[data-col="'+index+'"]'); if(head)head.hidden=hide;
    });
    var grid=document.getElementById('grid');if(grid)grid.classList.toggle('is-expanded',expanded);
    var groups=document.querySelectorAll('#grid thead .grp');
    if(groups.length===3){groups[0].colSpan=expanded?2:1;groups[2].colSpan=expanded?4:1;}
  }
  function fitWidths(entries,available) {
    var fitted=entries.map(function(entry){return {col:entry.col,key:entry.key,width:entry.width};});
    if(expanded||!available)return fitted;
    var total=fitted.reduce(function(sum,entry){return sum+entry.width;},0),extra=Math.floor(available-total);
    if(extra<=0)return fitted;
    var weights={name_own:3,automation:2,brand:1};
    var flexible=fitted.filter(function(entry){return entry.width>0&&weights[entry.key];});
    var weightTotal=flexible.reduce(function(sum,entry){return sum+weights[entry.key];},0),remaining=extra;
    flexible.forEach(function(entry,index){
      var add=index===flexible.length-1?remaining:Math.floor(extra*weights[entry.key]/weightTotal);
      entry.width+=add;remaining-=add;
    });
    return fitted;
  }
  function visibleItems() { return State.items.filter(function(it){return filter === "all" || AutomationEditor.readiness(it).key === filter;}); }
  function resetFilter() { filter="all"; }
  function filterRows() {
    if(listId!==State.currentListId){listId=State.currentListId;filter="all";}
    var visible=new Set(visibleItems().map(function(it){return it.id;}));
    Object.keys(State.selected).forEach(function(id){if(!visible.has(id))delete State.selected[id];});
    document.querySelectorAll("#gridBody tr[data-id]").forEach(function(row){row.hidden=!visible.has(row.dataset.id);});
    var empty=document.getElementById("filteredEmpty");if(empty)empty.hidden=!State.items.length||visible.size>0;
  }
  function refresh() {
    if(listId!==State.currentListId){listId=State.currentListId;filter="all";}
    var box=document.getElementById('readinessFilters');if(!box)return;
    var counts={all:State.items.length,missing:0,images:0,ready:0};
    State.items.forEach(function(it){var k=AutomationEditor.readiness(it).key;if(k in counts)counts[k]++;});
    box.innerHTML=[['all','전체'],['missing','정보 부족'],['images','이미지 확인 필요'],['ready','준비 완료']].map(function(pair){return '<button type="button" data-ready-filter="'+pair[0]+'" aria-pressed="'+(filter===pair[0])+'" class="readiness-count ready-'+pair[0]+'">'+pair[1]+' <b>'+counts[pair[0]]+'</b></button>';}).join('');
    document.querySelectorAll('#gridBody tr[data-id]').forEach(function(row){var it=State.items.find(function(i){return i.id===row.dataset.id;});if(!it)return;var summary=row.querySelector('.automation-summary');if(summary)summary.outerHTML=AutomationEditor.summary(it);});
    UI.applyColWidths();
  }
  var textFields=[['name_own','자사몰 상품명'],['name_naver','네이버 상품명'],['model','모델명'],['ref_link','참고 링크'],['note','비고']];
  var priceFields=[['price_retail','소매몰 가격','need_retail'],['price_wholesale','도매몰 베이직 가격','need_wholesale'],['price_wholesale_master','도매몰 마스터 가격','need_wholesale'],['price_naver','네이버 가격','need_naver']];
  function brandOptions(it) {
    var brands=AutomationEditor.brands(),matched=AutomationCore.matchBrand(brands,it.brand),custom=isBrandCustom(it,brands);
    var out='<option value="">브랜드 선택</option>';
    brands.slice().sort(function(a,b){return a.name.localeCompare(b.name,'en',{sensitivity:'base'});}).forEach(function(b){
      if(b.active===false && b!==matched)return;
      out+='<option value="'+esc(b.name)+'"'+(!custom&&b===matched?' selected':'')+'>'+esc(b.name)+(b.active===false?' · 사용 중지':'')+'</option>';
    });
    return out+'<option value="'+UI.BRAND_CUSTOM+'"'+(custom?' selected':'')+'>직접 입력…</option>';
  }
  function brandField(it,ro) {
    var custom=isBrandCustom(it,AutomationEditor.brands());
    return '<label class="field">브랜드<select data-product-brand-select'+(ro?' disabled':'')+'>'+brandOptions(it)+'</select>'+
      (custom?'<input class="brand-direct-input" data-product-field="brand" value="'+esc(it.brand||'')+'" placeholder="브랜드 직접 입력" maxlength="30"'+(ro?' readonly':'')+'>':'')+
      '<span class="field-note">등록된 브랜드는 선택 상태로 유지되며, 필요할 때만 직접 입력으로 바꿀 수 있습니다.</span></label>';
  }
  function fields(it,ro) {
    var issues=AutomationEditor.readiness(it).issues;
    var out='<section class="auto-section"><h3>준비 상태</h3><p class="field-note">'+esc(issues.length?issues.join(' · '):'등록에 필요한 정보가 준비되었습니다. 실제 등록 결과는 별도로 확인하세요.')+'</p></section><section class="auto-section"><h3>상품 정보</h3><div class="field-grid">';
    out+=brandField(it,ro);
    textFields.forEach(function(f){out+='<label class="field">'+f[1]+'<input data-product-field="'+f[0]+'" value="'+esc(it[f[0]]||'')+'"'+(ro?' readonly':'')+'></label>';});
    out+='<label class="field">원산지<input data-basic="origin" value="'+esc(AutomationCore.normalize(it.automation).origin)+'" placeholder="예: Made in China" maxlength="30"'+(ro?' readonly':'')+'><span class="field-note">고도몰 원산지 칸에 그대로 입력됩니다.</span></label>';
    out+='<label class="field">내용<select data-product-field="content"'+(ro?' disabled':'')+'><option value=""></option>'+CONTENT_OPTIONS.map(function(v){return '<option'+(it.content===v?' selected':'')+'>'+esc(v)+'</option>';}).join('')+'</select></label></div></section><section class="auto-section"><h3>몰별 가격</h3><div class="field-grid">';
    priceFields.forEach(function(f){var blocked=it[f[2]]!=='필요'||(f[0]==='price_naver'&&it.link_np!==false);out+='<label class="field">'+f[1]+'<input inputmode="numeric" data-product-field="'+f[0]+'" value="'+esc(withComma(it[f[0]]))+'"'+(ro?' readonly':blocked?' disabled':'')+'></label>';});
    out+='</div><label class="field-note"><input type="checkbox" data-product-field="link_np"'+(it.link_np!==false?' checked':'')+(ro?' disabled':'')+'> 네이버 가격을 소매몰과 동일하게 유지</label><p class="field-note">등록할 몰은 표에서 선택하세요. 선택한 몰의 가격만 입력할 수 있습니다.</p></section>';
    var regs=(State.registrations||{})[it.id]||{};
    if(Object.keys(regs).length){out+='<section class="auto-section"><h3>실제 등록 결과</h3>';Object.keys(regs).forEach(function(k){var r=regs[k];out+='<p>'+esc(k==='retail'?'소매몰':'도매몰')+' · '+esc(({pending:'대기',running:'진행 중',success:'완료',failed:'실패'})[r.status]||r.status)+(r.goods_no?' #'+esc(r.goods_no):'')+'</p>'+(r.error_message?'<p class="field-note">'+esc(r.error_message)+'</p>':'');});out+='</section>';}
    return out;
  }
  function editField(it,input) {
    var f=input.dataset.productField;
    if(f==='link_np'){it.link_np=input.checked;if(input.checked)it.price_naver=it.price_retail;}
    else if(f.indexOf('price_')===0){input.value=withComma(input.value);it[f]=toNumberOrNull(input.value);if(f==='price_retail'&&it.link_np!==false)it.price_naver=it.price_retail;}
    else { it[f]=input.value; if(f==='brand')it.brand_custom=!AutomationCore.matchBrand(AutomationEditor.brands(),input.value); }
    var naver=document.querySelector('[data-product-field="price_naver"]');
    if(naver){naver.disabled=it.need_naver!=='필요'||it.link_np!==false;if(f==='link_np'||(f==='price_retail'&&it.link_np!==false))naver.value=withComma(it.price_naver);}
  }
  function selectBrand(it,value) {
    if(value===UI.BRAND_CUSTOM){it.brand_custom=true;return;}
    var matched=AutomationCore.matchBrand(AutomationEditor.brands(),value);
    it.brand=matched?matched.name:value;
    it.brand_custom=false;
  }
  document.addEventListener('DOMContentLoaded',function(){
    var empty=document.createElement('p');empty.id='filteredEmpty';empty.className='empty-hint';empty.hidden=true;empty.textContent='이 상태에 해당하는 상품이 없습니다.';document.querySelector('.table-wrap').after(empty);
    document.getElementById('readinessFilters').addEventListener('click',function(e){var b=e.target.closest('[data-ready-filter]');if(!b)return;filter=b.dataset.readyFilter;clearSelection();UI.renderGrid();});
    var more=document.getElementById('workspaceMoreItems');
    ['btnColSettings','btnDeleteList'].forEach(function(id){var el=document.getElementById(id);if(el&&more)more.appendChild(id==='btnColSettings'?el.parentElement:el);});
    var metadata=document.querySelector('.lh-meta');
    if(metadata){var detail=document.createElement('details');detail.className='list-history';detail.innerHTML='<summary>목록 정보</summary>';['listCreated','listUpdated'].forEach(function(id){var el=document.getElementById(id);if(el)detail.appendChild(el.parentElement);});more.appendChild(detail);}
    var toggle=document.getElementById('btnTableDensity');
    toggle.addEventListener('click',function(){expanded=!expanded;toggle.textContent=expanded?'기본 열 보기':'전체 열 보기';toggle.setAttribute('aria-pressed',String(expanded));UI.applyColWidths();});
    var tableWrap=document.querySelector('.table-wrap');
    if(tableWrap&&typeof ResizeObserver!=="undefined"){
      tableResizeObserver=new ResizeObserver(function(){UI.applyColWidths();});
      tableResizeObserver.observe(tableWrap);
    }else if(typeof window!=="undefined"){
      window.addEventListener('resize',function(){UI.applyColWidths();});
    }
    refresh();
  });
  function width(key,value) {var widths={check:48,brand:190,name_own:220,need_retail:70,need_wholesale:70,need_naver:70,price_retail:110,automation:210};return expanded?value:Math.min(value,widths[key]||value);}
  return {width:width,fitWidths:fitWidths,visibleItems:visibleItems,filterRows:filterRows,resetFilter:resetFilter,compactHidden:compactHidden,columns:columns,refresh:refresh,fields:fields,editField:editField,selectBrand:selectBrand};
})();
