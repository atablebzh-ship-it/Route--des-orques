import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Reproduit l'API de stockage utilisée pendant le prototypage (get/set/delete avec un
// indicateur "shared") : shared=false -> stocké localement sur l'appareil (profil perso),
// shared=true -> stocké dans Supabase, visible par tous les plaisanciers connectés.
export const storage = {
  async get(key, shared) {
    if (!shared) {
      const v = localStorage.getItem(key);
      return v ? { key, value: v } : null;
    }
    const { data, error } = await supabase.from("app_data").select("value").eq("key", key).maybeSingle();
    if (error || !data) return null;
    return { key, value: data.value };
  },

  async set(key, value, shared) {
    if (!shared) {
      localStorage.setItem(key, value);
      return { key, value };
    }
    const { error } = await supabase
      .from("app_data")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) {
      console.error("storage.set error", error);
      return null;
    }
    return { key, value };
  },

  async delete(key, shared) {
    if (!shared) {
      localStorage.removeItem(key);
      return { key, deleted: true };
    }
    const { error } = await supabase.from("app_data").delete().eq("key", key);
    if (error) return null;
    return { key, deleted: true };
  },
};
