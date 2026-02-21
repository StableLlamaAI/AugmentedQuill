import json as _json


def tool_message(name: str, call_id: str, content) -> dict:
    return {
        "role": "tool",
        "tool_call_id": call_id,
        "name": name,
        "content": _json.dumps(content),
    }


def tool_error(name: str, call_id: str, message: str) -> dict:
    return tool_message(name, call_id, {"error": message})
