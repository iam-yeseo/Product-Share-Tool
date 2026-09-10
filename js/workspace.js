/* CALLTO 작업공간 표현 계층.
   표는 읽기 전용이고 상품 정보는 중앙 상품 모달의 초안에서만 수정합니다.
   모달 배치는 Figma modal-default(640px, 전체 폭 / 1-2 / 1-3 그리드)를 따릅니다. */
var Workspace = (function () {
  var expanded = false;
  var CHEVRON = '<svg class="caret" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var origins = [
    ['korea', '대한민국', 'Made in Korea'],
    ['china', '중국', 'Made in China'],
    ['japan', '일본', 'Made in Japan'],
    ['usa', '미국', 'Made in USA'],
    ['custom', '직접 입력', '']
  ];

  function brands() {
    return typeof AutomationEditor !== 'undefined' && AutomationEditor.brands ? AutomationEditor.brands() : [];
  }
  function isCustomBrand(it, list) {
    return typeof isBrandCustom === 'function' ? isBrandCustom(it, list) : !!it.brand && !AutomationCore.matchBrand(list, it.brand);
  }
  function visibleItems() { return (State && State.items) || []; }
  function resetFilter() {}
  function filterRows() {}
  function refresh() { if (typeof UI !== 'undefined' && UI.applyColWidths) UI.applyColWidths(); }
  function compactHidden() { return false; }
  function columns() {}

  /* 남는 가로 폭은 읽어야 하는 텍스트 열에 우선 배분합니다. */
  function fitWidths(entries, available) {
    var fitted = entries.map(function (entry) { return { col: entry.col, key: entry.key, width: entry.width }; });
    if (expanded || !available) return fitted;
    var total = fitted.reduce(function (sum, entry) { return sum + entry.width; }, 0);
    var extra = Math.floor(available - total);
    if (extra <= 0) return fitted;
    var weights = { name_own: 4, note: 2, model: 1, brand: 1 };
    var flexible = fitted.filter(function (entry) { return entry.width > 0 && weights[entry.key]; });
    if (!flexible.length) return fitted;
    var weightTotal = flexible.reduce(function (sum, entry) { return sum + weights[entry.key]; }, 0);
    var remaining = extra;
    flexible.forEach(function (entry, index) {
      var add = index === flexible.length - 1 ? remaining : Math.floor(extra * weights[entry.key] / weightTotal);
      entry.width += add;
      remaining -= add;
    });
    return fitted;
  }

  /* ---------- 모달 필드 ---------- */
  function inputField(options) {
    var value = options.value == null ? '' : options.value;
    return '<label class="field ' + (options.width || 'w-full') + '"><span>' + esc(options.label) + '</span>' +
      '<input data-product-field="' + options.field + '" value="' + esc(value) + '"' +
      (options.inputmode ? ' inputmode="' + options.inputmode + '"' : '') +
      (options.maxlength ? ' maxlength="' + options.maxlength + '"' : '') +
      (options.klass ? ' class="' + options.klass + '"' : '') +
      ' placeholder="' + esc(options.placeholder || '') + '"' + (options.ro ? ' readonly' : '') + '>' +
      (options.extra || '') + '</label>';
  }

  function brandField(it, ro) {
    var list = brands(), selected = AutomationCore.matchBrand(list, it.brand), custom = isCustomBrand(it, list);
    var value = selected ? selected.name : (it.brand || '');
    var direct = custom ? '<input class="brand-direct-input" data-product-field="brand" value="' + esc(it.brand || '') + '" placeholder="브랜드 직접 입력" maxlength="30"' + (ro ? ' readonly' : '') + '>' : '';
    return '<div class="field w-third"><span class="field-label">브랜드</span>' +
      '<button type="button" class="choice-trigger" data-choice="brand"' + (ro ? ' disabled' : '') + '>' +
      '<span class="cv' + (value ? '' : ' is-placeholder') + '" data-brand-value>' + esc(value || '브랜드 선택') + '</span>' +
      CHEVRON + '</button>' + direct + '</div>';
  }

  function originState(value) {
    var raw = String(value || '').trim().replace(/^Made in\s+/i, '');
    var preset = origins.find(function (item) { return item[2] && item[2].toLowerCase() === String(value || '').trim().toLowerCase(); });
    return { key: preset ? preset[0] : (raw ? 'custom' : ''), custom: preset ? '' : raw };
  }
  function originField(value, ro) {
    var state = originState(value);
    return '<label class="field w-third"><span>원산지</span><select data-origin-select' + (ro ? ' disabled' : '') + '>' +
      '<option value="">원산지 선택</option>' + origins.map(function (item) {
        return '<option value="' + item[0] + '"' + (item[0] === state.key ? ' selected' : '') + '>' + item[1] + '</option>';
      }).join('') + '</select>' +
      (state.key === 'custom' ? '<input class="field-extra" data-basic="origin-custom" value="' + esc(state.custom) + '" placeholder="예: Vietnam" pattern="[A-Za-z][A-Za-z .\'\\-]*" maxlength="40"' + (ro ? ' readonly' : '') + '>' : '') +
      '<span class="field-note" data-origin-preview>' + esc(value ? '미리보기: ' + value : '영문 국가명만 입력할 수 있습니다.') + '</span></label>';
  }
  function originOutput(key, custom) {
    var found = origins.find(function (item) { return item[0] === key; });
    if (!found || key === '') return '';
    if (key === 'custom') {
      var country = String(custom || '').trim().replace(/^Made in\s+/i, '');
      return country ? 'Made in ' + country : '';
    }
    return found[2];
  }

  function smartName(value) { return String(value || '').replace(/\//g, ''); }
  function smartNameMode(it) {
    var a = AutomationCore.normalize(it.automation);
    if (a.naverNameMode === 'manual') return 'manual';
    if (!a.naverNameMode && it.name_naver && it.name_naver !== smartName(it.name_own)) return 'manual';
    return 'auto';
  }
  function naverNameField(it, ro) {
    var mode = smartNameMode(it), value = it.name_naver || (mode === 'auto' ? smartName(it.name_own) : '');
    return '<div class="field w-full"><span class="field-label">스마트스토어 전용 상품명</span>' +
      '<input data-product-field="name_naver" data-naver-input value="' + esc(value) + '" placeholder="상품명을 입력하면 자동으로 변환됩니다." maxlength="120"' + (ro || mode === 'auto' ? ' readonly' : '') + '>' +
      '<div class="name-meta-row"><label class="check-line check-line-sm"><input type="checkbox" data-naver-mode' + (mode === 'manual' ? ' checked' : '') + (ro ? ' disabled' : '') + '><span>직접 입력</span></label>' +
      '<span class="char-count" data-naver-count></span></div>' +
      '<span class="field-note">자동 모드는 상품명의 `/`만 제거하며 50자를 넘어도 자동으로 자르지 않습니다.</span></div>';
  }

  function priceField(label, field, value, ro, options) {
    options = options || {};
    return '<label class="field w-third"><span>' + esc(label) + '</span>' +
      '<input class="price-input" inputmode="numeric" data-product-field="' + field + '" value="' + esc(withComma(value)) + '"' +
      (ro || options.disabled ? ' disabled' : '') + ' placeholder="' + esc(options.placeholder || '0원') + '">' +
      (options.extra || '') + '</label>';
  }

  /* opts: { categoryField(store, ro) → HTML, regularManual: boolean } */
  function fields(it, ro, opts) {
    opts = typeof opts === 'function' ? { categoryField: opts } : (opts || {});
    var categoryField = opts.categoryField || function () { return ''; };
    it.automation = AutomationCore.normalize(it.automation);

    var needs = [['retail', '소비자몰'], ['wholesale', '도매몰'], ['naver', '스마트스토어']].map(function (pair) {
      var field = 'need_' + pair[0];
      return '<label class="check-line"><input type="checkbox" data-need-field="' + field + '"' +
        (it[field] === '필요' ? ' checked' : '') + (ro ? ' disabled' : '') + '><span>' + pair[1] + '</span></label>';
    }).join('');

    var regularManual = opts.regularManual !== undefined ? opts.regularManual : it.price_retail_regular !== null && it.price_retail_regular !== undefined;

    var out = '<section class="modal-section"><div class="f-grid">';
    out += inputField({ label: '상품명', field: 'name_own', value: it.name_own, placeholder: '상품명 입력', ro: ro, width: 'w-full' });
    out += naverNameField(it, ro);
    out += brandField(it, ro);
    out += inputField({ label: '모델명', field: 'model', value: it.model, placeholder: '모델명 입력', ro: ro, width: 'w-third' });
    out += originField(it.automation.origin, ro);
    out += inputField({ label: '참고링크', field: 'ref_link', value: it.ref_link, placeholder: '링크 입력하기', ro: ro, width: 'w-half' });
    out += inputField({ label: '비고', field: 'note', value: it.note, placeholder: '텍스트 입력', ro: ro, width: 'w-half' });
    out += '</div></section>';

    out += '<section class="modal-section"><h3>상품 등록 여부</h3><div class="needs-grid">' + needs + '</div></section>';

    out += '<section class="modal-section"><h3>카테고리 및 금액</h3><div class="f-grid">';
    out += categoryField('retail', ro);
    out += priceField('소비자몰 정가', 'price_retail_regular', it.price_retail_regular, ro, {
      disabled: !regularManual,
      placeholder: '정가 입력 안 함',
      extra: '<label class="check-line check-line-sm field-extra"><input type="checkbox" data-regular-manual' + (regularManual ? ' checked' : '') + (ro ? ' disabled' : '') + '><span>직접 입력</span></label>'
    });
    out += priceField('소비자몰 판매가', 'price_retail', it.price_retail, ro, { extra: '<span class="field-note">스마트스토어 가격은 이 값과 항상 연동됩니다.</span>' });
    out += categoryField('wholesale', ro);
    out += priceField('도매몰(베이직) 금액', 'price_wholesale', it.price_wholesale, ro);
    out += priceField('도매몰(마스터) 금액', 'price_wholesale_master', it.price_wholesale_master, ro, {
      extra: '<span class="field-note">공란일 경우 베이직 금액과 동일하게 입력됩니다.</span>'
    });
    out += '</div></section>';
    return out;
  }

  function editField(it, input) {
    var field = input.dataset.productField;
    if (field === 'link_np') {
      it.link_np = input.checked;
      if (input.checked) it.price_naver = it.price_retail;
    } else if (field.indexOf('price_') === 0) {
      input.value = withComma(input.value);
      it[field] = toNumberOrNull(input.value);
      if (field === 'price_retail' && it.link_np !== false) it.price_naver = it.price_retail;
    } else if (field === 'name_naver') {
      it.name_naver = smartName(input.value);
      if (input.dataset.naverInput) it.automation = AutomationCore.normalize(Object.assign({}, it.automation, { naverNameMode: 'manual' }));
    } else {
      it[field] = input.value;
      if (field === 'brand') it.brand_custom = !AutomationCore.matchBrand(brands(), input.value);
    }
    var naver = document.querySelector('[data-product-field="price_naver"]');
    if (naver && (field === 'link_np' || field === 'price_retail')) {
      naver.value = withComma(it.price_naver);
      /* 구버전 화면 호환용 플래그입니다. 새 모달에는 스마트스토어 가격 입력이 없습니다. */
      naver.disabled = it.link_np !== false;
    }
  }

  function selectBrand(it, value) {
    var customValue = typeof UI !== 'undefined' && UI.BRAND_CUSTOM ? UI.BRAND_CUSTOM : '__custom__';
    if (value === customValue) { it.brand_custom = true; return; }
    var matched = AutomationCore.matchBrand(brands(), value);
    it.brand = matched ? matched.name : value;
    it.brand_custom = false;
  }
  /* 전체 열 보기가 아닐 때는 Figma 기준 너비를 넘지 않게 제한합니다. */
  function width(key, value) {
    var widths = {
      check: 44, seq: 44, brand: 120, name_own: 560, model: 170,
      need_retail: 72, need_wholesale: 72, need_naver: 72,
      price_retail: 120, price_wholesale: 120, price_wholesale_master: 120, price_naver: 120,
      ref_link: 80, act: 80, note: 240
    };
    return expanded ? value : Math.min(value, widths[key] || value);
  }

  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('btnTableDensity');
    if (toggle) toggle.addEventListener('click', function () {
      expanded = !expanded;
      toggle.setAttribute('aria-pressed', String(expanded));
      toggle.textContent = expanded ? '기본 열 보기' : '전체 열 보기';
      if (typeof UI !== 'undefined') UI.applyColWidths();
    });
  });

  return {
    width: width, fitWidths: fitWidths, visibleItems: visibleItems, filterRows: filterRows, resetFilter: resetFilter,
    compactHidden: compactHidden, columns: columns, refresh: refresh, fields: fields, editField: editField,
    selectBrand: selectBrand, originOutput: originOutput, origins: origins, smartName: smartName, smartNameMode: smartNameMode
  };
})();
