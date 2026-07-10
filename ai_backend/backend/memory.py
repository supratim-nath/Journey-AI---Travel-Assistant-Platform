from collections import defaultdict

memory_store = defaultdict(list)


def get_history(session_id: str):
    return memory_store[session_id]


def add_message(session_id: str, role: str, content: str):
    history = memory_store[session_id]
    history.append({
        "role": role,
        "content": content
    })
    # Keep only the last 20 messages to prevent memory leak
    if len(history) > 20:
        memory_store[session_id] = history[-20:]