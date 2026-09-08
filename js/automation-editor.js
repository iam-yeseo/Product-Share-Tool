/* Automation inputs are another editor for the same product rows. */
var AutomationEditor = (function () {
  var settings = null, activeId = null, pending = new Map(), checking = new Set(), thumbnailChecks = new Map(), lastFocus = null;
  var statusLabels = { unchecked: '미검증', checking: '검사 중', valid: '정상', error: '로딩 실패', timeout: '시간 초과', invalid: '주소 형식 오류' };
  function current() { return State.items.find(function (it) { return it.id === activeId; }); }
  function data(it) { it.automation = AutomationCore.normalize(it.automation); return it.automation; }
  function touch() { if (State.view === 'editor') setDirty(true); publish(); }
  function safeUrl(url) { return /^https?:\/\//.test(url || '') ? normalizeUrl(url) : ''; }
  function thumbUrl(it) { return pending.has(it.id) ? pending.get(it.id).preview : safeUrl(it.image_url); }
  function thumbnailCell(it) {
    var url = thumbUrl(it), a = AutomationCore.normalize(it.automation), cleaned = a.thumbnail && a.thumbnail.deletedAt;
    return '<button class="thumb-button" data-auto-open="' + esc(it.id) + '" title="상품 상세 정보">' +
      (url ? '<img src="' + esc(url) + '" alt="상품 썸네일" loading="lazy">' : (cleaned ? '정리됨' : (State.view === 'editor' ? '+ 이미지' : '이미지 없음'))) + '</button>';
  }
  function summary(it) {
    var state = readiness(it);
    return '<button class="automation-summary" data-auto-open="' + esc(it.id) + '"><strong class="ready-label ready-' + state.key + '">' + esc(state.label) + '</strong><span>' + esc(state.issues[0] || '상품 상세 정보 열기 →') + '</span></button>';
  }
  function getSettings() { return settings || { categories: { retail: [], wholesale: [] }, folders: [], brands: [] }; }
  function brands() { return getSettings().brands || []; }
  /* 설정(브랜드·카테고리)이 바뀌었을 때 다시 읽습니다. 화면 갱신은 호출부가 결정합니다. */
  async function reloadSettings() { settings = (await Api.fetchAutomationSettings()).value; return settings; }
  function readiness(it) {
    if (!settings) return {key:'loading',label:'설정 확인 중',issues:[]};
    var issues = AutomationCore.readyIssues(it,getSettings());
    var missing = issues.filter(function (issue) { return !/이미지 정상 확인 필요/.test(issue); });
    return {key:missing.length?'missing':issues.length?'images':'ready',label:missing.length?'정보 부족':issues.length?'이미지 확인 필요':'등록 준비 완료',issues:issues};
  }

  function publish() {
    var target = document.getElementById('automation-data');
    var ready = !!(settings && State.currentListId && !State.loading && !State.loadError);
    document.documentElement.dataset.automationReady = String(ready);
    if (target) target.textContent = JSON.stringify({ schemaVersion: 1, ready: ready, listId: State.currentListId, saved: !State.dirty && !State.saving,
      items: State.items.map(function (it) { return AutomationCore.exportItem(it, getSettings()); }) });
    if (typeof Workspace !== 'undefined') Workspace.refresh();
    var selector = document.getElementById('autoItemSelect');
    if (selector) {
      var before = selector.value;
      selector.innerHTML = State.items.map(function (it) { return '<option value="' + esc(it.id) + '">' + it.seq + '. ' + esc(it.brand + ' ' + (it.model || it.name_own || '상품명 미입력')) + '</option>'; }).join('');
      if (State.items.some(function (it) { return it.id === before; })) selector.value = before;
    }
  }
  function folders(value) {
    var list = getSettings().folders.slice();
    if (value && !list.includes(value)) list.push(value);
    return '<option value="">폴더 선택</option>' + list.map(function (f) { return '<option value="' + esc(f) + '"' + (f === value ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('');
  }
  function categoryOptions(store, code, query) {
    var cats = getSettings().categories[store], q = (query || '').toLowerCase();
    var options = cats.filter(function (c) { return c.code === code || (c.active !== false && (!q || (c.code + ' ' + AutomationCore.path(cats,c.code)).toLowerCase().includes(q))); });
    var out = '<option value="">카테고리 선택</option>';
    if (code && !cats.some(function (c) { return c.code === code; })) out += '<option selected value="' + esc(code) + '">' + esc(code) + ' (설정에서 찾을 수 없음)</option>';
    return out + options.map(function (c) { return '<option value="' + esc(c.code) + '"' + (c.code === code ? ' selected' : '') + '>' + esc(AutomationCore.path(cats,c.code)) + ' [' + esc(c.code) + ']' + (c.active === false ? ' · 사용 중지' : '') + '</option>'; }).join('');
  }
  function render() {
    var it = current(); if (!it) return;
    var a = data(it), ro = State.view !== 'editor', disabled = ro ? ' disabled' : '';
    document.getElementById('autoTitle').textContent = it.seq + '. ' + (it.brand || '') + ' ' + (it.model || it.name_own || '상품 정보');
    var cats = ['retail','wholesale'].map(function (store) {
      var code = a.categoryCodes[store];
      var recommendation = AutomationCore.defaultFolder(getSettings().categories[store], code);
      return '<div class="field"><label for="category-' + store + '">' + (store === 'retail' ? '소매몰' : '도매몰') + ' 카테고리</label>' +
        (!ro ? '<input data-category-search="' + store + '" aria-label="' + (store === 'retail' ? '소매몰' : '도매몰') + ' 카테고리 검색" placeholder="이름 또는 코드 검색">' : '') +
        '<select id="category-' + store + '" data-category="' + store + '"' + disabled + '>' + categoryOptions(store,code) + '</select>' +
        '<div class="field-note">저장 코드 <code>' + esc(code || '미선택') + '</code>' + (recommendation ? ' · 기본 폴더 ' + esc(recommendation) : '') + '</div></div>';
    }).join('');
    var url = thumbUrl(it), cleanedAt = a.thumbnail && a.thumbnail.deletedAt;
    document.getElementById('autoBody').innerHTML =
      (typeof Workspace !== 'undefined' ? Workspace.fields(it,ro) : '') +
      '<section class="auto-section"><h3>카테고리</h3><div class="field-grid">' + cats + '</div></section>' +
      '<section class="auto-section"><h3>상품 썸네일</h3><div class="thumbnail-editor">' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener"><img src="' + esc(url) + '" alt="등록할 썸네일"></a>' : '<div class="thumbnail-empty">' + (cleanedAt ? '자동 정리됨' : '썸네일 없음') + '</div>') +
      '<div>' + (!ro ? '<label class="btn file-label">이미지 선택<input id="thumbnailFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label> <button class="btn btn-ghost" data-action="remove-thumb">제거</button><p class="field-note">JPG · PNG · WEBP · GIF, 최대 6MB<br>저장 시 업로드됩니다.</p>' : '') +
      '<p class="field-note">' + esc(pending.has(it.id) ? pending.get(it.id).file.name + ' · 저장 대기' : (cleanedAt ? '등록 완료 3일 후 정리 · ' + fmtDateTime(cleanedAt) : (a.thumbnail && a.thumbnail.originalName) || '')) + '</p>' + (it.image_url && !pending.has(it.id) ? '<button class="btn btn-ghost" data-action="copy-thumb">썸네일 주소 복사</button>' : '') + '</div></div></section>' +
      (!ro ? '<section class="auto-section"><h3>상세 이미지 주소 만들기</h3><p class="field-note">영문 소문자로 생성합니다. 제품명 내부 대시와 공백은 제거됩니다.</p><div class="field-grid generator-grid">' +
      '<label class="field">이미지 폴더<select data-generator="folder">' + folders(a.generator.folder) + '</select></label>' +
      '<label class="field">영문 브랜드<input data-generator="brand" value="' + esc(a.generator.brand) + '" placeholder="tilta"></label>' +
      '<label class="field">파일명용 제품명<input data-generator="product" value="' + esc(a.generator.product) + '" placeholder="TA-T108-C-B"></label>' +
      '<label class="field">확장자<select data-generator="extension">' + AutomationCore.EXTENSIONS.map(function (ext) { return '<option' + (ext === a.generator.extension ? ' selected' : '') + '>' + ext + '</option>'; }).join('') + '</select></label>' +
      '<label class="field">이미지 수<input type="number" min="1" max="50" data-generator="count" value="' + esc(a.generator.count) + '"></label></div><div class="action-row"><button class="btn btn-primary" data-action="generate">주소 생성 · 목록에 추가</button><button class="btn" data-action="add-image">+ 이미지 직접 추가</button></div></section>' : '') +
      '<section class="auto-section"><div class="section-title"><h3>상세 이미지 <span id="detailCount"></span></h3><button class="btn" data-action="check-all">전체 검사</button></div><p class="field-note">정상 여부는 이 브라우저에서 실제 이미지를 불러와 확인합니다. 내용이 해당 상품과 맞는지는 미리보기로 확인하세요.</p><div id="detailImageRows"></div></section>' +
      '<details class="auto-section advanced-output"><summary>내보내기 · HTML과 이미지 주소</summary><div class="section-title"><h3>상세페이지 HTML</h3><button class="btn" data-action="copy-html">HTML 복사</button></div><textarea id="detailHtml" data-field="detail-html" readonly rows="7" spellcheck="false" aria-label="상세페이지 HTML"></textarea><div class="action-row"><button class="btn" data-action="copy-urls">주소 전체 복사</button><button class="btn" data-action="copy-json">상품 JSON 복사</button></div><p id="autoIssues" class="field-note"></p></details>';
    renderImages();
  }
  function renderImages() {
    var it = current(); if (!it) return;
    var ro = State.view !== 'editor';
    document.getElementById('detailImageRows').innerHTML = it.automation.detailImages.map(function (img, index) {
      return '<article class="image-row" data-image-id="' + esc(img.id) + '"><div class="section-title"><b>이미지 ' + (index + 1) + '</b><div class="action-row">' +
        (!ro ? '<button class="btn" data-image-action="up" aria-label="이미지 ' + (index + 1) + ' 위로"' + (index===0 ? ' disabled' : '') + '>↑</button><button class="btn" data-image-action="down" aria-label="이미지 ' + (index + 1) + ' 아래로"' + (index===it.automation.detailImages.length-1 ? ' disabled' : '') + '>↓</button><button class="btn btn-danger-ghost" data-image-action="remove">삭제</button>' : '') + '</div></div>' +
        '<div class="image-fields"><select data-image-field="folder" aria-label="이미지 ' + (index + 1) + ' 폴더"' + (ro ? ' disabled' : '') + '>' + folders(img.folder) + '</select>' +
        '<input data-image-field="filename" aria-label="이미지 ' + (index + 1) + ' 파일명" value="' + esc(img.filename) + '" placeholder="brand-product-1.jpg"' + (ro ? ' readonly' : '') + '><select data-image-extension aria-label="이미지 ' + (index + 1) + ' 확장자"' + (ro ? ' disabled' : '') + '>' + AutomationCore.EXTENSIONS.map(function(ext) { return '<option' + (img.filename.endsWith('.' + ext) ? ' selected' : '') + '>' + ext + '</option>'; }).join('') + '</select></div>' +
        '<input class="image-url" data-field="detail-image-url" aria-label="이미지 ' + (index + 1) + ' 주소" readonly><div class="action-row"><button class="btn" data-image-action="check">검사</button><button class="btn" data-image-action="copy">주소 복사</button><a class="btn image-link" target="_blank" rel="noopener">원본 열기</a><span class="image-status" aria-live="polite"></span></div><details class="image-preview"><summary>이미지 미리보기</summary><div></div></details></article>';
    }).join('') || '<p class="empty-hint">등록한 상세 이미지가 없습니다.</p>';
    updateOutputs();
  }
  function updateOutputs() {
    var it = current(); if (!it) return;
    it.automation.detailImages.forEach(function (img) {
      var row = Array.from(document.querySelectorAll('.image-row')).find(function (r) { return r.dataset.imageId === img.id; });
      if (!row) return;
      var url = AutomationCore.imageUrl(img), v = AutomationCore.validation(img), status = checking.has(img.id) ? 'checking' : (!url ? 'invalid' : v.status);
      row.querySelector('.image-url').value = url;
      var link = row.querySelector('.image-link'); link.hidden = !url; if (url) link.href = url; else link.removeAttribute('href');
      var label = row.querySelector('.image-status'); label.dataset.status = status;
      label.textContent = statusLabels[status] + (status === 'valid' ? ' · ' + v.width + ' × ' + v.height : '') + (v.checkedAt && status !== 'checking' ? ' · ' + fmtDateTime(v.checkedAt) : '');
      row.querySelector('[data-image-action="check"]').disabled = !url || status === 'checking';
      var preview = row.querySelector('.image-preview div');
      if (preview.dataset.url !== url) { preview.replaceChildren(); preview.dataset.url = url; }
    });
    document.getElementById('detailCount').textContent = it.automation.detailImages.length + '장';
    document.getElementById('detailHtml').value = AutomationCore.html(it.automation.detailImages);
    var issues = AutomationCore.readyIssues(it,getSettings());
    document.getElementById('autoIssues').textContent = issues.length ? '자동화 확인 항목: ' + issues.join(' / ') : '자동화에 필요한 정보가 준비되었습니다. 검사 시각을 확인해 주세요.';
    publish();
  }
  function open(id) {
    if (!settings) { toast('자동화 설정을 불러오지 못했습니다. 페이지를 새로고침해 주세요.', 'error'); return; }
    activeId = id; var it = current(); if (!it) return;
    var a = data(it);
    if (!a.generator.brand) a.generator.brand = it.brand || '';
    if (!a.generator.product) a.generator.product = it.model || '';
    a.detailImages.forEach(function (img) { if (!img.id) img.id = uuid(); });
    lastFocus = document.activeElement;
    render(); document.getElementById('automationDialog').showModal();
  }
  function close() { document.getElementById('automationDialog').close(); activeId = null; UI.renderGrid(); if (lastFocus && lastFocus.isConnected) lastFocus.focus(); else { var fallback=document.querySelector('.automation-summary') || document.getElementById('btnTableDensity'); if(fallback)fallback.focus(); } }
  async function checkImage(it, img) {
    var url = AutomationCore.imageUrl(img); if (!url || checking.has(img.id)) return;
    checking.add(img.id); if (current() === it) updateOutputs();
    var result;
    try { result = await ImageValidator.check(url); } finally { checking.delete(img.id); }
    if (State.items.includes(it) && it.automation.detailImages.includes(img) && AutomationCore.imageUrl(img) === url) { img.validation = result; touch(); }
    if (current() === it) updateOutputs();
  }
  async function checkAll(items) {
    var jobs = []; items.forEach(function (it) { var a = it.automation || {}; (a.detailImages || []).forEach(function (img) { jobs.push({it:it,img:img}); }); });
    await ImageValidator.pool(jobs, function (j) { return checkImage(j.it,j.img); });
  }
  function copyPending(from, to) {
    if (!pending.has(from)) return;
    var src = pending.get(from); pending.set(to,{file:src.file,preview:URL.createObjectURL(src.file)});
  }
  function clearPending() { pending.forEach(function (p) { URL.revokeObjectURL(p.preview); }); pending.clear(); thumbnailChecks.clear(); }
  async function uploadPending() {
    for (var it of State.items) {
      var p = pending.get(it.id); if (!p) continue;
      if (!p.uploaded) {
        var extension = { 'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif' }[p.file.type];
        var path = State.list.id + '/' + it.id + '/' + uuid() + '.' + extension;
        var result = await supabaseClient.storage.from('product-thumbnails').upload(path,p.file,{contentType:p.file.type,upsert:false});
        if (result.error) throw result.error;
        p.uploaded = {path:path,url:supabaseClient.storage.from('product-thumbnails').getPublicUrl(path).data.publicUrl};
      }
      it.image_url = p.uploaded.url;
      it.automation = AutomationCore.normalize(it.automation);
      it.automation.thumbnail = { path:p.uploaded.path, originalName:p.file.name, mimeType:p.file.type, size:p.file.size };
    }
  }
  function download() {
    var result = JSON.parse(document.getElementById('automation-data').textContent);
    if (!result.ready) { toast("상품 데이터가 준비된 뒤 다시 시도해 주세요.", "warn"); return; }
    if (State.dirty) { toast('저장 후 내보내 주세요.', 'warn'); return; }
    if (result.items.some(function (it) { return it.issues.length; }) && !confirm('자동화 확인 항목이 남아 있습니다. 확인 항목을 포함하여 JSON을 내보낼까요?')) return;
    var blob = new Blob([JSON.stringify(result,null,2)],{type:'application/json'}), url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download='상품-자동화-'+(State.currentListId || '목록')+'.json'; a.click(); setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }
  function bind() {

    document.getElementById('btnExportAutomation').addEventListener('click',download);
    document.getElementById('btnValidateList').addEventListener('click',async function(){this.disabled=true; await checkAll(State.items); this.disabled=false; toast('이미지 검사가 끝났습니다. 상품별 결과를 확인하세요.');});
    document.getElementById('gridBody').addEventListener('click',function(e){var b=e.target.closest('[data-auto-open]');if(b)open(b.dataset.autoOpen);});
    document.getElementById('autoClose').addEventListener('click',close);
    document.getElementById('autoSave').addEventListener('click',function(){close();});
    var dialog=document.getElementById('automationDialog');
    dialog.addEventListener('cancel',function(e){e.preventDefault();close();});
    dialog.addEventListener('input',function(e){
      var it=current();if(!it || State.view!=='editor')return;
      if(e.target.hasAttribute('data-product-brand-search') && typeof Workspace !== 'undefined'){Workspace.searchBrands(it,e.target.value);return;}
      if(e.target.dataset.productField && typeof Workspace !== 'undefined'){Workspace.editField(it,e.target);touch();return;}
      if(e.target.dataset.categorySearch){var store=e.target.dataset.categorySearch;document.getElementById('category-'+store).innerHTML=categoryOptions(store,it.automation.categoryCodes[store],e.target.value);return;}
      if(e.target.dataset.generator){it.automation.generator[e.target.dataset.generator]=e.target.value;touch();}
      if(e.target.dataset.basic){it.automation[e.target.dataset.basic]=e.target.value;touch();}
      if(e.target.dataset.imageField){var row=e.target.closest('[data-image-id]'),img=it.automation.detailImages.find(function(i){return i.id===row.dataset.imageId;});img[e.target.dataset.imageField]=e.target.value.toLowerCase().trim();delete img.validation;touch();updateOutputs();}
    });
    dialog.addEventListener('change',async function(e){
      var it=current();if(!it || State.view!=='editor')return;
      if(e.target.hasAttribute('data-product-brand-select')){
        Workspace.selectBrand(it,e.target.value);touch();render();
        if(e.target.value===UI.BRAND_CUSTOM){var direct=document.querySelector('.brand-direct-input');if(direct){direct.focus();direct.select();}}
        return;
      }
      if(e.target.hasAttribute('data-image-extension')) {
        var row=e.target.closest('[data-image-id]'), img=it.automation.detailImages.find(function(i){return i.id===row.dataset.imageId;});
        img.filename=img.filename.replace(/\.[^.]*$/,'')+'.'+e.target.value; delete img.validation;touch();renderImages();return;
      }
      if(e.target.dataset.category){var store=e.target.dataset.category;it.automation.categoryCodes[store]=e.target.value;var f=AutomationCore.defaultFolder(settings.categories[store],e.target.value);if(f && !it.automation.generator.folder)it.automation.generator.folder=f;touch();render();}
      if(e.target.id==='thumbnailFile'){
        var file=e.target.files[0];if(!file)return;
        if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type) || file.size>6*1024*1024){toast('JPG·PNG·WEBP·GIF 이미지, 최대 6MB까지 등록할 수 있습니다.','error');e.target.value='';return;}
        var token={}, preview=URL.createObjectURL(file), result, latest=false;
        thumbnailChecks.set(it.id,token);
        try { result=await ImageValidator.check(preview); latest=thumbnailChecks.get(it.id)===token; }
        finally { if(thumbnailChecks.get(it.id)===token)thumbnailChecks.delete(it.id); }
        if(!latest){URL.revokeObjectURL(preview);return;}
        if(result.status!=='valid'){URL.revokeObjectURL(preview);toast('이미지 파일을 읽을 수 없습니다.','error');return;}
        if(!State.items.includes(it)){URL.revokeObjectURL(preview);return;}
        if(pending.has(it.id))URL.revokeObjectURL(pending.get(it.id).preview);
        pending.set(it.id,{file:file,preview:preview});touch();if(current()===it)render();
      }
    });
    dialog.addEventListener('toggle',function(e){
      if(!e.target.matches('.image-preview') || !e.target.open)return;
      var row=e.target.closest('[data-image-id]'),it=current();if(!it)return;
      var img=it.automation.detailImages.find(function(i){return i.id===row.dataset.imageId;}),url=AutomationCore.imageUrl(img),box=e.target.querySelector('div');
      if(url && !box.children.length){var image=document.createElement('img');image.src=url;image.alt=img.filename;image.onerror=function(){image.replaceWith(document.createTextNode('이미지를 불러오지 못했습니다. 주소를 확인해 주세요.'));};box.appendChild(image);}
    },true);
    dialog.addEventListener('click',async function(e){
      var it=current();if(!it)return;
      var b=e.target.closest('[data-action],[data-image-action]');if(!b)return;
      try {
        var action=b.dataset.action, a=it.automation;
        if(action==='check-all'){b.disabled=true;await checkAll([it]);b.disabled=false;return;}
        if(action==='copy-html'){var h=AutomationCore.html(a.detailImages);if(!h)throw new Error('이미지 주소를 먼저 확인해 주세요.');copyText(h);return;}
        if(action==='copy-urls'){copyText(a.detailImages.map(AutomationCore.imageUrl).filter(Boolean).join('\n'));return;}
        if(action==='copy-json'){copyText(JSON.stringify(AutomationCore.exportItem(it,settings),null,2));return;}
        if(action==='copy-thumb'){copyText(it.image_url);return;}
        if(b.dataset.imageAction){
          var id=b.closest('[data-image-id]').dataset.imageId, index=a.detailImages.findIndex(function(i){return i.id===id;}),img=a.detailImages[index],ia=b.dataset.imageAction;
          if(ia==='check'){await checkImage(it,img);return;}
          if(ia==='copy'){copyText(AutomationCore.imageUrl(img));return;}
          if(State.view!=='editor')return;
          if(ia==='remove')a.detailImages.splice(index,1);
          if(ia==='up' && index>0){a.detailImages.splice(index,1);a.detailImages.splice(index-1,0,img);}
          if(ia==='down' && index<a.detailImages.length-1){a.detailImages.splice(index,1);a.detailImages.splice(index+1,0,img);}
          touch();renderImages();return;
        }
        if(State.view!=='editor')return;
        if(action==='generate'){
          var images=AutomationCore.generate(a.generator),existing=new Set(a.detailImages.map(AutomationCore.imageUrl));
          images=images.filter(function(img){return !existing.has(AutomationCore.imageUrl(img));}).map(function(img){return Object.assign({id:uuid()},img);});
          if(!images.length)throw new Error('같은 이미지 주소가 이미 목록에 있습니다.');
          a.detailImages=a.detailImages.concat(images);touch();renderImages();
        }
        if(action==='add-image'){a.detailImages.push({id:uuid(),folder:a.generator.folder,filename:''});touch();renderImages();}
        if(action==='remove-thumb'){thumbnailChecks.delete(it.id);if(pending.has(it.id))URL.revokeObjectURL(pending.get(it.id).preview);pending.delete(it.id);it.image_url='';delete a.thumbnail;touch();render();}
      } catch(err){toast(err.message || String(err),'error');}
    });
  }
  async function init() { bind(); try { settings=(await Api.fetchAutomationSettings()).value; } catch(e){toast('자동화 설정 불러오기 실패: '+e.message,'error');} }
  function afterLoad() { var dialog = document.getElementById("automationDialog"); if (dialog.open) { if (current()) render(); else close(); } }
  return { readiness:readiness, afterLoad:afterLoad, settings:getSettings, brands:brands, reloadSettings:reloadSettings, isChecking:function(){return checking.size>0 || thumbnailChecks.size>0;}, init:init, open:open, publish:publish, thumbnailCell:thumbnailCell, summary:summary, clearPending:clearPending, copyPending:copyPending, uploadPending:uploadPending };
})();
