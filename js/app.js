/* ===== 이벤트 연결 · 초기화 · 실시간 동기화 ===== */

var removedIds = [];   // 편집 중 삭제된 행 (저장 시 서버에서 삭제)

/* ---------- 데이터 로드 ---------- */
async function refreshSidebar() {
  try {
    State.lists = await Api.fetchLists();
    UI.renderSidebar();
  } catch (e) {
    console.error(e);
    UI.setSync("동기화 오류", "error");
  }
}

async function loadList(id) {
  try {
    var list = await Api.fetchList(id);
    if (!list) {
      toast("리스트를 찾을 수 없습니다", "error");
      State.currentListId = null;
      UI.renderAll();
      return;
    }
    State.currentListId = id;
    State.list = list;
    State.items = await Api.fetchItems(id);
    State.baseItemIds = {};
    State.items.forEach(function (it) { State.baseItemIds[it.id] = true; });
    clearSelection();
    removedIds = [];
    State.remoteChanged = false;
    setDirty(false);
    UI.renderAll();
  } catch (e) {
    console.error(e);
    toast("불러오지 못했습니다: " + (e.message || e), "error");
  }
}

async function reloadCurrent() {
  if (State.currentListId) await loadList(State.currentListId);
}

/* ---------- 뷰 전환 ---------- */
async function setView(v) {
  if (v === State.view) return;
  if (State.view === "editor" && !(await confirmLeave())) return;
  State.view = v;
  document.body.classList.toggle("view-editor", v === "editor");
  document.body.classList.toggle("view-registrar", v === "registrar");
  document.querySelectorAll(".vs-btn").forEach(function (b) {
    b.classList.toggle("is-active", b.dataset.view === v);
  });
  setDirty(false);
  clearSelection();
  removedIds = [];
  UI.applyColWidths();
  reloadCurrent();
}

/* ---------- 저장 ----------
   성공하면 true, 저장하지 않았거나 실패하면 false 를 돌려줍니다.
   ('저장하고 이동'에서 저장이 끝났는지 확인하는 데 사용합니다) */
async function save() {
  if (!State.list) return false;
  var author = (State.list.author || "").trim();
  var date = State.list.work_date || "";
  if (!date) { toast("작성일을 입력해 주세요", "error"); document.getElementById("listDate").focus(); return false; }
  if (!author) { toast("작성자를 입력해 주세요", "error"); document.getElementById("listAuthor").focus(); return false; }

  if (State.remoteChanged &&
      !confirm("편집하는 동안 다른 사람이 이 리스트를 수정했습니다.\n지금 저장하면 내 내용으로 덮어쓸 수 있습니다.\n\n계속 저장할까요?")) {
    return false;
  }

  var btn = document.getElementById("btnSave");
  btn.disabled = true;
  btn.textContent = "저장 중…";
  try {
    renumber();
    await Api.saveDraft(State.list, State.items, removedIds);
    removedIds = [];
    setDirty(false);
    State.remoteChanged = false;
    toast("저장했습니다");
    await refreshSidebar();
    await reloadCurrent();
    return true;
  } catch (e) {
    console.error(e);
    toast("저장 실패: " + (e.message || e), "error");
    btn.disabled = false;
    return false;
  } finally {
    btn.textContent = "편집 완료 · 저장";
  }
}

/* ---------- 이동 전 확인 (저장하지 않고 이동 / 저장하고 이동) ----------
   저장할 편집 내용이 없으면 바로 이동(true)합니다.
   있으면 확인 창을 띄우고, 사용자의 선택 결과(이동해도 되는지)를 Promise 로 돌려줍니다. */
var _leaveResolve = null;

function confirmLeave() {
  if (!State.dirty) return Promise.resolve(true);
  return new Promise(function (resolve) {
    _leaveResolve = resolve;
    document.getElementById("leaveModal").hidden = false;
  });
}

function closeLeaveModal(canLeave) {
  document.getElementById("leaveModal").hidden = true;
  var resolve = _leaveResolve;
  _leaveResolve = null;
  if (resolve) resolve(canLeave);
}

function bindLeaveModal() {
  var modal = document.getElementById("leaveModal");

  // 저장하지 않고 이동 — 편집 내용을 버리고 이동합니다.
  document.getElementById("lvDiscard").addEventListener("click", function () {
    closeLeaveModal(true);
  });

  // 저장하고 이동 — 저장에 성공해야 이동합니다. (작성일·작성자 누락 등으로 실패하면 머무릅니다)
  document.getElementById("lvSave").addEventListener("click", async function () {
    var ok = await save();
    closeLeaveModal(ok);
  });

  // 닫기(×)·바깥 클릭·ESC = 취소(머무르기)
  document.getElementById("lvClose").addEventListener("click", function () { closeLeaveModal(false); });
  modal.addEventListener("click", function (e) { if (e.target === modal) closeLeaveModal(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) closeLeaveModal(false);
  });
}

/* ---------- 행 조작 ---------- */
function findIndex(id) {
  for (var i = 0; i < State.items.length; i++) if (State.items[i].id === id) return i;
  return -1;
}

function addRow() {
  State.items.push(makeItem(State.items.length + 1));
  setDirty(true);
  UI.renderGrid();
  UI.renderHead();
  var rows = document.querySelectorAll("#gridBody .row");
  var last = rows[rows.length - 1];
  if (last) {
    var input = last.querySelector('.cell-input[data-field="brand"]');
    if (input) input.focus();
  }
}

function moveRow(idx, dir) {
  var to = idx + dir;
  if (to < 0 || to >= State.items.length) return;
  var tmp = State.items[idx];
  State.items[idx] = State.items[to];
  State.items[to] = tmp;
  renumber();
  setDirty(true);
  UI.renderGrid();
}

function moveRowTo(idx, pos) {
  var to = Math.max(0, Math.min(State.items.length - 1, pos - 1));
  if (to === idx) { UI.renderGrid(); return; }
  var row = State.items.splice(idx, 1)[0];
  State.items.splice(to, 0, row);
  renumber();
  setDirty(true);
  UI.renderGrid();
}

function deleteRow(idx) {
  var it = State.items[idx];
  if (!confirm((it.brand || it.name_own || "이 행") + " 을(를) 삭제할까요?")) return;
  if (State.baseItemIds[it.id]) removedIds.push(it.id);
  delete State.selected[it.id];
  State.items.splice(idx, 1);
  renumber();
  setDirty(true);
  UI.renderGrid();
  UI.renderHead();
}

/* ---------- 체크한 행 일괄 처리 (편집자 전용) ---------- */
function copySelectedRows() {
  var n = selectedCount();
  if (!n) { toast("복사할 행을 체크해 주세요", "warn"); return; }

  // 뒤에서부터 넣어야 인덱스가 밀리지 않습니다. 복사본은 원본 바로 아래에 들어갑니다.
  for (var i = State.items.length - 1; i >= 0; i--) {
    var it = State.items[i];
    if (!State.selected[it.id]) continue;
    State.items.splice(i + 1, 0, copyItem(it));
  }
  clearSelection();
  renumber();
  setDirty(true);
  UI.renderGrid();
  UI.renderHead();
  toast(n + "개 행을 복사했습니다");
}

function deleteSelectedRows() {
  var targets = selectedItems();
  if (!targets.length) { toast("삭제할 행을 체크해 주세요", "warn"); return; }
  if (!confirm("체크한 " + targets.length + "개 행을 삭제할까요?\n저장하면 되돌릴 수 없습니다.")) return;

  targets.forEach(function (it) {
    if (State.baseItemIds[it.id]) removedIds.push(it.id);
  });
  State.items = State.items.filter(function (it) { return !State.selected[it.id]; });
  clearSelection();
  renumber();
  setDirty(true);
  UI.renderGrid();
  UI.renderHead();
  toast(targets.length + "개 행을 삭제했습니다");
}

/* ---------- 이벤트 등록 ---------- */
function bindEvents() {

  /* GNB */
  document.querySelectorAll(".vs-btn").forEach(function (b) {
    b.addEventListener("click", function () { setView(b.dataset.view); });
  });
  document.getElementById("btnSave").addEventListener("click", save);

  /* 사이드바 */
  document.getElementById("searchInput").addEventListener("input", function (e) {
    State.search = e.target.value;
    UI.renderSidebar();
  });

  document.getElementById("btnNewList").addEventListener("click", async function () {
    if (!(await confirmLeave())) return;
    var title = prompt("새 리스트 이름을 입력하세요", fmtDate(new Date()) + " 상품 등록 요청");
    if (title === null) return;
    try {
      var created = await Api.createList((title || "").trim() || "제목 없는 리스트");
      await refreshSidebar();
      await loadList(created.id);
      if (!State.items.length) {
        State.items.push(makeItem(1));
        UI.renderGrid();
      }
      document.getElementById("listAuthor").focus();
      closeSidebar();
    } catch (e) {
      console.error(e);
      toast("리스트를 만들지 못했습니다: " + (e.message || e), "error");
    }
  });

  document.getElementById("listNav").addEventListener("click", async function (e) {
    var btn = e.target.closest(".list-item");
    if (!btn) return;
    if (btn.dataset.id === State.currentListId) { closeSidebar(); return; }
    if (!(await confirmLeave())) return;
    loadList(btn.dataset.id);
    closeSidebar();
  });

  /* 햄버거 — 좁은 화면에서는 열고/닫고, 넓은 화면에서는 접고/펴기 */
  document.getElementById("btnSidebar").addEventListener("click", function () {
    if (isNarrow()) {
      document.body.classList.toggle("sidebar-open");
    } else {
      var collapsed = document.body.classList.toggle("sidebar-collapsed");
      try { localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0"); } catch (e) { /* 무시 */ }
    }
  });
  document.getElementById("sidebarDim").addEventListener("click", closeSidebar);

  /* 리스트 헤더 입력 */
  document.getElementById("listTitle").addEventListener("input", function (e) {
    State.list.title = e.target.value;
    document.getElementById("listTitleRO").textContent = e.target.value;
    setDirty(true);
  });
  document.getElementById("listDate").addEventListener("change", function (e) {
    State.list.work_date = e.target.value;
    setDirty(true);
  });
  document.getElementById("listAuthor").addEventListener("input", function (e) {
    State.list.author = e.target.value;
    setDirty(true);
  });

  document.getElementById("btnDeleteList").addEventListener("click", async function () {
    if (!State.list) return;
    if (!confirm('"' + (State.list.title || "제목 없는 리스트") + '" 리스트를 삭제할까요?\n안에 있는 상품 정보도 모두 사라지며 되돌릴 수 없습니다.')) return;
    try {
      await Api.deleteList(State.list.id);
      State.currentListId = null;
      State.list = null;
      State.items = [];
      setDirty(false);
      await refreshSidebar();
      UI.renderAll();
      toast("삭제했습니다");
    } catch (e) {
      console.error(e);
      toast("삭제 실패: " + (e.message || e), "error");
    }
  });

  document.getElementById("btnAddRow").addEventListener("click", addRow);
  document.getElementById("btnCopyRows").addEventListener("click", copySelectedRows);
  document.getElementById("btnDeleteRows").addEventListener("click", deleteSelectedRows);

  /* 전체 선택 / 해제 */
  document.getElementById("chkAll").addEventListener("change", function (e) {
    clearSelection();
    if (e.target.checked) {
      State.items.forEach(function (it) { State.selected[it.id] = true; });
    }
    UI.renderGrid();
  });

  /* 표 — 입력 */
  var body = document.getElementById("gridBody");

  body.addEventListener("input", function (e) {
    var tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    var idx = findIndex(tr.dataset.id);
    if (idx < 0) return;
    var it = State.items[idx];
    var f = e.target.dataset.field;

    if (e.target.classList.contains("cell-price")) {
      var formatted = withComma(e.target.value);
      e.target.value = formatted;
      it[f] = toNumberOrNull(formatted);
      setDirty(true);
      return;
    }
    if (f && f !== "seq") {
      it[f] = e.target.value;
      setDirty(true);
    }
  });

  body.addEventListener("change", async function (e) {
    var tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    var idx = findIndex(tr.dataset.id);
    if (idx < 0) return;
    var it = State.items[idx];

    /* 행 선택 — 편집자 전용. 등록 완료 상태는 건드리지 않습니다. */
    if (e.target.classList.contains("chk-sel")) {
      if (e.target.checked) State.selected[it.id] = true;
      else delete State.selected[it.id];
      tr.classList.toggle("is-selected", e.target.checked);
      UI.renderToolbar();
      return;
    }

    /* 등록 완료 체크 — 등록자 전용, 즉시 저장 */
    if (e.target.classList.contains("chk-done")) {
      if (State.view !== "registrar") { e.target.checked = it.done; return; }
      var next = e.target.checked;
      try {
        await Api.setDone(it.id, next);
        it.done = next;
        it.done_at = next ? new Date().toISOString() : null;
        tr.classList.toggle("is-done", next);
        UI.renderHead();
        refreshSidebar();
      } catch (err) {
        console.error(err);
        e.target.checked = it.done;
        toast("상태를 바꾸지 못했습니다: " + (err.message || err), "error");
      }
      return;
    }

    if (e.target.classList.contains("seq-input")) {
      moveRowTo(idx, parseInt(e.target.value, 10) || idx + 1);
      return;
    }

    var f = e.target.dataset.field;
    if (f && e.target.tagName === "SELECT") {
      it[f] = e.target.value;
      setDirty(true);
    }
  });

  body.addEventListener("click", function (e) {
    var copyBtn = e.target.closest(".copy-btn");
    if (copyBtn) { copyText(copyBtn.dataset.copy); return; }

    var goBtn = e.target.closest(".btn-go");
    if (goBtn) { window.open(goBtn.dataset.url, "_blank", "noopener,noreferrer"); return; }

    var mini = e.target.closest(".mini-btn");
    if (!mini) return;
    var tr = mini.closest("tr[data-id]");
    var idx = findIndex(tr.dataset.id);
    if (idx < 0) return;
    if (mini.dataset.act === "up") moveRow(idx, -1);
    else if (mini.dataset.act === "down") moveRow(idx, 1);
    else if (mini.dataset.act === "del") deleteRow(idx);
  });

  /* 저장하지 않고 이탈할 때 경고 */
  window.addEventListener("beforeunload", function (e) {
    if (!State.dirty) return;
    e.preventDefault();
    e.returnValue = "";
    return "";
  });

  /* 저장 단축키 */
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (State.view === "editor" && State.dirty) save();
    }
  });
}

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
}

var SIDEBAR_KEY = "productTool.sidebarCollapsed";
function isNarrow() {
  return window.matchMedia("(max-width: 900px)").matches;
}
function restoreSidebar() {
  var v = null;
  try { v = localStorage.getItem(SIDEBAR_KEY); } catch (e) { v = null; }
  if (v === "1") document.body.classList.add("sidebar-collapsed");
}

/* ---------- 열 너비 드래그 ---------- */
function bindColumnResize() {
  var head = document.querySelector("#grid thead");
  if (!head) return;

  head.addEventListener("mousedown", function (e) {
    var handle = e.target.closest(".col-resizer");
    if (!handle) return;
    var th = handle.closest("th[data-col]");
    if (!th) return;

    var key = UI.colKeyAt(Number(th.dataset.col));
    if (!key) return;

    e.preventDefault();
    var startX = e.clientX;
    var startW = UI.colWidthOf(key);
    handle.classList.add("is-active");
    document.body.classList.add("resizing");

    function onMove(ev) { UI.setColWidth(key, startW + (ev.clientX - startX)); }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      handle.classList.remove("is-active");
      document.body.classList.remove("resizing");
      UI.saveColWidths();
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  /* 손잡이를 더블클릭하면 모든 열을 기본 너비로 */
  head.addEventListener("dblclick", function (e) {
    if (!e.target.closest(".col-resizer")) return;
    UI.resetColWidths();
    toast("열 너비를 기본값으로 되돌렸습니다");
  });
}

/* ---------- 엑셀 불러오기 ---------- */
var pendingImport = null;

function bindImport() {
  document.getElementById("btnImport").addEventListener("click", function () {
    if (!State.currentListId) { toast("먼저 리스트를 만들거나 선택해 주세요", "warn"); return; }
    document.getElementById("fileInput").click();
  });

  document.getElementById("fileInput").addEventListener("change", async function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = "";                       // 같은 파일을 다시 고를 수 있도록 비웁니다
    if (!file) return;
    try {
      var res = await XlsxImport.parseFile(file);
      if (!res.items.length) {
        toast("가져올 상품 행을 찾지 못했습니다", "error");
        return;
      }
      pendingImport = res;
      showImportModal(file.name, res);
    } catch (err) {
      console.error(err);
      toast("엑셀을 읽지 못했습니다: " + (err.message || err), "error");
    }
  });

  document.getElementById("imCancel").addEventListener("click", closeImportModal);
  document.getElementById("imApply").addEventListener("click", applyImport);
  document.getElementById("importModal").addEventListener("click", function (e) {
    if (e.target.id === "importModal") closeImportModal();
  });
}

function showImportModal(fileName, res) {
  document.getElementById("imFile").textContent = fileName;

  var stat =
    '<div class="im-stat">' +
      "<span>시트 <b>" + esc(res.sheetName) + "</b></span>" +
      "<span>머리글 <b>" + res.headerRow + (res.subHeaderRow ? "~" + res.subHeaderRow : "") + "행</b></span>" +
      "<span>상품 <b>" + res.items.length + "개</b></span>" +
      (res.workDate ? "<span>작성일 <b>" + esc(res.workDate) + "</b></span>" : "") +
    "</div>";

  var map = '<ul class="im-map">' + res.mappings.map(function (m) {
    return "<li>" +
      '<span class="im-from">' + esc(m.label) + "</span>" +
      '<span class="im-arrow">→</span>' +
      '<span class="im-to">' + esc(m.to) + "</span>" +
    "</li>";
  }).join("") + "</ul>";

  var ignored = res.ignored.length
    ? '<p class="im-ignored">가져오지 않는 열 : ' +
      res.ignored.map(function (m) { return esc(m.label); }).join(", ") + "</p>"
    : "";

  document.getElementById("imSummary").innerHTML = stat + map + ignored;
  document.getElementById("importModal").hidden = false;
}

function closeImportModal() {
  document.getElementById("importModal").hidden = true;
  pendingImport = null;
}

function applyImport() {
  if (!pendingImport || !State.list) return;
  var mode = document.querySelector('input[name="imMode"]:checked').value;
  var items = pendingImport.items;

  if (mode === "replace") {
    State.items.forEach(function (it) {
      if (State.baseItemIds[it.id]) removedIds.push(it.id);
    });
    State.items = items;
  } else {
    State.items = State.items.concat(items);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(pendingImport.workDate || "") && !State.list.work_date) {
    State.list.work_date = pendingImport.workDate;
  }

  clearSelection();
  renumber();
  setDirty(true);
  closeImportModal();
  UI.renderAll();
  toast(items.length + "개 행을 불러왔습니다 — 확인 후 저장하세요");
}

/* ---------- 실시간 동기화 ---------- */
var _syncTimer = null;
function startRealtime() {
  supabaseClient
    .channel("product-tool")
    .on("postgres_changes", { event: "*", schema: "public", table: "product_items" }, onRemote)
    .on("postgres_changes", { event: "*", schema: "public", table: "product_lists" }, onRemote)
    .subscribe(function (status) {
      if (status === "SUBSCRIBED") UI.setSync("실시간 동기화 중", "ok");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") UI.setSync("동기화 끊김", "error");
    });
}

function onRemote() {
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(function () {
    refreshSidebar();
    if (!State.currentListId) return;
    if (State.view === "editor" && hasUnsavedWork()) {
      if (State.dirty && !State.remoteChanged) {
        State.remoteChanged = true;
        toast("다른 사람이 이 리스트를 수정했습니다", "warn");
      }
      return;                 // 편집 중인 내용은 덮어쓰지 않습니다
    }
    reloadCurrent();
  }, 400);
}

/* ---------- 시작 ---------- */
(async function init() {
  document.body.classList.add("view-editor");
  restoreSidebar();
  bindEvents();
  bindColumnResize();
  bindImport();
  bindLeaveModal();
  UI.applyColWidths();
  UI.setSync("연결 중…");
  await refreshSidebar();
  UI.renderAll();
  if (State.lists.length) await loadList(State.lists[0].id);
  startRealtime();
})();
