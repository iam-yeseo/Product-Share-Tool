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
function setView(v) {
  if (v === State.view) return;
  if (State.view === "editor" && !confirmDiscard()) return;
  State.view = v;
  document.body.classList.toggle("view-editor", v === "editor");
  document.body.classList.toggle("view-registrar", v === "registrar");
  document.querySelectorAll(".vs-btn").forEach(function (b) {
    b.classList.toggle("is-active", b.dataset.view === v);
  });
  setDirty(false);
  removedIds = [];
  reloadCurrent();
}

/* ---------- 저장 ---------- */
async function save() {
  if (!State.list) return;
  var author = (State.list.author || "").trim();
  var date = State.list.work_date || "";
  if (!date) { toast("작성일을 입력해 주세요", "error"); document.getElementById("listDate").focus(); return; }
  if (!author) { toast("작성자를 입력해 주세요", "error"); document.getElementById("listAuthor").focus(); return; }

  if (State.remoteChanged &&
      !confirm("편집하는 동안 다른 사람이 이 리스트를 수정했습니다.\n지금 저장하면 내 내용으로 덮어쓸 수 있습니다.\n\n계속 저장할까요?")) {
    return;
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
  } catch (e) {
    console.error(e);
    toast("저장 실패: " + (e.message || e), "error");
    btn.disabled = false;
  } finally {
    btn.textContent = "편집 완료 · 저장";
  }
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
  State.items.splice(idx, 1);
  renumber();
  setDirty(true);
  UI.renderGrid();
  UI.renderHead();
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
    if (!confirmDiscard()) return;
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

  document.getElementById("listNav").addEventListener("click", function (e) {
    var btn = e.target.closest(".list-item");
    if (!btn) return;
    if (btn.dataset.id === State.currentListId) { closeSidebar(); return; }
    if (!confirmDiscard()) return;
    loadList(btn.dataset.id);
    closeSidebar();
  });

  document.getElementById("btnSidebar").addEventListener("click", function () {
    document.body.classList.toggle("sidebar-open");
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
  bindEvents();
  UI.setSync("연결 중…");
  await refreshSidebar();
  UI.renderAll();
  if (State.lists.length) await loadList(State.lists[0].id);
  startRealtime();
})();
