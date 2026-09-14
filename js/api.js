/* ===== Supabase 데이터 접근 =====
   모든 함수는 실패 시 예외를 던지고, 호출부에서 토스트로 알립니다. */

var Api = (function () {

  function check(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  /* 상품 리스트 개요용 목록 + 몰별 요청/완료 집계 */
  async function fetchLists() {
    var lists = check(
      await supabaseClient
        .from("product_lists")
        .select("id,title,author,work_date,created_at,updated_at,note")
        .order("updated_at", { ascending: false })
    );

    var stats = check(
      await supabaseClient.from("product_items").select("id,list_id,done,need_retail,need_wholesale,need_naver")
    );
    var registrations = check(
      await supabaseClient.from("product_registrations")
        .select("item_id,channel,status,product_items!inner(list_id,need_retail,need_wholesale,need_naver)")
    );

    var map = {};
    stats.forEach(function (r) {
      if (!map[r.list_id]) map[r.list_id] = { total: 0, done: 0, retail: { done: 0, total: 0 }, wholesale: { done: 0, total: 0 }, naver: { done: 0, total: 0 }, failed: false };
      var list = map[r.list_id];
      list.total++;
      if (r.done) list.done++;
      ["retail", "wholesale", "naver"].forEach(function (channel) {
        if (r["need_" + channel] === "필요") list[channel].total++;
      });
    });
    registrations.forEach(function (r) {
      var listId = r.product_items && r.product_items.list_id, channel = r.channel;
      if (!listId || !map[listId] || !map[listId][channel]) return;
      if (r.status === "success") map[listId][channel].done++;
      if (r.status === "failed") map[listId].failed = true;
    });

    lists.forEach(function (l) {
      var s = map[l.id] || { total: 0, done: 0, retail: { done: 0, total: 0 }, wholesale: { done: 0, total: 0 }, naver: { done: 0, total: 0 }, failed: false };
      l.total = s.total;
      l.doneCount = s.done;
      l.channels = { retail: s.retail, wholesale: s.wholesale, naver: s.naver };
      var required = s.retail.total + s.wholesale.total;
      var complete = s.retail.done + s.wholesale.done;
      l.progressState = s.failed ? "실패" : required === 0 ? (s.naver.total ? "—" : "미시작") : complete === required ? "완료" : complete > 0 ? "진행 중" : "미시작";
    });
    return lists;
  }

  async function fetchList(listId) {
    return check(
      await supabaseClient
        .from("product_lists")
        .select("*")
        .eq("id", listId)
        .maybeSingle()
    );
  }

  /* 몰별 등록 상태 (자동화 프로그램이 기록). 실패해도 목록 표시는 막지 않도록 호출부에서 처리 */
  async function fetchRegistrations(listId) {
    var rows = check(
      await supabaseClient
        .from("product_registrations")
        .select("item_id,channel,status,goods_no,error_message,warnings,attempted_at,product_items!inner(list_id)")
        .eq("product_items.list_id", listId)
    );
    var map = {};
    rows.forEach(function (r) {
      if (!map[r.item_id]) map[r.item_id] = {};
      map[r.item_id][r.channel] = r;
    });
    return map;
  }

  async function fetchItems(listId) {
    return check(
      await supabaseClient
        .from("product_items")
        .select("*")
        .eq("list_id", listId)
        .order("seq", { ascending: true })
        .order("created_at", { ascending: true })
    );
  }

  async function createList(title) {
    return check(
      await supabaseClient
        .from("product_lists")
        .insert({ title: title, author: "", work_date: todayISO() })
        .select()
        .single()
    );
  }

  async function deleteList(listId) {
    check(await supabaseClient.from("product_lists").delete().eq("id", listId));
  }

  /* 편집자 저장 — 리스트 메타 + 행 전체를 한 번에 반영합니다.
     done / done_at 은 payload 에서 제외합니다. (등록자가 체크한 상태를 덮어쓰지 않기 위함) */
  async function saveDraft(list, items, removedIds) {
    var payload = items.map(function (it, i) {
        return {
          id: it.id,
          list_id: list.id,
          seq: i + 1,
          brand: it.brand || "",
          name_own: it.name_own || "",
          name_naver: it.name_naver || "",
          model: it.model || "",
          content: it.content || "",
          image_usage: it.image_usage || "",   // 화면에서는 뺐지만 DB 열이 남아 있어 기존 값을 그대로 보냅니다
          need_retail: it.need_retail || "",
          need_wholesale: it.need_wholesale || "",
          need_naver: it.need_naver || "",
          price_retail_regular: it.price_retail_regular,
          price_retail: it.price_retail,
          price_wholesale: it.price_wholesale,
          price_wholesale_master: it.price_wholesale_master,
          price_naver: it.price_naver,
          image_url: it.image_url || "",
          ref_link: it.ref_link || "",
          note: it.note || "",
          automation: Object.assign(AutomationCore.normalize(it.automation), { detailHtml: AutomationCore.html(AutomationCore.normalize(it.automation).detailImages) })
        };
      });
    check(await supabaseClient.rpc("save_product_draft", { p_list: list, p_items: payload, p_removed_ids: removedIds }));
  }

  /* 등록자 체크 — 즉시 반영 */
  async function setDone(itemId, done) {
    check(
      await supabaseClient
        .from("product_items")
        .update({ done: done, done_at: done ? new Date().toISOString() : null })
        .eq("id", itemId)
    );
  }

  /* 열 숨김 설정 (전역 공유) — app_settings 테이블에 배열로 저장 */
  async function fetchHiddenCols() {
    var data = check(
      await supabaseClient
        .from("app_settings")
        .select("value")
        .eq("key", "hidden_columns")
        .maybeSingle()
    );
    var v = data && data.value;
    return Array.isArray(v) ? v : [];
  }

  async function saveHiddenCols(cols) {
    check(
      await supabaseClient
        .from("app_settings")
        .upsert({ key: "hidden_columns", value: cols, updated_at: new Date().toISOString() })
    );
  }

  /* 상품 인덱싱 */
  async function fetchIndexing() {
    return check(await supabaseClient.from("product_indexing").select("*").order("updated_at", { ascending: false }));
  }

  async function createIndexing(payload) {
    return check(await supabaseClient.from("product_indexing").insert(payload).select().single());
  }

  async function updateIndexing(id, payload) {
    return check(await supabaseClient.from("product_indexing").update(Object.assign({}, payload, { updated_at: new Date().toISOString() })).eq("id", id).select().single());
  }

  async function deleteIndexing(id) {
    check(await supabaseClient.from("product_indexing").delete().eq("id", id));
  }

  async function fetchAutomationSettings() {
    var row = check(await supabaseClient.from("app_settings").select("value,updated_at").eq("key", "product_automation_v1").single());
    // 공용 설정에 brands 키가 아직 없으면(마이그레이션 미적용) 배포된 기본 브랜드 목록을 씁니다.
    // 설정 페이지에서 한 번 저장하면 그 목록이 DB에 들어갑니다. 빈 배열은 의도한 상태로 보고 그대로 둡니다.
    if (row.value && typeof row.value === "object" && !("brands" in row.value) && typeof BRAND_DEFAULTS !== "undefined") {
      row.value.brands = AutomationCore.clone(BRAND_DEFAULTS);
    }
    AutomationCore.validateSettings(row.value);
    return row;
  }

  async function saveAutomationSettings(value, revision) {
    AutomationCore.validateSettings(value);
    var data = check(await supabaseClient.from("app_settings")
      .update({ value: value, updated_at: new Date().toISOString() })
      .eq("key", "product_automation_v1").eq("updated_at", revision).select("updated_at").maybeSingle());
    if (!data) throw new Error("다른 사용자가 설정을 변경했습니다. 새로 불러온 뒤 다시 적용해 주세요.");
    return data.updated_at;
  }

  return {
    fetchAutomationSettings: fetchAutomationSettings,
    saveAutomationSettings: saveAutomationSettings,
    fetchLists: fetchLists,
    fetchList: fetchList,
    fetchItems: fetchItems,
    fetchRegistrations: fetchRegistrations,
    createList: createList,
    deleteList: deleteList,
    saveDraft: saveDraft,
    setDone: setDone,
    fetchHiddenCols: fetchHiddenCols,
    saveHiddenCols: saveHiddenCols,
    fetchIndexing: fetchIndexing,
    createIndexing: createIndexing,
    updateIndexing: updateIndexing,
    deleteIndexing: deleteIndexing
  };
})();
