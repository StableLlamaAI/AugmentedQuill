from __future__ import annotations

import datetime
import uuid
from typing import Any, Dict, List

# Global list to store LLM communication logs for the current session
llm_logs: List[Dict[str, Any]] = []


def add_llm_log(log_entry: Dict[str, Any]):
    """Add a log entry to the global list, keeping only the last 100 entries."""
    llm_logs.append(log_entry)
    if len(llm_logs) > 100:
        llm_logs.pop(0)


def create_log_entry(
    url: str, method: str, headers: Dict[str, str], body: Any, streaming: bool = False
) -> Dict[str, Any]:
    """Create a new log entry structure."""
    return {
        "id": str(uuid.uuid4()),
        "timestamp_start": datetime.datetime.now().isoformat(),
        "timestamp_end": None,
        "request": {
            "url": url,
            "method": method,
            "headers": {
                k: ("***" if k.lower() == "authorization" else v)
                for k, v in headers.items()
            },
            "body": body,
        },
        "response": {
            "status_code": None,
            "streaming": streaming,
            "chunks": [] if streaming else None,
            "full_content": "" if streaming else None,
            "body": None if not streaming else None,
        },
    }
