// The anon key is safe to publish: Row Level Security (schema.sql) blocks anyone not signed in.
export const CONFIG = {
  SUPABASE_URL: 'https://byllsqoonhejvuzuuwbr.supabase.co',        
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5bGxzcW9vbmhlanZ1enV1d2JyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMjQ3NDQsImV4cCI6MjEwOTcwMDc0NH0.xozQKIriZ7zCqUp4YvxYam1tEV2JTxaYOC8NQtqHvOg',
  CURRENCY: 'Rs',
  // Business details and bank info live in the database (Settings page), not here.
  PROVIDER: 'Shammi Travels, a subsidiary of Dulanjalee & Co.',
  PROVIDER_REG: 'PV: 00308562',
  // Terms editor format: "# Heading", "- bullet", "1. numbered", "| col | col" table rows (first row = header),
  // plain lines = paragraphs, and a line containing only {{bank}} prints the bank details from Settings.
  DEFAULT_TERMS: `# 1. Scope of Services
The Service Provider agrees to provide transportation services to the Client for university-related activities, including:
- Airport transfers and hotel transfers
- Daily transportation for university staff, students and guests
- City tours, excursions and other transportation requirements
All transportation services shall be arranged based on the Client’s confirmed itinerary and requirements.
# 2. Types of Vehicles Offered
The Service Provider shall provide suitable vehicles based on the number of passengers and the nature of the transportation service, subject to availability. Available vehicle categories include:
- Cars: Toyota Axio, Toyota Prius and similar vehicles
- Vans: 9-seater and 14-seater passenger vans
- Buses: 37-seater and 45-seater buses
All vehicles shall be maintained in roadworthy condition and operated by appropriately licensed drivers. The Service Provider reserves the right to provide an equivalent or upgraded vehicle when necessary, subject to prior communication with the Client.
# 3. Service Standards and Etiquette
The Service Provider agrees to maintain professional standards throughout the provision of transportation services. Drivers and representatives shall:
- Maintain professional, respectful and courteous behaviour at all times.
- Arrive at the agreed pickup location punctually.
- Maintain appropriate personal appearance and hygiene.
- Ensure vehicles are clean, comfortable and properly maintained.
- Drive safely and comply with applicable traffic laws and regulations.
- Respect the privacy, cultural differences and personal boundaries of all passengers.
- Refrain from smoking, consuming alcohol or engaging in inappropriate behaviour while providing services.
- Assist passengers with reasonable luggage handling and boarding requirements.
- Maintain confidentiality regarding the Client’s staff, students, guests and travel arrangements.
The Client agrees to ensure that passengers behave respectfully toward drivers and other personnel and comply with applicable vehicle safety requirements.
# 4. Booking and Confirmation
- The Client shall provide transportation requirements, including dates, times, pickup and drop-off locations, passenger numbers and special requirements.
- All services are subject to availability at the time of confirmation.
- A booking shall be considered confirmed only upon written acceptance by the Service Provider and receipt of the required payment in accordance with Clause 5.
- Any changes to confirmed bookings must be communicated as early as possible.
- Additional services or itinerary changes may result in additional charges, subject to prior agreement between the Parties.
# 5. Payment Terms
1. Transportation charges shall be based on the quotations agreed upon by both Parties.
2. A 100% advance payment is required upon confirmation of the vehicle services.
3. For bookings confirmed within seven (07) days of the service date, full payment is required immediately upon confirmation.
4. Vehicle arrangements will only be considered confirmed upon receipt of the required payment.
5. Payments shall be made in the currency specified in the relevant quotation or invoice.
6. Additional charges, including extended waiting time, additional mileage, parking, highway fees or itinerary changes, shall be communicated to and approved by the Client where applicable.
7. Any disputes concerning an invoice shall be communicated to the Service Provider within seven (7) days of receipt. Disputed charges shall be discussed and resolved between the Parties before the relevant service is provided, wherever reasonably practicable.
8. Undisputed amounts shall remain payable in accordance with these payment terms.
# 6. Cancellation Policy
The following cancellation charges will apply, based on the date written cancellation notice is received by the Service Provider:
| Notice received before service date | Cancellation charge
| 08 days or more | No cancellation charge. Any refundable amount will be returned after deduction of applicable bank charges.
| 07 to 04 days | 50% of the confirmed vehicle hire value
| 03 days or less | 100% of the confirmed vehicle hire value
| No Show | 100% of the confirmed vehicle hire value
# 7. Amendments
Requests to amend the vehicle type, passenger numbers, collection time, destination or itinerary should be made in writing. All amendments are subject to vehicle and driver availability and may result in a revised rate. The Service Provider shall make reasonable efforts to accommodate changes requested by the Client.
# 8. No Show and Late Cancellation
If passengers fail to appear at the agreed collection point without prior notice, the booking will be treated as a No Show and the full applicable vehicle charge will apply.
# 9. Luggage
The quoted vehicle allocation is based on the passenger numbers provided. The Client shall advise the Service Provider in advance of any excess or oversized luggage, as a larger or additional vehicle may be required at a revised rate.
# 10. Entrance Fees and Activities
Unless specifically stated, entrance fees, attraction fees, activity charges, safari fees, guide fees and other excursion-related costs are not included in vehicle hire rates. The quotation specifically excludes entrance fees.
# 11. Passenger Conduct and Vehicle Care
1. The Client shall be responsible for any damage caused to the vehicle by passengers, excluding normal wear and tear. Repair or cleaning costs may be recovered from the Client where applicable.
2. Smoking, vaping and the consumption of illegal substances inside the vehicle are strictly prohibited.
3. The Service Provider accepts no responsibility for loss of or damage to passengers’ personal belongings left in the vehicle.
# 12. Journey Times
Journey times are estimates only. The Service Provider shall not be liable for delays caused by traffic congestion, accidents, road closures or other circumstances beyond its reasonable control.
# 13. Responsibilities of the Service Provider
The Service Provider shall:
- Provide suitable vehicles and qualified drivers.
- Maintain appropriate vehicle insurance and required licences.
- Ensure compliance with applicable transportation and road safety regulations.
- Make reasonable efforts to provide reliable and punctual transportation services.
- Notify the Client promptly of any delays, breakdowns or unforeseen circumstances affecting the service.
- Arrange suitable alternative transportation where reasonably possible in the event of vehicle failure.
# 14. Responsibilities of the Client
The Client shall:
- Provide accurate booking details and passenger information.
- Ensure passengers are ready at the agreed pickup locations and times.
- Inform the Service Provider of any special requirements in advance.
- Make payments in accordance with Clause 5.
- Communicate complaints, service concerns or incidents promptly to the Service Provider.
- Ensure passengers comply with applicable safety requirements and behave respectfully toward drivers and other personnel.
# 15. Liability and Force Majeure
Each Party shall be responsible for its own acts and omissions in accordance with applicable law.
The Service Provider shall not be held responsible for delays, cancellations or additional costs arising from circumstances beyond its reasonable control, including severe weather, natural disasters, road closures, strikes, civil disturbances, government restrictions, flight disruptions or other unforeseen circumstances.
Every reasonable effort will nevertheless be made to assist the Client and provide an appropriate alternative where possible. The Parties shall communicate promptly regarding any circumstances affecting service delivery.
# 16. Bank Charges and Bank Details
All bank charges relating to payments and refunds shall be borne by the Client unless otherwise agreed in writing.
Payments shall be made to the following account:
{{bank}}
# 17. Agreement Term and Termination
This Agreement shall commence on the date of signing and shall remain in effect until terminated by either Party. Either Party may terminate this Agreement by providing thirty (30) days’ written notice to the other Party.
Any outstanding payments for services already provided, as well as applicable cancellation charges for confirmed bookings, shall remain payable following termination.
# 18. Governing Law
This Agreement shall be governed by and interpreted in accordance with the laws of Sri Lanka, unless otherwise mutually agreed in writing by the Parties.
# 19. General
All services are subject to availability at the time of confirmation.
The Service Provider reserves the right to amend these terms at any time. Any amendments will not affect bookings that have already been confirmed and paid for.
Any other amendment to this Agreement shall be made only by mutual written agreement between the Parties.
# 20. Acceptance of Terms and Conditions
By confirming a booking and making the required payment, the Client acknowledges that they have read, understood and accepted these terms and conditions in full. These terms form an integral part of the service agreement between the Client and the Service Provider.
Acceptance of this Agreement shall become effective upon signature by the Client, or upon written confirmation and receipt of the required payment.
We thank you for choosing Shammi Travels and look forward to providing a safe, reliable and professional transportation service throughout your journey in Sri Lanka.`,
};
