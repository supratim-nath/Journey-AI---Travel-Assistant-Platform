import re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from backend.schemas import ChatRequest, ChatResponse, ItineraryUpdate
from backend.schemas import ItineraryRequest, ItineraryResponse
from backend.schemas import SuggestionRequest, SuggestionResponse
from backend.agent import chat_with_agent, get_curated_suggestions, GeminiQuotaExhaustedError
from backend.itinerary_agent import generate_itinerary
from backend.cache import TTLCache, SingleFlight

app = FastAPI(title="India Travel AI")

# Instantiate Caches and Request Collapsers
itinerary_cache = TTLCache(maxsize=100, ttl=3600) # Cache itineraries for 1 hour
suggestions_cache = TTLCache(maxsize=100, ttl=1800) # Cache suggestions for 30 mins
flight_coordinator = SingleFlight()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5001",
        "http://127.0.0.1:5001",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Travel AI Backend Running"}

@app.get("/api/health")
def api_health():
    try:
        from google import genai
        from backend.agent import API_KEYS
        
        if not API_KEYS:
            return {"status": "error", "message": "No API keys configured. Set GEMINI_API_KEY environment variable."}
            
        client = genai.Client(api_key=API_KEYS[0])
        models = client.models.list()
        # Collect model info
        model_names = [m.name for m in models]
        return {"status": "ok", "available_models": model_names}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Chat conversation endpoint
@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    try:
        reply = chat_with_agent(
            request.session_id,
            request.message,
            request.current_itinerary,
            request.history
        )
    except GeminiQuotaExhaustedError as q_err:
        raise HTTPException(status_code=429, detail="Gemini API rate limit exceeded. Ritu is catching her breath! Please retry in 60 seconds.")
    except Exception as e:
        import logging
        logging.error(f"Error in chat endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Travel co-pilot experienced a temporary processing delay. Please retry.")

    replace_all = False
    if "[FULL_ITINERARY]" in reply:
        replace_all = True
        reply = reply.replace("[FULL_ITINERARY]", "").strip()

    pattern = r"(?:^|\n)[^\w\n]*Day\s+(\d+)[^\w\n]*(.*?)(?=(?:\n[^\w\n]*Day\s+\d+[^\w\n]*)|$)"
    matches = re.findall(pattern, reply, re.DOTALL | re.IGNORECASE)
    
    itinerary_updates = []
    for day_str, activity in matches:
        act_clean = activity.strip()
        if act_clean.startswith(":"):
            act_clean = act_clean[1:].strip()
            
        # Clean up leading location header line (e.g. ": Udaipur" or "Udaipur") if present
        lines = act_clean.split("\n")
        if len(lines) > 1:
            first_line = lines[0].strip()
            # If the first line doesn't start with a bullet point list symbol, discard it
            if not first_line.startswith(("-", "*", "•", "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.")):
                act_clean = "\n".join(lines[1:]).strip()
                
        try:
            itinerary_updates.append(ItineraryUpdate(
                day=int(day_str),
                activity=act_clean
            ))
        except ValueError:
            pass

    return ChatResponse(
        response=reply,
        itinerary_updates=itinerary_updates if itinerary_updates else None,
        replace_all=replace_all
    )


# Itinerary generator endpoint
@app.post("/generate-itinerary")
def create_itinerary(request: ItineraryRequest):
    data = request.model_dump() if hasattr(request, "model_dump") else request.dict()
    dest = str(data.get('destination', 'India')).strip().lower()
    days = str(data.get('days', 3))
    budget = str(data.get('budget', 'Variable'))
    vibe = str(data.get('interests', 'Attractions'))
    traveler = str(data.get('traveler_type', 'Any'))
    cache_key = f"itinerary:{dest}:{days}:{budget}:{vibe}:{traveler}"
    
    # 1. Read Cache
    cached_result = itinerary_cache.get(cache_key)
    if cached_result:
        return ItineraryResponse(itinerary=cached_result)
        
    # 2. Not cached - run in SingleFlight collapser
    try:
        result = flight_coordinator.run(cache_key, generate_itinerary, data)
        # Write Cache
        itinerary_cache.set(cache_key, result)
        return ItineraryResponse(itinerary=result)
    except GeminiQuotaExhaustedError as q_err:
        raise HTTPException(status_code=429, detail="Gemini API rate limit exceeded. Ritu is catching her breath! Please retry in 60 seconds.")
    except Exception as e:
        import logging
        logging.error(f"Error in generate-itinerary endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate the trip itinerary.")


# AI Suggestions endpoint
@app.post("/suggestions", response_model=SuggestionResponse)
def compute_suggestions(request: SuggestionRequest):
    hist = ",".join(sorted(request.history)) if request.history else "none"
    query = (request.query or "").strip().lower()
    cache_key = f"suggestions:{hist}:{query}"
    
    # 1. Read Cache
    cached_result = suggestions_cache.get(cache_key)
    if cached_result:
        return SuggestionResponse(**cached_result)
        
    # 2. Not cached - run in SingleFlight collapser
    try:
        result = flight_coordinator.run(cache_key, get_curated_suggestions, request.history, request.query)
        # Write Cache
        suggestions_cache.set(cache_key, result)
        return SuggestionResponse(**result)
    except GeminiQuotaExhaustedError as q_err:
        raise HTTPException(status_code=429, detail="Gemini API rate limit exceeded. Ritu is catching her breath! Please retry in 60 seconds.")
    except Exception as e:
        import logging
        logging.error(f"Error in suggestions endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to compute travel recommendations.")


# Chat history retrieval endpoint
@app.get("/history/{session_id}")
def history(session_id: str):
    try:
        from backend.memory import get_history
        return {"history": get_history(session_id)}
    except Exception as e:
        import logging
        from fastapi import HTTPException
        logging.error(f"Error in history endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve history.")