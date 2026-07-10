"""
JourneyAI Travel Knowledge Base
Structured semantic chunks for vector database indexing (RAG retrieval).
"""

TRAVEL_CHUNKS = [
    # GOA
    {"id": "goa_north_beaches", "dest": "Goa", "cat": "attractions",
     "text": "NORTH GOA BEACHES: Baga Beach is famous for water sports, beach shacks, and nightlife. Anjuna Beach hosts the legendary Wednesday Flea Market with handicrafts. Calangute Beach is the most popular tourist beach. Vagator Beach has dramatic red laterite cliffs. Morjim Beach is a turtle nesting site for Olive Ridley sea turtles."},
    {"id": "goa_south_beaches", "dest": "Goa", "cat": "attractions",
     "text": "SOUTH GOA BEACHES: Palolem Beach is a crescent-shaped cove, most scenic in South Goa, perfect for swimming. Agonda Beach is serene with minimal crowds. Cabo de Rama Fort offers dramatic ocean cliff views. Butterfly Beach near Palolem can only be reached by boat."},
    {"id": "goa_heritage", "dest": "Goa", "cat": "attractions",
     "text": "GOA HERITAGE: Basilica of Bom Jesus is a UNESCO World Heritage site holding relics of St. Francis Xavier. Se Cathedral is one of Asia's largest churches. Fontainhas Latin Quarter in Panaji is Goa's oldest neighbourhood with Portuguese-style coloured houses."},
    {"id": "goa_food", "dest": "Goa", "cat": "food",
     "text": "GOA FOOD: Britto's at Baga Beach for seafood. Local dishes include fish curry rice, prawn balchao, Bebinca layered dessert, xacuti curry, vindaloo, and feni cashew liquor. Martin's Corner in Betalbatim is famous for fish curry and prawn dishes."},
    {"id": "goa_transport", "dest": "Goa", "cat": "transport",
     "text": "GOA TRANSPORT: Scooter or bike rental is 300-500 rupees per day and most popular. Taxis charge 200-500 rupees per trip. KTC buses run between major towns for 15-40 rupees. Ferry boats cross the Mandovi river for 5-10 rupees. Best way to explore is by renting a scooter."},
    {"id": "goa_budget", "dest": "Goa", "cat": "budget",
     "text": "GOA BUDGET: Budget 1500-2500 rupees per day includes hostel and local food. Standard comfort is 3000-5000 rupees per day. Luxury 8000 rupees and above. Best time to visit is November to March. Avoid June to September monsoon when many businesses close."},
    # RAJASTHAN
    {"id": "jaipur_attractions", "dest": "Jaipur", "cat": "attractions",
     "text": "JAIPUR ATTRACTIONS: Amer Fort is a must-visit with elephant rides at sunrise for 900 rupees and the Sheesh Mahal mirror palace inside. Hawa Mahal has 953 windows designed for royal ladies. Jantar Mantar is a UNESCO astronomical observatory. City Palace is a living palace-museum. Nahargarh Fort gives the best Jaipur sunset view. Jal Mahal is a palace floating on Man Sagar Lake."},
    {"id": "jaipur_food", "dest": "Jaipur", "cat": "food",
     "text": "JAIPUR FOOD: LMB at Johari Bazaar is famous for dal baati churma. Rawat Mishthan Bhandar serves legendary pyaaz kachori. Masala Chowk is an open-air food court with 25 stalls. Chokhi Dhani cultural village offers unlimited authentic Rajasthani dinner with folk entertainment for 900 rupees."},
    {"id": "udaipur_attractions", "dest": "Udaipur", "cat": "attractions",
     "text": "UDAIPUR ATTRACTIONS: City Palace is the largest palace in Rajasthan with entry 250 rupees. Lake Pichola Boat Ride to Jag Mandir island palace costs 700 rupees for 30 minutes. Sajjangarh Monsoon Palace on a hilltop has panoramic views. Bagore ki Haveli hosts traditional cultural shows daily at 7PM for 150 rupees."},
    {"id": "udaipur_food", "dest": "Udaipur", "cat": "food",
     "text": "UDAIPUR FOOD: Ambrai Ghat Restaurant is lakeside with stunning City Palace views. Natraj Dining Hall serves unlimited Rajasthani thali with 20 dishes for 300-400 rupees. Millets of Mewar is a health-conscious rooftop restaurant. Jagat Niwas Palace rooftop offers heritage dining."},
    # KERALA
    {"id": "alleppey_houseboat", "dest": "Alleppey", "cat": "attractions",
     "text": "ALLEPPEY HOUSEBOAT EXPERIENCE: Overnight houseboat cruises on Kerala backwaters are the signature experience. Traditional thatched rice boats cruise through Vembanad Lake and narrow canals. Premium houseboats include AC bedroom and kitchen. Price is 8000-25000 rupees per night for two people including all meals. Snake boat races happen in August and September."},
    {"id": "munnar_attractions", "dest": "Munnar", "cat": "attractions",
     "text": "MUNNAR ATTRACTIONS: Munnar Tea Gardens are vast rolling tea-covered hills most picturesque in early morning mist. Eravikulam National Park is home to the endangered Nilgiri Tahr mountain goat with entry 200 rupees. Anamudi Peak at 2695 metres is South India's highest mountain. Temperature is 8-28 degrees Celsius year-round."},
    {"id": "kerala_food", "dest": "Kerala", "cat": "food",
     "text": "KERALA FOOD: Sadya is a traditional vegetarian feast on banana leaf with rice and 20 curries served during Onam. Karimeen fish pollichathu cooked in banana leaf is a Kerala specialty. Appam with stew for breakfast. Puttu and kadala curry. Thalassery biryani is a unique North Kerala rice dish."},
    {"id": "kerala_transport", "dest": "Kerala", "cat": "transport",
     "text": "KERALA TRANSPORT: KSRTC AC buses are comfortable between cities for 100-400 rupees. Local buses cost 5-50 rupees. Within backwaters use public ferries and country boats. Auto-rickshaws for short distances 60-200 rupees. Hire private car for Munnar and hill stations for 2000-4000 rupees per day. Kochi has a metro system."},
    # HIMACHAL
    {"id": "manali_attractions", "dest": "Manali", "cat": "attractions",
     "text": "MANALI ATTRACTIONS at 2050 metres altitude: Solang Valley is the adventure hub for paragliding, zorbing, snowmobiling, and snowboarding in winter costing 500-3000 rupees per activity. Rohtang Pass requires a green permit costing 550 rupees bookable online. Hadimba Devi Temple is a 16th-century wooden temple in deodar cedar forest. Vashisht Hot Springs has sulfur hot water baths. Jogini Waterfalls is a 45-minute trek from Vashisht."},
    {"id": "manali_food", "dest": "Manali", "cat": "food",
     "text": "MANALI FOOD: Johnson's Cafe is famous for wood-fired trout fish and continental cuisine in a garden setting costing 600-1200 rupees per person. Cafe 1947 in Old Manali is a riverside outdoor cafe with Tibetan food and wood-fired pizza. Local Himachali food includes siddu stuffed bread with walnut filling, Kullu trout fish, and madra white chickpea curry."},
    # LADAKH
    {"id": "leh_attractions", "dest": "Leh", "cat": "attractions",
     "text": "LEH ATTRACTIONS at 3500 metres altitude: Leh Palace is a 9-storey 17th-century royal palace overlooking Leh city. Shanti Stupa is a white peace pagoda on a hilltop with 360-degree views. Hemis Monastery is the largest monastery in Ladakh. Pangong Tso Lake is 5 hours from Leh, an azure-blue salt lake at 4350 metres, famous from the 3 Idiots film. Nubra Valley via Khardung La Pass at 5359 metres has Hunder Sand Dunes with Bactrian camels."},
    {"id": "ladakh_tips", "dest": "Ladakh", "cat": "safety",
     "text": "LADAKH HEALTH AND PERMIT TIPS: Acclimatize in Leh for at least 2 full days before trekking or going to high-altitude sites. Avoid alcohol and strenuous activity for first 48 hours. Diamox tablet helps with altitude sickness. Inner Line Permit is required for Nubra Valley, Pangong Tso, and Tso Moriri costing 400 rupees plus agent fees. Best time to visit is June to September. Roads closed November to April."},
    # VARANASI
    {"id": "varanasi_ghats", "dest": "Varanasi", "cat": "attractions",
     "text": "VARANASI GHATS: Dashashwamedh Ghat hosts the spectacular Ganga Aarti ceremony every evening at 6:30PM with 10 priests performing fire rituals to thousands of people. Manikarnika Ghat is the sacred Hindu cremation ghat operating 24 hours a day. Assi Ghat Aarti at sunrise 5:30AM is called Subah-e-Banaras. Sunrise boat ride on the Ganga is the most iconic Varanasi experience."},
    {"id": "varanasi_food", "dest": "Varanasi", "cat": "food",
     "text": "VARANASI FOOD: Blue Lassi Shop near Vishwanath Temple has been serving thick creamy lassi since 1925 for 60-100 rupees. Kachori Gali serves kachori sabzi for breakfast, a Banarasi morning ritual costing 30-50 rupees. Deena Chaat Bhandar serves tamatar chaat tangy tomato spicy snack. Banarasi paan betel leaf with multiple fillings is a post-meal tradition."},
    # MUMBAI
    {"id": "mumbai_attractions", "dest": "Mumbai", "cat": "attractions",
     "text": "MUMBAI ATTRACTIONS: Gateway of India is the iconic 1924 archway on the waterfront. Elephanta Caves are UNESCO ancient rock-cut cave temples on an island accessible by 1-hour ferry from Gateway for 200 rupees return. CST railway station is a stunning UNESCO Gothic building. Marine Drive is a 3.6km beachfront promenade best at sunset. Dharavi guided tour is 600-1200 rupees."},
    # DELHI
    {"id": "delhi_attractions", "dest": "Delhi", "cat": "attractions",
     "text": "DELHI ATTRACTIONS: Red Fort is a massive 17th-century Mughal fort with entry 500 rupees. Qutub Minar is a UNESCO 73-metre minaret. India Gate is a war memorial. Humayun's Tomb is a UNESCO precursor to the Taj Mahal design. Lotus Temple is architecturally stunning and open to all for free. Chandni Chowk bazaar for shopping and street food."},
    {"id": "delhi_food", "dest": "Delhi", "cat": "food",
     "text": "DELHI FOOD: Karim's in Old Delhi since 1913 serves legendary Mughlai mutton korma and seekh kebabs for 300-600 rupees per person. Paranthe Wali Gali in Chandni Chowk has 200-year-old parantha shops. Indian Accent is top-rated contemporary Indian fine dining for 3000-5000 rupees. Bukhara at ITC Maurya is famous for dal bukhara slow-cooked overnight lentils."},
    # AGRA
    {"id": "agra_taj_mahal", "dest": "Agra", "cat": "attractions",
     "text": "TAJ MAHAL VISIT TIPS: Entry is 1100 rupees for Indians and 1300 rupees for foreigners. Best time is sunrise 6-8AM for golden light and fewest crowds. Friday the Taj is CLOSED. No photography inside the main mausoleum. Pre-book tickets online. Agra Fort entry is 550 rupees. Mehtab Bagh across the river is the best sunset Taj view spot without crowds for 300 rupees."},
    # ANDAMAN
    {"id": "andaman_attractions", "dest": "Andaman", "cat": "attractions",
     "text": "ANDAMAN ISLANDS: Radhanagar Beach on Havelock Island is rated Asia's best beach by Time magazine. Cellular Jail in Port Blair is a colonial-era prison and memorial. Scuba diving at Havelock with world-class coral reefs costs 3500-5000 rupees per session. Neil Island is quieter and ideal for snorkeling for 500-800 rupees. Ross Island has ruins of British colonial headquarters."},
    # GENERAL INDIA
    {"id": "india_train_travel", "dest": "India", "cat": "transport",
     "text": "INDIA TRAIN TRAVEL: Book tickets on IRCTC app or irctc.co.in. Classes include AC 2-Tier costing 500-2000 rupees, AC 3-Tier costing 300-1000 rupees, and Sleeper costing 150-400 rupees. Rajdhani and Shatabdi Express are premium fast trains. Book at least 2 weeks ahead. Tatkal quota opens 2 days before departure with a surcharge."},
    {"id": "india_safety", "dest": "India", "cat": "safety",
     "text": "INDIA SAFETY TIPS: Emergency number is 112. Police is 100. Ambulance is 102. Tourist Helpline is 1800-111-363. Be aware of pickpockets in crowded markets. Use Uber or Ola app instead of unmetered taxis. Keep photocopies of your passport and visa. Drink only bottled water. Eat freshly cooked hot food."},
    {"id": "india_budget", "dest": "India", "cat": "budget",
     "text": "INDIA BUDGET per person per day excluding intercity travel: Budget backpacker 1000-1800 rupees covers hostel dorm, local dhabas, and local transport. Standard comfort 2500-5000 rupees covers budget hotel with AC, restaurants, and some taxis. Premium 8000-20000 rupees covers heritage hotels and fine dining. Best season for north India is October to March."},
    {"id": "india_festivals", "dest": "India", "cat": "culture",
     "text": "INDIA FESTIVALS: Holi in February-March is best experienced in Mathura, Vrindavan, and Jaipur - it is a colour powder festival. Diwali in October-November has spectacular fireworks and diyas on the Ganges in Varanasi. Pushkar Camel Fair in November in Rajasthan. Onam in August-September in Kerala is a harvest festival with Sadya feast and snake boat races. Hornbill Festival in December in Nagaland is a tribal cultural showcase."},
    {"id": "meghalaya_attractions", "dest": "Meghalaya", "cat": "attractions",
     "text": "MEGHALAYA ATTRACTIONS: Living Root Bridges of Cherrapunji are centuries-old bridges made from tree roots by the Khasi tribe requiring a 2-hour trek. Dawki River has crystal-clear water where you can see the riverbed 10 metres deep. Nohkalikai Falls at 340 metres is India's tallest plunge waterfall. Shillong has Ward's Lake and Don Bosco Museum."},
    {"id": "jaisalmer_attractions", "dest": "Jaisalmer", "cat": "attractions",
     "text": "JAISALMER GOLDEN CITY: Jaisalmer Fort is a living fort where people still live inside. Patwon ki Haveli has intricate golden sandstone carvings. Sam Sand Dunes 42km away offers camel safari at sunset and overnight desert camp with folk music costing 500-2500 rupees. Gadisar Lake has temples and morning boat rides. Kuldhara Ghost Village 18km away is an abandoned village with paranormal legends."},
]
