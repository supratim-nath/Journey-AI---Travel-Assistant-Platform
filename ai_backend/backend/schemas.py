from pydantic import BaseModel
from typing import List, Optional


class ChatRequest(BaseModel):
    session_id: str
    message: str
    current_itinerary: Optional[dict] = None
    history: Optional[List[dict]] = None


class ItineraryUpdate(BaseModel):
    day: int
    activity: str


class ChatResponse(BaseModel):
    response: str
    itinerary_updates: Optional[List[ItineraryUpdate]] = None
    replace_all: Optional[bool] = False


class ItineraryRequest(BaseModel):
    destination: str
    days: Optional[int] = 3
    traveler_type: str
    budget: str
    interests: str


class ItineraryResponse(BaseModel):
    itinerary: str


class SuggestionRequest(BaseModel):
    history: List[str]
    query: Optional[str] = None



class SuggestionItem(BaseModel):
    title: str
    description: str
    icon: str


class SuggestionResponse(BaseModel):
    hidden_gems: List[SuggestionItem]
    food_recommendations: List[SuggestionItem]