// Preencha com os dados do SEU projeto Supabase (Project Settings > API).
const SUPABASE_URL = "https://SEU-PROJETO.supabase.co";
const SUPABASE_ANON_KEY = "SUA_CHAVE_ANON_AQUI";

// Nome "sb" (em vez de "supabase") para não colidir com o objeto global
// que a própria biblioteca @supabase/supabase-js expõe em window.supabase.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
