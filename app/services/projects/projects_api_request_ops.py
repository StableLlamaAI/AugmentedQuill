from __future__ import annotations

from fastapi import HTTPException, Request


async def parse_json_body(request: Request) -> dict:
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    return payload or {}


def payload_value(payload: dict, key: str, default=None):
    return payload.get(key, default)


def required_payload_value(payload: dict, key: str, error_detail: str):
    value = payload.get(key)
    if value in (None, ""):
        raise HTTPException(status_code=400, detail=error_detail)
    return value
