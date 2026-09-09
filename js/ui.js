/* CALLTO 화면 그리기. 상품 표는 읽기 전용으로 유지하고 편집은 모달에서 처리합니다. */
var UI = (function () {
  var DEFAULT_COL_W = {
    check: 54, seq: 58, brand: 150, name_own: 330, model: 160,
    need_retail: 104, need_wholesale: 104, need_naver: 116,
    price_retail: 150, price_wholesale: 140, price_wholesale_master: 150, price_naver: 150,
    ref_link: 126, act: 82, note: 190
  };
  var COL_W_KEY = 'productTool.calltoColWidths';
  var colW = {};
  try {
    var saved = JSON.parse(localStorage.getItem(COL_W_KEY) || '{}');
    Object.keys(DEFAULT_COL_W).forEach(function (key) { colW[key] = typeof saved[key] === 'number' ? saved[key] : DEFAULT_COL_W[key]; });
  } catch (e) { Object.keys(DEFAULT_COL_W).forEach(function (key) { colW[key] = DEFAULT_COL_W[key]; }); }

  function colKeyAt(index) { var col = document.querySelectorAll('#gridCols col')[index]; return col ? col.dataset.key : null; }
  function colWidthOf(key) { return colW[key] || DEFAULT_COL_W[key] || 100; }
  function applyColWidths() {
    var cols = document.querySelectorAll('#gridCols col'), total = 0;
    cols.forEach(function (col) {
      var key = col.dataset.key, width = colWidthOf(key);
      if (typeof Workspace !== 'undefined') width = Workspace.width(key, width);
      if ((State.hiddenCols || []).indexOf(key) > -1) width = 0;
      col.style.width = width + 'px';
      col.style.display = width ? '' : 'none';
      total += width;
    });
    var grid = document.getElementById('grid'); if (grid) grid.style.width = total + 'px';
    document.documentElement.style.setProperty('--seq-left', colWidthOf('check') + 'px');
  }
  function setColWidth(key, width) { colW[key] = Math.max(64, Math.round(width)); applyColWidths(); }
  function saveColWidths() { try { localStorage.setItem(COL_W_KEY, JSON.stringify(colW)); } catch (e) {} }
  function resetColWidths() { Object.keys(DEFAULT_COL_W).forEach(function (key) { colW[key] = DEFAULT_COL_W[key]; }); saveColWidths(); applyColWidths(); }

  function renderSidebar() {
    var nav = document.getElementById('listNav'); if (!nav) return;
    var q = String(State.search || '').trim().toLowerCase();
    var rows = (State.lists || []).filter(function (list) {
      return !q || (list.title || '').toLowerCase().indexOf(q) > -1 || (list.author || '').toLowerCase().indexOf(q) > -1;
    });
    if (!rows.length) { nav.innerHTML = '<p class="empty-hint">' + (q ? '검색 결과가 없습니다.' : '저장된 리스트가 없습니다.') + '</p>'; return; }
    nav.innerHTML = rows.map(function (list) {
      var active = list.id === State.currentListId ? ' is-active' : '';
      return '<button class="list-item' + active + '" data-id="' + esc(list.id) + '"><span class="li-title">' + esc(list.title || '제목 없는 리스트') + '</span><span class="li-sub"><span>' + esc(fmtDate(list.created_at || list.work_date)) + '</span></span></button>';
    }).join('');
  }

  function renderHead() {
    var list = State.list; if (!list) return;
    var display = document.getElementById('listTitleDisplay');
    if (display) display.textContent = list.title || '제목 없는 리스트';
    var title = document.getElementById('listTitle'); if (title) title.value = list.title || '';
    var date = document.getElementById('listDate'); if (date) date.value = list.work_date || '';
    var dateRo = document.getElementById('listDateRO'); if (dateRo) dateRo.textContent = list.work_date || '—';
    var author = document.getElementById('listAuthor'); if (author) author.value = list.author || '';
    var created = document.getElementById('listCreated'); if (created) created.textContent = list.created_at ? fmtDateTime(list.created_at) : '—';
    var updated = document.getElementById('listUpdated'); if (updated) updated.textContent = list.updated_at ? fmtDateTime(list.updated_at) : '—';
  }

  function ro(value, copyable) {
    var text = value === null || value === undefined ? '' : String(value);
    if (!text.trim()) return '<span class="ro-empty">—</span>';
    return '<span class="ro-cell"><span class="ro-text">' + esc(text) + '</span>' + (copyable ? '<button class="copy-btn" data-copy="' + esc(text) + '" title="복사">복사</button>' : '') + '</span>';
  }
  function price(value) {
    if (value === null || value === undefined || value === '') return '<span class="ro-empty">—</span>';
    return '<span class="ro-cell"><span class="ro-text price-ro">' + esc(fmtWon(value)) + '</span><button class="copy-btn" data-copy="' + esc(String(value)) + '" title="숫자만 복사">복사</button></span>';
  }
  function need(value) {
    if (!value) return '<span class="ro-empty">—</span>';
    return '<span class="tag ' + (value === '필요' ? 'tag-need' : 'tag-noneed') + '">' + esc(value) + '</span>';
  }
  function brand(it) {
    var name = (it.brand || '').trim();
    var registered = typeof AutomationEditor !== 'undefined' && AutomationEditor.brands ? AutomationCore.matchBrand(AutomationEditor.brands(), name) : null;
    return '<span class="ro-cell"><span class="ro-text">' + esc(name || '브랜드 선택') + '</span>' + (!registered && name ? '<span class="brand-tag">직접 입력</span>' : '') + '</span>';
  }

  function renderRow(item, index) {
    var editor = State.view === 'editor', selected = editor && !!State.selected[item.id];
    var cls = 'row' + (item.done ? ' is-done' : '') + (selected ? ' is-selected' : ''), cells = [];
    cells.push('<td class="c-check"><input type="checkbox" class="' + (editor ? 'chk-sel' : 'chk-done') + '"' + ((editor ? selected : item.done) ? ' checked' : '') + ' title="' + (editor ? '행 선택' : '등록 완료 체크') + '">' + (editor && item.done ? '<span class="done-mark" title="완료 상태는 보조 상태 관리에서 기록됩니다">✓</span>' : '') + '</td>');
    cells.push('<td class="c-seq"><span class="seq-ro">' + (index + 1) + '</span></td>');
    cells.push('<td class="c-brand k-brand">' + brand(item) + '</td>');
    cells.push('<td class="c-name k-name_own">' + ro(item.name_own, true) + '</td>');
    cells.push('<td class="c-model k-model">' + ro(item.model, true) + '</td>');
    ['need_retail', 'need_wholesale', 'need_naver'].forEach(function (field) { cells.push('<td class="c-need k-' + field + '">' + need(item[field]) + '</td>'); });
    ['price_retail', 'price_wholesale', 'price_wholesale_master', 'price_naver'].forEach(function (field) { cells.push('<td class="c-price k-' + field + '">' + price(field === 'price_naver' ? item.price_retail : item[field]) + '</td>'); });
    var url = normalizeUrl(item.ref_link);
    cells.push('<td class="c-link k-ref_link">' + (url ? '<button class="btn-go" data-url="' + esc(url) + '">열기</button>' : ro(item.ref_link, true)) + '</td>');
    cells.push('<td class="c-act only-editor-cell">' + (editor ? '<button class="edit-row" data-auto-open="' + esc(item.id) + '">편집</button>' : '—') + '</td>');
    cells.push('<td class="c-note k-note">' + ro(item.note, true) + '</td>');
    return '<tr class="' + cls + '" data-id="' + esc(item.id) + '">' + cells.join('') + '</tr>';
  }

  function renderToolbar() {
    var count = selectedCount(), label = document.getElementById('selCount');
    if (label) label.textContent = count ? '선택 ' + count + '건' : '행을 체크하면 일괄 설정·복사·삭제할 수 있습니다';
    ['btnBulkEdit', 'btnCopyRows', 'btnDeleteRows'].forEach(function (id) { var el = document.getElementById(id); if (el) { el.disabled = !count; el.hidden = !count; } });
    var all = document.getElementById('chkAll');
    if (all) { var items = typeof Workspace !== 'undefined' && Workspace.visibleItems ? Workspace.visibleItems() : State.items; all.checked = !!items.length && count === items.length; all.indeterminate = count > 0 && count < items.length; }
  }
  function renderHeaderChecks() { renderToolbar(); }
  function renderGrid() {
    var body = document.getElementById('gridBody'); if (!body) return;
    var checkLabel = document.querySelector('#grid .c-check .th-label');
    if (checkLabel) checkLabel.textContent = State.view === 'registrar' ? '완료' : '체크';
    if (!State.items.length) {
      body.innerHTML = '<tr class="row-empty"><td colspan="15"><strong>아직 상품이 없습니다.</strong><br><span>상품 등록 버튼으로 첫 상품을 추가하세요.</span></td></tr>';
    } else {
      body.innerHTML = State.items.map(renderRow).join('');
    }
    var itemCount = document.getElementById('itemCountLabel');
    if (itemCount) itemCount.textContent = State.items.length ? '(' + State.items.length + '개)' : '(0개)';
    renderToolbar();
    if (typeof AutomationEditor !== 'undefined' && AutomationEditor.publish) AutomationEditor.publish();
    applyColWidths();
  }

  function autoFitColumn(key) {
    var col = document.querySelector('#gridCols col[data-key="' + key + '"]');
    if (!col) return;
    var width = colWidthOf(key);
    document.querySelectorAll('#grid tbody tr[data-id]').forEach(function (row) {
      var cell = row.querySelector('.k-' + key); if (cell) width = Math.max(width, Math.min(600, cell.scrollWidth + 20));
    });
    setColWidth(key, width); saveColWidths();
  }
  function updateHideStyle() {
    var hidden = State.hiddenCols || [];
    document.querySelectorAll('#gridCols col').forEach(function (col) { col.style.display = hidden.indexOf(col.dataset.key) > -1 ? 'none' : ''; });
  }
  function renderColPanel() {
    var panel = document.getElementById('colSettingsPanel'); if (!panel) return;
    var hidden = State.hiddenCols || [];
    panel.innerHTML = '<div class="col-panel-head">표에 표시할 열</div><div class="col-panel-list">' + HIDEABLE_COLS.map(function (column) {
      return '<label class="col-panel-item"><input type="checkbox" class="col-vis" data-key="' + esc(column.key) + '"' + (hidden.indexOf(column.key) === -1 ? ' checked' : '') + '><span>' + esc(column.label) + '</span></label>';
    }).join('') + '</div><div class="col-panel-foot">준비 상태와 실제 등록 상태는 이 목록에 포함하지 않습니다.</div>';
  }
  function renderAll() {
    renderSidebar();
    var has = !!State.currentListId;
    var empty = document.getElementById('emptyState'), pane = document.getElementById('listPane');
    if (empty) empty.hidden = has;
    if (pane) pane.hidden = !has;
    if (has) { renderHead(); renderGrid(); }
  }
  function setSync(text, kind) { var el = document.getElementById('syncState'); if (el) { el.textContent = text; el.className = 'sync-state' + (kind ? ' sync-' + kind : ''); } }

  return { renderAll: renderAll, renderSidebar: renderSidebar, renderGrid: renderGrid, renderHead: renderHead, renderToolbar: renderToolbar, renderHeaderChecks: renderHeaderChecks, autoFitColumn: autoFitColumn, BRAND_CUSTOM: '__custom__', updateHideStyle: updateHideStyle, renderColPanel: renderColPanel, setSync: setSync, applyColWidths: applyColWidths, setColWidth: setColWidth, saveColWidths: saveColWidths, resetColWidths: resetColWidths, colKeyAt: colKeyAt, colWidthOf: colWidthOf };
})();
