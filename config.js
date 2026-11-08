// The anon key is safe to publish: Row Level Security (schema.sql) blocks anyone not signed in.
export const CONFIG = {
  SUPABASE_URL: 'PASTE_PROJECT_URL',        // e.g. https://abcd.supabase.co
  SUPABASE_ANON_KEY: 'PASTE_ANON_KEY',
  CURRENCY: 'LKR',
  BUSINESS: {
    name: 'Shammi Travels',
    address: 'Your address, Sri Lanka',
    phone: '+94 00 000 0000',
    email: 'info@example.com',
    payment: 'Bank: ____  Account name: Shammi Travels  Account no: ____',
  },
  DEFAULT_TERMS: `1. Services: Shammi Travels will provide the transportation described above with a licensed driver and a roadworthy, insured vehicle.
2. Payment: The agreed rate is payable as stated. The deposit is due on confirmation; the balance is due on completion unless agreed otherwise.
3. Cancellation: Cancellations 48 hours or more before pick-up: deposit refunded. Within 48 hours: deposit is retained.
4. Waiting time & extras: Waiting beyond 30 minutes, extra distance, tolls and parking are charged in addition at standard rates.
5. Client conduct: The client is responsible for any damage to the vehicle caused by the client or passengers. Smoking and illegal items are not permitted.
6. Liability: Shammi Travels is not liable for delays caused by traffic, weather, road closures or events beyond its control.
7. Governing law: This agreement is governed by the laws of Sri Lanka.`,
};
