import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://irgbzqjpdawixzyborfl.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZ2J6cWpwZGF3aXh6eWJvcmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4ODgyNTAsImV4cCI6MjA5MzQ2NDI1MH0.5CsSM2Lxm83WqGFQ9yQvNNOWg2FKaCQuGT3mW6ufui8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});