/* CALLTO 화면 그리기.
   상품 표는 읽기 전용이며 편집은 상품 모달에서 처리합니다.
   표는 하나의 <table>과 하나의 스크롤 컨테이너로 그리고, 왼쪽 열은 sticky 로 고정합니다. */
var UI = (function () {
  /* Figma Main(1336px) 기준 열 너비. 남는 폭은 상품명 위주로 나눠 줍니다. */
  var DEFAULT_COL_W = {
    check: 40, seq: 40, brand: 96, name_own: 300, model: 140,
    need_retail: 64, need_wholesale: 64, need_naver: 64,
    price_retail: 96, price_wholesale: 96, price_wholesale_master: 96, price_naver: 96,
    ref_link: 68, act: 68, note: 120
  };
  /* 참고링크와 편집은 같은 공통 너비를 사용합니다. */
  var ACTION_COL_W = 68;
  var MIN_SCROLL_ROOM = 360;   // 고정 열 뒤에 남겨야 하는 최소 읽기 폭

  var COLUMNS = [
    { key: 'check', label: '체크', cls: 'c-check' },
    { key: 'seq', label: 'No.', cls: 'c-seq' },
    { key: 'brand', label: '브랜드', cls: 'c-brand' },
    { key: 'name_own', label: '상품명', cls: 'c-name' },
    { key: 'model', label: '모델명', cls: 'c-model' },
    { key: 'need_retail', label: '소매', group: '등록 필요', cls: 'c-need' },
    { key: 'need_wholesale', label: '도매', group: '등록 필요', cls: 'c-need' },
    { key: 'need_naver', label: '네이버', group: '등록 필요', cls: 'c-need' },
    { key: 'price_retail', label: '소매', group: '가격', cls: 'c-price' },
    { key: 'price_wholesale', label: '도매(베이직)', group: '가격', cls: 'c-price' },
    { key: 'price_wholesale_master', label: '도매(마스터)', group: '가격', cls: 'c-price' },
    { key: 'price_naver', label: '네이버', group: '가격', cls: 'c-price' },
    { key: 'ref_link', label: '참고링크', cls: 'c-link' },
    { key: 'act', label: '편집', cls: 'c-act' },
    { key: 'note', label: '비고', cls: 'c-note' }
  ];
  var WIDE_PINS = ['check', 'seq', 'brand', 'name_own'];
  var COPY_LABELS = {
    brand: '브랜드 복사', name_own: '상품명 복사', name_naver: '스마트스토어 상품명 복사', model: '모델명 복사',
    price_retail: '소매 판매가 복사', price_wholesale: '도매(베이직) 금액 복사',
    price_wholesale_master: '도매(마스터) 금액 복사', price_naver: '네이버 가격 복사',
    ref_link: '참고링크 복사', note: '비고 복사'
  };
  var COPY_GLYPHS = { name_naver: 'N' };

  var COL_W_KEY = 'productTool.calltoColWidths';
  var colW = {}, pinMode = 'wide';
  try {
    var saved = JSON.parse(localStorage.getItem(COL_W_KEY) || '{}');
    Object.keys(DEFAULT_COL_W).forEach(function (key) { colW[key] = typeof saved[key] === 'number' ? saved[key] : DEFAULT_COL_W[key]; });
  } catch (e) { Object.keys(DEFAULT_COL_W).forEach(function (key) { colW[key] = DEFAULT_COL_W[key]; }); }
  colW.ref_link = colW.act = Math.max(colW.ref_link, colW.act, ACTION_COL_W);

  function column(key) { return COLUMNS.find(function (col) { return col.key === key; }); }
  function isHidden(key) { return (State.hiddenCols || []).indexOf(key) > -1; }
  /* 화면에 실제로 그리는 열을 표시 순서대로 돌려줍니다.
     상품명 단독 고정 모드에서는 읽기 순서도 상품명이 먼저입니다. */
  function visibleColumns() {
    var keys = COLUMNS.filter(function (col) { return !isHidden(col.key); }).map(function (col) { return col.key; });
    if (pinMode === 'name' && keys.indexOf('name_own') > -1) {
      keys = ['name_own'].concat(keys.filter(function (key) { return key !== 'name_own'; }));
    }
    return keys;
  }
  function pinnedKeys() {
    if (pinMode === 'name') return isHidden('name_own') ? [] : ['name_own'];
    return WIDE_PINS.filter(function (key) { return !isHidden(key); });
  }
  function colWidthOf(key) { return colW[key] || DEFAULT_COL_W[key] || 100; }
  function wrapWidth() { var wrap = document.getElementById('tableWrap'); return wrap ? wrap.clientWidth : 0; }

  function computePinMode() {
    var available = wrapWidth();
    if (!available) return pinMode;
    var pinned = WIDE_PINS.filter(function (key) { return !isHidden(key); })
      .reduce(function (sum, key) { return sum + colWidthOf(key); }, 0);
    return available - pinned < MIN_SCROLL_ROOM ? 'name' : 'wide';
  }
  /* 가용 폭이 바뀌어 고정 모드가 달라지면 표를 다시 그립니다. */
  function syncPinMode() {
    var next = computePinMode();
    if (next === pinMode) return false;
    pinMode = next;
    return true;
  }

  function applyColWidths() {
    var table = document.getElementById('grid'), group = document.getElementById('gridCols');
    if (!table || !group) return;
    var available = wrapWidth(), keys = visibleColumns();
    var entries = keys.map(function (key) {
      var width = colWidthOf(key);
      if (typeof Workspace !== 'undefined' && Workspace.width) width = Workspace.width(key, width);
      if (pinMode === 'name' && key === 'name_own' && available) width = Math.min(width, Math.max(170, Math.round(available * 0.5)));
      return { key: key, width: width };
    });
    var fitted = typeof Workspace !== 'undefined' && Workspace.fitWidths ? Workspace.fitWidths(entries, available) : entries;
    var byKey = {}, total = 0;
    fitted.forEach(function (entry) { byKey[entry.key] = entry.width; total += entry.width; });
    group.querySelectorAll('col').forEach(function (col) {
      var width = byKey[col.dataset.key];
      if (width) col.style.width = width + 'px';
    });
    table.style.width = total + 'px';
    var offset = 0;
    pinnedKeys().forEach(function (key) {
      table.style.setProperty('--pin-' + (key === 'name_own' ? 'name' : key), offset + 'px');
      offset += byKey[key] || 0;
    });
  }
  function setColWidth(key, width) {
    colW[key] = Math.max(40, Math.round(width));
    if (key === 'ref_link' || key === 'act') { colW.ref_link = colW.act = colW[key]; }
    applyColWidths();
  }
  function saveColWidths() { try { localStorage.setItem(COL_W_KEY, JSON.stringify(colW)); } catch (e) {} }
  function resetColWidths() { Object.keys(DEFAULT_COL_W).forEach(function (key) { colW[key] = DEFAULT_COL_W[key]; }); saveColWidths(); renderGrid(); }

  /* ---------- 사이드바 ---------- */
  function listCounts(list) {
    if (list.id === State.currentListId && State.list && !State.loadError) {
      return { done: (State.items || []).filter(function (it) { return it.done; }).length, total: (State.items || []).length };
    }
    if (typeof list.total !== 'number') return null;
    return { done: list.doneCount || 0, total: list.total };
  }
  function countLabel(counts) { return counts ? counts.done + '/' + counts.total : '—'; }

  function renderSidebar() {
    var nav = document.getElementById('listNav'); if (!nav) return;
    var q = String(State.search || '').trim().toLowerCase();
    var rows = (State.lists || []).filter(function (list) {
      return !q || (list.title || '').toLowerCase().indexOf(q) > -1 || (list.author || '').toLowerCase().indexOf(q) > -1;
    });
    if (!rows.length) { nav.innerHTML = '<p class="empty-hint">' + (q ? '검색 결과가 없습니다.' : '저장된 리스트가 없습니다.') + '</p>'; return; }
    nav.innerHTML = rows.map(function (list) {
      var active = list.id === State.currentListId, counts = listCounts(list);
      return '<button class="list-item' + (active ? ' is-active' : '') + '" data-id="' + esc(list.id) + '"' + (active ? ' aria-current="true"' : '') + '>' +
        '<span class="li-main"><span class="li-title">' + esc(list.title || '제목 없는 리스트') + '</span>' +
        '<span class="li-sub">' + esc(fmtDate(list.created_at || list.work_date)) + '</span></span>' +
        '<span class="tag tag-count" data-list-count title="완료 상품 수 / 전체 상품 수">' + esc(countLabel(counts)) + '</span>' +
        '</button>';
    }).join('');
  }
  /* 완료 처리·추가·삭제 직후에도 목록을 다시 그리지 않고 숫자만 갱신합니다. */
  function updateListCounts() {
    (State.lists || []).forEach(function (list) {
      var node = document.querySelector('.list-item[data-id="' + list.id + '"] [data-list-count]');
      if (node) node.textContent = countLabel(listCounts(list));
    });
    var progress = document.getElementById('listProgress');
    if (progress) {
      if (!State.currentListId || !State.list || State.loadError) { progress.textContent = '—'; return; }
      var done = (State.items || []).filter(function (it) { return it.done; }).length;
      progress.textContent = done + ' / ' + (State.items || []).length;
    }
  }

  function renderHead() {
    var list = State.list; if (!list) return;
    var display = document.getElementById('listTitleDisplay');
    if (display) display.textContent = list.title || '제목 없는 리스트';
    var title = document.getElementById('listTitle'); if (title) title.value = list.title || '';
    var date = document.getElementById('listDate'); if (date) date.value = list.work_date || '';
    var dateRo = document.getElementById('listDateRO'); if (dateRo) dateRo.textContent = list.work_date ? fmtDate(list.work_date) : '—';
    var author = document.getElementById('listAuthor'); if (author) author.value = list.author || '';
    var created = document.getElementById('listCreated'); if (created) created.textContent = list.created_at ? fmtDateTime(list.created_at) : '—';
    var updated = document.getElementById('listUpdated'); if (updated) updated.textContent = list.updated_at ? fmtDateTime(list.updated_at) : '—';
    updateListCounts();
  }

  /* ---------- 셀 ---------- */
  function copyButton(key, value) {
    if (!value) return '';
    var label = COPY_LABELS[key] || '복사';
    return '<button type="button" class="copy-btn" data-copy="' + esc(value) + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + (COPY_GLYPHS[key] || '⧉') + '</button>';
  }
  /* copies: [[key, value], …] — 한 셀에서 여러 값을 각각 복사할 수 있습니다. */
  function copyGroup(copies) {
    var buttons = (copies || []).map(function (pair) { return copyButton(pair[0], pair[1]); }).join('');
    return buttons ? '<span class="copy-group">' + buttons + '</span>' : '';
  }
  function ro(value, key, copyValue) {
    var text = value === null || value === undefined ? '' : String(value);
    if (!text.trim()) return '<span class="ro-empty">—</span>';
    return '<span class="ro-cell"><span class="ro-text" title="' + esc(text) + '">' + esc(text) + '</span>' +
      (key ? copyGroup([[key, copyValue === undefined ? text : copyValue]]) : '') + '</span>';
  }
  function price(value, key) {
    if (value === null || value === undefined || value === '') return '<span class="ro-empty">—</span>';
    return '<span class="ro-cell"><span class="ro-text price-ro">' + esc(fmtWon(value)) + '</span>' + copyGroup([[key, String(value)]]) + '</span>';
  }
  /* 상품명 셀은 원문과 스마트스토어용 상품명을 각각 복사할 수 있습니다. */
  function nameCell(item) {
    var raw = item.name_own || '', text = AutomationCore.displayName(raw);
    if (!text.trim()) return '<span class="ro-empty">—</span>';
    var smart = item.name_naver || AutomationCore.smartName(raw);
    return '<span class="ro-cell"><span class="ro-text" title="' + esc(text) + '">' + esc(text) + '</span>' +
      copyGroup([['name_own', raw], ['name_naver', smart]]) + '</span>';
  }
  function need(value) {
    if (!value) return '<span class="ro-empty">—</span>';
    return '<span class="tag ' + (value === '필요' ? 'tag-need' : 'tag-noneed') + '">' + esc(value) + '</span>';
  }
  function brandCell(it) {
    var name = (it.brand || '').trim();
    if (!name) return '<span class="ro-empty">—</span>';
    var registered = typeof AutomationEditor !== 'undefined' && AutomationEditor.brands ? AutomationCore.matchBrand(AutomationEditor.brands(), name) : null;
    return '<span class="ro-cell"><span class="ro-text" title="' + esc(name) + '">' + esc(name) + '</span>' +
      (!registered ? '<span class="brand-tag">직접 입력</span>' : '') + copyGroup([['brand', name]]) + '</span>';
  }

  function cellHtml(item, key, index) {
    var editor = State.view === 'editor', selected = editor && !!State.selected[item.id];
    if (key === 'check') {
      return '<span class="th-check"><input type="checkbox" class="' + (editor ? 'chk-sel' : 'chk-done') + '"' +
        ((editor ? selected : item.done) ? ' checked' : '') + ' aria-label="' + (editor ? '행 선택' : '등록 완료 체크') + '">' +
        (editor && item.done ? '<span class="done-mark" title="등록 완료">✓</span>' : '') + '</span>';
    }
    if (key === 'seq') return '<span class="seq-ro">' + (index + 1) + '</span>';
    if (key === 'brand') return brandCell(item);
    /* 상품명은 HTML 원문을 보존하고 화면에는 읽기용 텍스트만 표시합니다. */
    if (key === 'name_own') return nameCell(item);
    if (key === 'model') return ro(item.model, 'model');
    if (key.indexOf('need_') === 0) return need(item[key]);
    if (key === 'price_naver') return price(item.price_retail, 'price_naver');
    if (key.indexOf('price_') === 0) return price(item[key], key);
    if (key === 'ref_link') {
      var url = normalizeUrl(item.ref_link);
      return url ? '<a class="btn btn-outline btn-sm" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">링크</a>' : ro(item.ref_link, 'ref_link');
    }
    if (key === 'act') return editor ? '<button type="button" class="btn btn-neutral btn-sm" data-auto-open="' + esc(item.id) + '">편집</button>' : '—';
    if (key === 'note') return ro(item.note, 'note');
    return '';
  }

  function renderRow(item, index) {
    var editor = State.view === 'editor', selected = editor && !!State.selected[item.id];
    var cls = 'row' + (item.done ? ' is-done' : '') + (selected ? ' is-selected' : '');
    var keys = visibleColumns(), pins = pinnedKeys(), lastPin = pins[pins.length - 1];
    var cells = keys.map(function (key) {
      var col = column(key), pinned = pins.indexOf(key) > -1;
      var classes = [col.cls, 'k-' + key];
      if (pinned) classes.push('pin', 'pin-' + (key === 'name_own' ? 'name' : key));
      if (key === lastPin) classes.push('pin-last');
      return '<td class="' + classes.join(' ') + '">' + cellHtml(item, key, index) + '</td>';
    });
    return '<tr class="' + cls + '" data-id="' + esc(item.id) + '">' + cells.join('') + '</tr>';
  }

  function renderColgroupAndHead() {
    var group = document.getElementById('gridCols'), head = document.getElementById('gridHead');
    if (!group || !head) return;
    var keys = visibleColumns(), pins = pinnedKeys(), lastPin = pins[pins.length - 1];
    var editor = State.view === 'editor';
    group.innerHTML = keys.map(function (key) { return '<col data-key="' + key + '">'; }).join('');

    var top = '', bottom = '';
    keys.forEach(function (key, index) {
      var col = column(key), pinned = pins.indexOf(key) > -1;
      var classes = [col.cls];
      if (pinned) classes.push('pin', 'pin-' + (key === 'name_own' ? 'name' : key));
      if (key === lastPin) classes.push('pin-last');
      var resizer = '<i class="col-resizer"></i>';
      if (!col.group) {
        var label = col.label;
        if (key === 'check') {
          label = editor
            ? '<span class="th-check"><input type="checkbox" id="chkAll" class="chk-all only-editor" aria-label="전체 선택 / 해제"></span>'
            : '<span class="th-check"><span class="th-label">완료</span></span>';
        } else { label = esc(label); }
        top += '<th class="' + classes.concat('th-span').join(' ') + '" rowspan="2" scope="col" data-col-key="' + key + '">' + label + resizer + '</th>';
        return;
      }
      var previous = index > 0 ? column(keys[index - 1]) : null;
      if (!previous || previous.group !== col.group) {
        var span = 1;
        for (var i = index + 1; i < keys.length; i++) { if (column(keys[i]).group === col.group) span++; else break; }
        top += '<th class="th-group" colspan="' + span + '" scope="colgroup">' + esc(col.group) + '</th>';
      }
      bottom += '<th class="' + classes.join(' ') + '" scope="col" data-col-key="' + key + '">' + esc(col.label) + resizer + '</th>';
    });
    head.innerHTML = '<tr class="th-group-row">' + top + '</tr><tr>' + bottom + '</tr>';
  }

  function renderToolbar() {
    var count = selectedCount(), label = document.getElementById('selCount');
    if (label) label.textContent = count ? '선택 ' + count + '건' : '행을 체크하면 일괄 설정·복사·삭제할 수 있습니다';
    /* 선택 전에도 버튼을 보여 기능을 발견할 수 있게 하고, 비활성 상태만 바꿉니다. */
    ['btnBulkEdit', 'btnCopyRows', 'btnDeleteRows'].forEach(function (id) {
      var el = document.getElementById(id); if (el) { el.disabled = !count; el.hidden = false; }
    });
    var all = document.getElementById('chkAll');
    if (all) {
      var items = typeof Workspace !== 'undefined' && Workspace.visibleItems ? Workspace.visibleItems() : State.items;
      all.checked = !!items.length && count === items.length;
      all.indeterminate = count > 0 && count < items.length;
    }
  }
  function renderHeaderChecks() { renderToolbar(); }

  function renderGrid() {
    var body = document.getElementById('gridBody'); if (!body) return;
    syncPinMode();
    renderColgroupAndHead();
    var colspan = visibleColumns().length;
    if (!State.items.length) {
      body.innerHTML = '<tr class="row-empty"><td colspan="' + colspan + '"><strong>아직 상품이 없습니다.</strong><br><span>상품 등록 버튼으로 첫 상품을 추가하세요.</span></td></tr>';
    } else {
      body.innerHTML = State.items.map(renderRow).join('');
    }
    var itemCount = document.getElementById('itemCountLabel');
    if (itemCount) itemCount.textContent = '(' + State.items.length + '개)';
    var hint = document.getElementById('scrollHint');
    if (hint) hint.textContent = pinMode === 'name'
      ? '화면이 좁아 상품명 열만 왼쪽에 고정됩니다. 체크·No.·브랜드를 포함한 나머지 열은 가로로 스크롤해 사용하세요.'
      : '체크·No.·브랜드·상품명 열은 왼쪽에 고정되고, 모델명부터 오른쪽 열만 가로로 스크롤됩니다.';
    renderToolbar();
    updateListCounts();
    if (typeof AutomationEditor !== 'undefined' && AutomationEditor.publish) AutomationEditor.publish();
    applyColWidths();
  }

  /* 화면 폭이 바뀌면 고정 모드를 다시 계산하고 필요할 때만 다시 그립니다. */
  function handleResize() {
    if (!State.currentListId) return;
    if (syncPinMode()) renderGrid(); else applyColWidths();
  }

  function autoFitColumn(key) {
    var width = colWidthOf(key);
    document.querySelectorAll('#grid tbody tr[data-id]').forEach(function (row) {
      var cell = row.querySelector('.k-' + key); if (cell) width = Math.max(width, Math.min(600, cell.scrollWidth + 24));
    });
    setColWidth(key, width); saveColWidths();
  }
  function updateHideStyle() { if (State.currentListId) renderGrid(); }
  function renderColPanel() {
    var panel = document.getElementById('colSettingsPanel'); if (!panel) return;
    var hidden = State.hiddenCols || [];
    panel.innerHTML = '<div class="col-panel-head">표에 표시할 열</div><div class="col-panel-list">' + HIDEABLE_COLS.map(function (column) {
      return '<label class="col-panel-item"><input type="checkbox" class="col-vis" data-key="' + esc(column.key) + '"' + (hidden.indexOf(column.key) === -1 ? ' checked' : '') + '><span>' + esc(column.label) + '</span></label>';
    }).join('') + '</div><div class="col-panel-foot">체크·No.·편집 열은 항상 표시합니다.</div>';
  }
  function renderAll() {
    renderSidebar();
    var has = !!State.currentListId;
    var empty = document.getElementById('emptyState'), pane = document.getElementById('listPane');
    if (empty) empty.hidden = has;
    if (pane) pane.hidden = !has;
    if (has) { renderHead(); renderGrid(); }
  }
  function setSync(text, kind) {
    var el = document.getElementById('syncState');
    if (el) { el.textContent = text; el.className = 'sync-state' + (kind ? ' sync-' + kind : ''); }
  }

  return {
    renderAll: renderAll, renderSidebar: renderSidebar, renderGrid: renderGrid, renderHead: renderHead,
    renderToolbar: renderToolbar, renderHeaderChecks: renderHeaderChecks, updateListCounts: updateListCounts,
    autoFitColumn: autoFitColumn, BRAND_CUSTOM: '__custom__', updateHideStyle: updateHideStyle,
    renderColPanel: renderColPanel, setSync: setSync, applyColWidths: applyColWidths, handleResize: handleResize,
    setColWidth: setColWidth, saveColWidths: saveColWidths, resetColWidths: resetColWidths,
    colWidthOf: colWidthOf, pinMode: function () { return pinMode; }, columns: function () { return COLUMNS.slice(); }
  };
})();
