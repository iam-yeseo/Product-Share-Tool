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
  dirty: false,
  remoteChanged: false   // 편집 중 다른 사람이 서버 데이터를 바꿨는지
};

/* 내용 / 등록 필요 선택지 */
var CONTENT_OPTIONS = ["신규 제품", "기존 제품", "기타"];
var NEED_OPTIONS = ["필요", "불필요"];

/* 새 행 기본값 */
function makeItem(seq) {
  return {
    id: uuid(),
    seq: seq,
    brand: "",
    name_own: "",
    name_naver: "",
    model: "",
    content: "",
    image_usage: "",
    need_retail: "",
    need_wholesale: "",
    need_naver: "",
    price_retail: null,
    price_wholesale: null,
    price_naver: null,
    image_url: "",
    ref_link: "",
    note: "",
    done: false,
    done_at: null
  };
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

/* 편집 중인 내용을 버려도 되는지 확인 */
function confirmDiscard() {
  if (!State.dirty) return true;
  return confirm("저장하지 않은 편집 내용이 있습니다.\n저장하지 않고 이동하면 변경 사항이 사라집니다.\n\n이동할까요?");
}
