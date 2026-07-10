// File: services/aiService.js

exports.generateItinerary = async ({ destination, days, budget, vibe, traveler_type }) => {
    let rawText = "";
    let warning = null;

    try {
        const raw_ai_url = process.env.AI_BACKEND_URL || 'http://localhost:8000';
        const AI_URL = raw_ai_url.endsWith('/') ? raw_ai_url.slice(0, -1) : raw_ai_url;
        const controller = new AbortController();
        const aiTimeout = setTimeout(() => controller.abort(), 10000); // 10s timeout to prevent Render router timeouts

        const response = await fetch(`${AI_URL}/generate-itinerary`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                destination: destination || "Anywhere",
                days: days || 3,
                traveler_type: traveler_type || vibe || "Traveler",
                budget: typeof budget === "number" ? `₹${budget}` : budget,
                interests: vibe || "General"
            }),
            signal: controller.signal
        });
        clearTimeout(aiTimeout);

        if (!response.ok) {
            let errorText = `HTTP ${response.status}`;
            try {
                const errData = await response.json();
                if (errData.detail) errorText = errData.detail;
            } catch (e) {}
            throw new Error(errorText);
        }

        const data = await response.json();
        rawText = data.itinerary;
        
    } catch (err) {
        console.warn("⚠️ AI Backend down or failed. Using local JS itinerary fallback database. Error:", err.message);
        
        if (err.message.includes("rate limit") || err.message.includes("429") || err.message.includes("ResourceExhausted") || err.message.includes("breath")) {
            warning = "Gemini API rate limit exceeded. Ritu has generated a standard custom itinerary offline for you.";
        } else {
            warning = "AI Service temporarily unavailable. Ritu has generated a standard custom itinerary offline for you.";
        }
        
        const MOCK_ITINERARIES = {
            goa: [
                "### Day {i}: North Goa Beaches & Latin Quarter Heritage\n- Morning: Start with a scenic walking tour through the colorful Portuguese-style streets of **Fontainhas Latin Quarter**.\n- Afternoon: Sunbathe at **Baga Beach** and savor a fresh seafood platter at the legendary **Britto's Restaurant** [₹1,200].\n- Evening: Catch a breathtaking sunset from **Chapora Fort** and enjoy the cooling sea breeze.\n- Transport: Take a local auto-rickshaw (₹150) or hire a scooter (₹400/day).",
                "### Day {i}: Old Goa Churches & Spice Plantation Tour\n- Morning: Explore the historic **Basilica of Bom Jesus** to view the relics of St. Francis Xavier, and walk to **Se Cathedral**.\n- Afternoon: Take a guided tour at **Sahakari Spice Farm** in Ponda, tasting fresh spices and enjoying a Goan buffet lunch [₹500].\n- Evening: Cruise along the Mandovi River on the **Mandovi River Cruise** with live Goan folk music [₹700].\n- Transport: Hire a private taxi (₹1,800/day).",
                "### Day {i}: South Goa Coastal Scenic Wonders\n- Morning: Relax on the peaceful, crescent-shaped cove of **Palolem Beach** for swimming [Free entry].\n- Afternoon: Indulge in authentic Goan fish curry rice at the seaside **Dropadi Restaurant** [₹800].\n- Evening: Walk through the historic ruins of **Cabo de Rama Fort** and watch the sunset.\n- Transport: Use local bus (₹40) or rent a scooter (₹450/day).",
                "### Day {i}: Flea Markets & Hidden Lagoons\n- Morning: Shop for unique souvenirs and local handicrafts at the vibrant **Anjuna Flea Market**.\n- Afternoon: Sip fresh coconut water at **Calangute Beach** followed by local Goan lunch at **Martin's Corner** [₹1,000].\n- Evening: Explore the quiet waters of **Arambol Sweet Water Lake** and take a dip.\n- Transport: Rent a scooter (₹400/day)."
            ],
            jaip: [
                "### Day {i}: Royal Palaces & Sunrise Fort Walk\n- Morning: Watch the sunrise at the majestic **Amer Fort** and explore the Sheesh Mahal (Mirror Palace) [Entry ₹100].\n- Afternoon: Savor a traditional Rajasthani Dal Baati Churma thali at **Laxmi Mishthan Bhandar** [₹600].\n- Evening: Admire the facade of **Hawa Mahal** (Palace of Winds) and watch the sunset from **Nahargarh Fort**.\n- Transport: Take an e-rickshaw (₹80) or hire a local auto (₹200).",
                "### Day {i}: Science, Craft & Cultural village Dining\n- Morning: Discover the ancient astronomical instruments at **Jantar Mantar** and tour the **Jaipur City Palace** [Entry ₹200].\n- Afternoon: Visit **Patrika Gate** for photos and have snacks at **Masala Chowk** street food court [₹300].\n- Evening: Immerse yourself in village culture, folk dances, and unlimited Rajasthani dining at **Chokhi Dhani** [₹900].\n- Transport: Book a private cab (₹1,500 for the day).",
                "### Day {i}: Ancient Temples & Museum Galleries\n- Morning: Hike up to the sacred **Galta Ji Monkey Temple** hidden in the mountain clefts.\n- Afternoon: Relish a delicious Pyaaz Kachori at **Rawat Mishthan Bhandar** and shop at Johari Bazaar [₹200].\n- Evening: Explore the historical exhibits at **Albert Hall Museum** and walk the royal gardens of **Sisodia Rani Ka Bagh**.\n- Transport: Take a local auto-rickshaw (₹150)."
            ],
            udaip: [
                "### Day {i}: Lakeside Palaces & Sunset Boat Cruise\n- Morning: Tour the massive **City Palace Udaipur** overlooking Lake Pichola [Entry ₹250].\n- Afternoon: Enjoy a multi-cuisine lakeside lunch at **Ambrai Ghat** with views of Lake Palace [₹1,000].\n- Evening: Enjoy a peaceful **Lake Pichola Boat Ride** and watch the sunset near Gangaur Ghat.\n- Transport: Take an e-rickshaw (₹50) or walk through old city alleys.",
                "### Day {i}: Monsoon Vistas & Cultural Dance Shows\n- Morning: Drive up to the hilltop **Sajjangarh Monsoon Palace** for panoramic views of Udaipur's lakes [Entry ₹150].\n- Afternoon: Visit **Saheliyon ki Bari** royal fountain gardens and seek blessings at **Jagdish Temple**.\n- Evening: Watch a traditional Rajasthani puppet and folk dance show at **Bagore ki Haveli** [₹150].\n- Transport: Rent a scooter (₹450/day) or hire a taxi (₹1,200).",
                "### Day {i}: Crafts Villages & Elevated Peaks\n- Morning: Hike up to **Bahubali Hills** for an incredible 360-degree view of Badi Lake.\n- Afternoon: Savor an unlimited authentic thali at **Natraj Dining Hall** [₹300].\n- Evening: Shop for local clay pottery and paintings at **Shilpgram Craft Village** and take the **Karni Mata Ropeway**.\n- Transport: Use local auto-rickshaws (₹250)."
            ],
            manal: [
                "### Day {i}: Adventure Valleys & Ancient Temple Walks\n- Morning: Experience paragliding and zorbing in **Solang Valley** [Activities ₹1,000-₹3,000].\n- Afternoon: Walk through the pine forest to the historic wood-carved **Hadimba Devi Temple** [Free entry].\n- Evening: Sip hot mountain tea and explore the vibrant shops along **Mall Road Manali**.\n- Transport: Hire a local taxi (₹800) or walk.",
                "### Day {i}: Snowy Passes & Riverside Dining\n- Morning: Drive up the winding roads to the high-altitude **Rohtang Pass** for snow views [Permit required, ₹550].\n- Afternoon: Relax on the riverside seating at **Johnson's Cafe** and enjoy their specialty wood-fired trout fish [₹800].\n- Evening: Explore the quiet streets and monasteries of **Old Manali Café Gali**.\n- Transport: Hire a local union taxi (₹2,500).",
                "### Day {i}: Forest Waterfalls & Hot Springs\n- Morning: Take a scenic forest trek to the cascading **Jogini Waterfalls**.\n- Afternoon: Soak in the natural therapeutic hot sulfur baths at **Vashisht Hot Springs**.\n- Evening: Walk the pine pathways of **Van Vihar Park** along the Beas River and visit the **Tibetan Monastery Manali**.\n- Transport: Take an auto-rickshaw (₹150)."
            ],
            varanas: [
                "### Day {i}: Sacred Temples & Majestic Evening Aarti\n- Morning: Seek blessings at the golden spire of **Kashi Vishwanath Temple**.\n- Afternoon: Savor hot crispy kachoris at the historic **Kachori Gali** and taste a creamy lassi at **Blue Lassi Shop** [₹150].\n- Evening: Watch the spectacular Ganga Aarti ceremony from the steps of **Dashashwamedh Ghat**.\n- Transport: Take an e-rickshaw (₹50) or walk through narrow alleys.",
                "### Day {i}: Sunrise River Cruise & Buddhist Heritage\n- Morning: Experience a magical **Ganga River Cruise** at sunrise to see the daily bathing rituals [₹300].\n- Afternoon: Travel to **Sarnath Buddhist Site** to explore the ancient stupas and archaeological museum [Entry ₹20].\n- Evening: Watch traditional Indian wrestling practices at **Tulsi Ghat** akharas and shop for silk sarees.\n- Transport: Hire an auto-rickshaw (₹300 round trip to Sarnath).",
                "### Day {i}: Historical Forts & Rooftop Dining\n- Morning: Travel by boat to the 17th-century riverside **Ramnagar Fort** [Entry ₹50].\n- Afternoon: Try Banarasi Tamatar Chaat at **Deena Chaat Bhandar** [₹80].\n- Evening: Savor organic baked goods at **Brown Bread Bakery** on their rooftop overlooking Assi Ghat.\n- Transport: Take a shared auto (₹30) or private auto (₹150)."
            ],
            keral: [
                "### Day {i}: Munnar Tea Gardens & National Parks\n- Morning: Walk through the lush, misty tea estates of **Munnar Tea Gardens**.\n- Afternoon: Spot the rare Nilgiri Tahr at **Eravikulam National Park** and tour the **Mattupetty Dam** [Entry ₹200].\n- Evening: Savor authentic Malabar chicken curry at **Halais Restaurant** [₹400].\n- Transport: Hire a private car (₹2,000/day).",
                "### Day {i}: Backwater Houseboat Cruise & Feasts\n- Morning: Board a traditional thatched **Alleppey Houseboat Cruise** on the backwaters [₹8,000-₹12,000/night].\n- Afternoon: Savor a massive traditional **Sadya** feast served on banana leaves on board the houseboat.\n- Evening: Relax on the deck as the boat cruises along the scenic canals of **Vembanad Lake**.\n- Transport: Included in the houseboat package.",
                "### Day {i}: Heritage Streets & Clifftop Beaches\n- Morning: Tour the historic **Fort Kochi Chinese Nets** and see the Dutch Palace.\n- Afternoon: Visit **Kathakali Center** for a cultural make-up session and watch a live show [₹300].\n- Evening: Walk along the stunning **Varkala Cliff** and dine at the clifftop **Darjeeling Cafe Varkala**.\n- Transport: Take a local taxi or KSRTC bus (₹250)."
            ],
            mumbai: [
                "### Day {i}: Colonial Monuments & Marine Drive Walks\n- Morning: Walk through the historic **Gateway of India** and admire **Chhatrapati Shivaji Terminus**.\n- Afternoon: Savor the famous mutton keema at the legendary **Leopold Cafe** in Colaba [₹600].\n- Evening: Take a sunset stroll along the curving promenade of **Marine Drive**.\n- Transport: Take a black-and-yellow taxi (metered, typical short ride ₹80).",
                "### Day {i}: Cave Explorations & Seaside Dining\n- Morning: Board a ferry to **Elephanta Caves** to explore the rock-cut temples [Ferry ₹200, Entry ₹40].\n- Afternoon: Enjoy traditional chaat and ice cream at **Girgaon Chowpatty** [₹150].\n- Evening: Walk the Bollywood-themed promenade of **Bandra Bandstand** and drive across **Bandra-Worli Sea Link**.\n- Transport: Use local trains (₹15) or booking Ola/Uber.",
                "### Day {i}: Local Markets & Heritage Dining\n- Morning: Experience the bustling energy of **Crawford Market** for shopping.\n- Afternoon: Indulge in the famous Berry Pulav at the historic Parsi restaurant **Britannia & Co Restaurant** [₹700].\n- Evening: Seek blessings at the **Siddhivinayak Temple** and watch the sea waves at Haji Ali.\n- Transport: Take a local taxi (₹250)."
            ],
            ladakh: [
                "### Day {i}: Leh Palace & Shanti Stupa\n- Morning: Climb up to the historic **Leh Palace** overlooking the city [Entry ₹20].\n- Afternoon: Savor a hot apricot pie at the popular **Gesmo Restaurant** [₹250].\n- Evening: Watch the sunset and spin the prayer wheels at the white-domed **Shanti Stupa**.\n- Transport: Rent a local taxi (₹600) or walk.",
                "### Day {i}: High Mountain Passes & Sand Dunes\n- Morning: Drive across the high-altitude **Khardung La Pass** at 5,359 meters.\n- Afternoon: Explore the double-humped Bactrian camels at **Hunder Sand Dunes** in Nubra Valley [Ride ₹300].\n- Evening: Visit the majestic **Diskit Monastery** with its 100ft tall Buddha statue.\n- Transport: Book a shared or private SUV cab (₹6,000 for 2 days).",
                "### Day {i}: High-Altitude Saltwater Lakes\n- Morning: Stand by the turquoise blue waters of the breathtaking **Pangong Tso Lake**.\n- Afternoon: Stay in a lakeside camp at **Spangmik Village** and enjoy a hot bowl of Ladakhi Thukpa [₹350].\n- Evening: Stroll through the scenic village paths and watch the stars over the Himalayas.\n- Transport: Included in SUV package."
            ],
            delhi: [
                "### Day {i}: Historical Tombs & Mughlai Dining\n- Morning: Explore the red sandstone ruins of the ancient **Qutub Minar** [Entry ₹40].\n- Afternoon: Travel to Old Delhi and feast on authentic Mughlai mutton stew at **Karim's Restaurant** [₹700].\n- Evening: Pay respects at the **India Gate** war memorial and walk the retail lawns.\n- Transport: Take the Delhi Metro (Yellow Line, ₹40).",
                "### Day {i}: Mughal Citadels & Street Food Walks\n- Morning: Walk through the massive ramparts of the **Red Fort** (Lal Qila) [Entry ₹50].\n- Afternoon: Go on a sensory street food walking tour through the crowded lanes of **Chandni Chowk** [₹300].\n- Evening: Visit the magnificent **Humayun's Tomb** at sunset, a precursor to the Taj Mahal.\n- Transport: Take the metro or an auto-rickshaw (₹100).",
                "### Day {i}: Modern Temples & Craft Markets\n- Morning: Experience the peace and quiet of the flower-shaped **Lotus Temple**.\n- Afternoon: Shop for regional handicrafts and taste pan-Indian food stalls at **Dilli Haat** [Entry ₹30].\n- Evening: Watch the laser light and water show at the massive **Akshardham Temple**.\n- Transport: Use the Delhi Metro (Blue Line, ₹40)."
            ],
            agra: [
                "### Day {i}: The Wonder of the World & Red Forts\n- Morning: Beat the crowds and witness the sunrise at the stunning white-marble **Taj Mahal** [Entry ₹50].\n- Afternoon: Savor a royal Mughlai lunch at the upscale **Pinch of Spice Restaurant** [₹800].\n- Evening: Walk the massive red sandstone walls of **Agra Fort** and see the chambers [Entry ₹50].\n- Transport: Take an electric auto-rickshaw (₹100) or walk.",
                "### Day {i}: Ancient Ghost Cities & Sunset Gardens\n- Morning: Take a day excursion to **Fatehpur Sikri** to see Buland Darwaza and Akbar's palace [Entry ₹50].\n- Afternoon: Try the famous local sweet 'Agra Petha' at Panchhi Petha [₹100].\n- Evening: Watch the Taj Mahal reflect the orange sky from **Mehtab Bagh** gardens across the river.\n- Transport: Hire a local taxi (₹1,500 round trip)."
            ],
            andaman: [
                "### Day {i}: Asian Blue Heavens & Freedom Memorials\n- Morning: Walk the white sands of **Radhanagar Beach**, rated as Asia's finest beach.\n- Afternoon: Savor fresh seafood and local juices at the popular **Anju Coco Restaurant** [₹700].\n- Evening: Tour the historic chambers of **Cellular Jail** and watch the light and sound show [Entry ₹50].\n- Transport: Hire a local taxi or scooter (₹500/day).",
                "### Day {i}: Scuba Diving & Island Adventures\n- Morning: Go scuba diving or snorkeling among coral reefs at **Havelock Island** [Diving ₹3,500].\n- Afternoon: Enjoy a beachside lunch at **Something Different Restaurant** [₹600].\n- Evening: Take a boat to the historic ruins of **Ross Island** to see colonial heritage.\n- Transport: Board the government or private ferry (₹600-₹1,200)."
            ]
        };

        const destClean = (destination || '').trim().toLowerCase();
        let matchedKey = 'delhi';
        for (const key of Object.keys(MOCK_ITINERARIES)) {
            if (destClean.includes(key) || (key === 'keral' && destClean.includes('munnar'))) {
                matchedKey = key;
                break;
            }
        }

        const list = MOCK_ITINERARIES[matchedKey];
        const daysCount = parseInt(days) || 3;
        const days_itinerary = [];
        for (let i = 1; i <= daysCount; i++) {
            const idx = (i - 1) % list.length;
            const day_content = list[idx].replace(/\{i\}/g, i.toString());
            days_itinerary.push(day_content);
        }
        rawText = days_itinerary.join("\n\n");
    }

    // Parse the raw generic text into the strict JSON object the frontend expects
    const schedule = [];
    
    // Regex matches "Day <number>:" followed by any text until the next "Day <number>:"
    const dayRegex = /(?:^|\n)[^\w\n]*Day\s+(\d+)[^\w\n]*:?[ \t]*\n?(.*?)(?=(?:\n[^\w\n]*Day\s+\d+)|$)/gis;
    
    let match;
    while ((match = dayRegex.exec(rawText)) !== null) {
        const dayNum = parseInt(match[1]);
        const activity = match[2].trim();
        schedule.push({
            day: dayNum,
            activity: activity,
            location: destination
        });
    }

    // Fallback if the AI messes up the formatting so badly that the regex misses
    if (schedule.length === 0) {
        schedule.push({
            day: 1,
            activity: rawText.trim(),
            location: destination
        });
    }

    return {
        overview: `A custom ${vibe} trip to ${destination}.`,
        schedule: schedule,
        warning: warning
    };
};