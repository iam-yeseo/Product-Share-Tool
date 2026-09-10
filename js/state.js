/* ===== 애플리케이션 상태 =====
   editor(편집자) : items 는 "초안". 저장을 눌러야 서버에 반영됩니다.
   registrar(등록자) : 체크 변경만 가능하며 즉시 서버에 반영됩니다. */

var State = {
  view: "editor",        // 'editor' | 'registrar'
  lists: [],             // 사이드바 목록 (등록일 내림차순)
  search: "",
  currentListId: null,
  list: null,            // 현재 리스트 메타(초안)
  items: [],             // 현재 리스트 행(초안)
  baseIds: [],           // 마지막으로 서버에서 읽어온 행 id 목록 (삭제 판별용)
  baseItemIds: {},       // id -> true (신규/기존 행 판별용)
  selected: {},          // 편집자 뷰에서 체크한 행 (id -> true) — 등록 완료 상태와 무관
  dirty: false,
  remoteChanged: false,  // 편집 중 다른 사람이 서버 데이터를 바꿨는지
  hiddenCols: [],        // 보기 뷰에서 숨길 열 key 목록 (전역 공유)
  registrations: {}      // item id -> { retail: {...}, wholesale: {...} } 몰별 등록 상태
};

/* 숨기거나 다시 표시할 수 있는 열 (상태·자동화 열은 의도적으로 제외) */
var HIDEABLE_COLS = [
  { key: "brand", label: "브랜드" },
  { key: "name_own", label: "상품명" },
  { key: "model", label: "모델명" },
  { key: "need_retail", label: "등록 필요 · 소매" },
  { key: "need_wholesale", label: "등록 필요 · 도매" },
  { key: "need_naver", label: "등록 필요 · 네이버" },
  { key: "price_retail", label: "가격 · 소매" },
  { key: "price_wholesale", label: "가격 · 도매(베이직)" },
  { key: "price_wholesale_master", label: "가격 · 도매(마스터)" },
  { key: "price_naver", label: "가격 · 네이버" },
  { key: "ref_link", label: "참고링크" },
  { key: "note", label: "비고" }
];

/* 체크된 행 개수 / 목록 */
function selectedCount() {
  return State.items.filter(function (it) { return State.selected[it.id]; }).length;
}
function selectedItems() {
  return State.items.filter(function (it) { return State.selected[it.id]; });
}
function clearSelection() {
  State.selected = {};
}

/* 등록 필요 선택지 */
var NEED_OPTIONS = ["필요", "불필요"];

/* 새 행을 추가할 때 미리 채워지는 값 */
var DEFAULT_NEED = "필요";
var DEFAULT_NAVER_NEED = "불필요";

/* 새 행 기본값 */
function makeItem(seq) {
  return {
    id: uuid(),
    seq: seq,
    brand: "",
    name_own: "",
    name_naver: "",
    model: "",
    content: "",                 // 이전 데이터 보존용. 화면과 내보내기에서는 더 이상 사용하지 않습니다.
    need_retail: DEFAULT_NEED,
    need_wholesale: DEFAULT_NEED,
    need_naver: DEFAULT_NAVER_NEED,
    price_retail_regular: null,  // 소매몰 정가
    price_retail: null,          // 소매몰 판매가 · 도매몰 정가
    price_wholesale: null,          // 도매몰 · 베이직
    price_wholesale_master: null,   // 도매몰 · 마스터
    price_naver: null,
    link_np: true,                // 구버전 데이터와의 호환용. 새 화면에서는 항상 소매 판매가와 연동합니다.
    image_url: "",
    automation: AutomationCore.normalize({}),
    ref_link: "",
    note: "",
    done: false,
    done_at: null
  };
}

/* 행 복사 — 새 id 를 받고, 등록 완료 상태는 물려받지 않습니다. */
var COPY_FIELDS = [
  "brand", "name_own", "name_naver", "model", "content",
  "need_retail", "need_wholesale", "need_naver",
  "price_retail_regular", "price_retail", "price_wholesale", "price_wholesale_master", "price_naver", "link_np",
  "image_url", "ref_link", "note"
];
function copyItem(src) {
  var it = makeItem(0);
  COPY_FIELDS.forEach(function (f) { it[f] = src[f]; });
  it.automation = AutomationCore.normalize(src.automation);
  it.automation.detailImages.forEach(function (img) { img.id = uuid(); });
  if (typeof AutomationEditor !== 'undefined') AutomationEditor.copyPending(src.id, it.id);
  return it;
}

/* 브랜드 셀이 목록 선택인지 직접 입력인지 — 저장하지 않는 화면 상태입니다.
   처음에는 브랜드 문자열이 목록과 맞지 않을 때만 직접 입력으로 봅니다. */
function isBrandCustom(it, brands) {
  if (typeof it.brand_custom === "boolean") return it.brand_custom;
  return !!(it.brand || "").trim() && !AutomationCore.matchBrand(brands, it.brand);
}

/* 순번 1..n 로 다시 매기기 */
function renumber() {
  State.items.forEach(function (it, i) { it.seq = i + 1; });
}

function setDirty(v) {
  State.dirty = v;
  var badge = document.getElementById("dirtyBadge");
  var btn = document.getElementById("btnSave");
  if (badge) badge.hidden = !v;
  if (btn) btn.disabled = !v;
  if (typeof AutomationEditor !== "undefined") AutomationEditor.publish();
}

/* 아직 저장되지 않은 작업이 있는지 — 저장 전 행 추가 포함
   (실시간 동기화가 편집 중인 초안을 덮어쓰지 않도록 판단할 때 사용) */
function hasUnsavedWork() {
  if (State.dirty) return true;
  return State.items.some(function (it) { return !State.baseItemIds[it.id]; });
}
