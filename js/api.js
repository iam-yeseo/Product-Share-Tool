/* ===== Supabase 데이터 접근 =====
   모든 함수는 실패 시 예외를 던지고, 호출부에서 토스트로 알립니다. */

var Api = (function () {

  function check(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  /* 사이드바용 리스트 전체 (등록일 내림차순) + 행 개수/완료 개수 */
  async function fetchLists() {
    var lists = check(
      await supabaseClient
        .from("product_lists")
        .select("id,title,author,work_date,created_at")
        .order("created_at", { ascending: false })
    );

    var stats = check(
      await supabaseClient.from("product_items").select("list_id,done")
    );

    var map = {};
    stats.forEach(function (r) {
      if (!map[r.list_id]) map[r.list_id] = { total: 0, done: 0 };
      map[r.list_id].total++;
      if (r.done) map[r.list_id].done++;
    });

    lists.forEach(function (l) {
      var s = map[l.id] || { total: 0, done: 0 };
      l.total = s.total;
      l.doneCount = s.done;
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
    check(
      await supabaseClient
        .from("product_lists")
        .update({
          title: list.title || "제목 없는 리스트",
          author: list.author || "",
          work_date: list.work_date || null
        })
        .eq("id", list.id)
    );

    if (removedIds.length) {
      check(
        await supabaseClient.from("product_items").delete().in("id", removedIds)
      );
    }

    if (items.length) {
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
          image_usage: it.image_usage || "",
          need_retail: it.need_retail || "",
          need_wholesale: it.need_wholesale || "",
          need_naver: it.need_naver || "",
          price_retail: it.price_retail,
          price_wholesale: it.price_wholesale,
          price_naver: it.price_naver,
          image_url: it.image_url || "",
          ref_link: it.ref_link || "",
          note: it.note || ""
        };
      });
      check(await supabaseClient.from("product_items").upsert(payload));
    }
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

  return {
    fetchLists: fetchLists,
    fetchList: fetchList,
    fetchItems: fetchItems,
    createList: createList,
    deleteList: deleteList,
    saveDraft: saveDraft,
    setDone: setDone
  };
})();
