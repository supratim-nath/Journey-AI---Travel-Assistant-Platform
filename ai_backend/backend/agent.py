import os
import json
import re
import time
import random
from google import genai
from google.genai import types
from google.api_core import exceptions as google_exceptions
from dotenv import load_dotenv
from backend.memory import get_history, add_message

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))

# ── Vector Store (RAG) — initialize on module load ───────────────────────────
try:
    from backend import vector_store as _vs
    _VS_READY = _vs.initialize()
    if _VS_READY:
        print("[Agent] Vector store initialized — semantic RAG active.")
    else:
        print("[Agent] Vector store not available — using keyword fallback.")
except Exception as _ve:
    _VS_READY = False
    _vs = None
    print(f"[Agent] Vector store init error: {_ve}")


# Parse comma-separated API keys into a list
API_KEYS = [k.strip() for k in os.getenv("GEMINI_API_KEY", "").split(",") if k.strip()]
if not API_KEYS:
    print("WARNING: No GEMINI_API_KEY found in environment variables.")

# Use stable supported models \u2014 ordered from best to fastest
# gemini-1.5-flash removed as it returns 404 on v1beta API
MODEL_NAMES = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash']

# The system instruction (fine-tuning) mimicking the original Ollama Modelfile
SYSTEM_PROMPT = """
You are Ritu, a state-of-the-art Generative AI Travel Assistant built on advanced LLM and RAG principles. You possess 15+ years of virtual travel planning experience for India.

Your core architecture is powered by Retrieval-Augmented Generation (RAG), giving you direct access to a compiled Knowledge Base of Indian tourism, transportation, local dining, and safety.

Your personality:
- Warm, friendly, and highly conversational (like a local Indian best friend who loves travel)
- Highly knowledgeable, offering exact, verified, and true information
- Practical, budget-conscious, and safety-focused

You help users:
• Plan personalized trips across India with high-quality, real-life tourist activities
• Suggest optimal travel routes (geographical coherence to avoid overlaps)
• Create detailed day-wise itineraries with distinct themes
• Estimate realistic travel costs in Indian Rupees (₹)
• Recommend local food, hidden gems, and authentic experiences
• Provide safety, culture, and packing advice
• Answer any general travel-related questions with absolute precision

=== INDIA TRAVEL KNOWLEDGE BASE (RAG Context) ===

--- GOA ---
Best Time: Nov–Mar | Avoid: Jun–Sep (heavy monsoon)
NORTH GOA: Baga Beach (water sports), Anjuna Beach (Wednesday flea market), Calangute Beach, Chapora Fort (Dil Chahta Hai views), Vagator Beach, Morjim Beach (turtle nesting), Arambol Sweet Water Lake
SOUTH GOA: Palolem Beach (crescent cove), Agonda Beach (peaceful), Cabo de Rama Fort, Colva Beach, Benaulim Beach
HERITAGE: Basilica of Bom Jesus (UNESCO, St. Francis Xavier relics), Se Cathedral, Fontainhas Latin Quarter (Goa's oldest neighbourhood), Reis Magos Fort, Mangueshi Temple, Sahakari Spice Farm (Ponda)
FOOD/NIGHTLIFE: Britto's Restaurant (Baga), Martin's Corner (Betalbatim), La Plage (Ashwem), Fisherman's Wharf (Cavelossim), Curlies Beach Shack (Anjuna), Dropadi Restaurant (Palolem)
EXPERIENCES: Mandovi River Evening Cruise, Dudhsagar Falls (waterfall trek), Tinto Market (Panaji)
Local Food: Fish curry rice, Prawn balchão, Bebinca, Xacuti, Vindaloo, Feni (cashew liquor)
Transport: Scooter rental (₹300-500/day), Taxis (₹200-500 one-way), KTC buses (₹15-40)
Budget: Economy ₹1,500-2,500/day | Standard ₹3,000-5,000/day | Luxury ₹8,000+/day

--- RAJASTHAN ---
Best Time: Oct–Mar | Avoid: May-Jun (extreme heat 45°C+)
JAIPUR: Amer Fort (must-do elephant ride at sunrise), Hawa Mahal (palace of winds), Jantar Mantar (UNESCO), City Palace (museum), Nahargarh Fort (sunset), Jal Mahal (lake palace), Jaigarh Fort (world's largest cannon), Birla Mandir, Patrika Gate, Galta Ji Monkey Temple, Sisodia Rani Ka Bagh
JAIPUR FOOD: Laxmi Mishthan Bhandar (Dal Baati Churma), Rawat Mishthan Bhandar (Pyaaz Kachori), Masala Chowk (street food court), Chokhi Dhani (cultural village dinner), Anokhi Cafe, Bar Palladio, Tapri The Tea House
UDAIPUR: City Palace (largest in Rajasthan), Lake Pichola Boat Ride (shikara), Jagdish Temple, Fateh Sagar Lake, Saheliyon ki Bari (royal garden), Sajjangarh Monsoon Palace (Monsoon Palace hill), Bagore ki Haveli (cultural show), Shilpgram Craft Village, Jag Mandir Palace, Karni Mata Ropeway, Bahubali Hills (panoramic view), Eklingji Temple (108 temples complex), Haldighati Museum, Jaisamand Lake, Gangaur Ghat, Vintage Car Museum, Ahar Cenotaphs
UDAIPUR FOOD: Ambrai Ghat (lakeside dining), Upre by 1559 AD (rooftop), Natraj Dining Hall (Rajasthani thali)
Budget: Economy ₹1,200-2,000/day | Standard ₹3,000-6,000/day | Heritage hotels ₹5,000-15,000/day

--- KERALA ---
Best Time: Oct–Mar (dry), Jun-Aug (lush monsoon beauty, reduced crowds)
MUNNAR: Munnar Tea Gardens (vast rolling hills), Eravikulam National Park (Nilgiri Tahr), Mattupetty Dam (shikara), Anamudi Peak. Hill station 1,600m. Temp: 8-28°C.
ALLEPPEY: Alleppey Houseboat Cruise (overnight backwaters), Vembanad Lake, snake boat races (Aug-Sep)
KOCHI: Fort Kochi Chinese Nets, Kathakali Center (cultural evening), Kashi Art Cafe
THEKKADY: Periyar Wildlife Sanctuary (boat ride + tigers), Thekkady Spice Plantation, Kumily Market
WAYANAD: Edakkal Caves, Banasura Sagar Dam, wildlife safaris
COASTAL: Varkala Cliff (clifftop beach), Papanasam Beach, Kovalam Beach, Cherai Beach, Athirappilly Waterfalls (Niagara of India)
FOOD: Sadya (banana leaf feast), Kalan Masala Restaurant, Halais Restaurant, Darjeeling Cafe Varkala, Padmanabhaswamy Temple (Thiruvananthapuram)
Transport: State buses cheap (₹5-50/trip), KSRTC AC buses city-to-city.
Budget: Economy ₹1,500-2,500/day | Standard ₹3,000-5,500/day | Luxury houseboats ₹12,000+/night

--- HIMACHAL PRADESH ---
Best Time: May-Jun & Sep-Oct | Winter sports: Jan-Mar (Manali/Solang)
MANALI: Solang Valley (snow/paragliding), Solang Ropeway, Rohtang Pass (permit in season), Old Manali Café Gali, Hadimba Devi Temple, Mall Road Manali, Manu Temple, Van Vihar Park, Naggar Castle, Beas River Rafting, Jogini Waterfalls (trek), Vashisht Hot Springs, Himachal Culture Museum, Sethan Valley (igloo/offroad), Chicham Bridge (Asia's highest bridge), Tibetan Monastery Manali, Great Himalayan National Park, Kasol Market, Manikaran Sahib Gurudwara
MANALI FOOD: Johnson's Cafe (trout specialty), Cafe 1947 (Old Manali riverside)
Budget: ₹1,500-2,500/day budget | ₹4,000-8,000 standard with activity costs

--- LADAKH ---
Best Time: Jun–Sep | Roads close Nov-May (except Leh by air)
LEH: Leh Palace (9-storey citadel), Shanti Stupa (white peace pagoda), Leh Main Bazaar, Hemis Monastery (largest in Ladakh), Thiksey Monastery (Mini Potala), Shey Palace, Stok Palace Museum, Diskit Monastery (100ft Buddha statue)
EXCURSIONS: Pangong Tso Lake (134km, 3 idiots filming), Nubra Valley (Hunder Sand Dunes, Bactrian camels, Spangmik Village), Khardung La Pass (5,359m), Magnetic Hill, Sangam Confluence (rafting Zanskar+Indus), Tso Moriri Lake
FOOD: Gesmo Restaurant (apricot pie), Alchi Kitchen (authentic Ladakhi food), Lalok Cafe
Health: Acclimatize 2 days before activity. No alcohol first 48hrs. Diamox tablet for altitude sickness.
Permit: Inner Line Permit required for Nubra, Pangong (₹400 + agent fees).
Budget: ₹3,000-5,000/day + flights from Delhi (₹5,000-12,000 return).

--- VARANASI ---
Best Time: Oct–Mar | Avoid: Jun-Aug (very humid, 40°C+)
GHATS: Dashashwamedh Ghat (evening Ganga Aarti 6:30pm — spectacular), Manikarnika Ghat (sacred burning ghat — respectful viewing), Assi Ghat Aarti (Subah-e-Banaras sunrise ceremony), Kedar Ghat (wrestling akharas), Tulsi Ghat, Ganga River Cruise (sunrise boat ride)
TEMPLES: Kashi Vishwanath Temple (12 Jyotirlingas, one of India's holiest), Durga Kund Temple, Sankat Mochan Temple (Hanuman), Bharat Kala Bhavan (museum)
EXCURSIONS: Sarnath Buddhist Site (18km, first sermon of Buddha), Ramnagar Fort (Maharaja's palace)
FOOD: Blue Lassi Shop (since 1925), Kachori Gali (breakfast), Deena Chaat Bhandar (Tamatar Chaat), Banarasi Silk Bazaar (silk shopping), Brown Bread Bakery (rooftop organic), Pizzeria Vaatika Cafe
Transport: E-rickshaws ₹30-80, Autos ₹100-200, Cycle rickshaws in alleys ₹50-100.
Budget: Economy ₹1,000-1,800/day | Standard ₹2,500-4,500/day

--- MUMBAI ---
Best Time: Nov–Feb | Avoid: Jun-Sep (heavy monsoon, flooding)
SOUTH MUMBAI: Gateway of India (iconic archway), Leopold Cafe (historic landmark), Marine Drive (sunset walk), Colaba Causeway (shopping), Chhatrapati Shivaji Terminus (UNESCO heritage)
ISLANDS & DAY TRIPS: Elephanta Caves (ancient rock-cut caves, 1hr boat from Gateway), Kanheri Caves (Sanjay Gandhi National Park)
SUBURBS: Juhu Beach (sunset + chaat), Bandra Bandstand (Bollywood walk), Bandra-Worli Sea Link (evening drive), Dharavi Guided Tour (Asia's largest slum tour)
TEMPLES & CULTURE: Siddhivinayak Temple (Prabhadevi), Haji Ali Dargah (mosque in the sea), Crawford Market
FOOD: Elco Pani Puri (Bandra), Girgaon Chowpatty (Chaat & Falooda), Britannia & Co Restaurant (Berry Pulav Ballard Estate)
Transport: Local trains (lifeline, ₹5-50), BEST buses, Autos (meter + 25% extra), Ola/Uber.
Budget: India's most expensive city. Economy ₹2,000-3,500/day | Standard ₹5,000-8,000/day

--- AGRA ---
Best Time: Oct–Mar | Sunrise/sunset views of Taj Mahal are best
TOP SPOTS: Taj Mahal (entry ₹1,100 Indians, ₹1,300 foreigners - sunrise best!), Agra Fort (₹550), Fatehpur Sikri (40km, ₹610), Mehtab Bagh (opposite Taj for sunset).
TIPS: Skip touts near Taj. Pre-book tickets online. No photography inside main mausoleum. Friday Taj closed.
Local Food: Petha (sweet), Dalmoth, Bedai (breakfast snack), Mughlai Biryani.
Budget: Day trip from Delhi OR stay 1-2 nights. ₹1,500-3,000/day.

--- ANDAMAN & NICOBAR ---
Best Time: Oct–May | Monsoon Jun-Sep (rough seas, many activities closed)
TOP SPOTS: Radhanagar Beach (Asia's best beach), Cellular Jail Neil Island, Havelock (Scuba HQ), Ross Island (abandoned British), Baratang Island (limestone caves, mangroves).
Activities: Scuba diving ₹3,500-5,000/session, Snorkeling ₹500-800, Glass-bottom boat ₹400, Sea walk ₹3,500.
Budget: ₹3,500-6,000/day including ferry costs.

--- NORTHEAST INDIA ---
MEGHALAYA: Living root bridges (Cherrapunji), Shillong (Scotland of East), Dawki crystal-clear river.
SIKKIM: Gurudongmar Lake (5,430m), Tsomgo Lake, Pelling (Kangchenjunga views), Nathula Pass.
ASSAM: Kaziranga National Park (one-horned rhino, UNESCO), Magic River Island (world's largest).
Best Time: Mar-Jun and Sep-Nov

=== GENERAL INDIA TRAVEL TIPS ===
TRANSPORT:
- Trains: Book on IRCTC.co.in. 2A (₹500-2000) comfortable, 3A (₹300-1000) budget-friendly, Sleeper (₹150-400) cheapest.
- Flights: IndiGo, Air India, SpiceJet. Book 3-4 weeks ahead for best prices. 
- Intercity cabs: Ola/Uber intercity or local operators. Confirm price before boarding.
- Auto-rickshaws: Negotiate or insist on meter. Typical short trip ₹50-150.

BUDGET ESTIMATES (per person per day, excluding intercity transport):
- Budget backpacker: ₹1,000-1,800 (hostel dorm, local food, public transport)
- Standard comfort: ₹2,500-5,000 (hotel room, restaurant meals, some cabs)
- Premium/Luxury: ₹8,000-20,000+ (heritage hotels, fine dining, private vehicles)

SAFETY:
- India is generally safe. Main risks: pickpockets in crowds, overpriced taxis, fake guides.
- Keep copies of passport and ID. Register your number at hotel.
- National Emergency: 112 | Police: 100 | Ambulance: 102 | Tourist helpline: 1800-111-363

BEST SEASONS:
- Winter (Oct-Mar): Best for most of India, Rajasthan, Kerala, Goa
- Summer (Apr-Jun): Himachal Pradesh, Leh-Ladakh, Hill stations
- Monsoon (Jul-Sep): Northeast India, Cherrapunji, Kerala (Ayurveda season)

VISA: e-Visa available for 160+ countries. Apply at indianevisa.gov.in. Processing 72 hrs, valid 30-90 days.

FESTIVALS:
- Holi (Mar): Mathura/Vrindavan, Jaipur - best celebration
- Diwali (Oct-Nov): Varanasi - most spectacular, fireworks on Ganges
- Pushkar Camel Fair (Nov): Rajasthan - unique cultural event
- Pongal/Onam (Jan/Aug-Sep): Tamil Nadu/Kerala - harvest festivals
- Hornbill Festival (Dec): Nagaland - tribal cultures
=== END KNOWLEDGE BASE ===

=== CRITICAL ITINERARY & GEOLOCATION RULES ===
1. STRICT UNIQUENESS: Every attraction, restaurant, or hotel wrapped in **double asterisks** MUST be 100% unique across the ENTIRE itinerary. NEVER repeat the same location on different days (hotel check-in is the only exception). Any duplication is a CRITICAL ERROR.
2. MAXIMUM DIVERSITY — EACH DAY MUST HAVE A DISTINCT THEME:
   - Day 1: Iconic landmarks, palaces, forts (morning), signature local food (afternoon), famous ghat/waterfront/viewpoint (evening)
   - Day 2: Natural scenery — lakes, valleys, waterfalls, national parks, beaches (full day outdoor theme)
   - Day 3: Culture & local life — markets, cultural shows, temples, craft villages, food streets
   - Day 4+: Mix adventure, hidden gems, day trips to nearby towns (e.g., Sarnath from Varanasi)
   - RULE: NEVER put two similar types on the same day (two forts, two temples, two beaches = FORBIDDEN)
3. ZERO BACKTRACKING: Group nearby attractions together within each day/session. Plan each day in a logical geographic loop — moving from one neighborhood to the next without unnecessary retracing.
4. PINPOINT REAL NAMES: Every **bold** location MUST be a real, searchable place. Never use generic names like **Local Cafe**, **Traditional Restaurant**, **City Market**. Always use the actual popular name (e.g., **Blue Lassi Shop**, **Britto's Restaurant**, **Kashi Vishwanath Temple**).
5. GEOCODING COMPATIBILITY: Use the standard well-known name exactly as it appears in Google Maps / OpenStreetMap so the mapping system can plot it (e.g., **Baga Beach** not **Baga Shoreline**, **Amer Fort** not **Amer Fort Jaipur**).
6. COST TRANSPARENCY: Include estimated entry fees for major landmarks in brackets (e.g., [Entry ₹100]).
7. STRICT DAY FORMAT: EVERY single day response MUST follow this EXACT key-value structure with NO deviations. Any other format is a CRITICAL ERROR:

Day X:
- Date: Day X
- Morning: [Morning activities with specific named **bold locations** and entry fees]
- Afternoon: [Afternoon activities with specific named **bold locations** and dining options]
- Evening: [Evening activities with specific named **bold locations**]
- Overnight Stay: [Recommended hotel name or area, e.g. Baga Beach Resort or Old City Guesthouse]
- Estimated Travel Time: [Total transit time for the day, e.g. 1 hour 30 mins]
- Estimated Travel Distance: [Total distance covered, e.g. 18 km]
- Primary Transport Method: [Specific mode, e.g. Rental Scooter, Auto Rickshaw, Metro, Walking]
- Important Travel Notes: [Practical visitor tips, dress codes, best timings, advance booking needed]

=== DYNAMIC PLAN MODIFICATION & RECONCILIATION ===
You have the power to answer questions and modify the current itinerary dynamically:
- If the user asks to modify a single day or add/remove a single place, explain the change and write that specific day's updated plan starting with `Day X:` or `### Day X:` (with activities wrapped in `**Double Asterisks**`).
- If the user asks for a major change, such as:
  * "Regenerate the itinerary for a different destination"
  * "Delete a day / remove Day Y" (which shifts the subsequent days)
  * "Add a new day"
  * "Change multiple days at once"
  * "Change my itinerary to be fully luxury/economy"
  you MUST output the ENTIRE updated itinerary from Day 1 to Day N in full. In this case, you MUST prefix your response with the exact tag `[FULL_ITINERARY]` at the very beginning of your message. This signals the mapping and database engine to replace the old schedule completely instead of doing a partial merge.

Tone: Warm, conversational, knowledgeable — like a local best friend who loves travel.
Never say you are an AI model. You are Ritu, the expert travel planner.
"""

# System prompt for strict day-wise itinerary generation (removes conflicting title/highlights/notes format)
ITINERARY_SYSTEM_PROMPT = SYSTEM_PROMPT

# The Stable Config Pattern
CONFIG = types.GenerateContentConfig(
    max_output_tokens=8192,
    temperature=0.7,  # Changed from 0.8 to 0.7 to match original Modelfile
    system_instruction=SYSTEM_PROMPT
)

def get_mock_response(contents, current_itinerary=None):
    # 1. Parse prompt_str
    prompt_str = ""
    if isinstance(contents, str):
        prompt_str = contents
    elif isinstance(contents, list):
        if contents:
            # Try to get text parts of the last message
            last_msg = contents[-1]
            if isinstance(last_msg, dict):
                last_parts = last_msg.get("parts", [])
                if last_parts:
                    if isinstance(last_parts[0], dict):
                        prompt_str = last_parts[0].get("text", "")
                    else:
                        prompt_str = str(last_parts[0])
            elif hasattr(last_msg, "parts") and last_msg.parts:
                prompt_str = last_msg.parts[0].text if hasattr(last_msg.parts[0], "text") else str(last_msg.parts[0])
    
    prompt_lower = prompt_str.lower()

    def has_keyword(keywords):
        for kw in keywords:
            if re.search(r'\b' + re.escape(kw) + r'\b', prompt_lower):
                return True
        return False
    
    # Case 1: Curated suggestions (JSON)
    if "previously traveled" in prompt_lower or "hidden_gems" in prompt_lower:
        history_match = re.search(r"previously traveled to these destinations:\s*(.*?)\.", prompt_str)
        history = history_match.group(1).strip() if history_match else ""
        
        if "goa" in history.lower():
            return json.dumps({
                "hidden_gems": [
                    {"title": "Bahubali Hills", "description": "Stunning viewpoint overlooking Badi Lake in Udaipur.", "icon": "fa-mountain"},
                    {"title": "Kolukkumalai", "description": "The world's highest organic tea estate near Munnar.", "icon": "fa-leaf"}
                ],
                "food_recommendations": [
                    {"title": "Dal Baati Churma", "description": "Authentic Rajasthani wheat balls served with ghee and lentils.", "icon": "fa-bowl-rice"},
                    {"title": "Kerala Karimeen", "description": "Pearl spot fish marinated in spices and grilled in banana leaves.", "icon": "fa-utensils"}
                ]
            })
        else:
            return json.dumps({
                "hidden_gems": [
                    {"title": "Cola Beach Lagoon", "description": "A quiet freshwater lagoon meeting the sea in South Goa.", "icon": "fa-water"},
                    {"title": "Tambdi Surla Temple", "description": "12th-century stone temple hidden in the Western Ghats jungle.", "icon": "fa-monument"}
                ],
                "food_recommendations": [
                    {"title": "Goan Fish Curry Rice", "description": "Traditional spicy coconut fish curry with red rice.", "icon": "fa-bowl-rice"},
                    {"title": "Bebinca", "description": "Rich 7-layered traditional Indo-Portuguese dessert.", "icon": "fa-utensils"}
                ]
            })
            
    # Case 2: Itinerary generation
    if "travel itinerary generator" in prompt_lower:
        dest_match = re.search(r"Destination:\s*(.*)", prompt_str, re.IGNORECASE)
        destination = dest_match.group(1).strip() if dest_match else "India"
        destination = destination.split("\n")[0].strip()
        
        days_match = re.search(r"Days:\s*(\d+)", prompt_str, re.IGNORECASE)
        num_days = int(days_match.group(1)) if days_match else 3
        
        dest_lower = destination.lower()
        
        # Destination-specific rich itineraries in structured key-value day format
        MOCK_ITINERARIES = {
            "goa": [
                "Day 1:\n- Date: Day 1\n- Morning: Start with a scenic walking tour through the colorful Portuguese-style streets of **Fontainhas Latin Quarter** [Free entry].\n- Afternoon: Sunbathe at **Baga Beach** and savor a fresh seafood platter at the legendary **Britto's Restaurant** [₹1,200].\n- Evening: Catch a breathtaking sunset from **Chapora Fort** and enjoy the cooling sea breeze.\n- Overnight Stay: Baga Beach Resort or North Goa guesthouse\n- Estimated Travel Time: 1 hour 20 mins\n- Estimated Travel Distance: 22 km\n- Primary Transport Method: Rental Scooter (₹400/day)\n- Important Travel Notes: Carry sunscreen and stay hydrated. Chapora Fort has free entry. Avoid peak noon hours.",
                "Day 2:\n- Date: Day 2\n- Morning: Explore the historic **Basilica of Bom Jesus** to view the relics of St. Francis Xavier and walk to **Se Cathedral** [Free entry].\n- Afternoon: Take a guided tour at **Sahakari Spice Farm** in Ponda, tasting fresh spices and enjoying a Goan buffet lunch [₹500].\n- Evening: Cruise along the Mandovi River on the **Mandovi River Cruise** with live Goan folk music [₹700].\n- Overnight Stay: Panaji city heritage guesthouse or Panjim Inn\n- Estimated Travel Time: 1 hour 45 mins\n- Estimated Travel Distance: 30 km\n- Primary Transport Method: Private Taxi (₹1,800/day)\n- Important Travel Notes: Dress modestly at churches. Book the river cruise in advance during peak season.",
                "Day 3:\n- Date: Day 3\n- Morning: Relax on the peaceful, crescent-shaped cove of **Palolem Beach** for swimming and sunbathing [Free entry].\n- Afternoon: Indulge in authentic Goan fish curry rice at the seaside **Dropadi Restaurant** [₹800].\n- Evening: Walk through the historic ruins of **Cabo de Rama Fort** and watch the Arabian Sea sunset [Free].\n- Overnight Stay: Palolem beach hut or Agonda eco-resort\n- Estimated Travel Time: 2 hours\n- Estimated Travel Distance: 35 km\n- Primary Transport Method: Local Bus (₹40) or Scooter\n- Important Travel Notes: South Goa roads are narrow. Palolem gets crowded on weekends — arrive early.",
                "Day 4:\n- Date: Day 4\n- Morning: Shop for unique souvenirs and handicrafts at the vibrant **Anjuna Flea Market** [Free entry].\n- Afternoon: Enjoy fresh coconut water at **Calangute Beach** and Goan thali at **Martin's Corner** [₹1,000].\n- Evening: Swim in the freshwater natural pool at **Arambol Sweet Water Lake** at golden hour.\n- Overnight Stay: Anjuna or Arambol beach hostel\n- Estimated Travel Time: 1 hour 10 mins\n- Estimated Travel Distance: 18 km\n- Primary Transport Method: Rental Scooter (₹400/day)\n- Important Travel Notes: Anjuna Flea Market runs only on Wednesdays. Carry cash as some stalls don't accept cards."
            ],
            "jaipur": [
                "Day 1:\n- Date: Day 1\n- Morning: Watch the sunrise at the majestic **Amer Fort** and explore the Sheesh Mahal mirror palace [Entry ₹100].\n- Afternoon: Savor a traditional Rajasthani Dal Baati Churma thali at **Laxmi Mishthan Bhandar** in the old city [₹600].\n- Evening: Admire the facade of **Hawa Mahal** (Palace of Winds) and catch the golden hour from **Nahargarh Fort**.\n- Overnight Stay: Jaipur Old City heritage hotel or Haveli guesthouse\n- Estimated Travel Time: 1 hour 30 mins\n- Estimated Travel Distance: 25 km\n- Primary Transport Method: E-Rickshaw (₹80) or Auto Rickshaw\n- Important Travel Notes: Amer Fort elephant rides are banned — take the jeep instead. Visit Hawa Mahal from outside for best photos.",
                "Day 2:\n- Date: Day 2\n- Morning: Discover the ancient astronomical instruments at **Jantar Mantar** and tour the royal **Jaipur City Palace** [Entry ₹200].\n- Afternoon: Visit **Patrika Gate** for photos and enjoy the street food carnival at **Masala Chowk** [₹300].\n- Evening: Immerse in village culture, folk dances, and unlimited Rajasthani dining at **Chokhi Dhani** [₹900].\n- Overnight Stay: Mid-range hotel near Tonk Road or Civil Lines\n- Estimated Travel Time: 1 hour 15 mins\n- Estimated Travel Distance: 20 km\n- Primary Transport Method: Private Cab (₹1,500/day)\n- Important Travel Notes: Book Chokhi Dhani in advance on weekends. Patrika Gate is free but very popular at sunset.",
                "Day 3:\n- Date: Day 3\n- Morning: Hike up to the sacred **Galta Ji Monkey Temple** hidden in the mountain clefts [Free entry].\n- Afternoon: Relish a delicious Pyaaz Kachori at **Rawat Mishthan Bhandar** and explore Johari Bazaar for jewelry [₹200].\n- Evening: Explore the historical exhibits at **Albert Hall Museum** and stroll through **Sisodia Rani Ka Bagh** gardens.\n- Overnight Stay: Budget hotel near Albert Hall or Bani Park\n- Estimated Travel Time: 1 hour\n- Estimated Travel Distance: 14 km\n- Primary Transport Method: Local Auto Rickshaw (₹150)\n- Important Travel Notes: Monkeys at Galta Ji are wild — do not carry food. Albert Hall is closed on Fridays."
            ],
            "udaipur": [
                "Day 1:\n- Date: Day 1\n- Morning: Tour the massive **City Palace Udaipur** overlooking Lake Pichola [Entry ₹250].\n- Afternoon: Enjoy a lakeside multi-cuisine lunch at **Ambrai Ghat** with views of the Lake Palace [₹1,000].\n- Evening: Take a peaceful **Lake Pichola Boat Ride** and watch the sunset near Gangaur Ghat.\n- Overnight Stay: Old City lakeside guesthouse or Heritage haveli\n- Estimated Travel Time: 50 mins\n- Estimated Travel Distance: 8 km\n- Primary Transport Method: E-Rickshaw (₹50) or Walking\n- Important Travel Notes: City Palace tickets sell out fast in season — book online. Boat rides run from Rameshwar Ghat.",
                "Day 2:\n- Date: Day 2\n- Morning: Drive up to the hilltop **Sajjangarh Monsoon Palace** for panoramic sunrise views [Entry ₹150].\n- Afternoon: Visit the **Saheliyon ki Bari** fountain gardens and seek blessings at **Jagdish Temple** [Free entry].\n- Evening: Watch a traditional Rajasthani puppet and folk dance show at **Bagore ki Haveli** [₹150].\n- Overnight Stay: Udaipur mid-range hotel near Fateh Sagar Lake\n- Estimated Travel Time: 1 hour 20 mins\n- Estimated Travel Distance: 18 km\n- Primary Transport Method: Rental Scooter (₹450/day) or Taxi\n- Important Travel Notes: Bagore ki Haveli show starts at 7PM sharp — arrive 15 mins early. Sajjangarh entry is by road taxi only.",
                "Day 3:\n- Date: Day 3\n- Morning: Hike up to **Bahubali Hills** for an incredible 360-degree panoramic view of Badi Lake [Free].\n- Afternoon: Savor an unlimited authentic Rajasthani thali at **Natraj Dining Hall** [₹300].\n- Evening: Shop for local clay pottery and miniature paintings at **Shilpgram Craft Village** and ride the **Karni Mata Ropeway**.\n- Overnight Stay: Budget guesthouse in Shilpgram or Hiran Magri area\n- Estimated Travel Time: 1 hour 10 mins\n- Estimated Travel Distance: 12 km\n- Primary Transport Method: Local Auto Rickshaw (₹250)\n- Important Travel Notes: Bahubali Hills requires a 20-minute uphill walk. Carry water and wear comfortable shoes."
            ],
            "manali": [
                "Day 1:\n- Date: Day 1\n- Morning: Experience paragliding and zorbing in **Solang Valley** [Activities ₹1,000-₹3,000].\n- Afternoon: Walk through the deodar pine forest to the historic wood-carved **Hadimba Devi Temple** [Free entry].\n- Evening: Sip hot mountain tea and explore the handicraft shops along **Mall Road Manali**.\n- Overnight Stay: Old Manali guesthouse or hotel near Mall Road\n- Estimated Travel Time: 1 hour\n- Estimated Travel Distance: 14 km\n- Primary Transport Method: Local Taxi (₹800) or Walking\n- Important Travel Notes: Paragliding weather-dependent — check forecast. Dress in layers; evenings are cold even in summer.",
                "Day 2:\n- Date: Day 2\n- Morning: Drive up the winding mountain roads to the high-altitude **Rohtang Pass** for snow views [Permit required, ₹550].\n- Afternoon: Relax on the riverside garden seating at **Johnson's Cafe** and enjoy specialty wood-fired trout fish [₹800].\n- Evening: Explore the quiet cafes and monasteries of **Old Manali Café Gali** and watch the starry sky.\n- Overnight Stay: Old Manali cafe guesthouse or boutique stay\n- Estimated Travel Time: 3 hours (due to mountain roads)\n- Estimated Travel Distance: 52 km\n- Primary Transport Method: Local Union Taxi (₹2,500)\n- Important Travel Notes: Rohtang Pass permit must be booked online in advance at himachalservices.nic.in. Roads close in heavy snowfall.",
                "Day 3:\n- Date: Day 3\n- Morning: Take a scenic 45-minute forest trek to the cascading **Jogini Waterfalls** [Free entry].\n- Afternoon: Soak in the therapeutic natural hot sulfur baths at **Vashisht Hot Springs** [Free entry].\n- Evening: Walk along the Beas River in **Van Vihar Park** and visit the **Tibetan Monastery Manali** at dusk.\n- Overnight Stay: Vashisht village guesthouse or Manali hotel\n- Estimated Travel Time: 45 mins\n- Estimated Travel Distance: 6 km\n- Primary Transport Method: Auto Rickshaw (₹150) or Walking\n- Important Travel Notes: Wear waterproof shoes for the Jogini trek. The hot springs have separate bathing times for men and women."
            ],
            "varanasi": [
                "Day 1:\n- Date: Day 1\n- Morning: Seek blessings at the golden spire of **Kashi Vishwanath Temple** — one of India's most sacred Hindu shrines [Free].\n- Afternoon: Savor hot crispy kachoris at **Kachori Gali** and taste a legendary creamy lassi at **Blue Lassi Shop** [₹150].\n- Evening: Watch the spectacular Ganga fire Aarti ceremony from the ghats of **Dashashwamedh Ghat**.\n- Overnight Stay: Assi Ghat guesthouse or hotel in the old city\n- Estimated Travel Time: 40 mins\n- Estimated Travel Distance: 5 km\n- Primary Transport Method: E-Rickshaw (₹50) or Walking through alleys\n- Important Travel Notes: Temple entry requires leaving shoes and bags outside. Ganga Aarti starts at 6:30PM — arrive by 6PM for a good spot.",
                "Day 2:\n- Date: Day 2\n- Morning: Experience a magical sunrise **Ganga River Cruise** to witness the daily bathing rituals along the ghats [₹300].\n- Afternoon: Travel to the ancient **Sarnath Buddhist Site** to explore stupas and the Dhamek Stupa [Entry ₹20].\n- Evening: Watch traditional Indian wrestling practice at **Tulsi Ghat** akharas and browse the famous Banarasi silk saree shops.\n- Overnight Stay: Sarnath or Varanasi midrange hotel\n- Estimated Travel Time: 1 hour 20 mins (including Sarnath round trip)\n- Estimated Travel Distance: 20 km\n- Primary Transport Method: Auto Rickshaw (₹300 round trip to Sarnath)\n- Important Travel Notes: Boat rides are cheaper when booked by the hour (not per head). Carry small change for temple donations.",
                "Day 3:\n- Date: Day 3\n- Morning: Travel by country boat to the 17th-century riverside **Ramnagar Fort** [Entry ₹50].\n- Afternoon: Try Banarasi Tamatar Chaat at **Deena Chaat Bhandar** — a local institution since 1920 [₹80].\n- Evening: Savor wood-fired bread and organic baked goods at **Brown Bread Bakery** on their famous rooftop overlooking Assi Ghat.\n- Overnight Stay: Assi Ghat heritage guesthouse\n- Estimated Travel Time: 1 hour\n- Estimated Travel Distance: 12 km\n- Primary Transport Method: Shared Auto (₹30) or Boat + Walk\n- Important Travel Notes: Ramnagar Fort is best visited in the morning when light is good for photos. Take a boat to cross the Ganga — avoid road route."
            ],
            "kerala": [
                "Day 1:\n- Date: Day 1\n- Morning: Walk through the lush, misty rolling hills of **Munnar Tea Gardens** with a guided plantation tour [Free entry].\n- Afternoon: Spot the rare Nilgiri Tahr mountain goat at **Eravikulam National Park** and visit the panoramic **Mattupetty Dam** [Entry ₹200].\n- Evening: Savor authentic Malabar chicken curry at **Halais Restaurant** Munnar [₹400].\n- Overnight Stay: Munnar tea estate cottages or hotel near Mattupetty\n- Estimated Travel Time: 1 hour 30 mins\n- Estimated Travel Distance: 18 km\n- Primary Transport Method: Private Car (₹2,000/day)\n- Important Travel Notes: Eravikulam Park entry is seasonal (Jan-Mar closed for calving). Book tickets online in advance.",
                "Day 2:\n- Date: Day 2\n- Morning: Board a traditional thatched rice boat for an overnight **Alleppey Houseboat Cruise** on Kerala backwaters [₹8,000-₹12,000/night].\n- Afternoon: Savor a massive traditional **Sadya** vegetarian feast on banana leaf — rice with 24 curries [Included in houseboat].\n- Evening: Relax on the houseboat deck as it glides through the serene canals of **Vembanad Lake** at sunset.\n- Overnight Stay: On board the luxury houseboat\n- Estimated Travel Time: Houseboat journey (cruise included)\n- Estimated Travel Distance: 30 km by water\n- Primary Transport Method: Houseboat (self-contained)\n- Important Travel Notes: Book the houseboat at least 3 days in advance. Negotiate directly with boat operators at Alleppey Boat Jetty.",
                "Day 3:\n- Date: Day 3\n- Morning: Tour the historic **Fort Kochi Chinese Nets** and visit the ancient **Dutch Palace Mattancherry** [Free/₹5].\n- Afternoon: Watch an elaborate **Kathakali Center** makeup session and live dance performance [₹300].\n- Evening: Walk the dramatic red laterite **Varkala Cliff** and dine at the clifftop **Darjeeling Cafe Varkala**.\n- Overnight Stay: Kochi heritage homestay or Varkala cliff guesthouse\n- Estimated Travel Time: 2 hours\n- Estimated Travel Distance: 40 km\n- Primary Transport Method: KSRTC Bus (₹250) or Private Taxi\n- Important Travel Notes: Chinese nets are best photographed at sunrise. Kathakali show timings vary — confirm at the center."
            ],
            "mumbai": [
                "Day 1:\n- Date: Day 1\n- Morning: Walk through the iconic **Gateway of India** and admire the Gothic **Chhatrapati Shivaji Terminus** [Free entry].\n- Afternoon: Savor the famous mutton keema pav at the legendary **Leopold Cafe** in Colaba [₹600].\n- Evening: Take a sunset stroll along the curved promenade of **Marine Drive** (Queen's Necklace).\n- Overnight Stay: Colaba or Fort area hotel\n- Estimated Travel Time: 1 hour\n- Estimated Travel Distance: 7 km\n- Primary Transport Method: Black-and-Yellow Taxi (₹80 per ride)\n- Important Travel Notes: Colaba is very walkable — wear comfortable footwear. Leopold Cafe gets crowded after 7PM.",
                "Day 2:\n- Date: Day 2\n- Morning: Board a ferry from Apollo Bunder to explore the UNESCO rock-cut **Elephanta Caves** [Ferry ₹200, Entry ₹40].\n- Afternoon: Enjoy chaat and kulfi at the seaside **Girgaon Chowpatty** beach food stalls [₹150].\n- Evening: Walk the Bollywood-themed **Bandra Bandstand** promenade and marvel at the **Bandra-Worli Sea Link** at night.\n- Overnight Stay: Bandra or BKC hotel\n- Estimated Travel Time: 2 hours\n- Estimated Travel Distance: 22 km\n- Primary Transport Method: Ferry + Local Train (₹15) or Uber\n- Important Travel Notes: Elephanta Caves are closed on Mondays. Last ferry returns by 5:30PM.",
                "Day 3:\n- Date: Day 3\n- Morning: Experience the organized chaos of **Crawford Market** — Mumbai's Victorian wholesale bazaar [Free entry].\n- Afternoon: Indulge in the legendary Berry Pulav at historic Parsi restaurant **Britannia & Co Restaurant** [₹700].\n- Evening: Seek blessings at the iconic **Siddhivinayak Temple** and watch the Haji Ali Dargah float at high tide.\n- Overnight Stay: Dadar or Prabhadevi area hotel\n- Estimated Travel Time: 1 hour 30 mins\n- Estimated Travel Distance: 14 km\n- Primary Transport Method: Local Taxi (₹250) or Auto Rickshaw\n- Important Travel Notes: Siddhivinayak Temple has long queues on Tuesdays — avoid or arrive before 7AM. Britannia closes early on Sundays."
            ],
            "ladakh": [
                "Day 1:\n- Date: Day 1\n- Morning: Acclimatize to 3,500m altitude in Leh and then climb up to the historic 9-storey **Leh Palace** [Entry ₹20].\n- Afternoon: Savor a hot butter tea and apricot pie at the popular **Gesmo Restaurant** in Leh market [₹250].\n- Evening: Watch the sunset and spin the prayer wheels at the iconic white-domed **Shanti Stupa** [Free].\n- Overnight Stay: Leh town hotel or guesthouse\n- Estimated Travel Time: 1 hour\n- Estimated Travel Distance: 5 km (walking and short taxi)\n- Primary Transport Method: Walking or Local Taxi (₹600)\n- Important Travel Notes: CRITICAL — Do NOT do any strenuous activities for the first 2 days. Altitude sickness (AMS) is real. Drink lots of water and avoid alcohol.",
                "Day 2:\n- Date: Day 2\n- Morning: Drive 39 km to the world's highest motorable pass — **Khardung La Pass** at 5,359 meters [Free].\n- Afternoon: Explore the Bactrian double-humped camels at **Hunder Sand Dunes** in the magical Nubra Valley [Camel ride ₹300].\n- Evening: Visit the hilltop **Diskit Monastery** with the 100ft tall Maitreya Buddha statue at dusk [Entry ₹30].\n- Overnight Stay: Nubra Valley eco-camp or Diskit guesthouse\n- Estimated Travel Time: 4 hours (mountain road)\n- Estimated Travel Distance: 120 km\n- Primary Transport Method: Private SUV Cab (₹6,000 for 2 days)\n- Important Travel Notes: Inner Line Permit required for Nubra Valley — get from Leh DC office (₹400). Carry warm clothing; temperature drops sharply.",
                "Day 3:\n- Date: Day 3\n- Morning: Stand by the shimmering turquoise waters of the breathtaking **Pangong Tso Lake** at 4,350m altitude [Free].\n- Afternoon: Stay in a lakeside camp tent at **Spangmik Village** and enjoy a hot bowl of Ladakhi Thukpa noodle soup [₹350].\n- Evening: Watch the incredible star-studded Himalayan sky from the pristine lakeside camp.\n- Overnight Stay: Pangong Lake camp (included in tour package)\n- Estimated Travel Time: 5 hours\n- Estimated Travel Distance: 170 km from Leh\n- Primary Transport Method: Private SUV Cab (included in package)\n- Important Travel Notes: Carry a quality sleeping bag — lake nights are extremely cold. No ATM after Leh — carry sufficient cash."
            ],
            "delhi": [
                "Day 1:\n- Date: Day 1\n- Morning: Explore the towering red sandstone ruins of the ancient **Qutub Minar** complex [Entry ₹40].\n- Afternoon: Head to Old Delhi and feast on authentic Mughlai mutton stew at **Karim's Restaurant** in Jama Masjid lane [₹700].\n- Evening: Pay respects at the **India Gate** war memorial and stroll the leafy Rajpath lawns.\n- Overnight Stay: Connaught Place or South Delhi hotel\n- Estimated Travel Time: 1 hour 30 mins\n- Estimated Travel Distance: 20 km\n- Primary Transport Method: Delhi Metro Yellow Line (₹40)\n- Important Travel Notes: Carry valid ID for India Gate area. Metro is the fastest way around Delhi — buy a tourist pass.",
                "Day 2:\n- Date: Day 2\n- Morning: Walk through the massive red stone ramparts of the iconic **Red Fort** (Lal Qila) [Entry ₹50].\n- Afternoon: Take a sensory street food walking tour through the chaotic, aromatic lanes of **Chandni Chowk** [₹300 per head].\n- Evening: Visit the serene Mughal-era **Humayun's Tomb** complex at golden hour — a precursor to the Taj Mahal [Entry ₹30].\n- Overnight Stay: Old Delhi area or Paharganj heritage hotel\n- Estimated Travel Time: 1 hour 20 mins\n- Estimated Travel Distance: 15 km\n- Primary Transport Method: Metro or Auto Rickshaw (₹100)\n- Important Travel Notes: Red Fort is closed on Mondays. Chandni Chowk is very crowded — keep your valuables secure.",
                "Day 3:\n- Date: Day 3\n- Morning: Experience the deep calm of the award-winning flower-shaped **Lotus Temple** [Free — closed Mondays].\n- Afternoon: Shop for regional handicrafts and sample pan-Indian food at **Dilli Haat** craft market [Entry ₹30].\n- Evening: Watch the spectacular laser light and sound show at the iconic **Akshardham Temple** [Entry ₹170].\n- Overnight Stay: East Delhi or Dwarka area hotel\n- Estimated Travel Time: 1 hour 15 mins\n- Estimated Travel Distance: 18 km\n- Primary Transport Method: Delhi Metro Blue Line (₹40)\n- Important Travel Notes: No cameras or phones inside Akshardham — use cloak rooms. Lotus Temple entry is free but long queues on weekends."
            ],
            "agra": [
                "Day 1:\n- Date: Day 1\n- Morning: Beat the crowds and witness the breathtaking sunrise at the iconic white-marble **Taj Mahal** [Entry ₹50 Indians, ₹1,100 foreigners].\n- Afternoon: Savor royal Mughlai cuisine at the upscale rooftop **Pinch of Spice Restaurant** [₹800].\n- Evening: Walk the massive red sandstone ramparts of **Agra Fort** with views of the Taj at dusk [Entry ₹50].\n- Overnight Stay: Agra hotel near Taj Ganj or Sadar Bazaar\n- Estimated Travel Time: 1 hour\n- Estimated Travel Distance: 4 km (walking distance)\n- Primary Transport Method: Electric Auto Rickshaw (₹100) or Walking\n- Important Travel Notes: Taj Mahal tickets MUST be booked online in advance at asi.payumoney.com. Tripod and professional cameras require separate permits.",
                "Day 2:\n- Date: Day 2\n- Morning: Take a half-day excursion to the abandoned Mughal city of **Fatehpur Sikri** [Entry ₹50] — Buland Darwaza, Panch Mahal.\n- Afternoon: Try the world-famous local sweet 'Agra Petha' at the iconic **Panchhi Petha** shop [₹100].\n- Evening: Watch the Taj Mahal glow orange and pink in the dusk light from **Mehtab Bagh** gardens across the Yamuna river [Entry ₹30].\n- Overnight Stay: Agra budget hotel or eco-lodge\n- Estimated Travel Time: 2 hours\n- Estimated Travel Distance: 40 km round trip\n- Primary Transport Method: Local Taxi (₹1,500 round trip)\n- Important Travel Notes: Fatehpur Sikri is 40km from Agra — start by 8AM. Mehtab Bagh at sunset is better than Taj Mahal side for photography."
            ],
            "andaman": [
                "Day 1:\n- Date: Day 1\n- Morning: Walk the pristine white sands of **Radhanagar Beach** on Havelock Island — rated Asia's finest beach [Free entry].\n- Afternoon: Savor fresh seafood and tropical fresh juices at the popular beachside **Anju Coco Restaurant** [₹700].\n- Evening: Tour the dark historic chambers of **Cellular Jail** in Port Blair and watch the sobering Light & Sound Show [Entry ₹50].\n- Overnight Stay: Havelock Island beach resort or Port Blair guesthouse\n- Estimated Travel Time: 1 hour (including ferry transit)\n- Estimated Travel Distance: 12 km by ferry + 4 km on island\n- Primary Transport Method: Government Ferry (₹400) + Local Taxi\n- Important Travel Notes: Ferry timings are fixed — check schedules at andamans.gov.in. Book ferry tickets in advance during peak season.",
                "Day 2:\n- Date: Day 2\n- Morning: Go beginner or advanced scuba diving among vibrant coral reefs at **Havelock Island** Nemo Reef [₹3,500 for PADI intro].\n- Afternoon: Enjoy grilled barracuda and tropical salads at the beachside **Something Different Restaurant** [₹600].\n- Evening: Take a boat excursion to the historic ruins of **Ross Island** (Netaji Subhash Chandra Bose Island) to explore colonial-era structures.\n- Overnight Stay: Havelock Island eco-camp or private resort\n- Estimated Travel Time: 1 hour 30 mins\n- Estimated Travel Distance: 20 km by boat\n- Primary Transport Method: Private Ferry / Speed Boat (₹1,200)\n- Important Travel Notes: Scuba diving not allowed if you have a recent cold or ear infection. Carry full-spectrum reef-safe sunscreen."
            ],
        }

        matched_list = None
        for key in MOCK_ITINERARIES.keys():
            if key in dest_lower:
                matched_list = MOCK_ITINERARIES[key]
                break
        if not matched_list:
            matched_list = MOCK_ITINERARIES["delhi"]

        days_itinerary = []
        for i in range(1, num_days + 1):
            idx = (i - 1) % len(matched_list)
            day_content = matched_list[idx]
            day_content_cleaned = re.sub(r'^(?:###\s*)?Day\s+\d+:\s*(.*)', f'### Day {i}: \\1', day_content, flags=re.IGNORECASE)
            days_itinerary.append(day_content_cleaned)

        return "\n\n".join(days_itinerary)

    # Reconstruct the current itinerary
    days_dict = {}
    destination_name = "India"
    
    # 1. Parse current_itinerary if provided
    if current_itinerary and isinstance(current_itinerary, dict):
        schedule = current_itinerary.get("schedule", [])
        if schedule:
            for day_item in schedule:
                if isinstance(day_item, dict):
                    day_num = day_item.get("day")
                    activity = day_item.get("activity", "")
                    location = day_item.get("location", "")
                    if location:
                        destination_name = location
                    if day_num is not None:
                        day_num = int(day_num)
                        # Split activity into lines
                        acts = []
                        for line in activity.split("\n"):
                            line_str = line.strip()
                            if line_str:
                                # Clean list item prefixes if present
                                clean_line = re.sub(r'^[-*•]\s*', '', line_str)
                                if clean_line:
                                    acts.append(clean_line)
                        days_dict[day_num] = acts

    # 2. Fallback to parsing history if current_itinerary is not supplied
    if not days_dict:
        prev_itinerary = ""
        if isinstance(contents, list):
            for msg in reversed(contents[:-1]):  # Skip the current user message
                msg_text = ""
                if isinstance(msg, dict):
                    parts = msg.get("parts", [])
                    if parts and isinstance(parts[0], dict):
                        msg_text = parts[0].get("text", "")
                elif hasattr(msg, "parts") and msg.parts:
                    msg_text = msg.parts[0].text if hasattr(msg.parts[0], "text") else str(msg.parts[0])
                    
                if "### Day 1" in msg_text or "Day 1:" in msg_text:
                    prev_itinerary = msg_text
                    break

        if prev_itinerary:
            dest_match = re.search(r"tailor-made itinerary for \*\*(.*?)\*\*", prev_itinerary, re.IGNORECASE)
            if dest_match:
                destination_name = dest_match.group(1)
                
            lines = prev_itinerary.split("\n")
            current_day = None
            for line in lines:
                day_header_match = re.search(r"(?:###\s*)?Day\s+(\d+)", line, re.IGNORECASE)
                if day_header_match:
                    current_day = int(day_header_match.group(1))
                    days_dict[current_day] = []
                elif current_day is not None:
                    striped = line.strip()
                    if striped and not striped.startswith("Here is your") and not striped.startswith("✨"):
                        clean_line = re.sub(r'^[-*•]\s*', '', striped)
                        if clean_line:
                            days_dict[current_day].append(clean_line)

    # 3. Handle Add / Delete / Modify or General Questions
    if days_dict:
        # Helper to compile itinerary string
        def compile_itinerary(dest, d_dict, status_msg=""):
            lines_out = []
            if status_msg:
                lines_out.append(f"✨ {status_msg}\n")
            lines_out.append(f"Here is your tailor-made itinerary for **{dest}**! Click any blue tag to explore it on the map:\n")
            for d_num in sorted(d_dict.keys()):
                activities = d_dict[d_num]
                lines_out.append(f"### Day {d_num}: {dest}")
                for act in activities:
                    if act.startswith("-"):
                        lines_out.append(act)
                    else:
                        lines_out.append(f"- {act}")
                lines_out.append("")
            return "\n".join(lines_out)

        # 3.1 ADD
        add_match = re.search(r"(?:add|visit)\s+(?:a visit to\s+)?(.*?)\s+(?:on|to|in)\s+day\s+(\d+)", prompt_lower)
        if not add_match:
            add_match = re.search(r"add\s+(.*?)\s+day\s+(\d+)", prompt_lower)
        
        if add_match:
            place = add_match.group(1).strip()
            day_num = int(add_match.group(2))
            place = re.sub(r"^(a visit to|to|on)\s+", "", place, flags=re.IGNORECASE)
            place = place.strip(".,?! ")
            if not place.startswith("**"):
                place = f"**{place}**"
            if day_num in days_dict:
                days_dict[day_num].append(f"Explore {place} for a custom sightseeing session.")
                return compile_itinerary(destination_name, days_dict, f"Added {place} to Day {day_num} successfully!")
            else:
                days_dict[day_num] = [f"Explore {place} for a custom sightseeing session."]
                return compile_itinerary(destination_name, days_dict, f"Created Day {day_num} and added {place}!")

        # 3.1.2 ADD DAY (e.g. "add a day")
        add_day_match = re.search(r"add\s+(?:a\s+)?day", prompt_lower)
        if add_day_match:
            new_day = max(days_dict.keys()) + 1
            days_dict[new_day] = ["Sightseeing and exploring local landmarks.", "Relaxing evening at a local cafe."]
            return compile_itinerary(destination_name, days_dict, f"Added Day {new_day} to the itinerary.")

        # 3.1.3 ADD (Day-agnostic)
        if "add" in prompt_lower or "visit" in prompt_lower:
            add_simple = re.search(r"(?:add|visit)\s+(?:a visit to\s+)?(.*)", prompt_lower)
            if add_simple:
                place = add_simple.group(1).strip()
                if "day" not in place.lower():
                    place = re.sub(r"^(a visit to|to|on)\s+", "", place, flags=re.IGNORECASE)
                    place = place.strip(".,?! ")
                    if not place.startswith("**"):
                        place = f"**{place}**"
                    last_day = max(days_dict.keys())
                    days_dict[last_day].append(f"Explore {place} for a custom sightseeing session.")
                    return compile_itinerary(destination_name, days_dict, f"Added {place} to Day {last_day} (defaulted to last day).")

        # 3.2 DELETE/REMOVE Day
        del_day_match = re.search(r"(?:delete|remove)\s+day\s+(\d+)", prompt_lower)
        if del_day_match:
            day_num = int(del_day_match.group(1))
            if day_num in days_dict:
                del days_dict[day_num]
                new_days = {}
                for idx, (d_num, activities) in enumerate(sorted(days_dict.items()), 1):
                    new_days[idx] = activities
                days_dict = new_days
                return compile_itinerary(destination_name, days_dict, f"Removed Day {day_num} and re-aligned the schedule.")
            else:
                return f"Day {day_num} is not in your current itinerary."

        # 3.3 DELETE/REMOVE Place from Day (day-specific)
        del_item_match = re.search(r"(?:delete|remove)\s+(.*?)\s+from\s+day\s+(\d+)", prompt_lower)
        if del_item_match:
            item_to_remove = del_item_match.group(1).strip().strip("*\"' ")
            day_num = int(del_item_match.group(2))
            if day_num in days_dict:
                new_activities = []
                removed = False
                for act in days_dict[day_num]:
                    if item_to_remove.lower() in act.lower():
                        removed = True
                    else:
                        new_activities.append(act)
                days_dict[day_num] = new_activities
                status = f"Removed '{item_to_remove}' from Day {day_num}." if removed else f"Could not find '{item_to_remove}' on Day {day_num}."
                return compile_itinerary(destination_name, days_dict, status)

        # 3.3.2 DELETE/REMOVE (Day-agnostic)
        if "delete" in prompt_lower or "remove" in prompt_lower:
            del_simple_match = re.search(r"(?:delete|remove)\s+(.*)", prompt_lower)
            if del_simple_match:
                item_to_remove = del_simple_match.group(1).strip().strip("*\"' ")
                if "day" not in item_to_remove.lower():
                    found = False
                    day_num = None
                    for d_num in sorted(days_dict.keys()):
                        new_activities = []
                        for act in days_dict[d_num]:
                            if item_to_remove.lower() in act.lower():
                                found = True
                                day_num = d_num
                            else:
                                new_activities.append(act)
                        days_dict[d_num] = new_activities
                    
                    if found:
                        return compile_itinerary(destination_name, days_dict, f"Removed '{item_to_remove}' from Day {day_num} successfully!")
                    else:
                        return f"Could not find '{item_to_remove}' anywhere in your current itinerary to remove."

        # 3.4 MODIFY/REPLACE Place on Day (day-specific)
        mod_match = re.search(r"(?:change|replace)\s+(.*?)\s+(?:to|with)\s+(.*?)\s+(?:on|in|at)\s+day\s+(\d+)", prompt_lower)
        if mod_match:
            old_place = mod_match.group(1).strip().strip("*\"' ")
            new_place = mod_match.group(2).strip()
            day_num = int(mod_match.group(3))
            if not new_place.startswith("**"):
                new_place = f"**{new_place}**"
            if day_num in days_dict:
                modified = False
                for idx, act in enumerate(days_dict[day_num]):
                    if old_place.lower() in act.lower():
                        pattern = re.compile(re.escape(old_place), re.IGNORECASE)
                        days_dict[day_num][idx] = pattern.sub(new_place, act)
                        modified = True
                        break
                status = f"Replaced '{old_place}' with {new_place} on Day {day_num}." if modified else f"Could not find '{old_place}' on Day {day_num} to replace."
                return compile_itinerary(destination_name, days_dict, status)

        # 3.4.2 MODIFY/REPLACE (Day-agnostic)
        if "change" in prompt_lower or "replace" in prompt_lower:
            mod_simple_match = re.search(r"(?:change|replace)\s+(.*?)\s+(?:to|with)\s+(.*)", prompt_lower)
            if mod_simple_match:
                old_place = mod_simple_match.group(1).strip().strip("*\"' ")
                new_place = mod_simple_match.group(2).strip()
                if "day" not in new_place.lower():
                    if not new_place.startswith("**"):
                        new_place = f"**{new_place}**"
                    
                    found = False
                    day_num = None
                    for d_num in sorted(days_dict.keys()):
                        for idx, act in enumerate(days_dict[d_num]):
                            if old_place.lower() in act.lower():
                                pattern = re.compile(re.escape(old_place), re.IGNORECASE)
                                days_dict[d_num][idx] = pattern.sub(new_place, act)
                                found = True
                                day_num = d_num
                                break
                        if found:
                            break
                    
                    if found:
                        return compile_itinerary(destination_name, days_dict, f"Replaced '{old_place}' with {new_place} on Day {day_num} successfully!")
                    else:
                        return f"Could not find '{old_place}' anywhere in your current itinerary to replace."

        # 3.4.5 OPTIMIZE ROUTE
        if "optimize" in prompt_lower or "route sequence" in prompt_lower or "minimize distance" in prompt_lower:
            for d_num in days_dict.keys():
                acts = days_dict[d_num]
                # Cluster landmarks, beaches, then dining last
                def sort_key(act):
                    al = act.lower()
                    if "fort" in al: return 1
                    if "temple" in al or "church" in al or "basilica" in al or "monument" in al: return 2
                    if "beach" in al or "lake" in al or "falls" in al or "park" in al: return 3
                    if "market" in al or "bazaar" in al or "shopping" in al: return 4
                    if "restaurant" in al or "cafe" in al or "eatery" in al or "lunch" in al or "dinner" in al: return 5
                    return 6
                days_dict[d_num] = sorted(acts, key=sort_key)
            return compile_itinerary(destination_name, days_dict, "Re-aligned your route sequence for optimal geographical transit efficiency! Outdoor spots have been clustered together to minimize travel times.")

        # 3.5 GENERAL QUESTIONS ABOUT ITINERARY
        # 3.5.1 Show specific day
        day_q_match = re.search(r"(?:what|show|tell me).*?day\s+(\d+)", prompt_lower)
        if day_q_match:
            day_num = int(day_q_match.group(1))
            if day_num in days_dict:
                acts = "\n".join([f"- {a}" for a in days_dict[day_num]])
                return f"On **Day {day_num}** in **{destination_name}**, you have the following plan:\n\n{acts}"
            else:
                return f"Day {day_num} is not in your current itinerary. Let me know if you want to add it!"

        # 3.5.2 Budget / Cost questions
        if has_keyword(["budget", "cost", "price", "how much", "rupee", "inr"]):
            return f"Your custom itinerary for **{destination_name}** is estimated at a budget of **₹15,000** for standard lodging, meals, and local entry tickets. I can help you scale this to a luxury or economy plan if you prefer!"

        # 3.5.3 Food / Restaurants / Cafe questions
        if has_keyword(["food", "eat", "restaurant", "cafe", "dishes", "dining"]):
            food_spots = []
            for d_num, acts in days_dict.items():
                for act in acts:
                    if any(w in act.lower() for w in ["cafe", "eatery", "restaurant", "lunch", "dinner"]):
                        bolds = re.findall(r"\*\*(.*?)\*\*", act)
                        if bolds:
                            food_spots.append(f"**{bolds[0]}** (Day {d_num})")
            if food_spots:
                spots_str = ", ".join(food_spots)
                return f"Yes! Here are the food stops currently scheduled in your itinerary:\n- {spots_str}\n\nI highly recommend trying local dishes there. Let me know if you'd like to add or change any food spots!"
            else:
                return f"I suggest visiting the local marketplaces and cafes around **{destination_name}** to taste authentic street foods. Would you like me to add a specific cafe to one of your days?"

        # 3.5.4 Packing / Weather / Wear questions
        if has_keyword(["pack", "wear", "weather", "clothing", "temp"]):
            return f"For your trip to **{destination_name}**, I recommend packing comfortable walking shoes for sightseeing, lightweight breathable clothes, a reusable water bottle, sunscreen, and a light jacket if you are traveling during winter or visiting elevated places. Be sure to dress respectfully when entering religious monuments."

        # 3.5.5 Activities / Things to do questions
        if has_keyword(["activity", "activities", "todo", "to do", "things to do", "sightseeing", "sights", "places to visit", "explore"]):
            all_sights = []
            for d_num, acts in days_dict.items():
                for act in acts:
                    bolds = re.findall(r"\*\*(.*?)\*\*", act)
                    for b in bolds:
                        all_sights.append(f"**{b}** (Day {d_num})")
            if all_sights:
                sights_str = "\n- ".join(all_sights)
                return f"Here are the key places and attractions you are exploring in **{destination_name}**:\n- {sights_str}\n\nWould you like to add another sightseeing spot or change one of these?"
            else:
                return f"You can explore the beautiful landmarks, temples, and natural wonders of **{destination_name}**. Let me know if you would like me to add some specific sightseeing spots to your itinerary!"

        # 3.5.6 Transportation / Transit questions
        if has_keyword(["travel", "cab", "taxi", "metro", "bus", "train", "flight", "reach", "commute", "transport"]):
            return f"For getting around **{destination_name}**, local auto-rickshaws and cabs (like Ola/Uber if available) are very convenient. For traveling between different cities, trains are budget-friendly and scenic, while domestic flights save time. Let me know if you want me to add transit details to any of your days!"

        # 3.5.7 Hotels / Stay questions
        if has_keyword(["hotel", "stay", "resort", "hostel", "accommodation", "lodging"]):
            return f"In **{destination_name}**, you can find a range of options from budget backpacker hostels (₹800-₹1,500/night) to standard heritage stays (₹3,000-₹6,000/night) and luxury resorts. I recommend staying near the central sightseeing hubs to minimize daily commute times."

        # 3.5.8 Safety / Tips questions
        if has_keyword(["safe", "safety", "culture", "scam", "tips", "precaution", "emergency", "respect"]):
            return f"Travel safety tips for **{destination_name}**:\n1. Keep your belongings secure in crowded markets.\n2. Always agree on auto-rickshaw fares beforehand or use metered rides.\n3. Dress modestly when visiting temples or religious shrines.\n4. Drink bottled water and enjoy hot, freshly cooked local food.\nLet me know if you need specific tips for solo travelers or families!"

    return "Hello! I am Ritu, your AI Travel Planner. I can help you customize your trip details. Let me know if you would like to:\n- **Add** a place: 'Add a visit to **Chapora Fort** on Day 2'\n- **Remove** a place: 'Remove **Mumbai Museum** from Day 3'\n- **Replace** a place: 'Replace **Traditional Cafe** with **Bandra Sea Link** on Day 1'\n- **Ask details**: 'What is scheduled on Day 2?' or ask about food, hotels, transit, weather, packing, and safety!"

_CLIENTS_CACHE = {}

def _get_client(api_key: str):
    """Retrieve or create a cached genai.Client instance."""
    if api_key not in _CLIENTS_CACHE:
        _CLIENTS_CACHE[api_key] = genai.Client(api_key=api_key)
    return _CLIENTS_CACHE[api_key]

def _generate_with_fallback(contents, config=None, current_itinerary=None, custom_system_prompt=None):
    """Fallback loop pattern to try different models and API keys if one fails"""
    last_error = "No API keys configured."
    is_rate_limited = False
    
    if not custom_system_prompt:
        custom_system_prompt = SYSTEM_PROMPT
    if current_itinerary and isinstance(current_itinerary, dict):
        schedule = current_itinerary.get("schedule", [])
        if schedule:
            lines = []
            for day_item in schedule:
                if isinstance(day_item, dict):
                    day_num = day_item.get("day")
                    activity = day_item.get("activity", "")
                    location = day_item.get("location", "")
                    lines.append(f"Day {day_num} ({location}):\n{activity}")
            itinerary_text = "\n\n".join(lines)
            
            custom_system_prompt += f"\n\nActive Trip Itinerary Context:\n{itinerary_text}\n\n"
            custom_system_prompt += (
                "CRITICAL: If the user asks to add, delete, remove, or modify any days/places in the itinerary, "
                "you MUST output the updated itinerary in full, starting each day with the format 'Day X:' or '### Day X:'. "
                "This ensures the system can parse the updates and refresh the map. "
                "Keep all specific locations, monuments, hotels, and attractions wrapped in **Double Asterisks** so they can be parsed."
            )

    if API_KEYS:
        for api_key in API_KEYS:
            try:
                client = _get_client(api_key)
            except Exception as client_err:
                print(f"[Agent] Failed to instantiate Gemini client for key prefix {api_key[:8]}...: {client_err}")
                continue
            
            for model in MODEL_NAMES:
                # Retry strategy: up to 2 retries for transient errors
                max_retries = 2
                for attempt in range(max_retries + 1):
                    try:
                        # Always create a fresh config to avoid mutating the shared global object
                        if config:
                            active_config = types.GenerateContentConfig(
                                max_output_tokens=config.max_output_tokens or 8192,
                                temperature=config.temperature or 0.7,
                                system_instruction=custom_system_prompt
                            )
                        else:
                            active_config = types.GenerateContentConfig(
                                max_output_tokens=8192,
                                temperature=0.7,
                                system_instruction=custom_system_prompt
                            )
                        
                        response = client.models.generate_content(
                            model=model, 
                            contents=contents, 
                            config=active_config
                        )
                        if response.text:
                            return response.text
                    except google_exceptions.ResourceExhausted as q_err:
                        # HTTP 429 - Resource Exhausted / Rate limit: Do NOT retry on this key, cycle immediately
                        last_error = f"Gemini API rate limit exceeded on model {model}."
                        is_rate_limited = True
                        print(f"⚠️ [Agent] Key prefix {api_key[:8]} rate-limited (429) on model {model}: {q_err}. Cycling to next key...")
                        break # Break retry loop to try the next key
                    except (google_exceptions.ServiceUnavailable, google_exceptions.DeadlineExceeded, ConnectionError) as trans_err:
                        # Transient errors: retry with exponential backoff and jitter
                        last_error = str(trans_err)
                        if attempt < max_retries:
                            sleep_time = (2 ** attempt) + random.uniform(0.1, 1.0)
                            print(f"🔄 [Agent] Transient error: {trans_err}. Retrying in {sleep_time:.2f}s...")
                            time.sleep(sleep_time)
                        else:
                            print(f"❌ [Agent] Transient error retries exhausted on model {model}: {trans_err}")
                            break
                    except Exception as other_err:
                        last_error = str(other_err)
                        print(f"❌ [Agent] Model {model} failed on key prefix {api_key[:8]}...: {last_error}")
                        break
    
    # If we are rate limited on all keys, raise a ResourceExhausted exception so route controllers know
    if is_rate_limited:
        print("🚨 [Agent] All API keys have exceeded their Gemini quota rate limit.")
        raise google_exceptions.ResourceExhausted(f"All configured Gemini API keys are rate limited. {last_error}")
        
    # Otherwise fallback to mock generation
    print("[Agent] Falling back to Mock Generation...")
    return get_mock_response(contents, current_itinerary)


def is_travel_query(query: str) -> bool:
    keywords = [
        "trip", "travel", "itinerary", "destination", "hotel", "stay", "resort", "hostel", "accommodation",
        "food", "dish", "eat", "dining", "restaurant", "cafe", "menu", "taste", "cuisine", "breakfast", "dinner", "lunch",
        "weather", "forecast", "temp", "climate", "rain", "sunny", "monsoon", "snow", "degree",
        "attraction", "sight", "monument", "fort", "palace", "temple", "ghat", "beach", "lake", "museum", "park",
        "transit", "transport", "cab", "taxi", "bus", "train", "flight", "route", "direction", "metro", "auto", "rickshaw",
        "safety", "scam", "safe", "precaution", "emergency", "cost", "budget", "rupee", "price", "charge", "fee",
        "pack", "wear", "clothing", "tip", "permit", "visit", "explore", "guide", "tour", "activity", "activities"
    ]
    q = query.lower()
    return any(kw in q for kw in keywords)


def chat_with_agent(session_id: str, user_message: str, current_itinerary: dict = None, history: list = None):
    """Main chat entrypoint with RAG-augmented context injection."""

    # ── Extract destination for semantic retrieval ────────────────────────────
    destination = ""
    user_prefs = None
    if current_itinerary and isinstance(current_itinerary, dict):
        schedule = current_itinerary.get("schedule", [])
        if schedule and isinstance(schedule[0], dict):
            destination = schedule[0].get("location", "") or current_itinerary.get("destination", "")
        else:
            destination = current_itinerary.get("destination", "")
        user_prefs = current_itinerary.get("user_preferences")

    # ── Semantic RAG retrieval (Hybrid Intelligence Router) ───────────────────
    rag_context = ""
    if _vs is not None and is_travel_query(user_message):
        try:
            rag_context = _vs.build_context(user_message, destination=destination, max_chars=2500)
        except Exception as rag_err:
            print(f"[Agent] RAG retrieval error (non-fatal): {rag_err}")

    # Build augmented system prompt (inject RAG context before the main prompt)
    augmented_system = SYSTEM_PROMPT
    if rag_context:
        augmented_system = rag_context + "\n\n" + SYSTEM_PROMPT

    # ── Inject User Preferences if present ─────────────────────────────────────
    if user_prefs and isinstance(user_prefs, dict):
        pref_lines = []
        for pk, pv in user_prefs.items():
            pref_lines.append(f"- {pk.capitalize()}: {pv}")
        prefs_str = "\n".join(pref_lines)
        augmented_system += f"\n\n=== USER PROFILE PREFERENCES ===\n{prefs_str}\n"
        augmented_system += "Please tailor your recommendations and formatting according to these user preferences where applicable.\n"

    # ── Build Gemini content history ──────────────────────────────────────────
    if history is not None:
        gemini_contents = []
        for msg in history:
            role = "model" if msg.get("role") == "assistant" else "user"
            gemini_contents.append({"role": role, "parts": [{"text": msg.get("content", "")}]})
        gemini_contents.append({"role": "user", "parts": [{"text": user_message}]})

        try:
            assistant_message = _generate_with_fallback(
                contents=gemini_contents,
                current_itinerary=current_itinerary,
                custom_system_prompt=augmented_system
            )
        except Exception as e:
            print(f"[Agent] Chat failed: {str(e)}")
            assistant_message = "I'm having trouble connecting to my personal travel brain. Please try again later!"
        
        # Also sync to server-side memory store
        add_message(session_id, "user", user_message)
        add_message(session_id, "assistant", assistant_message)
        return assistant_message

    # Otherwise fallback to transient local in-memory store
    add_message(session_id, "user", user_message)
    history = get_history(session_id)
    gemini_contents = []
    for msg in history:
        role = "model" if msg["role"] == "assistant" else "user"
        gemini_contents.append({"role": role, "parts": [{"text": msg["content"]}]})

    try:
        assistant_message = _generate_with_fallback(
            contents=gemini_contents,
            current_itinerary=current_itinerary,
            custom_system_prompt=augmented_system
        )
    except Exception as e:
        print(f"[Agent] Transient chat failed: {str(e)}")
        assistant_message = "I'm having trouble connecting to my personal travel brain. Please try again later!"

    add_message(session_id, "assistant", assistant_message)
    return assistant_message



def get_curated_suggestions(history: list[str], query: str = None):
    history_str = ", ".join(history) if history else "no past trips"
    if query:
        prompt = f"""
        The user is requesting specific travel suggestions with this query/vibe: "{query}".
        Their past travel history contains: {history_str}.
        Based on this specific request and their past travel history, suggest exactly 2 hidden gems and 2 food recommendations in India.
        Output ONLY the JSON object. No intro text, no conversational filler, no markdown formatting.
        {{
          "hidden_gems": [
            {{"title": "Place Name", "description": "Short text", "icon": "fa-monument"}},
            {{"title": "Place Name", "description": "Short text", "icon": "fa-water"}}
          ],
          "food_recommendations": [
            {{"title": "Food Name", "description": "Short text", "icon": "fa-bowl-rice"}},
            {{"title": "Food Name", "description": "Short text", "icon": "fa-utensils"}}
          ]
        }}
        """
    else:
        prompt = f"""
        The user has previously traveled to these destinations: {history_str}.
        Based on their implicit travel style and preferences derived from these past trips, suggest exactly 2 hidden gems and 2 food recommendations. 
        If they have no past trips, suggest popular vibrant Indian destinations.
        Output ONLY the JSON object. No intro text, no conversational filler, no markdown formatting.
        {{
          "hidden_gems": [
            {{"title": "Place Name", "description": "Short text", "icon": "fa-monument"}},
            {{"title": "Place Name", "description": "Short text", "icon": "fa-water"}}
          ],
          "food_recommendations": [
            {{"title": "Food Name", "description": "Short text", "icon": "fa-bowl-rice"}},
            {{"title": "Food Name", "description": "Short text", "icon": "fa-utensils"}}
          ]
        }}
        """
    
    # We enforce JSON by setting response_mime_type if needed, but the prompt should be sufficient.
    config = types.GenerateContentConfig(
        max_output_tokens=2048,
        temperature=0.8,
        response_mime_type="application/json"
    )

    try:
        response_text = _generate_with_fallback(contents=prompt, config=config)
        # Strip potential markdown backticks just in case
        clean_json = response_text.replace('```json', '').replace('```', '').strip()
        return json.loads(clean_json)
    except Exception as e:
        print(f"[Agent] Suggestions generation failed: {e}. Returning defaults...")
        return {
            "hidden_gems": [
                {"title": "Cola Beach Lagoon", "description": "A quiet freshwater lagoon meeting the sea in South Goa.", "icon": "fa-water"},
                {"title": "Bahubali Hills", "description": "Stunning viewpoint overlooking Badi Lake in Udaipur.", "icon": "fa-mountain"}
            ],
            "food_recommendations": [
                {"title": "Dal Baati Churma", "description": "Authentic Rajasthani wheat balls served with ghee and lentils.", "icon": "fa-bowl-rice"},
                {"title": "Goan Fish Curry Rice", "description": "Traditional spicy coconut fish curry with red rice.", "icon": "fa-utensils"}
            ]
        }