/* 상품 중앙 모달. 목록 행과 분리된 초안을 편집하고 '상품 등록/수정 완료'에서만 행에 커밋합니다.
   배치는 Figma modal-default / modal-img / modal-brand 를 따릅니다. */
var AutomationEditor = (function () {
  var CHEVRON = '<svg class="caret" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var settings = null, settingsError = '', activeId = null, activeOriginal = null, draft = null, isNew = false, activeTab = 'default';
  var pending = new Map(), checking = new Set(), thumbnailChecks = new Map(), lastFocus = null, choice = null;
  var regularManual = false;
  var statusLabels = { unchecked: '미검사', checking: '검사 중', valid: '정상', error: '로딩 실패', timeout: '시간 초과', invalid: '주소 형식 오류' };

  function current() { return draft || (State.items || []).find(function (item) { return item.id === activeId; }); }
  function data(item) { item.automation = AutomationCore.normalize(item.automation); return item.automation; }
  function getSettings() { return settings || { categories: { retail: [], wholesale: [] }, folders: [], brands: [] }; }
  function brands() { return getSettings().brands || []; }
  /* 모달 편집은 비공개 초안에만 반영됩니다. 취소하면 목록은 그대로 남습니다. */
  function touch() { if (State.view === 'editor' && !draft) setDirty(true); publish(); }
  function safeUrl(url) { return /^https?:\/\//.test(url || '') ? normalizeUrl(url) : ''; }
  function thumbUrl(item) { return pending.has(item.id) ? pending.get(item.id).preview : safeUrl(item.image_url); }
  function thumbnailCell(item) {
    var url = thumbUrl(item), a = AutomationCore.normalize(item.automation), cleaned = a.thumbnail && a.thumbnail.deletedAt;
    return '<button class="thumb-button" data-auto-open="' + esc(item.id) + '" title="상품 편집">' + (url ? '<img src="' + esc(url) + '" alt="상품 썸네일" loading="lazy">' : (cleaned ? '정리됨' : '+ 이미지')) + '</button>';
  }
  function summary() { return ''; }
  function reloadSettings() { return Api.fetchAutomationSettings().then(function (row) { settings = row.value; settingsError = ''; return settings; }); }
  function readiness(item) {
    if (!settings) return { key: 'loading', label: '설정 확인 중', issues: [] };
    var issues = AutomationCore.readyIssues(item, getSettings());
    var missing = issues.filter(function (issue) { return !/이미지 정상 확인 필요/.test(issue); });
    return { key: missing.length ? 'missing' : issues.length ? 'images' : 'ready', label: missing.length ? '정보 부족' : issues.length ? '이미지 확인 필요' : '등록 준비 완료', issues: issues };
  }
  function publish() {
    var target = document.getElementById('automation-data');
    var ready = !!(settings && State.currentListId && !State.loading && !State.loadError);
    document.documentElement.dataset.automationReady = String(ready);
    if (target) target.textContent = JSON.stringify({ schemaVersion: 1, ready: ready, listId: State.currentListId, saved: !State.dirty && !State.saving, items: (State.items || []).map(function (item) { return AutomationCore.exportItem(item, getSettings()); }) });
  }

  /* ---------- 모달 열고 닫기 ---------- */
  function prefersReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function syncScrollLock() {
    var open = Array.prototype.some.call(document.querySelectorAll('dialog'), function (node) { return node.open; });
    document.body.classList.toggle('modal-open', open);
  }
  function openDialog(dialog) { if (!dialog) return; dialog.classList.remove('is-closing'); if (!dialog.open) dialog.showModal(); syncScrollLock(); }
  /* 닫기 애니메이션이 실제로 재생된 뒤에 dialog 를 닫습니다. */
  function closeDialog(dialog, after) {
    if (!dialog || !dialog.open) { if (after) after(); syncScrollLock(); return; }
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      dialog.classList.remove('is-closing');
      dialog.close();
      syncScrollLock();
      if (after) after();
    }
    if (prefersReducedMotion()) { finish(); return; }
    dialog.classList.add('is-closing');
    var timer = setTimeout(finish, 320);
    dialog.addEventListener('animationend', function handler(event) {
      if (event.target !== dialog) return;
      dialog.removeEventListener('animationend', handler);
      clearTimeout(timer);
      finish();
    });
  }

  function folders(value) {
    var list = (getSettings().folders || []).slice();
    if (value && list.indexOf(value) === -1) list.push(value);
    return '<option value="">폴더 선택</option>' + list.map(function (folder) { return '<option value="' + esc(folder) + '"' + (folder === value ? ' selected' : '') + '>' + esc(folder) + '</option>'; }).join('');
  }
  function categorySummary(store, code) {
    var cats = getSettings().categories[store] || [], found = cats.find(function (cat) { return cat.code === code; });
    return found ? AutomationCore.path(cats, code) : (code ? '설정에서 찾을 수 없는 코드' : '카테고리 선택');
  }
  /* 카테고리는 선택 모달로 연결하고 저장 코드를 필드 아래에 그대로 보여 줍니다. (앞자리 0 보존) */
  function categoryField(store, ro) {
    var item = current(), code = data(item).categoryCodes[store], label = store === 'retail' ? '소비자몰 카테고리' : '도매몰 카테고리';
    var cats = getSettings().categories[store] || [], missing = !!code && !cats.some(function (cat) { return cat.code === code; });
    var text = categorySummary(store, code);
    return '<div class="field w-third"><span class="field-label">' + esc(label) + '</span>' +
      '<button type="button" class="choice-trigger" data-choice="category" data-choice-store="' + store + '"' + (ro ? ' disabled' : '') + '>' +
      '<span class="cv' + (code ? '' : ' is-placeholder') + '" title="' + esc(text) + '">' + esc(text) + '</span>' + CHEVRON + '</button>' +
      '<span class="field-code">저장 코드 ' + esc(code || '없음') + '</span>' +
      (missing ? '<span class="field-warning">설정에서 사라진 코드입니다. 저장 코드는 유지되며 다시 선택할 수 있습니다.</span>' : '') +
      '</div>';
  }

  function renderBasic() {
    var item = current(); if (!item) return;
    var ro = State.view !== 'editor';
    document.getElementById('autoBody').innerHTML = Workspace.fields(item, ro, { categoryField: categoryField, regularManual: regularManual });
    updateNameCount(); updateOriginPreview();
  }

  function generatorField(item, key, label, placeholder, note, ro) {
    var g = data(item).generator, manualKey = key === 'brand' ? 'brandManual' : 'productManual';
    var manual = !!g[manualKey], value = manual ? g[key] : (key === 'brand' ? item.brand || '' : item.model || '');
    return '<div class="field w-half"><span class="field-label">' + esc(label) + '</span>' +
      '<input data-generator="' + key + '" value="' + esc(value) + '" placeholder="' + esc(placeholder) + '"' + (ro || !manual ? ' disabled' : '') + '>' +
      '<label class="check-line check-line-sm field-extra"><input type="checkbox" data-generator-manual="' + key + '"' + (manual ? ' checked' : '') + (ro ? ' disabled' : '') + '><span>직접 입력</span></label>' +
      (note ? '<span class="field-note">' + esc(note) + '</span>' : '') + '</div>';
  }

  function renderImagesTab() {
    var item = current(); if (!item) return;
    var a = data(item), ro = State.view !== 'editor', url = thumbUrl(item), cleanedAt = a.thumbnail && a.thumbnail.deletedAt;

    var html = '<section class="modal-section"><h3>상품 썸네일</h3><div class="thumbnail-editor">' +
      '<div class="thumbnail-preview">' + (url ? '<img src="' + esc(url) + '" alt="상품 썸네일 미리보기">' : '<span>' + (cleanedAt ? '자동 정리됨' : '이미지 없음') + '</span>') + '</div>' +
      '<div class="thumbnail-actions">' +
      (!ro ? '<div class="action-row"><label class="btn btn-primary file-label">이미지 업로드<input id="thumbnailFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></label><button class="btn btn-outline" data-action="remove-thumb">삭제</button></div>' : '') +
      '<p class="field-note">JPG · PNG · WEBP · GIF, 최대 6MB<br>저장 시 업로드됩니다.</p>' +
      '<p class="field-note">' + esc(pending.has(item.id) ? pending.get(item.id).file.name + ' · 업로드 대기' : (a.thumbnail && a.thumbnail.originalName) || '') + '</p>' +
      (item.image_url && !pending.has(item.id) ? '<button class="btn btn-neutral" data-action="copy-thumb">썸네일 주소 복사</button>' : '') +
      '</div></div></section>';

    if (!ro) {
      html += '<section class="modal-section"><div class="section-heading"><div><h3>상세페이지 이미지 주소 만들기</h3>' +
        '<p class="field-note">영문 소문자로 생성합니다. 제품명 내부 대시와 공백은 제거됩니다.</p></div></div><div class="f-grid">' +
        '<label class="field w-half"><span>FTP 서버 내 폴더</span><select data-generator="folder">' + folders(a.generator.folder) + '</select>' +
        '<span class="field-note">이미지가 업로드 된 폴더를 선택해주세요.</span></label>' +
        generatorField(item, 'brand', '브랜드', '브랜드 선택', '', ro) +
        '<label class="field w-half"><span>이미지 수</span><input type="number" min="1" max="50" data-generator="count" value="' + esc(a.generator.count) + '" placeholder="숫자 입력">' +
        '<span class="field-note">이미지가 분할된 경우 사용합니다.</span></label>' +
        generatorField(item, 'product', '모델명', '모델명 입력', '', ro) +
        '<label class="field w-half"><span>확장자</span><select data-generator="extension">' + AutomationCore.EXTENSIONS.map(function (ext) { return '<option value="' + ext + '"' + (ext === a.generator.extension ? ' selected' : '') + '>' + ext.toUpperCase() + '</option>'; }).join('') + '</select></label>' +
        '</div><div class="action-row generator-actions"><button class="btn btn-primary" data-action="generate">자동 생성하기</button><button class="btn btn-outline" data-action="add-image">이미지 직접 추가</button></div></section>';
    }

    html += '<section class="modal-section"><div class="section-heading"><div><h3>상세페이지 이미지 <span class="count-label" id="detailCount"></span></h3>' +
      '<p class="field-note">FTP에서 실제 이미지를 불러와 확인할 수 있습니다. 내용이 해당 상품과 맞는지는 미리보기로 확인하세요.</p></div>' +
      '<button class="btn btn-neutral" data-action="check-all">전체 검사</button></div><div id="detailImageRows"></div></section>';

    html += '<section class="modal-section html-section"><div class="section-heading"><h3>상세페이지 HTML</h3>' +
      '<button class="btn btn-outline" data-action="copy-html">HTML 복사</button></div>' +
      '<textarea id="detailHtml" readonly rows="5" spellcheck="false" aria-label="상세페이지 HTML"></textarea></section>';

    document.getElementById('autoBody').innerHTML = html;
    renderImages();
  }

  function render() {
    var item = current(); if (!item) return;
    var body = document.getElementById('autoBody'), keepScroll = body ? body.scrollTop : 0;
    var title = document.getElementById('autoTitle'); if (title) title.textContent = '상품 등록 및 수정';
    document.querySelectorAll('[data-product-tab]').forEach(function (tab) {
      var on = tab.dataset.productTab === activeTab;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
    });
    var saveButton = document.getElementById('autoSave'); if (saveButton) saveButton.textContent = isNew ? '상품 등록' : '수정 완료';
    if (activeTab === 'images') renderImagesTab(); else renderBasic();
    /* 하위 모달을 닫고 돌아와도 본문 스크롤 위치를 유지합니다. */
    if (body) body.scrollTop = keepScroll;
  }

  function renderImages() {
    var item = current(); if (!item) return;
    var a = data(item), ro = State.view !== 'editor', rows = a.detailImages.map(function (image, index) {
      var imageId = image.id || (image.id = uuid());
      return '<article class="image-row" data-image-id="' + esc(imageId) + '">' +
        '<div class="image-row-head"><b>이미지 ' + (index + 1) + '</b><div class="action-row">' +
        (!ro ? '<button class="icon-action" data-image-action="up" aria-label="이미지 ' + (index + 1) + ' 위로"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
          '<button class="icon-action" data-image-action="down" aria-label="이미지 ' + (index + 1) + ' 아래로"' + (index === a.detailImages.length - 1 ? ' disabled' : '') + '>↓</button>' +
          '<button class="btn btn-outline btn-sm" data-image-action="remove">삭제</button>' : '') +
        '</div></div>' +
        '<div class="image-fields">' +
        '<select data-image-field="folder" aria-label="이미지 ' + (index + 1) + ' 폴더"' + (ro ? ' disabled' : '') + '>' + folders(image.folder) + '</select>' +
        '<input data-image-field="filename" aria-label="이미지 ' + (index + 1) + ' 파일명" value="' + esc(image.filename || '') + '" placeholder="파일명"' + (ro ? ' readonly' : '') + '>' +
        '<select data-image-extension aria-label="이미지 ' + (index + 1) + ' 확장자"' + (ro ? ' disabled' : '') + '>' + AutomationCore.EXTENSIONS.map(function (ext) { return '<option value="' + ext + '"' + (String(image.filename || '').endsWith('.' + ext) ? ' selected' : '') + '>' + ext.toUpperCase() + '</option>'; }).join('') + '</select>' +
        '</div>' +
        '<div class="image-url-row"><input class="image-url" data-field="detail-image-url" readonly aria-label="이미지 ' + (index + 1) + ' 주소">' +
        '<button class="btn btn-outline" data-image-action="copy">주소 복사</button></div>' +
        '<div class="image-row-actions"><button class="btn btn-neutral btn-sm" data-image-action="check">검사</button>' +
        '<a class="btn btn-text btn-sm image-link" target="_blank" rel="noopener">원본 열기</a>' +
        '<span class="image-status" aria-live="polite"></span></div>' +
        '<details class="image-preview"><summary>이미지 미리보기</summary><div class="image-preview-box"></div></details></article>';
    }).join('');
    document.getElementById('detailImageRows').innerHTML = rows || '<p class="empty-hint">등록한 상세 이미지가 없습니다.</p>';
    updateOutputs();
  }

  function updateNameCount() {
    var field = document.querySelector('[data-product-field="name_naver"]'), count = document.querySelector('[data-naver-count]');
    if (!field || !count) return;
    var length = String(field.value || '').length;
    count.textContent = length + ' / 50';
    count.classList.toggle('is-over', length > 50);
  }
  function updateOriginPreview() {
    var preview = document.querySelector('[data-origin-preview]'); if (!preview) return;
    var select = document.querySelector('[data-origin-select]'), input = document.querySelector('[data-basic="origin-custom"]');
    var value = select ? Workspace.originOutput(select.value, input && input.value) : (current() && current().automation.origin);
    preview.textContent = value ? '미리보기: ' + value : '영문 국가명만 입력할 수 있습니다.';
  }
  function updateOutputs() {
    var item = current(); if (!item) return;
    var a = data(item);
    a.detailImages.forEach(function (image) {
      var row = Array.prototype.slice.call(document.querySelectorAll('.image-row')).find(function (candidate) { return candidate.dataset.imageId === image.id; });
      if (!row) return;
      var url = AutomationCore.imageUrl(image), validation = AutomationCore.validation(image), status = checking.has(image.id) ? 'checking' : (!url ? 'invalid' : validation.status);
      row.querySelector('.image-url').value = url;
      var link = row.querySelector('.image-link'); link.hidden = !url; if (url) link.href = url; else link.removeAttribute('href');
      var label = row.querySelector('.image-status'); label.dataset.status = status; label.textContent = statusLabels[status] + (status === 'valid' ? ' · ' + validation.width + ' × ' + validation.height : '');
      row.querySelector('[data-image-action="check"]').disabled = !url || status === 'checking';
      var preview = row.querySelector('.image-preview-box'); if (preview.dataset.url !== url) { preview.replaceChildren(); preview.dataset.url = url; }
    });
    var count = document.getElementById('detailCount'); if (count) count.textContent = a.detailImages.length + '장';
    var output = document.getElementById('detailHtml'); if (output) output.value = AutomationCore.html(a.detailImages);
    publish();
  }

  function open(id) {
    if (!settings) { toast(settingsError || '자동화 설정을 불러오지 못했습니다. 페이지를 새로고침해 주세요.', 'error'); return; }
    var source = (State.items || []).find(function (item) { return item.id === id; }); if (!source) return;
    activeOriginal = source;
    draft = AutomationCore.clone(source);
    draft.automation = AutomationCore.normalize(draft.automation);
    draft.automation.detailImages.forEach(function (image) { if (!image.id) image.id = uuid(); });
    draft.price_naver = draft.price_retail;
    activeId = id; isNew = false; activeTab = 'default';
    regularManual = draft.price_retail_regular !== null && draft.price_retail_regular !== undefined;
    lastFocus = document.activeElement;
    render();
    openDialog(document.getElementById('automationDialog'));
  }
  function openNew(item) {
    if (!settings) { toast(settingsError || '자동화 설정을 불러오지 못했습니다. 페이지를 새로고침해 주세요.', 'error'); return; }
    activeOriginal = null;
    draft = item || makeItem((State.items || []).length + 1);
    draft.automation = AutomationCore.normalize(draft.automation);
    draft.automation.naverNameMode = 'auto';
    activeId = draft.id; isNew = true; activeTab = 'default';
    regularManual = draft.price_retail_regular !== null && draft.price_retail_regular !== undefined;
    lastFocus = document.activeElement;
    render();
    openDialog(document.getElementById('automationDialog'));
  }
  function discardPending(id) { var item = pending.get(id); if (item) { URL.revokeObjectURL(item.preview); pending.delete(id); } thumbnailChecks.delete(id); }
  function restoreFocus() {
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    else { var fallback = document.getElementById('btnAddRow'); if (fallback) fallback.focus(); }
  }
  function closeDiscard() {
    if (isNew) discardPending(activeId);
    closeDialog(document.getElementById('automationDialog'), function () {
      activeId = null; activeOriginal = null; draft = null; isNew = false; choice = null;
      restoreFocus();
    });
  }
  function commit() {
    var item = current(); if (!item) return;
    if (!item.name_naver || data(item).naverNameMode === 'auto') item.name_naver = Workspace.smartName(item.name_own);
    item.price_naver = item.price_retail;
    var index = State.items.findIndex(function (candidate) { return candidate.id === item.id; });
    if (index === -1) { State.items.push(item); State.baseItemIds[item.id] = false; } else State.items[index] = item;
    setDirty(true); UI.renderGrid();
    closeDialog(document.getElementById('automationDialog'), function () {
      activeId = null; activeOriginal = null; draft = null; isNew = false; choice = null;
      restoreFocus();
    });
    toast('상품이 목록에 반영되었습니다. 상단 저장하기를 눌러 공유하세요.');
  }

  async function checkImage(item, image) {
    var url = AutomationCore.imageUrl(image); if (!url || checking.has(image.id)) return;
    checking.add(image.id); if (current() === item) updateOutputs();
    var result;
    try { result = await ImageValidator.check(url); } finally { checking.delete(image.id); }
    var stillCurrent = (draft === item || (State.items || []).indexOf(item) > -1) && AutomationCore.imageUrl(image) === url;
    if (stillCurrent) { image.validation = result; if (draft === item) touch(); }
    if (current() === item) updateOutputs();
  }
  async function checkAll(items) {
    var jobs = []; (items || []).forEach(function (item) { var a = item.automation || {}; (a.detailImages || []).forEach(function (image) { jobs.push({ item: item, image: image }); }); });
    await ImageValidator.pool(jobs, function (job) { return checkImage(job.item, job.image); });
  }
  function copyPending(from, to) { if (!pending.has(from)) return; var source = pending.get(from); pending.set(to, { file: source.file, preview: URL.createObjectURL(source.file) }); }
  function clearPending() { pending.forEach(function (entry) { URL.revokeObjectURL(entry.preview); }); pending.clear(); thumbnailChecks.clear(); }
  async function uploadPending() {
    for (var i = 0; i < State.items.length; i++) {
      var item = State.items[i], selected = pending.get(item.id); if (!selected) continue;
      if (!selected.uploaded) {
        var extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[selected.file.type];
        var path = State.list.id + '/' + item.id + '/' + uuid() + '.' + extension;
        var result = await supabaseClient.storage.from('product-thumbnails').upload(path, selected.file, { contentType: selected.file.type, upsert: false });
        if (result.error) throw result.error;
        selected.uploaded = { path: path, url: supabaseClient.storage.from('product-thumbnails').getPublicUrl(path).data.publicUrl };
      }
      item.image_url = selected.uploaded.url; item.automation = AutomationCore.normalize(item.automation); item.automation.thumbnail = { path: selected.uploaded.path, originalName: selected.file.name, mimeType: selected.file.type, size: selected.file.size };
    }
  }

  /* ---------- 브랜드 · 카테고리 선택 모달 (Figma modal-brand) ---------- */
  function choiceRow(value, main, code, selected, extraClass) {
    return '<button type="button" class="choice-row' + (extraClass ? ' ' + extraClass : '') + (selected ? ' is-selected' : '') +
      '" role="option" aria-selected="' + String(!!selected) + '" data-choice-value="' + esc(value) + '">' +
      '<span class="cr-main"><span class="cr-path">' + main + '</span></span>' +
      '<code>' + esc(code || '') + '</code>' +
      '<span class="choice-check" aria-hidden="true">' + (selected ? '✓' : '') + '</span></button>';
  }
  function choiceRows() {
    if (!choice) return;
    var list = document.getElementById('choiceList'), state = document.getElementById('choiceState');
    var query = document.getElementById('choiceSearch').value.trim(), selected = choice.selected;
    if (settingsError) {
      list.className = 'choice-list';
      list.innerHTML = '<div class="choice-empty">설정을 불러오지 못했습니다.<br>' + esc(settingsError) + '</div>';
      if (state) state.textContent = '';
      return;
    }
    if (!settings) {
      list.className = 'choice-list';
      list.innerHTML = '<div class="choice-empty">불러오는 중…</div>';
      if (state) state.textContent = '';
      return;
    }
    if (choice.type === 'brand') {
      var rows = brands()
        .filter(function (brand) { return brand.active !== false || brand.name === selected; })
        .filter(function (brand) { return !query || AutomationCore.brandMatches(brand, query); })
        .sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }); });
      list.className = 'choice-list choice-grid';
      list.innerHTML = rows.map(function (brand) {
        return choiceRow(brand.name, esc(brand.name), brand.code, brand.name === selected);
      }).join('');
      if (!rows.length) {
        list.className = 'choice-list';
        list.innerHTML = '<div class="choice-empty"><span>검색 결과가 없습니다.</span>' +
          '<button type="button" class="btn btn-outline" data-choice-value="' + UI.BRAND_CUSTOM + '">미등록 브랜드 직접 입력</button></div>';
      }
      if (state) state.textContent = rows.length ? rows.length + '개 브랜드' : '';
      return;
    }
    var categories = getSettings().categories[choice.store] || [], q = query.toLowerCase();
    /* 검색 조건과 무관한 기존 선택 항목을 결과에 끼워 넣지 않습니다. */
    var matched = categories.filter(function (cat) {
      return !q || (cat.code + ' ' + AutomationCore.path(categories, cat.code)).toLowerCase().indexOf(q) > -1;
    });
    list.className = 'choice-list';
    list.innerHTML = matched.map(function (cat) {
      return choiceRow(cat.code, esc(AutomationCore.path(categories, cat.code)), cat.code, cat.code === selected);
    }).join('') || '<div class="choice-empty">검색 결과가 없습니다.</div>';
    if (state) state.textContent = matched.length ? matched.length + '개 카테고리' : '';
  }
  function openChoice(type, store) {
    var item = current(); if (!item) return;
    choice = {
      type: type,
      store: store || '',
      selected: type === 'brand'
        ? (AutomationCore.matchBrand(brands(), item.brand) || {}).name || (isBrandCustom(item, brands()) ? UI.BRAND_CUSTOM : '')
        : data(item).categoryCodes[store] || '',
      returnFocus: document.activeElement
    };
    var brandMode = type === 'brand';
    document.getElementById('choiceTitle').textContent = brandMode ? '브랜드 선택' : (store === 'retail' ? '소비자몰 카테고리 선택' : '도매몰 카테고리 선택');
    document.getElementById('choiceSearchLabel').textContent = brandMode ? '브랜드 검색' : '카테고리 검색';
    document.getElementById('choiceListLabel').textContent = brandMode ? '브랜드 리스트' : '카테고리 리스트';
    document.getElementById('choiceSearch').placeholder = brandMode ? '초성 입력도 가능합니다.' : '이름 · 전체 경로 · 코드 검색';
    document.getElementById('choiceConfirm').textContent = brandMode ? '브랜드 선택' : '카테고리 선택';
    document.getElementById('choiceSearch').value = '';
    choiceRows();
    openDialog(document.getElementById('choiceDialog'));
    document.getElementById('choiceSearch').focus();
  }
  /* 하위 모달 취소는 하위 선택만 취소하고 부모 모달의 입력·스크롤·포커스를 유지합니다. */
  function closeChoice(apply) {
    if (!choice) return;
    var selected = choice.selected, item = current(), pendingChoice = choice, focus = choice.returnFocus;
    choice = null;
    closeDialog(document.getElementById('choiceDialog'), function () {
      if (apply && item) {
        if (pendingChoice.type === 'brand') {
          Workspace.selectBrand(item, selected || UI.BRAND_CUSTOM);
          render();
          if (selected === UI.BRAND_CUSTOM) { var direct = document.querySelector('.brand-direct-input'); if (direct) { direct.focus(); direct.select(); return; } }
        } else {
          data(item).categoryCodes[pendingChoice.store] = selected;
          var folder = AutomationCore.defaultFolder(getSettings().categories[pendingChoice.store] || [], selected);
          if (folder && !data(item).generator.folder) data(item).generator.folder = folder;
          render();
        }
        touch();
      }
      if (focus && focus.isConnected) focus.focus();
    });
  }

  function download() {
    var result = JSON.parse(document.getElementById('automation-data').textContent);
    if (!result.ready) { toast('상품 데이터가 준비된 뒤 다시 시도해 주세요.', 'warn'); return; }
    if (State.dirty) { toast('저장 후 내보내 주세요.', 'warn'); return; }
    if (result.items.some(function (item) { return item.issues.length; }) && !confirm('자동화 확인 항목이 남아 있습니다. 확인 항목을 포함하여 JSON을 내보낼까요?')) return;
    var blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = '상품-자동화-' + (State.currentListId || '목록') + '.json'; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function bind() {
    var gridBody = document.getElementById('gridBody'), dialog = document.getElementById('automationDialog'), choiceDialog = document.getElementById('choiceDialog');
    var exportButton = document.getElementById('btnExportAutomation'); if (exportButton) exportButton.addEventListener('click', download);
    var validateButton = document.getElementById('btnValidateList');
    if (validateButton) validateButton.addEventListener('click', async function () { this.disabled = true; await checkAll(State.items); this.disabled = false; toast('이미지 검사가 끝났습니다. 상품별 결과를 확인하세요.'); });

    /* 행의 일반 영역을 누르면 상품 모달을 엽니다.
       복사·체크·링크 같은 고유 동작과 텍스트 드래그 선택은 편집 클릭으로 보지 않습니다. */
    if (gridBody) {
      var pressX = 0, pressY = 0;
      gridBody.addEventListener('pointerdown', function (event) { pressX = event.clientX; pressY = event.clientY; });
      gridBody.addEventListener('click', function (event) {
        var button = event.target.closest('[data-auto-open]');
        if (button) { open(button.dataset.autoOpen); return; }
        if (State.view !== 'editor') return;
        if (event.target.closest('button, a, input, select, textarea, label')) return;
        if (Math.abs(event.clientX - pressX) > 4 || Math.abs(event.clientY - pressY) > 4) return;
        var selection = window.getSelection && window.getSelection();
        if (selection && !selection.isCollapsed && String(selection).trim()) return;
        var row = event.target.closest('tr[data-id]');
        if (row) open(row.dataset.id);
      });
    }

    document.querySelectorAll('[data-product-tab]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        if (activeTab === tab.dataset.productTab) return;
        activeTab = tab.dataset.productTab;
        var body = document.getElementById('autoBody');
        render();
        if (body) { body.scrollTop = 0; body.classList.remove('is-switching'); void body.offsetWidth; body.classList.add('is-switching'); }
      });
    });
    document.getElementById('autoCancel').addEventListener('click', closeDiscard);
    document.getElementById('autoSave').addEventListener('click', commit);
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); closeDiscard(); });

    dialog.addEventListener('input', function (event) {
      var item = current(); if (!item || State.view !== 'editor') return;
      if (event.target.dataset.productField) {
        Workspace.editField(item, event.target);
        if (event.target.dataset.productField === 'name_own' && Workspace.smartNameMode(item) === 'auto') {
          item.name_naver = Workspace.smartName(item.name_own);
          var naver = document.querySelector('[data-product-field="name_naver"]');
          if (naver) naver.value = item.name_naver;
        }
        touch(); updateNameCount(); return;
      }
      if (event.target.dataset.basic === 'origin-custom') { item.automation.origin = Workspace.originOutput('custom', event.target.value.replace(/[^A-Za-z .'-]/g, '')); updateOriginPreview(); touch(); return; }
      if (event.target.dataset.generator) { data(item).generator[event.target.dataset.generator] = event.target.value; touch(); return; }
      if (event.target.dataset.imageField) {
        var row = event.target.closest('[data-image-id]'), image = data(item).detailImages.find(function (candidate) { return candidate.id === row.dataset.imageId; });
        image[event.target.dataset.imageField] = event.target.value.toLowerCase().trim();
        delete image.validation; touch(); updateOutputs();
      }
    });

    dialog.addEventListener('change', async function (event) {
      var item = current(); if (!item || State.view !== 'editor') return;
      if (event.target.hasAttribute('data-naver-mode')) {
        if (event.target.checked) {
          data(item).naverNameMode = 'manual'; renderBasic();
          var input = document.querySelector('[data-product-field="name_naver"]');
          if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
        } else if (confirm('자동 모드로 되돌리면 현재 상품명으로 스마트스토어 상품명이 다시 생성됩니다. 계속할까요?')) {
          data(item).naverNameMode = 'auto'; item.name_naver = Workspace.smartName(item.name_own); renderBasic();
        } else { event.target.checked = true; return; }
        touch(); return;
      }
      /* 소비자몰 정가는 기본 미입력이며 직접 입력을 켰을 때만 입력할 수 있습니다. */
      if (event.target.hasAttribute('data-regular-manual')) {
        regularManual = event.target.checked;
        if (!regularManual) item.price_retail_regular = null;
        renderBasic();
        if (regularManual) { var regular = document.querySelector('[data-product-field="price_retail_regular"]'); if (regular) regular.focus(); }
        touch(); return;
      }
      if (event.target.dataset.generatorManual) {
        var key = event.target.dataset.generatorManual, generator = data(item).generator;
        generator[key === 'brand' ? 'brandManual' : 'productManual'] = event.target.checked;
        if (!event.target.checked) generator[key] = '';
        touch(); renderImagesTab(); return;
      }
      if (event.target.dataset.needField) { item[event.target.dataset.needField] = event.target.checked ? '필요' : '불필요'; touch(); return; }
      if (event.target.dataset.originSelect !== undefined) {
        var custom = document.querySelector('[data-basic="origin-custom"]');
        item.automation.origin = Workspace.originOutput(event.target.value, custom && custom.value);
        if (event.target.value === 'custom') renderBasic(); else updateOriginPreview();
        touch(); return;
      }
      if (event.target.hasAttribute('data-image-extension')) {
        var extRow = event.target.closest('[data-image-id]'), extImage = data(item).detailImages.find(function (candidate) { return candidate.id === extRow.dataset.imageId; });
        extImage.filename = String(extImage.filename || '').replace(/\.[^.]*$/, '') + '.' + event.target.value;
        delete extImage.validation; touch(); renderImages(); return;
      }
      if (event.target.id === 'thumbnailFile') {
        var file = event.target.files[0]; if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 6 * 1024 * 1024) { toast('JPG·PNG·WEBP·GIF 이미지, 최대 6MB까지 등록할 수 있습니다.', 'error'); event.target.value = ''; return; }
        var token = {}, preview = URL.createObjectURL(file), result, latest = false; thumbnailChecks.set(item.id, token);
        try { result = await ImageValidator.check(preview); latest = thumbnailChecks.get(item.id) === token; } finally { if (thumbnailChecks.get(item.id) === token) thumbnailChecks.delete(item.id); }
        if (!latest || result.status !== 'valid' || current() !== item) { URL.revokeObjectURL(preview); if (latest) toast('이미지 파일을 읽을 수 없습니다.', 'error'); return; }
        if (pending.has(item.id)) URL.revokeObjectURL(pending.get(item.id).preview);
        pending.set(item.id, { file: file, preview: preview });
        touch(); renderImagesTab();
      }
    });

    dialog.addEventListener('click', async function (event) {
      var item = current(); if (!item) return;
      var choiceButton = event.target.closest('[data-choice]'); if (choiceButton) { openChoice(choiceButton.dataset.choice, choiceButton.dataset.choiceStore); return; }
      var button = event.target.closest('[data-action],[data-image-action]'); if (!button) return;
      try {
        var action = button.dataset.action, a = data(item);
        if (action === 'check-all') { button.disabled = true; await checkAll([item]); button.disabled = false; return; }
        if (action === 'copy-html') { var html = AutomationCore.html(a.detailImages); if (!html) throw new Error('이미지 주소를 먼저 확인해 주세요.'); copyText(html); return; }
        if (action === 'copy-thumb') { copyText(item.image_url); return; }
        if (action === 'remove-thumb') { thumbnailChecks.delete(item.id); if (pending.has(item.id)) URL.revokeObjectURL(pending.get(item.id).preview); pending.delete(item.id); item.image_url = ''; delete a.thumbnail; touch(); renderImagesTab(); return; }
        if (button.dataset.imageAction) {
          var imageRow = button.closest('[data-image-id]'), id = imageRow.dataset.imageId;
          var index = a.detailImages.findIndex(function (candidate) { return candidate.id === id; }), image = a.detailImages[index], imageAction = button.dataset.imageAction;
          if (imageAction === 'check') { await checkImage(item, image); return; }
          if (imageAction === 'copy') { copyText(AutomationCore.imageUrl(image)); return; }
          if (imageAction === 'remove') a.detailImages.splice(index, 1);
          if (imageAction === 'up' && index > 0) { a.detailImages.splice(index, 1); a.detailImages.splice(index - 1, 0, image); }
          if (imageAction === 'down' && index < a.detailImages.length - 1) { a.detailImages.splice(index, 1); a.detailImages.splice(index + 1, 0, image); }
          touch(); renderImages(); return;
        }
        if (action === 'generate') {
          var images = AutomationCore.generate(AutomationCore.generatorValues(item));
          var existing = new Set(a.detailImages.map(AutomationCore.imageUrl));
          images = images.filter(function (image) { return !existing.has(AutomationCore.imageUrl(image)); }).map(function (image) { return Object.assign({ id: uuid() }, image); });
          if (!images.length) throw new Error('같은 이미지 주소가 이미 목록에 있습니다.');
          a.detailImages = a.detailImages.concat(images); touch(); renderImages();
        }
        if (action === 'add-image') { a.detailImages.push({ id: uuid(), folder: a.generator.folder, filename: '' }); touch(); renderImages(); }
      } catch (error) { toast(error.message || String(error), 'error'); }
    });

    dialog.addEventListener('toggle', function (event) {
      if (!event.target.matches('.image-preview') || !event.target.open) return;
      var row = event.target.closest('[data-image-id]'), item = current(); if (!item) return;
      var image = data(item).detailImages.find(function (candidate) { return candidate.id === row.dataset.imageId; });
      var url = AutomationCore.imageUrl(image), box = event.target.querySelector('.image-preview-box');
      if (url && !box.children.length) {
        var preview = document.createElement('img');
        preview.src = url; preview.alt = image.filename;
        preview.onerror = function () { preview.replaceWith(document.createTextNode('이미지를 불러오지 못했습니다. 주소를 확인해 주세요.')); };
        box.appendChild(preview);
      }
    }, true);

    document.getElementById('choiceSearch').addEventListener('input', choiceRows);
    document.getElementById('choiceList').addEventListener('click', function (event) {
      var row = event.target.closest('[data-choice-value]'); if (!row || !choice) return;
      choice.selected = row.dataset.choiceValue;
      if (row.classList.contains('btn')) { closeChoice(true); return; }
      choiceRows();
    });
    document.getElementById('choiceList').addEventListener('dblclick', function (event) {
      var row = event.target.closest('.choice-row'); if (!row || !choice) return;
      choice.selected = row.dataset.choiceValue; closeChoice(true);
    });
    document.getElementById('choiceCancel').addEventListener('click', function () { closeChoice(false); });
    document.getElementById('choiceConfirm').addEventListener('click', function () { closeChoice(true); });
    choiceDialog.addEventListener('cancel', function (event) { event.preventDefault(); closeChoice(false); });
  }

  async function init() {
    bind();
    try { settings = (await Api.fetchAutomationSettings()).value; settingsError = ''; }
    catch (error) { settingsError = error.message || String(error); toast('자동화 설정 불러오기 실패: ' + settingsError, 'error'); }
  }
  function afterLoad() {
    var dialog = document.getElementById('automationDialog');
    if (dialog && dialog.open) { if (current()) render(); else closeDiscard(); }
  }

  return {
    readiness: readiness, afterLoad: afterLoad, settings: getSettings, brands: brands, reloadSettings: reloadSettings,
    isChecking: function () { return checking.size > 0 || thumbnailChecks.size > 0; },
    init: init, open: open, openNew: openNew, publish: publish, thumbnailCell: thumbnailCell, summary: summary,
    clearPending: clearPending, copyPending: copyPending, uploadPending: uploadPending,
    openDialog: openDialog, closeDialog: closeDialog, syncScrollLock: syncScrollLock
  };
})();
