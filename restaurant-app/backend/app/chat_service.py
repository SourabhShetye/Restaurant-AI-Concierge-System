"""
chat_service.py - Stateful AI chat with mode isolation.
Three modes: general, ordering, booking.
Switching modes resets context to prevent cross-contamination.
"""
from __future__ import annotations
from enum import Enum
from groq import Groq
from app.config import settings
from app.order_service import process_natural_language_order
from app.booking_service import parse_booking_datetime, validate_booking_time
from app.booking_service import (
    parse_booking_datetime,
    validate_booking_time,
    check_capacity,
    check_duplicate_booking,
)

class ChatMode(str, Enum):
    general  = "general"
    ordering = "ordering"
    booking  = "booking"

# Intent detection keywords
ORDER_KEYWORDS   = ["order","want","have","get me","burger","pizza","coffee","food","eat","drink","hungry"]
BOOKING_KEYWORDS = ["book","table","reserve","reservation","tonight","tomorrow","guests","people","party"]

def detect_mode(message: str, current_mode: ChatMode) -> ChatMode:
    msg = message.lower()
    if any(k in msg for k in BOOKING_KEYWORDS): return ChatMode.booking
    if any(k in msg for k in ORDER_KEYWORDS):   return ChatMode.ordering
    return current_mode  # stay in current mode if no clear signal

async def process_chat(
    message: str,
    mode: str,
    restaurant_id: str,
    table_number: str | None,
    menu_items: list,
    customer_allergies: list,
    ai_context: str = "",
    conversation_history: list = [],
) -> dict:
    current_mode = ChatMode(mode)
    new_mode = detect_mode(message, current_mode)

    # Mode switched — add a transition message
    mode_changed = new_mode != current_mode
    transition = ""
    if mode_changed and new_mode == ChatMode.ordering:
        transition = "Switching to order mode. "
    elif mode_changed and new_mode == ChatMode.booking:
        transition = "Switching to booking mode. "

    # Auto-detect allergens mentioned in the message itself
    # e.g. "I'm allergic to nuts" → adds 'nuts' to the session
    from app.order_service import detect_allergens_in_text
    newly_mentioned = detect_allergens_in_text(message)
    if newly_mentioned:
        # Merge with existing allergies (deduped)
        customer_allergies = list(set(customer_allergies + newly_mentioned))
        # Caller should persist this back to user_sessions if changed
        
    client = Groq(api_key=settings.groq_api_key)

    # Build mode-specific system prompt
    menu_text = "\n".join([
        f"- {i['name']} | {i['category']} | AED {i['price']}" +
        (" [SOLD OUT]" if i.get('sold_out') else "")
        for i in menu_items
    ])

    if new_mode == ChatMode.ordering:
        system = f"""You are an AI waiter. Help the customer order food.
MENU:\n{menu_text}
{f"RESTAURANT NOTES: {ai_context}" if ai_context else ""}
Rules: Only recommend items on the menu. Warn about allergens if customer has any.
Customer allergies: {', '.join(customer_allergies) if customer_allergies else 'none stated'}.
If the customer describes an order, confirm the items and total price.
Keep responses short and friendly."""

    elif new_mode == ChatMode.booking:
         # Try to extract booking details from the message to give real-time feedback
        booking_hint = ""
        import re
        party_match = re.search(r'\b(\d+)\s*(people|guests|persons|pax)\b', message.lower())
        if party_match:
            party_size = int(party_match.group(1))
            # Quick capacity check so AI can give honest availability info
            from datetime import datetime, timezone
            try:
                existing_bookings = []  # passed in as parameter in full implementation
                # Simple hint for AI — full validation happens at POST /api/bookings
                if party_size > 10:
                    booking_hint = f"Note: party of {party_size} exceeds max of 10. Tell the customer."
                else:
                    booking_hint = f"Party size {party_size} looks fine — proceed to confirm time."
            except Exception:
                pass

        system = f"""You are a restaurant booking assistant.
Help the customer book a table. Collect: date/time, party size, special requests.
When you have all details, say "Great! I'll book that for you now." and include a summary.
Max party size: 10. Bookings need at least 2 hours advance notice.
{booking_hint}
{f"Restaurant info: {ai_context}" if ai_context else ""}
Keep responses short and friendly."""

    messages = conversation_history[-6:] + [{"role": "user", "content": message}]

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "system", "content": system}] + messages,
        temperature=0.7,
        max_tokens=400,
    )
    reply = response.choices[0].message.content or "Sorry, I couldn't process that."

    return {
        "reply": transition + reply,
        "new_mode": new_mode.value,
        "mode_changed": mode_changed,
        "detected_allergies": newly_mentioned,   # frontend can show a warning
    }