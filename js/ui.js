/* ===== 화면 그리기 ===== */

var UI = (function () {

  /* ---------- 사이드바 ---------- */
  function renderSidebar() {
    var nav = document.getElementById("listNav");
    var q = State.search.trim().toLowerCase();

    var rows = State.lists.filter(function (l) {
      if (!q) return true;
      return (
        (l.title || "").toLowerCase().indexOf(q) > -1 ||
        (l.author || "").toLowerCase().indexOf(q) > -1
      );
    });

    if (!rows.length) {
      nav.innerHTML = '<p class="empty-hint">' +
        (q ? "검색 결과가 없습니다." : "등록된 리스트가 없습니다.") + "</p>";
      return;
    }

    nav.innerHTML = rows.map(function (l) {
      var active = l.id === State.currentListId ? " is-active" : "";
      var complete = l.total > 0 && l.doneCount === l.total ? " is-complete" : "";
      return (
        '<button class="list-item' + active + complete + '" data-id="' + esc(l.id) + '">' +
          '<span class="li-title">' + esc(l.title || "제목 없는 리스트") + "</span>" +
          '<span class="li-sub">' +
            '<span class="li-date">' + esc(fmtDate(l.created_at)) + "</span>" +
            (l.author ? '<span class="li-author">' + esc(l.author) + "</span>" : "") +
          "</span>" +
          '<span class="li-badge">' + l.doneCount + " / " + l.total + "</span>" +
        "</button>"
      );
    }).join("");
  }

  /* ---------- 리스트 헤더 ---------- */
  function renderHead() {
    var l = State.list;
    if (!l) return;
    document.getElementById("listTitle").value = l.title || "";
    document.getElementById("listTitleRO").textContent = l.title || "제목 없는 리스트";
    document.getElementById("listDate").value = l.work_date || "";
    document.getElementById("listDateRO").textContent = l.work_date || "—";
    document.getElementById("listAuthor").value = l.author || "";
    document.getElementById("listAuthorRO").textContent = l.author || "—";

    var done = State.items.filter(function (i) { return i.done; }).length;
    document.getElementById("listProgress").textContent = done + " / " + State.items.length;
  }

  /* ---------- 셀 헬퍼 ---------- */
  function textInput(field, val, ph) {
    return '<input class="cell-input" data-field="' + field + '" value="' + esc(val) + '"' +
      (ph ? ' placeholder="' + esc(ph) + '"' : "") + ">";
  }

  function selectInput(field, val, options) {
    var opts = '<option value=""></option>' + options.map(function (o) {
      return '<option value="' + esc(o) + '"' + (val === o ? " selected" : "") + ">" + esc(o) + "</option>";
    }).join("");
    return '<select class="cell-select" data-field="' + field + '">' + opts + "</select>";
  }

  function priceInput(field, val) {
    return '<span class="price-wrap">' +
      '<span class="won">₩</span>' +
      '<input class="cell-input cell-price" data-field="' + field + '" inputmode="numeric" ' +
      'value="' + esc(withComma(val)) + '">' +
      "</span>";
  }

  /* 읽기 전용 + 복사 버튼 */
  function ro(val, copyable) {
    var s = (val === null || val === undefined) ? "" : String(val);
    if (!s.trim()) return '<span class="ro-empty">—</span>';
    var body = '<span class="ro-text">' + esc(s) + "</span>";
    if (copyable) {
      body += '<button class="copy-btn" data-copy="' + esc(s) + '" title="복사">복사</button>';
    }
    return '<span class="ro-cell">' + body + "</span>";
  }

  function roTag(val, kind) {
    if (!val) return '<span class="ro-empty">—</span>';
    return '<span class="tag tag-' + kind + '">' + esc(val) + "</span>";
  }

  /* ---------- 행 ---------- */
  function renderRow(it, idx) {
    var editor = State.view === "editor";
    var cls = "row" + (it.done ? " is-done" : "");
    var c = [];

    // 체크 — 등록자만 조작 가능
    c.push('<td class="c-check">' +
      '<input type="checkbox" class="chk-done"' + (it.done ? " checked" : "") +
      (editor ? " disabled" : "") + ' title="' +
      (editor ? "등록자만 체크할 수 있습니다" : "등록 완료 체크") + '"></td>');

    // 순번
    if (editor) {
      c.push('<td class="c-seq">' +
        '<div class="seq-cell">' +
          '<input class="seq-input" data-field="seq" type="number" min="1" value="' + (idx + 1) + '">' +
          '<span class="seq-arrows">' +
            '<button class="mini-btn" data-act="up" title="위로">▲</button>' +
            '<button class="mini-btn" data-act="down" title="아래로">▼</button>' +
          "</span>" +
        "</div></td>");
    } else {
      c.push('<td class="c-seq"><span class="seq-ro">' + (idx + 1) + "</span></td>");
    }

    // 브랜드 / 상품명(자사몰) / 상품명(네이버) / 모델명
    c.push('<td class="c-brand">' + (editor ? textInput("brand", it.brand) : ro(it.brand, true)) + "</td>");
    c.push('<td class="c-name">' + (editor ? textInput("name_own", it.name_own) : ro(it.name_own, true)) + "</td>");
    c.push('<td class="c-name">' + (editor ? textInput("name_naver", it.name_naver) : ro(it.name_naver, true)) + "</td>");
    c.push('<td class="c-model">' + (editor ? textInput("model", it.model) : ro(it.model, true)) + "</td>");

    // 내용
    c.push('<td class="c-content">' +
      (editor ? selectInput("content", it.content, CONTENT_OPTIONS) : roTag(it.content, "content")) + "</td>");

    // 이미지 사용 여부
    c.push('<td class="c-imguse">' +
      (editor ? textInput("image_usage", it.image_usage) : ro(it.image_usage, true)) + "</td>");

    // 등록 필요 3종
    ["need_retail", "need_wholesale", "need_naver"].forEach(function (f) {
      var v = it[f];
      c.push('<td class="c-need">' +
        (editor ? selectInput(f, v, NEED_OPTIONS)
                : roTag(v, v === "필요" ? "need" : v === "불필요" ? "noneed" : "content")) + "</td>");
    });

    // 가격 3종
    ["price_retail", "price_wholesale", "price_naver"].forEach(function (f) {
      c.push('<td class="c-price">' +
        (editor ? priceInput(f, it[f])
                : (it[f] === null || it[f] === undefined
                    ? '<span class="ro-empty">—</span>'
                    : '<span class="ro-cell"><span class="ro-text price-ro">' + esc(fmtWon(it[f])) + "</span>" +
                      '<button class="copy-btn" data-copy="' + esc(String(it[f])) +
                      '" title="숫자만 복사">복사</button></span>')
        ) + "</td>");
    });

    // 이미지 — 현재 비활성
    c.push('<td class="c-image"><button class="btn-locked" disabled title="이미지 업로드는 추후 지원 예정입니다">준비 중</button></td>');

    // 참고 링크
    if (editor) {
      c.push('<td class="c-link">' + textInput("ref_link", it.ref_link, "https://") + "</td>");
    } else {
      var url = normalizeUrl(it.ref_link);
      c.push('<td class="c-link">' + (url
        ? '<button class="btn-go" data-url="' + esc(url) + '">바로가기</button>'
        : '<span class="ro-empty">—</span>') + "</td>");
    }

    // 비고
    c.push('<td class="c-note">' + (editor ? textInput("note", it.note) : ro(it.note, true)) + "</td>");

    // 관리 (편집자 전용)
    c.push('<td class="c-act only-editor-cell">' +
      (editor ? '<button class="mini-btn danger" data-act="del" title="행 삭제">삭제</button>' : "") + "</td>");

    return '<tr class="' + cls + '" data-id="' + esc(it.id) + '">' + c.join("") + "</tr>";
  }

  function renderGrid() {
    var body = document.getElementById("gridBody");
    if (!State.items.length) {
      var colspan = 18;
      body.innerHTML = '<tr class="row-empty"><td colspan="' + colspan + '">' +
        (State.view === "editor"
          ? "아래 <b>+ 행 추가</b> 버튼으로 상품을 추가하세요."
          : "등록된 상품이 없습니다.") + "</td></tr>";
      return;
    }
    body.innerHTML = State.items.map(renderRow).join("");
  }

  function renderAll() {
    renderSidebar();
    var has = !!State.currentListId;
    document.getElementById("emptyState").hidden = has;
    document.getElementById("listPane").hidden = !has;
    if (has) {
      renderHead();
      renderGrid();
    }
  }

  function setSync(text, kind) {
    var el = document.getElementById("syncState");
    el.textContent = text;
    el.className = "sync-state" + (kind ? " sync-" + kind : "");
  }

  return {
    renderAll: renderAll,
    renderSidebar: renderSidebar,
    renderGrid: renderGrid,
    renderHead: renderHead,
    setSync: setSync
  };
})();
