/* ===== Supabase 클라이언트 =====
   - 이 파일보다 먼저 Supabase CDN 스크립트가 로드되어야 합니다.
   - 프론트엔드에는 publishable key만 사용합니다.
   - service_role / secret key는 절대 넣지 마세요.
   - 주소나 키를 바꿀 때는 아래 두 상수만 수정하면 됩니다. */

var SUPABASE_URL = "https://giuqapykceosroauaijq.supabase.co";
var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_NfLmTDmFVb-p1yvi1rGzlA_Fbq0rEN9";

var supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
