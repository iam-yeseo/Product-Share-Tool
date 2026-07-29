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
  hiddenCols: []         // 보기 뷰에서 숨길 열 key 목록 (전역 공유)
};

/* 숨기거나 다시 표시할 수 있는 열 (체크·순번·관리 열은 제외) */
var HIDEABLE_COLS = [
  { key: "brand", label: "브랜드" },
  { key: "name_own", label: "상품명 · 자사몰" },
  { key: "name_naver", label: "상품명 · 네이버" },
  { key: "model", label: "모델명" },
  { key: "content", label: "내용" },
  { key: "image_usage", label: "이미지 사용 여부" },
  { key: "need_retail", label: "등록 필요 · 소매몰" },
  { key: "need_wholesale", label: "등록 필요 · 도매몰" },
  { key: "need_naver", label: "등록 필요 · 네이버" },
  { key: "price_retail", label: "가격 · 소매몰" },
  { key: "price_wholesale", label: "가격 · 도매몰(베이직)" },
  { key: "price_wholesale_master", label: "가격 · 도매몰(마스터)" },
  { key: "price_naver", label: "가격 · 네이버" },
  { key: "image", label: "이미지" },
  { key: "ref_link", label: "참고 링크" },
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

/* 내용 / 등록 필요 선택지 */
var CONTENT_OPTIONS = ["신규 제품", "기존 제품", "기타"];
var NEED_OPTIONS = ["필요", "불필요"];

/* 새 행을 추가할 때 미리 채워지는 값 */
var DEFAULT_CONTENT = "신규 제품";
var DEFAULT_NEED = "필요";

/* 새 행 기본값 */
function makeItem(seq) {
  return {
    id: uuid(),
    seq: seq,
    brand: "",
    name_own: "",
    name_naver: "",
    model: "",
    content: DEFAULT_CONTENT,
    image_usage: "",
    need_retail: DEFAULT_NEED,
    need_wholesale: DEFAULT_NEED,
    need_naver: DEFAULT_NEED,
    price_retail: null,
    price_wholesale: null,          // 도매몰 · 베이직
    price_wholesale_master: null,   // 도매몰 · 마스터
    price_naver: null,
    image_url: "",
    ref_link: "",
    note: "",
    done: false,
    done_at: null
  };
}

/* 행 복사 — 새 id 를 받고, 등록 완료 상태는 물려받지 않습니다. */
var COPY_FIELDS = [
  "brand", "name_own", "name_naver", "model", "content", "image_usage",
  "need_retail", "need_wholesale", "need_naver",
  "price_retail", "price_wholesale", "price_wholesale_master", "price_naver",
  "image_url", "ref_link", "note"
];
function copyItem(src) {
  var it = makeItem(0);
  COPY_FIELDS.forEach(function (f) { it[f] = src[f]; });
  return it;
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
}

/* 아직 저장되지 않은 작업이 있는지 — 저장 전 행 추가 포함
   (실시간 동기화가 편집 중인 초안을 덮어쓰지 않도록 판단할 때 사용) */
function hasUnsavedWork() {
  if (State.dirty) return true;
  return State.items.some(function (it) { return !State.baseItemIds[it.id]; });
}
