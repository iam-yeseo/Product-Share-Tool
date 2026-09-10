/* 설정 초안은 명시적으로 저장할 때만 공유되고, 저장 시 리비전을 확인합니다.
   GNB 현재 페이지 표시와 화면 내부 탭 선택은 서로 다른 속성으로 완전히 분리합니다. */
(function () {
  var config, revision, store = 'retail', selected = '', dirty = false, formDirty = false, saving = false;
  var brandSelected = null;   // 수정 중인 브랜드의 비교 키 (null = 추가)
  var page = 'brands';        // 'brands' | 'categories'  — GNB 현재 페이지
  var catTab = 'retail';      // 'retail' | 'wholesale' | 'folders' — 카테고리 화면 내부 탭
  var byId = function (id) { return document.getElementById(id); };

  /* ---------- 화면 종류 결정 (데이터 로딩 전에 동기적으로 확정) ---------- */
  function readRoute() {
    var params = new URLSearchParams(location.search);
    var tab = params.get('tab') || 'brands';
    var sub = params.get('sub') || '';
    if (tab === 'retail' || tab === 'wholesale' || tab === 'folders') { page = 'categories'; catTab = tab; return; }
    if (tab === 'categories') { page = 'categories'; catTab = ['retail', 'wholesale', 'folders'].indexOf(sub) > -1 ? sub : 'retail'; return; }
    page = 'brands';
  }
  function paintChrome() {
    var brandsMode = page === 'brands';
    byId('settingsTitle').textContent = brandsMode ? '브랜드 설정' : '카테고리 설정';
    byId('settingsLead').textContent = brandsMode
      ? '상품 모달에서 선택하는 브랜드와 한글 검색명을 관리합니다. 저장한 설정은 모든 사용자에게 공유됩니다.'
      : '몰별 카테고리와 상세 이미지 폴더를 관리합니다. 저장한 설정은 모든 사용자에게 공유됩니다.';
    document.title = (brandsMode ? '브랜드 설정' : '카테고리 설정') + ' · CALLTO';
    byId('categoryTabs').hidden = brandsMode;
    /* GNB 표시는 페이지 기준으로만 정하고 내부 탭 전환으로 바뀌지 않습니다. */
    document.querySelectorAll('.gnb-link[data-settings-tab]').forEach(function (link) {
      var active = link.dataset.settingsTab === page;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-cat-tab]').forEach(function (button) {
      var active = button.dataset.catTab === catTab;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
  }
  function syncTabIndicator(animate) {
    if (typeof Motion !== 'undefined') Motion.segTabs(byId('categoryTabs'), animate);
  }
  /* 요청한 화면만 보여 줍니다. 카테고리 화면 진입 중 브랜드 화면이 잠깐 나타나지 않습니다. */
  function paintSections(loaded) {
    var brandsMode = page === 'brands';
    byId('settingsLoading').hidden = loaded;
    byId('brandSettings').hidden = !loaded || !brandsMode;
    byId('categorySettings').hidden = !loaded || brandsMode || catTab === 'folders';
    byId('folderSettings').hidden = !loaded || brandsMode || catTab !== 'folders';
  }
  readRoute();
  paintChrome();
  paintSections(false);

  function mark() { dirty = true; byId('saveSettings').disabled = false; byId('settingsState').textContent = '저장 안 됨'; }
  function markForm() { formDirty = true; byId('saveSettings').disabled = false; byId('settingsState').textContent = '저장 안 됨'; }
  function list() { return config.categories[store]; }

  /* ---------- 카테고리 ---------- */
  function populate() {
    var chosen = list().find(function (c) { return c.code === selected; });
    byId('categoryFormTitle').textContent = chosen ? '카테고리 수정' : '카테고리 추가';
    byId('categoryName').value = chosen ? chosen.name : '';
    byId('categoryCode').value = chosen ? chosen.code : ''; byId('categoryCode').readOnly = !!chosen;
    byId('categoryParent').innerHTML = '<option value="">없음 (1차 카테고리)</option>' + list().filter(function (c) { return c.code.length < 12 && c.code !== selected && !(selected && c.code.startsWith(selected)); }).map(function (c) { return '<option value="' + esc(c.code) + '">' + esc(AutomationCore.path(list(), c.code)) + ' [' + c.code + ']</option>'; }).join('');
    byId('categoryParent').value = chosen ? chosen.parentCode : ''; byId('categoryParent').disabled = !!chosen;
    byId('categoryFolder').innerHTML = '<option value="">미지정 · 상위 연결 사용</option>' + config.folders.map(function (f) { return '<option>' + esc(f) + '</option>'; }).join('');
    byId('categoryFolder').value = chosen ? chosen.folder : ''; byId('categoryActive').checked = !chosen || chosen.active !== false;
    formDirty = false;
  }
  function tree() {
    var q = byId('categorySearch').value.toLowerCase();
    var rows = list().slice().sort(function (a, b) { return a.code.localeCompare(b.code); }).filter(function (c) { return !q || (c.code + ' ' + AutomationCore.path(list(), c.code)).toLowerCase().includes(q); });
    byId('categoryCount').textContent = list().length + '개 카테고리 · 최대 4차 · ' + (store === 'retail' ? '소비자몰' : '도매몰') + ' 독립 저장';
    byId('categoryHeading').textContent = (store === 'retail' ? '소비자몰' : '도매몰') + ' 카테고리';
    byId('categoryTree').innerHTML = rows.map(function (c) { return '<button class="category-node' + (c.code === selected ? ' is-active' : '') + '" data-code="' + esc(c.code) + '" style="--depth:' + ((c.code.length / 3) - 1) + '"><span>' + esc(c.name) + '</span><code>' + c.code + '</code><small>' + (c.active === false ? '사용 중지' : c.folder ? esc(c.folder) : '') + '</small></button>'; }).join('') || '<p class="empty-hint">검색 결과가 없습니다.</p>';
  }
  function folders() { byId('folderList').innerHTML = config.folders.map(function (f) { return '<div class="folder-entry"><code>' + esc(f) + '</code><span class="field-note">/product/' + esc(f) + '/</span><button class="btn btn-neutral" data-rename-folder="' + esc(f) + '">수정</button></div>'; }).join(''); }

  /* ---------- 브랜드 ---------- */
  function brandsOf(c) { return (c || config).brands; }
  function brandFind(key) { return brandsOf().find(function (b) { return AutomationCore.brandKey(b.name) === key; }); }
  function brandTree() {
    var q = byId('brandSearch').value.toLowerCase();
    var rows = brandsOf().slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }); }).filter(function (b) { return !q || AutomationCore.brandMatches(b, q); });
    var active = brandsOf().filter(function (b) { return b.active !== false; }).length;
    byId('brandCount').textContent = brandsOf().length + '개 브랜드 · 선택 가능 ' + active + '개';
    byId('brandList').innerHTML = rows.map(function (b) { var key = AutomationCore.brandKey(b.name); return '<button class="category-node' + (key === brandSelected ? ' is-active' : '') + '" data-brand="' + esc(key) + '" style="--depth:0"><span>' + esc(b.name) + '</span><code>' + esc(b.code || '') + '</code><small>' + (b.active === false ? '사용 중지' : '') + '</small></button>'; }).join('') || '<p class="empty-hint">' + (q ? '검색 결과가 없습니다.' : '등록된 브랜드가 없습니다.') + '</p>';
  }
  function brandPopulate() {
    var chosen = brandSelected ? brandFind(brandSelected) : null;
    byId('brandFormTitle').textContent = chosen ? '브랜드 수정' : '브랜드 추가';
    byId('brandName').value = chosen ? chosen.name : '';
    byId('brandCode').value = chosen ? (chosen.code || '') : '';
    byId('brandAliases').value = chosen ? (chosen.aliases || []).join(', ') : '';
    byId('brandActive').checked = !chosen || chosen.active !== false;
    byId('deleteBrand').hidden = !chosen;
    formDirty = false;
  }
  function applyBrand() {
    if (!byId('brandForm').reportValidity()) return false;
    var candidate = AutomationCore.clone(config), rows = brandsOf(candidate);
    var aliases = byId('brandAliases').value.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
    var value = { code: byId('brandCode').value.trim(), name: byId('brandName').value.trim(), aliases: aliases, active: byId('brandActive').checked };
    var old = brandSelected ? rows.find(function (b) { return AutomationCore.brandKey(b.name) === brandSelected; }) : null;
    if (old) Object.assign(old, value); else rows.push(value);
    try { AutomationCore.validateSettings(candidate); } catch (e) { toast(e.message, 'error'); return false; }
    config = candidate; brandSelected = AutomationCore.brandKey(value.name); mark(); brandTree(); brandPopulate(); return true;
  }
  byId('brandSearch').addEventListener('input', brandTree);
  byId('brandList').addEventListener('click', function (e) { var b = e.target.closest('[data-brand]'); if (!b || !leaveForm()) return; brandSelected = b.dataset.brand; brandTree(); brandPopulate(); });
  byId('newBrand').addEventListener('click', function () { if (!leaveForm()) return; brandSelected = null; brandPopulate(); brandTree(); byId('brandName').focus(); });
  byId('brandForm').addEventListener('input', markForm);
  byId('brandForm').addEventListener('change', markForm);
  byId('brandForm').addEventListener('submit', function (e) { e.preventDefault(); if (applyBrand()) toast('변경을 반영했습니다. 상단에서 설정을 저장하세요.'); });
  byId('deleteBrand').addEventListener('click', function () {
    var chosen = brandSelected ? brandFind(brandSelected) : null; if (!chosen) return;
    if (!confirm('"' + chosen.name + '" 브랜드를 목록에서 삭제할까요?\n이미 저장된 상품의 브랜드 문자열은 그대로 남습니다.')) return;
    var candidate = AutomationCore.clone(config); candidate.brands = candidate.brands.filter(function (b) { return AutomationCore.brandKey(b.name) !== brandSelected; });
    config = candidate; brandSelected = null; mark(); brandTree(); brandPopulate(); toast('삭제를 반영했습니다. 상단에서 설정을 저장하세요.');
  });

  function leaveForm() { return !formDirty || confirm('아직 변경 반영하지 않은 입력이 있습니다. 입력을 버리고 이동할까요?'); }

  /* 내부 탭 전환 — GNB 선택 상태는 건드리지 않습니다. */
  document.querySelectorAll('[data-cat-tab]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (!config || saving || button.dataset.catTab === catTab || !leaveForm()) return;
      catTab = button.dataset.catTab;
      var address = new URL(location.href);
      address.searchParams.set('tab', 'categories');
      address.searchParams.set('sub', catTab);
      history.replaceState(null, '', address);
      paintChrome();
      paintSections(true);
      syncTabIndicator(true);
      showCurrent();
    });
  });

  byId('categorySearch').addEventListener('input', tree);
  byId('categoryTree').addEventListener('click', function (e) { var b = e.target.closest('[data-code]'); if (!b || !leaveForm()) return; selected = b.dataset.code; tree(); populate(); });
  byId('newCategory').addEventListener('click', function () { if (!leaveForm()) return; selected = ''; populate(); tree(); });
  byId('categoryForm').addEventListener('input', markForm);
  byId('categoryForm').addEventListener('change', markForm);
  function applyCategory() {
    if (!byId('categoryForm').reportValidity()) return false;
    var candidate = AutomationCore.clone(config), rows = candidate.categories[store], old = rows.find(function (c) { return c.code === selected; });
    var value = { code: byId('categoryCode').value.trim(), name: byId('categoryName').value.trim(), parentCode: byId('categoryParent').value, folder: byId('categoryFolder').value, active: byId('categoryActive').checked };
    if (old) Object.assign(old, value); else rows.push(value);
    try { AutomationCore.validateSettings(candidate); } catch (e) { toast(e.message, 'error'); return false; }
    config = candidate; selected = value.code; mark(); tree(); populate(); return true;
  }
  byId('categoryForm').addEventListener('submit', function (e) { e.preventDefault(); if (applyCategory()) toast('변경을 반영했습니다. 상단에서 설정을 저장하세요.'); });
  byId('folderForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var value = byId('newFolderName').value.trim(), candidate = AutomationCore.clone(config);
    candidate.folders.push(value);
    try { AutomationCore.validateSettings(candidate); } catch (err) { toast(err.message, 'error'); return; }
    config = candidate; mark(); byId('folderForm').reset(); folders();
  });
  byId('folderList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-rename-folder]'); if (!b) return;
    var old = b.dataset.renameFolder, value = prompt('새 폴더 이름', old);
    if (value === null || value === old) return;
    value = value.trim();
    var candidate = AutomationCore.clone(config); candidate.folders[candidate.folders.indexOf(old)] = value;
    ['retail', 'wholesale'].forEach(function (s) { candidate.categories[s].forEach(function (c) { if (c.folder === old) c.folder = value; }); });
    try { AutomationCore.validateSettings(candidate); } catch (err) { toast(err.message, 'error'); return; }
    config = candidate; mark(); folders();
  });

  byId('saveSettings').addEventListener('click', async function () {
    if (!config || saving) return;
    if (formDirty) {
      if (page === 'brands') { if (!applyBrand()) return; }
      else if (catTab !== 'folders' && !applyCategory()) return;
    }
    saving = true; byId('saveSettings').disabled = true; byId('settingsState').textContent = '저장 중…'; document.querySelector('main').inert = true;
    try { revision = await Api.saveAutomationSettings(config, revision); dirty = false; byId('settingsError').hidden = true; byId('settingsState').textContent = '저장됨'; toast('설정을 저장했습니다.'); }
    catch (err) { byId('settingsState').textContent = '저장 실패'; byId('settingsError').hidden = false; byId('settingsError').textContent = err.message; toast('설정 저장에 실패했습니다. 입력 내용은 유지됩니다.', 'error'); }
    finally { saving = false; byId('saveSettings').disabled = !dirty; document.querySelector('main').inert = false; }
  });

  document.querySelectorAll('.gnb-link[data-route]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (saving || ((dirty || formDirty) && !confirm('저장하지 않은 설정이 있습니다. 저장하지 않고 이동할까요?'))) { e.preventDefault(); return; }
      dirty = false; formDirty = false;
    });
  });
  window.addEventListener('beforeunload', function (e) { if (dirty || formDirty) { e.preventDefault(); e.returnValue = ''; } });

  function showCurrent() {
    if (page === 'brands') { brandSelected = null; brandTree(); brandPopulate(); return; }
    if (catTab === 'folders') { folders(); formDirty = false; return; }
    store = catTab; selected = ''; tree(); populate();
  }

  (async function () {
    try {
      var row = await Api.fetchAutomationSettings();
      config = AutomationCore.normalizeSettings(row.value);
      revision = row.updated_at;
      showCurrent();
      paintSections(true);
      syncTabIndicator(false);
      byId('settingsState').textContent = '저장된 설정';
      document.querySelector('main').inert = false;
    } catch (e) {
      byId('settingsLoading').hidden = true;
      byId('settingsState').textContent = '불러오기 실패';
      byId('settingsError').hidden = false;
      byId('settingsError').textContent = '설정을 불러오지 못했습니다. ' + e.message;
      document.querySelector('main').inert = false;
      document.querySelectorAll('main input, main button, main select').forEach(function (el) { el.disabled = true; });
    }
  })();
})();
