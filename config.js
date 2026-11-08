// The anon key is safe to publish: Row Level Security (schema.sql) blocks anyone not signed in.
export const CONFIG = {
  SUPABASE_URL: 'https://byllsqoonhejvuzuuwbr.supabase.co',        
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5bGxzcW9vbmhlanZ1enV1d2JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMjQ3NDQsImV4cCI6MjEwOTcwMDc0NH0.xozQKIriZ7zCqUp4YvxYam1tEV2JTxaYOC8NQtqHvOg',
  CURRENCY: 'Rs',
  // Business details and bank info live in the database (Settings page), not here.
  // Terms editor format: "# Heading" lines are headings, every other line is a bullet.
  DEFAULT_TERMS: `# Vehicle Hire, Airport Transfers & Group Transportation
All rates quoted are in Sri Lankan Rupees (LKR) and are based on the vehicle type and passenger numbers specified in the quotation.
Rates are quoted per vehicle/run and not per passenger, unless specifically stated otherwise.
The quoted rates are inclusive of applicable taxes, highway tolls and parking charges where applicable.
Entrance fees, attraction fees, activity charges and other personal expenses are not included unless specifically mentioned in the quotation.
# Vehicle Allocation
Vehicles will be allocated according to the number of passengers and luggage requirements. The standard vehicle allocation is:
Up to 02 passengers: Car
03 to 05 passengers: Van
06 to 09 passengers: Large Van
30 passengers: Large Coach
The vehicle provided will be suitable for the confirmed number of passengers and their luggage. Any significant change in passenger numbers or luggage requirements must be advised in advance and may result in a revision of the vehicle type and rate.
# Airport Transfers
Airport transfers include meet and greeting service, paging, highway charges and parking charges, as specified in the quotation.
Guests are requested to provide accurate flight details and inform the transport company of any changes as soon as possible.
In the event of flight delays or changes, the transport company will make reasonable efforts to accommodate the revised arrival or departure time. Additional charges may apply where substantial waiting time or vehicle reallocation is required.
# Payment Terms
A 100% advance payment is required upon confirmation of the vehicle services.
For bookings to be confirmed within 07 days of the service date, full payment is required upon confirmation.
Vehicle arrangements will only be considered confirmed upon receipt of the required payment.
# Cancellation Policy
The following cancellation charges will apply based on the date written cancellation notice is received:
More than 14 days prior to service: No cancellation charge. Any refundable amount will be returned after deduction of applicable bank charges.
More than 08 days prior to service: No cancellation charge. Any refundable amount will be returned after deduction of applicable bank charges.
07 to 04 days prior to service: 50% of the confirmed vehicle hire value will be charged.
03 days or less prior to service: 100% of the confirmed vehicle hire value will be charged.
No Show: 100% of the confirmed vehicle hire value will be charged.
# Amendments
Requests to amend the vehicle type, passenger numbers, collection time, destination or itinerary should be made in writing. All amendments are subject to availability and may result in a revised rate.
# Waiting Time
Vehicles will be scheduled according to the confirmed itinerary and collection times. For airport transfers, reasonable waiting time will be provided in consideration of normal flight arrival procedures. Extended waiting caused by delays, immigration, baggage collection or other circumstances may result in additional charges where applicable.
# No Show and Late Cancellation
If passengers fail to appear at the agreed collection point without prior notice, the booking will be treated as a No Show and the full applicable vehicle charge will apply.
# Luggage
The quoted vehicle allocation is based on the passenger numbers.
# Force Majeure
The transport company shall not be held responsible for delays, cancellations or additional costs arising from circumstances beyond its reasonable control, including severe weather, natural disasters, road closures, strikes, civil disturbances, government restrictions, flight disruptions or other unforeseen circumstances. Every reasonable effort will nevertheless be made to assist the client and provide an appropriate alternative where possible.
# General
All services are subject to availability at the time of confirmation. The acceptance of the quotation and payment of the required deposit shall be deemed as acceptance of these Terms & Conditions.
# Conduct
Passengers are expected to behave in a respectful manner. The Transport Company reserves the right to refuse service where passenger behaviour is abusive, dangerous or unlawful.
# Damage
The client shall be responsible for any damage caused to the vehicle by passengers, excluding normal wear and tear. Repair or cleaning costs may be recovered from the client where applicable.
# Smoking
Smoking, vaping and the consumption of illegal substances inside the vehicle are strictly prohibited.
# Personal Belongings
The Transport Company accepts no responsibility for loss of or damage to passengers' personal belongings left in the vehicle.
# Journey Times
Journey times are estimates only. The Transport Company shall not be liable for delays caused by traffic congestion, accidents, road closures or other circumstances beyond its reasonable control.
# Bank Charges
All bank charges relating to payments and refunds shall be borne by the client unless otherwise agreed in writing.
# Acceptance of Terms & Conditions
By confirming the booking and making the required payment, the Client acknowledges that they have read, understood, and accepted these Terms & Conditions in full. These Terms & Conditions form an integral part of the service agreement between the Client and the Transport Company.
The Transport Company reserves the right to amend these Terms & Conditions at any time. However, any amendments will not affect bookings that have already been confirmed and paid for.
We thank you for choosing us and look forward to providing you with a safe, reliable, and professional transportation service throughout your journey in Sri Lanka.
Acceptance of this agreement shall become effective upon signature by the Client or upon written confirmation and receipt of the required payment.`,
};
