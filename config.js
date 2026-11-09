// The anon key is safe to publish: Row Level Security (schema.sql) blocks anyone not signed in.
export const CONFIG = {
  SUPABASE_URL: 'https://byllsqoonhejvuzuuwbr.supabase.co',        
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5bGxzcW9vbmhlanZ1enV1d2JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMjQ3NDQsImV4cCI6MjEwOTcwMDc0NH0.xozQKIriZ7zCqUp4YvxYam1tEV2JTxaYOC8NQtqHvOg',
  CURRENCY: 'Rs',
  // Business details and bank info live in the database (Settings page), not here.
  // Company details (subsidiary line, PV number), bank details and the standard agreement terms are stored
  // in the database (Settings page), not here.
};
