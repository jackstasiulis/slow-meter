import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://atxqsddjivqksokuujsh.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0eHFzZGRqaXZxa3Nva3V1anNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3ODY0OTUsImV4cCI6MjA5MDM2MjQ5NX0.bwLlph8YsFAogZ6LH_HWBKfmBrhLvspmN38CD9aGMdI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
