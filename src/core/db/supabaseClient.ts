
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://sblmbkgoiefqzykjksgm.supabase.co';
const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNibG1ia2dvaWVmcXp5a2prc2dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2Nzg2ODIsImV4cCI6MjA3NzI1NDY4Mn0.wK5E6TVZCavAqLrbZeyfgdToGyETRnQAbm5PPaAVlFw';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
});
