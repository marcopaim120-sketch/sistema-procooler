// Preencha com os dados do SEU projeto Supabase (Project Settings > API).
const SUPABASE_URL = "https://fjvzdbgtfjirnaacshch.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_iradWjmwUj7JzUfJauEf1A_zfSEMSZp";

// Nome "sb" (em vez de "supabase") para não colidir com o objeto global
// que a própria biblioteca @supabase/supabase-js expõe em window.supabase.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
