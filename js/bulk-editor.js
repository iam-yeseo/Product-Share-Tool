/* Checked product rows can share selected settings without touching product-specific data. */
var BulkEditor = (function () {
  var hasOwn = function (value, key) { return Object.prototype.hasOwnProperty.call(value, key); };

  function applyChanges(items, changes, settings) {
    settings = settings || { categories: { retail: [], wholesale: [] }, folders: [], brands: [] };
    var brands = settings.brands || [];
    items.forEach(function (it) {
      var a = AutomationCore.normalize(it.automation);

      if (hasOwn(changes, 'brand')) {
        var brand = String(changes.brand || '').trim();
        var matched = AutomationCore.matchBrand(brands, brand);
        it.brand = matched ? matched.name : brand;
        it.brand_custom = !!brand && !matched;
      }
      ['content','ref_link','note','need_retail','need_wholesale','need_naver'].forEach(function (key) {
        if (hasOwn(changes, key)) it[key] = changes[key];
      });
      if (hasOwn(changes, 'origin')) a.origin = String(changes.origin || '').trim();

      ['retail','wholesale'].forEach(function (store) {
        var key = 'category_' + store;
        if (!hasOwn(changes, key)) return;
        a.categoryCodes[store] = changes[key];
      });
      if (hasOwn(changes, 'generator_folder')) a.generator.folder = changes.generator_folder;
      if (hasOwn(changes, 'generator_extension')) a.generator.extension = changes.generator_extension;

      var changesRetail = hasOwn(changes, 'price_retail');
      var changesNaver = hasOwn(changes, 'price_naver');
      var changesLink = hasOwn(changes, 'link_np');
      ['price_retail','price_wholesale','price_wholesale_master'].forEach(function (key) {
        if (hasOwn(changes, key)) it[key] = changes[key];
      });
      if (changesLink) it.link_np = changes.link_np;
      if ((changesLink || changesRetail) && it.link_np !== false) it.price_naver = it.price_retail;
      else if (changesNaver && it.link_np === false) it.price_naver = changes.price_naver;

      it.automation = a;
    });
    return items.length;
  }

  function option(value, label) { return '<option value="' + esc(value) + '">' + esc(label) + '</option>'; }
  function row(key, label, control, note) {
    return '<div class="bulk-field" data-bulk-row="' + key + '"><label class="bulk-enable"><input type="checkbox" data-bulk-enable="' + key + '"><span>' + esc(label) + '</span></label><div class="bulk-control">' + control + (note ? '<p class="field-note">' + esc(note) + '</p>' : '') + '</div></div>';
  }
  function select(key, values, first, required) {
    return '<select data-bulk-field="' + key + '" data-bulk-control="' + key + '"' + (required ? ' required' : '') + ' disabled>' + option('', first || '선택') + values.map(function (pair) { return option(pair[0], pair[1]); }).join('') + '</select>';
  }
  function input(key, type, placeholder, extra) {
    return '<input data-bulk-field="' + key + '" data-bulk-control="' + key + '" type="' + (type || 'text') + '" placeholder="' + esc(placeholder || '') + '"' + (extra || '') + ' disabled>';
  }
  function categoryOptions(store, query, selected) {
    var settings = AutomationEditor.settings(), cats = (settings.categories && settings.categories[store]) || [], q = String(query || '').toLowerCase();
    var html = option('', '카테고리 미선택으로 변경');
    return html + cats.filter(function (cat) {
      return cat.code === selected || (cat.active !== false && (!q || (cat.code + ' ' + AutomationCore.path(cats,cat.code)).toLowerCase().includes(q)));
    }).map(function (cat) { return option(cat.code, AutomationCore.path(cats,cat.code) + ' [' + cat.code + ']'); }).join('');
  }
  function categoryControl(store) {
    var key = 'category_' + store, label = store === 'retail' ? '소매몰' : '도매몰';
    return '<input type="search" data-bulk-search="' + store + '" data-bulk-control="' + key + '" placeholder="' + label + ' 카테고리 검색" disabled>' +
      '<select data-bulk-field="' + key + '" data-bulk-control="' + key + '" disabled>' + categoryOptions(store,'','') + '</select>';
  }
  function brandControl() {
    var brands = AutomationEditor.brands().slice().filter(function (b) { return b.active !== false; }).sort(function (a,b) { return a.name.localeCompare(b.name,'en',{sensitivity:'base'}); });
    var values = brands.map(function (b) { return [b.name,b.name]; }); values.push(['__custom__','직접 입력…']);
    return select('brand',values,'브랜드 비우기') + '<input class="bulk-custom-brand" data-bulk-brand-custom data-bulk-control="brand" maxlength="30" placeholder="브랜드 직접 입력" disabled hidden>';
  }
  function render() {
    var settings = AutomationEditor.settings(), folders = (settings.folders || []).map(function (folder) { return [folder,folder]; });
    document.getElementById('bulkDescription').textContent = '체크한 ' + selectedCount() + '개 상품에 같은 값을 적용합니다.';
    document.getElementById('bulkBody').innerHTML =
      '<section class="bulk-section"><h3>상품 기본 설정</h3><p class="field-note">적용할 항목만 체크하세요. 비운 값도 의도적으로 적용할 수 있습니다.</p><div class="bulk-fields">' +
        row('brand','브랜드',brandControl()) +
        row('content','내용',select('content',CONTENT_OPTIONS.map(function (v) { return [v,v]; }),'내용 비우기')) +
        row('origin','원산지',input('origin','text','예: Made in China',' maxlength="30"')) +
        row('ref_link','참고 링크',input('ref_link','text','https://')) +
        row('note','비고',input('note','text','공통 비고')) +
      '</div></section>' +
      '<section class="bulk-section"><h3>몰별 등록·카테고리·가격</h3><p class="field-note">소매몰과 도매몰 카테고리는 서로 독립적으로 저장됩니다.</p><div class="bulk-fields">' +
        row('need_retail','소매몰 등록 필요',select('need_retail',NEED_OPTIONS.map(function (v) { return [v,v]; }),'선택',true)) +
        row('need_wholesale','도매몰 등록 필요',select('need_wholesale',NEED_OPTIONS.map(function (v) { return [v,v]; }),'선택',true)) +
        row('need_naver','네이버 등록 필요',select('need_naver',NEED_OPTIONS.map(function (v) { return [v,v]; }),'선택',true)) +
        row('category_retail','소매몰 카테고리',categoryControl('retail')) +
        row('category_wholesale','도매몰 카테고리',categoryControl('wholesale')) +
        row('price_retail','소매몰 가격',input('price_retail','text','비우면 가격 삭제',' inputmode="numeric" data-bulk-price')) +
        row('price_wholesale','도매몰 베이직 가격',input('price_wholesale','text','비우면 가격 삭제',' inputmode="numeric" data-bulk-price')) +
        row('price_wholesale_master','도매몰 마스터 가격',input('price_wholesale_master','text','비우면 가격 삭제',' inputmode="numeric" data-bulk-price')) +
        row('link_np','네이버 가격 연동',select('link_np',[['true','소매몰 가격과 동일'],['false','네이버 가격 별도 입력']],'선택',true)) +
        row('price_naver','네이버 가격',input('price_naver','text','비우면 가격 삭제',' inputmode="numeric" data-bulk-price'),'가격 연동을 사용하는 상품은 소매몰 가격이 우선합니다.') +
      '</div></section>' +
      '<section class="bulk-section"><h3>상세 이미지 주소 생성 기본값</h3><p class="field-note">이미 만든 상세 이미지 주소는 바꾸지 않습니다.</p><div class="bulk-fields">' +
        row('generator_folder','이미지 폴더',select('generator_folder',folders,'폴더 미선택으로 변경')) +
        row('generator_extension','확장자',select('generator_extension',AutomationCore.EXTENSIONS.map(function (v) { return [v,v]; }),'선택',true)) +
      '</div></section>';
  }
  function syncEnabled(key) {
    var enabled = document.querySelector('[data-bulk-enable="' + key + '"]').checked;
    document.querySelectorAll('[data-bulk-control="' + key + '"]').forEach(function (control) { control.disabled = !enabled; });
  }
  function collect() {
    var changes = {};
    document.querySelectorAll('[data-bulk-enable]').forEach(function (check) {
      if (!check.checked) return;
      var key = check.dataset.bulkEnable, control = document.querySelector('[data-bulk-field="' + key + '"]');
      var value = control ? control.value : '';
      if (key === 'brand' && value === '__custom__') value = document.querySelector('[data-bulk-brand-custom]').value.trim();
      if (key.indexOf('price_') === 0) value = toNumberOrNull(value);
      if (key === 'link_np') value = value === 'true';
      changes[key] = value;
    });
    return changes;
  }
  function close() { var dialog = document.getElementById('bulkDialog'); if (dialog.open) dialog.close(); var button = document.getElementById('btnBulkEdit'); if (button && !button.hidden) button.focus(); }
  function open() {
    if (!selectedCount()) { toast('일괄 설정할 상품을 체크해 주세요','warn'); return; }
    render(); document.getElementById('bulkDialog').showModal();
  }
  function init() {
    var button = document.getElementById('btnBulkEdit'), dialog = document.getElementById('bulkDialog'), form = document.getElementById('bulkForm');
    if (!button || !dialog || !form) return;
    button.addEventListener('click',open);
    document.getElementById('bulkClose').addEventListener('click',close);
    document.getElementById('bulkCancel').addEventListener('click',close);
    dialog.addEventListener('cancel',function (event) { event.preventDefault(); close(); });
    form.addEventListener('change',function (event) {
      if (event.target.dataset.bulkEnable) syncEnabled(event.target.dataset.bulkEnable);
      if (event.target.dataset.bulkField === 'brand') {
        var direct = document.querySelector('[data-bulk-brand-custom]'); direct.hidden = event.target.value !== '__custom__';
        if (!direct.hidden) direct.focus();
      }
    });
    form.addEventListener('input',function (event) {
      if (event.target.hasAttribute('data-bulk-price')) event.target.value = withComma(event.target.value);
      if (event.target.dataset.bulkSearch) {
        var store = event.target.dataset.bulkSearch, key = 'category_' + store, target = document.querySelector('[data-bulk-field="' + key + '"]');
        target.innerHTML = categoryOptions(store,event.target.value,target.value);
      }
    });
    form.addEventListener('submit',function (event) {
      event.preventDefault();
      var targets = selectedItems(), changes = collect(), keys = Object.keys(changes);
      if (!targets.length) { close(); toast('선택된 상품이 없습니다','warn'); return; }
      if (!keys.length) { toast('적용할 설정을 하나 이상 체크해 주세요','warn'); return; }
      if (hasOwn(changes,'brand') && document.querySelector('[data-bulk-field="brand"]').value === '__custom__' && !changes.brand) {
        toast('직접 입력할 브랜드명을 입력해 주세요','warn'); document.querySelector('[data-bulk-brand-custom]').focus(); return;
      }
      applyChanges(targets,changes,AutomationEditor.settings());
      setDirty(true); UI.renderGrid(); close(); toast(targets.length + '개 상품에 ' + keys.length + '개 설정을 적용했습니다');
    });
  }
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded',init);
  return { applyChanges:applyChanges, collect:collect, open:open, init:init };
})();
if (typeof module !== 'undefined') module.exports = BulkEditor;
