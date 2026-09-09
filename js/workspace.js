/* CALLTO 작업공간 표현 계층.
   표는 읽기 전용이고 상품 정보는 중앙 상품 모달의 초안에서만 수정합니다. */
var Workspace = (function () {
  var expanded = false;
  var priceFields = [
    ['price_retail_regular', '소비자몰 정가'],
    ['price_retail', '소비자몰 판매가'],
    ['price_wholesale', '도매몰 베이직'],
    ['price_wholesale_master', '도매몰 마스터'],
    ['price_naver', '스마트스토어 가격']
  ];
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

  /* 기존 열 너비 회귀 테스트와 사용자 설정을 위한 호환 함수입니다. */
  function fitWidths(entries, available) {
    var fitted = entries.map(function (entry) { return { col: entry.col, key: entry.key, width: entry.width }; });
    if (expanded || !available) return fitted;
    var total = fitted.reduce(function (sum, entry) { return sum + entry.width; }, 0);
    var extra = Math.floor(available - total);
    if (extra <= 0) return fitted;
    var weights = { name_own: 3, automation: 2, brand: 1 };
    var flexible = fitted.filter(function (entry) { return entry.width > 0 && weights[entry.key]; });
    var weightTotal = flexible.reduce(function (sum, entry) { return sum + weights[entry.key]; }, 0);
    var remaining = extra;
    flexible.forEach(function (entry, index) {
      var add = index === flexible.length - 1 ? remaining : Math.floor(extra * weights[entry.key] / weightTotal);
      entry.width += add;
      remaining -= add;
    });
    return fitted;
  }

  function brandOptions(it, query) {
    var list = brands(), selected = AutomationCore.matchBrand(list, it.brand), custom = isCustomBrand(it, list);
    var q = String(query || '').trim();
    var html = '<option value="">브랜드 선택</option>';
    list.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }); }).forEach(function (brand) {
      if (brand.active === false && brand !== selected) return;
      if (q && brand !== selected && !AutomationCore.brandMatches(brand, q)) return;
      html += '<option value="' + esc(brand.name) + '"' + (!custom && brand === selected ? ' selected' : '') + '>' + esc(brand.name) + (brand.code ? ' · ' + esc(brand.code) : '') + '</option>';
    });
    html += '<option value="' + (typeof UI !== 'undefined' && UI.BRAND_CUSTOM ? UI.BRAND_CUSTOM : '__custom__') + '"' + (custom ? ' selected' : '') + '>직접 입력…</option>';
    return html;
  }

  function brandField(it, ro) {
    var list = brands(), selected = AutomationCore.matchBrand(list, it.brand), custom = isCustomBrand(it, list);
    var value = selected ? selected.name : (it.brand || '');
    var select = '<select class="legacy-brand-value" data-product-brand-select' + (ro ? ' disabled' : '') + ' hidden>' + brandOptions(it, '') + '</select>';
    var trigger = '<button type="button" class="choice-trigger" data-choice="brand"' + (ro ? ' disabled' : '') + '><span data-brand-value>' + esc(value || '브랜드 선택') + '</span><span aria-hidden="true">⌄</span></button>';
    var direct = custom ? '<input class="brand-direct-input" data-product-field="brand" value="' + esc(it.brand || '') + '" placeholder="브랜드 직접 입력" maxlength="30"' + (ro ? ' readonly' : '') + '>' : '';
    return '<label class="field">브랜드 선택' + select + trigger + direct + '<span class="field-note">등록된 브랜드는 검색·선택하고, 미등록 브랜드는 직접 입력으로 남길 수 있습니다.</span></label>';
  }

  function originState(value) {
    var raw = String(value || '').trim().replace(/^Made in\s+/i, '');
    var preset = origins.find(function (item) { return item[2] && item[2].toLowerCase() === String(value || '').trim().toLowerCase(); });
    return { key: preset ? preset[0] : (raw ? 'custom' : ''), custom: preset ? '' : raw };
  }
  function originOptions(value, ro) {
    var state = originState(value);
    return '<select data-origin-select' + (ro ? ' disabled' : '') + '><option value="">원산지 선택</option>' + origins.map(function (item) {
      return '<option value="' + item[0] + '"' + (item[0] === state.key ? ' selected' : '') + '>' + item[1] + '</option>';
    }).join('') + '</select>' + (state.key === 'custom' ? '<input data-basic="origin-custom" value="' + esc(state.custom) + '" placeholder="예: Vietnam" pattern="[A-Za-z][A-Za-z .\'\\-]*" maxlength="40"' + (ro ? ' readonly' : '') + '>' : '') + '<span class="field-note" data-origin-preview>' + esc(value ? '미리보기: ' + value : '영문 국가명만 입력할 수 있습니다.') + '</span>';
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
    return '<label class="field field-wide">네이버 상품명<div class="smart-name-row"><input data-product-field="name_naver" data-naver-input value="' + esc(value) + '" placeholder="상품명을 입력하면 자동으로 변환됩니다." maxlength="120"' + (ro ? ' readonly' : mode === 'auto' ? ' readonly' : '') + '><label class="inline-check"><input type="checkbox" data-naver-mode' + (mode === 'manual' ? ' checked' : '') + (ro ? ' disabled' : '') + '> 직접 입력</label></div><span class="char-count" data-naver-count></span><span class="field-note">자동 모드는 원상품명의 `/`만 제거합니다. 50자 초과 시 경고하며 자동으로 자르지 않습니다.</span></label>';
  }

  function fields(it, ro) {
    it.automation = AutomationCore.normalize(it.automation);
    var needs = ['retail', 'wholesale', 'naver'].map(function (store) {
      var label = store === 'retail' ? '소비자몰' : store === 'wholesale' ? '도매몰' : '스마트스토어';
      var field = 'need_' + store;
      return '<label class="need-option"><input type="checkbox" data-need-field="' + field + '"' + (it[field] === '필요' ? ' checked' : '') + (ro ? ' disabled' : '') + '><span>' + label + '</span></label>';
    }).join('');
    var prices = priceFields.map(function (pair) {
      var field = pair[0], readonly = ro || field === 'price_naver';
      return '<label class="field"><span>' + pair[1] + (field === 'price_naver' ? ' <small>소비자몰 판매가와 연동</small>' : '') + '</span><input inputmode="numeric" data-product-field="' + field + '" value="' + esc(withComma(field === 'price_naver' ? it.price_retail : it[field])) + '"' + (readonly ? ' readonly' : '') + ' placeholder="' + (field === 'price_retail_regular' ? '정가 입력 안 함' : '0원') + '"></label>';
    }).join('');
    var out = '<section class="modal-section product-info-section"><div class="section-heading"><div><h3>상품 정보</h3><p class="field-note">상품 기본 정보와 외부몰 표시값을 관리합니다.</p></div></div><div class="field-grid">';
    out += '<label class="field">브랜드 검색<input type="search" class="sr-only-input" data-product-brand-search placeholder="브랜드명·코드·한글 별칭 검색"' + (ro ? ' disabled' : '') + '></label>';
    out += brandField(it, ro);
    out += '<label class="field field-wide">자사몰 상품명<input data-product-field="name_own" value="' + esc(it.name_own || '') + '" placeholder="상품명 입력"' + (ro ? ' readonly' : '') + '></label>';
    out += naverNameField(it, ro);
    out += '<label class="field">모델명<input data-product-field="model" value="' + esc(it.model || '') + '" placeholder="모델명 입력"' + (ro ? ' readonly' : '') + '></label>';
    out += '<label class="field">원산지' + originOptions(it.automation.origin, ro) + '</label>';
    out += '<label class="field">참고 링크<input data-product-field="ref_link" value="' + esc(it.ref_link || '') + '" placeholder="https://"' + (ro ? ' readonly' : '') + '></label>';
    out += '<label class="field">비고<input data-product-field="note" value="' + esc(it.note || '') + '" placeholder="메모"' + (ro ? ' readonly' : '') + '></label>';
    out += '</div></section><section class="modal-section"><h3>상품 등록 여부</h3><div class="needs-grid">' + needs + '</div></section>';
    out += '<section class="modal-section"><h3>카테고리 및 금액</h3><p class="field-note">소비자몰·도매몰 카테고리는 서로 독립적으로 저장됩니다. 소비자몰 정가는 공란과 0원을 구분합니다.</p><div class="field-grid price-grid">' + prices + '</div><p class="field-note">도매몰 마스터 금액이 공란이면 베이직 금액을 따릅니다.</p></section>';
    out += '<p class="modal-validation-note">목록에 반영되며, 상단 저장하기를 눌러야 공유됩니다.</p>';
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
      /* Legacy callers still use this flag; the new modal keeps the input
         read-only and never renders a separate Naver price toggle. */
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
  function searchBrands(it, query) {
    var selector = document.querySelector('[data-product-brand-select]');
    if (selector) selector.innerHTML = brandOptions(it, query);
  }
  function width(key, value) {
    var widths = { check: 48, seq: 58, brand: 140, name_own: 300, model: 150, need_retail: 100, need_wholesale: 100, need_naver: 110, price_retail: 150, price_wholesale: 140, price_wholesale_master: 150, price_naver: 150, ref_link: 120, act: 82, note: 180 };
    return expanded ? value : Math.min(value, widths[key] || value);
  }

  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('btnTableDensity');
    if (toggle) toggle.addEventListener('click', function () { expanded = !expanded; toggle.setAttribute('aria-pressed', String(expanded)); toggle.textContent = expanded ? '기본 열 보기' : '전체 열 보기'; if (typeof UI !== 'undefined') UI.applyColWidths(); });
  });

  return { width: width, fitWidths: fitWidths, visibleItems: visibleItems, filterRows: filterRows, resetFilter: resetFilter, compactHidden: compactHidden, columns: columns, refresh: refresh, fields: fields, editField: editField, selectBrand: selectBrand, searchBrands: searchBrands, originOutput: originOutput, origins: origins, smartName: smartName, smartNameMode: smartNameMode };
})();
