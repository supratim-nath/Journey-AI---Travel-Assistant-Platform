from google.genai import types
from backend.agent import _generate_with_fallback

ITINERARY_SYSTEM_PROMPT = """You are a structured Indian travel itinerary generator. Your sole task is to generate complete, detailed, day-by-day travel itineraries for Indian destinations.
You must strictly follow the output format requested by the user, starting directly with 'Day 1:' and generating the exact number of requested days.
Provide real, named, geocodable places, with no repetition of locations across days.
Keep descriptions concise but informative, and do not include any introductory, conversational, or concluding text."""

def generate_itinerary(data):
    
    try:
        num_days = int(data.get('days', 3))
    except (ValueError, TypeError):
        num_days = 3

    days_format = ""
    for i in range(1, num_days + 1):
        days_format += (
            f"Day {i}:\n"
            f"- Date: Day {i}\n"
            f"- Morning: \n"
            f"- Afternoon: \n"
            f"- Evening: \n"
            f"- Overnight Stay: \n"
            f"- Estimated Travel Time: \n"
            f"- Estimated Travel Distance: \n"
            f"- Primary Transport Method: \n"
            f"- Important Travel Notes: \n\n"
        )

    prompt = f"""
You are an expert Indian travel itinerary generator specializing in accurate, geocodable itineraries.

STRICT OUTPUT RULES:
- Do NOT write any introduction, greeting, or explanation.
- Start DIRECTLY with "Day 1:" — nothing before it.
- You MUST generate exactly {num_days} days.
- Each day MUST follow the EXACT structured key-value format shown below.
- Each time slot MUST mention at least 1-2 specific named places wrapped in **Double Asterisks**.
- Total minimum: at least 3 unique **bold locations** per day across morning+afternoon+evening.
- CONCISE ACTIVITIES: Keep descriptions extremely short (1 sentence, maximum 15 words for Morning, Afternoon, Evening, and Important Travel Notes). Focus strictly on the named sights. This is critical to ensure the entire {num_days}-day itinerary is generated fully without truncation.

CRITICAL MAP & GEOLOCATION RULES:
1. WRAP EVERY specific place in **Double Asterisks**:
   GOOD: "Visit **Humayun's Tomb** then grab lunch at **Karim's Old Delhi**"
   BAD: "Visit a historic tomb then grab lunch at a famous restaurant"

2. ALL **bold locations** MUST be REAL, NAMED, GEOCODABLE places:
   GOOD: **Amer Fort**, **Jal Mahal**, **Chokhi Dhani**, **1135 AD Restaurant**
   BAD: **Local Restaurant**, **Famous Market**, **Historical Site**, **Cultural Center**

3. NO REPETITION: Track every location you use. Each **bold location** must appear EXACTLY ONCE across the ENTIRE itinerary — never on two different days.

4. FULL NAMES for geocoding accuracy:
   Example: "**Cafe Mondegar Mumbai**" not just "**Cafe Mondegar**"

5. DIVERSITY & COMPLETENESS: Cover the most visited, iconic landmarks. Mix historical sites, nature/parks, local markets/bazaars, cultural shows, and famous cafes/restaurants. Each day must have a completely different theme and cover a distinct neighborhood.

6. ZERO BACKTRACKING: Plan each day as a geographic loop — visit nearby attractions in sequence without doubling back.

7. PRACTICAL INFO: Include entry fees in brackets (e.g., [Entry Rs.100]), best visiting hours, and specific transport costs.

Trip Details:
Destination: {data.get('destination', 'India')}
Days: {num_days}
Traveler Type: {data.get('traveler_type', 'Any')}
Budget Level: {data.get('budget', 'Variable')}
Interests: {data.get('interests', 'Attractions')}

Return format STRICTLY (use this EXACT key format for EVERY day — no deviations):

{days_format.strip()}
"""

    config = types.GenerateContentConfig(
        max_output_tokens=8192,
        temperature=0.7,
        system_instruction=ITINERARY_SYSTEM_PROMPT
    )

    try:
        return _generate_with_fallback(contents=prompt, config=config)
    except Exception as e:
        print(f"[ItineraryAgent] Itinerary generation failed: {e}. Generating default template...")
        dest = data.get('destination', 'India')
        fallback_days = []
        for i in range(1, num_days + 1):
            if i % 3 == 1:
                day_content = (
                    f"Day {i}:\n"
                    f"- Date: Day {i}\n"
                    f"- Morning: Visit the iconic historical landmarks and heritage sites of **{dest} Old Town** [Entry varies].\n"
                    f"- Afternoon: Savor popular local cuisine at the famous **{dest} Food Street**.\n"
                    f"- Evening: Enjoy a cultural performance at **{dest} Cultural Center** and the scenic **{dest} Waterfront Promenade**.\n"
                    f"- Overnight Stay: Heritage guesthouse in the city center\n"
                    f"- Estimated Travel Time: 1 hour 30 mins\n"
                    f"- Estimated Travel Distance: 15 km\n"
                    f"- Primary Transport Method: Auto Rickshaw (Rs.150)\n"
                    f"- Important Travel Notes: Check entry ticket timings in advance. Comfortable shoes recommended."
                )
            elif i % 3 == 2:
                day_content = (
                    f"Day {i}:\n"
                    f"- Date: Day {i}\n"
                    f"- Morning: Take an early nature excursion to the scenic **{dest} Hills** [Free entry].\n"
                    f"- Afternoon: Relax at a popular local cafe **{dest} Garden Cafe** known for regional cuisine.\n"
                    f"- Evening: Browse the bustling local markets at **{dest} Main Bazaar**.\n"
                    f"- Overnight Stay: Mid-range hotel near the main market area\n"
                    f"- Estimated Travel Time: 2 hours\n"
                    f"- Estimated Travel Distance: 25 km\n"
                    f"- Primary Transport Method: Rental Scooter (Rs.400/day) or Cab\n"
                    f"- Important Travel Notes: Book a scooter the evening before. Carry water and sunscreen for outdoor activities."
                )
            else:
                day_content = (
                    f"Day {i}:\n"
                    f"- Date: Day {i}\n"
                    f"- Morning: Discover the cultural heart of the city at **{dest} Museum** and **{dest} Heritage Temple**.\n"
                    f"- Afternoon: Try famous street foods and traditional snacks at **{dest} Local Bazaar**.\n"
                    f"- Evening: Attend a cultural performance at **{dest} Art Gallery**.\n"
                    f"- Overnight Stay: Budget guesthouse or homestay in the cultural district\n"
                    f"- Estimated Travel Time: 1 hour\n"
                    f"- Estimated Travel Distance: 10 km\n"
                    f"- Primary Transport Method: E-Rickshaw (Rs.50-100)\n"
                    f"- Important Travel Notes: Markets close by 8PM. Carry small change for local street food purchases."
                )
            fallback_days.append(day_content)
        return "\n\n".join(fallback_days)