/* 상품 인덱싱 화면. 인덱싱 데이터는 상품 요청 리스트와 분리해 저장합니다. */
(function () {
  var settings = null, rows = [], selectedBrand = '', draft = null, editingId = null, htmlSource = 'generated';
  var modal = document.getElementById('indexingModal');

  function brandRef(brand) {
    return String((brand && (brand.id || brand.code)) || (brand && brand.name) || '').trim();
  }
  function indexingBrands() {
    return ((settings && settings.brands) || []).filter(function (brand) {
      return brand.indexing_enabled === true && brand.active !== false;
    }).sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }); });
  }
  function activeBrand(ref) {
    return indexingBrands().find(function (brand) { return brandRef(brand) === ref; });
  }
  function imageUrl(image) { return AutomationCore.imageUrl(image || {}); }
  function channelUrl(item, key) { return item[key + '_enabled'] && item[key + '_url'] ? item[key + '_url'] : ''; }
  function channelButton(item, key, label) {
    var url = channelUrl(item, key), disabled = !url;
    return '<div class="indexing-channel"><a class="btn btn-' + (disabled ? 'neutral' : 'primary') + ' btn-sm"' + (disabled ? ' aria-disabled="true"' : ' href="' + esc(normalizeUrl(url)) + '" target="_blank" rel="noopener noreferrer"') + '>' + esc(label) + '</a>' +
      '<button type="button" class="btn btn-outline btn-sm indexing-copy-url" data-index-copy-url="' + esc(item.id) + '" data-index-channel="' + key + '"' + (disabled ? ' disabled' : '') + '>복사</button></div>';
  }
  function htmlPreview(value) {
    var text = String(value || '').replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 110) + (text.length > 110 ? '…' : '') : '상세페이지 HTML이 없습니다.';
  }
  function renderBrands() {
    var el = document.getElementById('indexingBrands'); if (!el) return;
    var brands = indexingBrands();
    var counts = {};
    rows.forEach(function (item) { counts[item.brand_ref] = (counts[item.brand_ref] || 0) + 1; });
    var all = '<button type="button" class="brand-filter-item' + (!selectedBrand ? ' is-active' : '') + '" data-brand-filter=""><span>전체</span><b>' + rows.length + '</b></button>';
    var brandItems = brands.map(function (brand) {
      var ref = brandRef(brand);
      return '<button type="button" class="brand-filter-item' + (selectedBrand === ref ? ' is-active' : '') + '" data-brand-filter="' + esc(ref) + '"><span>' + esc(brand.name) + '</span><b>' + (counts[ref] || 0) + '</b></button>';
    }).join('');
    el.innerHTML = all + (brandItems || '<p class="overview-placeholder">인덱싱에 사용하는 브랜드가 없습니다.</p>');
  }
  function renderCards() {
    var el = document.getElementById('indexingCards'); if (!el) return;
    var filtered = selectedBrand ? rows.filter(function (item) { return item.brand_ref === selectedBrand; }) : rows;
    if (!filtered.length) { el.innerHTML = '<div class="indexing-empty"><strong>등록된 인덱싱 상품이 없습니다.</strong><p>직접 추가하기로 자주 사용하는 상품을 등록해 보세요.</p></div>'; return; }
    el.innerHTML = filtered.map(function (item) {
      return '<article class="indexing-card" data-index-id="' + esc(item.id) + '"><header class="indexing-card-head"><h2>' + esc(item.name) + '</h2><div class="action-row"><button type="button" class="btn btn-primary btn-sm" data-index-edit="' + esc(item.id) + '">수정</button><button type="button" class="btn btn-neutral btn-sm" data-index-delete="' + esc(item.id) + '">삭제</button></div></header>' +
        '<div class="indexing-card-field"><span>상세페이지 태그</span><div class="indexing-html-line"><code>' + esc(htmlPreview(item.detail_html)) + '</code><button type="button" class="btn btn-outline btn-sm" data-index-copy-html="' + esc(item.id) + '">복사</button></div></div>' +
        '<div class="indexing-card-field"><span>상품 바로가기</span><div class="indexing-channels">' + channelButton(item, 'retail', '소매몰') + channelButton(item, 'wholesale', '도매몰') + channelButton(item, 'smartstore', '스마트스토어') + '</div></div>' +
        '<p class="field-note">상품 페이지로 바로 연결됩니다. 복사를 누르면 저장된 상품 페이지 주소가 복사됩니다. 등록되지 않은 채널은 비활성화됩니다.</p></article>';
    }).join('');
  }
  function render() { renderBrands(); renderCards(); }
  function setError(message) {
    var el = document.getElementById('indexingFormError'); if (!el) return;
    el.textContent = message || ''; el.hidden = !message;
  }
  function imageRow(image, index) {
    var url = imageUrl(image);
    return '<article class="indexing-image-row" data-image-id="' + esc(image.id) + '"><div class="indexing-image-row-head"><b>이미지 ' + (index + 1) + '</b><div class="action-row"><button type="button" class="icon-action" data-index-image-action="up"' + (index === 0 ? ' disabled' : '') + ' aria-label="위로">↑</button><button type="button" class="icon-action" data-index-image-action="down"' + (index === draft.images.length - 1 ? ' disabled' : '') + ' aria-label="아래로">↓</button><button type="button" class="btn btn-outline btn-sm" data-index-image-action="remove">삭제</button></div></div>' +
      '<div class="indexing-image-fields"><select data-index-image-field="folder" aria-label="폴더"><option value="">폴더 선택</option>' + ((settings && settings.folders) || []).map(function (folder) { return '<option value="' + esc(folder) + '"' + (image.folder === folder ? ' selected' : '') + '>' + esc(folder) + '</option>'; }).join('') + '</select><input data-index-image-field="filename" value="' + esc(String(image.filename || '').replace(/\.[^.]*$/, '')) + '" placeholder="파일명"><select data-index-image-field="extension" aria-label="확장자">' + AutomationCore.EXTENSIONS.map(function (ext) { return '<option value="' + ext + '"' + (String(image.filename || '').endsWith('.' + ext) ? ' selected' : '') + '>' + ext.toUpperCase() + '</option>'; }).join('') + '</select></div>' +
      '<div class="indexing-image-url"><input readonly value="' + esc(url) + '" placeholder="https://calla.hgodo.com/"><button type="button" class="btn btn-outline btn-sm" data-index-image-copy="' + esc(image.id) + '"' + (url ? '' : ' disabled') + '>주소 복사</button></div>' +
      '<details class="indexing-image-preview"><summary>미리보기</summary><div class="indexing-image-preview-box">' + (url ? '<img src="' + esc(url) + '" alt="이미지 ' + (index + 1) + ' 미리보기" loading="lazy">' : '<span>유효한 이미지 주소가 없습니다.</span>') + '</div></details></article>';
  }
  function renderImages() {
    var el = document.getElementById('indexingImageRows'); if (!el || !draft) return;
    el.innerHTML = draft.images.map(imageRow).join('') || '<p class="overview-placeholder">이미지를 추가해 주소를 구성하세요.</p>';
  }
  function renderModal() {
    if (!draft) return;
    document.getElementById('indexingModalTitle').textContent = editingId ? '상품 인덱싱 수정' : '상품 인덱싱 추가';
    document.getElementById('indexingSave').textContent = editingId ? '수정 완료' : '상품 등록';
    document.getElementById('indexingName').value = draft.name || '';
    var brand = document.getElementById('indexingBrand');
    var brands = indexingBrands(), selected = activeBrand(draft.brand_ref);
    brand.innerHTML = '<option value="">브랜드 선택</option>' + brands.map(function (item) { var ref = brandRef(item); return '<option value="' + esc(ref) + '"' + (ref === (selected ? brandRef(selected) : draft.brand_ref) ? ' selected' : '') + '>' + esc(item.name) + '</option>'; }).join('');
    brand.value = draft.brand_ref || '';
    document.getElementById('indexingHtml').value = draft.detail_html || '';
    document.getElementById('indexingHtmlMode').textContent = htmlSource === 'manual' ? '직접 편집한 HTML' : '생성된 HTML';
    ['retail','wholesale','smartstore'].forEach(function (key) {
      document.getElementById('indexing' + key.charAt(0).toUpperCase() + key.slice(1) + 'Enabled').checked = !!draft[key + '_enabled'];
      var input = document.getElementById('indexing' + key.charAt(0).toUpperCase() + key.slice(1) + 'Url');
      input.value = draft[key + '_url'] || ''; input.disabled = !draft[key + '_enabled'];
    });
    renderImages(); setError('');
  }
  function openModal(item) {
    editingId = item ? item.id : null;
    draft = item ? JSON.parse(JSON.stringify(item)) : { name: '', brand_ref: selectedBrand || (indexingBrands()[0] ? brandRef(indexingBrands()[0]) : ''), brand_name: '', detail_html: '', images: [{ id: uuid(), folder: '', filename: '' }], html_source: 'generated', retail_enabled: true, retail_url: '', wholesale_enabled: true, wholesale_url: '', smartstore_enabled: false, smartstore_url: '' };
    draft.images = Array.isArray(draft.images) ? draft.images.map(function (image) { return Object.assign({ id: uuid() }, image); }) : [{ id: uuid(), folder: '', filename: '' }];
    htmlSource = draft.html_source === 'manual' ? 'manual' : 'generated';
    renderModal();
    if (!modal.open) modal.showModal();
    document.body.classList.add('modal-open');
    document.getElementById('indexingName').focus();
  }
  function closeModal() { if (modal.open) modal.close(); document.body.classList.remove('modal-open'); draft = null; editingId = null; }
  function collect() {
    var name = document.getElementById('indexingName').value.trim(), ref = document.getElementById('indexingBrand').value, brand = activeBrand(ref), html = document.getElementById('indexingHtml').value;
    if (!name) throw new Error('상품명을 입력해 주세요.');
    if (!brand) throw new Error('인덱싱에 사용할 브랜드를 선택해 주세요.');
    if (!html.trim()) throw new Error('상세페이지 태그 HTML을 입력하거나 생성해 주세요.');
    var payload = { name: name, brand_ref: brandRef(brand), brand_name: brand.name, detail_html: html, images: draft.images.map(function (image) { return { folder: image.folder || '', filename: image.filename || '' }; }), html_source: htmlSource };
    ['retail','wholesale','smartstore'].forEach(function (key) {
      var cap = key.charAt(0).toUpperCase() + key.slice(1), enabled = document.getElementById('indexing' + cap + 'Enabled').checked, url = document.getElementById('indexing' + cap + 'Url').value.trim();
      if (enabled && !/^https?:\/\//i.test(url)) throw new Error((key === 'retail' ? '소비자몰' : key === 'wholesale' ? '도매몰' : '스마트스토어') + ' URL은 http:// 또는 https://로 입력해 주세요.');
      payload[key + '_enabled'] = enabled; payload[key + '_url'] = enabled ? url : url;
    });
    return payload;
  }
  async function submit(event) {
    event.preventDefault(); setError('');
    var button = document.getElementById('indexingSave');
    var wasEditing = !!editingId;
    try {
      if (!document.getElementById('indexingForm').reportValidity()) return;
      var payload = collect(); button.disabled = true; button.textContent = '저장 중…';
      var saved = editingId ? await Api.updateIndexing(editingId, payload) : await Api.createIndexing(payload);
      var index = rows.findIndex(function (item) { return item.id === saved.id; });
      if (index > -1) rows[index] = saved; else rows.unshift(saved);
      render(); closeModal(); toast('인덱싱 상품을 저장했습니다.');
    } catch (error) { setError(error.message || String(error)); }
    finally { button.disabled = false; button.textContent = wasEditing ? '수정 완료' : '상품 등록'; }
  }
  async function remove(id) {
    var item = rows.find(function (row) { return row.id === id; }); if (!item) return;
    if (!confirm('"' + item.name + '" 인덱싱 상품을 삭제할까요?')) return;
    try { await Api.deleteIndexing(id); rows = rows.filter(function (row) { return row.id !== id; }); render(); toast('삭제했습니다'); }
    catch (error) { toast('삭제하지 못했습니다: ' + (error.message || error), 'error'); }
  }
  function imageAction(event) {
    if (!draft) return;
    var row = event.target.closest('[data-image-id]'); if (!row) return;
    var image = draft.images.find(function (item) { return item.id === row.dataset.imageId; }), index = draft.images.indexOf(image), action = event.target.dataset.indexImageAction;
    if (!image) return;
    if (action === 'remove') draft.images.splice(index, 1);
    if (action === 'up' && index > 0) { draft.images.splice(index, 1); draft.images.splice(index - 1, 0, image); }
    if (action === 'down' && index < draft.images.length - 1) { draft.images.splice(index, 1); draft.images.splice(index + 1, 0, image); }
    renderImages();
  }
  function bind() {
    document.getElementById('indexingAdd').addEventListener('click', function () { openModal(); });
    document.getElementById('indexingMdImport').addEventListener('click', function () { toast('MD 불러오기는 준비 중입니다.', 'warn'); });
    document.getElementById('indexingBrands').addEventListener('click', function (event) { var button = event.target.closest('[data-brand-filter]'); if (!button) return; selectedBrand = button.dataset.brandFilter; render(); });
    document.getElementById('indexingCards').addEventListener('click', function (event) {
      var id = (event.target.closest('[data-index-id]') || {}).dataset && event.target.closest('[data-index-id]').dataset.indexId;
      if (event.target.closest('[data-index-edit]')) { openModal(rows.find(function (item) { return item.id === event.target.closest('[data-index-edit]').dataset.indexEdit; })); return; }
      if (event.target.closest('[data-index-delete]')) { remove(event.target.closest('[data-index-delete]').dataset.indexDelete); return; }
      var copyHtml = event.target.closest('[data-index-copy-html]');
      if (copyHtml) { var html = rows.find(function (item) { return item.id === copyHtml.dataset.indexCopyHtml; }); if (html) copyText(html.detail_html || ''); return; }
      var copyUrl = event.target.closest('[data-index-copy-url]');
      if (copyUrl) { var item = rows.find(function (row) { return row.id === copyUrl.dataset.indexCopyUrl; }); if (item) copyText(channelUrl(item, copyUrl.dataset.indexChannel)); return; }
      var copyImage = event.target.closest('[data-index-image-copy]');
      if (copyImage && draft) { var image = draft.images.find(function (candidate) { return candidate.id === copyImage.dataset.indexImageCopy; }); if (image) copyText(imageUrl(image)); return; }
      if (id && !event.target.closest('button, a, input, select, textarea')) openModal(rows.find(function (item) { return item.id === id; }));
    });
    document.getElementById('indexingForm').addEventListener('submit', submit);
    document.getElementById('indexingCancel').addEventListener('click', closeModal);
    modal.addEventListener('cancel', function (event) { event.preventDefault(); closeModal(); });
    document.getElementById('indexingAddImage').addEventListener('click', function () { if (!draft) return; draft.images.push({ id: uuid(), folder: '', filename: '' }); renderImages(); });
    document.getElementById('indexingGenerateHtml').addEventListener('click', function () {
      if (!draft) return;
      var generated = AutomationCore.html(draft.images); if (!generated) { setError('이미지 폴더·파일명을 확인해 주세요.'); return; }
      if (htmlSource === 'manual' && !confirm('직접 편집한 HTML을 이미지 기반 HTML로 교체할까요?')) return;
      draft.detail_html = generated; htmlSource = 'generated'; document.getElementById('indexingHtml').value = generated; document.getElementById('indexingHtmlMode').textContent = '생성된 HTML'; setError('');
    });
    document.getElementById('indexingImageRows').addEventListener('click', imageAction);
    document.getElementById('indexingImageRows').addEventListener('change', function (event) {
      if (!draft || !event.target.dataset.indexImageField) return;
      var row = event.target.closest('[data-image-id]'), image = draft.images.find(function (candidate) { return candidate.id === row.dataset.imageId; });
      if (!image) return;
      var field = event.target.dataset.indexImageField;
      if (field === 'extension') image.filename = String(image.filename || '').replace(/\.[^.]*$/, '') + '.' + event.target.value;
      else image[field] = event.target.value.trim();
      renderImages();
    });
    document.getElementById('indexingImageRows').addEventListener('input', function (event) {
      if (!draft || !event.target.dataset.indexImageField || event.target.dataset.indexImageField === 'extension') return;
      var row = event.target.closest('[data-image-id]'), image = draft.images.find(function (candidate) { return candidate.id === row.dataset.imageId; });
      if (image) image[event.target.dataset.indexImageField] = event.target.value.trim();
    });
    document.getElementById('indexingHtml').addEventListener('input', function (event) { if (draft) { draft.detail_html = event.target.value; htmlSource = 'manual'; document.getElementById('indexingHtmlMode').textContent = '직접 편집한 HTML'; } });
    ['retail','wholesale','smartstore'].forEach(function (key) { var cap = key.charAt(0).toUpperCase() + key.slice(1); document.getElementById('indexing' + cap + 'Enabled').addEventListener('change', function () { document.getElementById('indexing' + cap + 'Url').disabled = !this.checked; }); });
  }
  async function init() {
    bind();
    try {
      var result = await Promise.all([Api.fetchAutomationSettings(), Api.fetchIndexing()]);
      settings = AutomationCore.normalizeSettings(result[0].value); rows = result[1] || [];
      selectedBrand = indexingBrands()[0] ? brandRef(indexingBrands()[0]) : '';
      document.getElementById('indexingSyncState').textContent = '실시간 동기화 중'; document.getElementById('indexingSyncState').className = 'sync-state sync-ok'; render();
    } catch (error) {
      document.getElementById('indexingSyncState').textContent = '동기화 오류'; document.getElementById('indexingSyncState').className = 'sync-state sync-error';
      document.getElementById('indexingCards').innerHTML = '<div class="indexing-empty"><strong>상품 인덱싱을 불러오지 못했습니다.</strong><p>' + esc(error.message || String(error)) + '</p></div>';
    }
    supabaseClient.channel('product-indexing').on('postgres_changes', { event: '*', schema: 'public', table: 'product_indexing' }, async function () { try { rows = await Api.fetchIndexing(); render(); } catch (error) {} }).on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, async function (payload) { if (payload && payload.new && payload.new.key === 'product_automation_v1') { try { settings = AutomationCore.normalizeSettings((await Api.fetchAutomationSettings()).value); render(); } catch (error) {} } }).subscribe();
  }
  init();
})();
