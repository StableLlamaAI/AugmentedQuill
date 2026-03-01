# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Domain exception hierarchy for the service layer.

Purpose: Provide HTTP-agnostic domain exceptions that carry enough context for
the API layer (or a global exception handler) to translate them into proper
HTTP responses. Service code should raise these instead of ``HTTPException``
so that it stays decoupled from any web framework.
"""

from __future__ import annotations


class ServiceError(Exception):
    """Base domain exception that carries an HTTP-equivalent status code.

    All service-layer error conditions should be expressed as subclasses
    of this class.  The global exception handler registered in ``main.py``
    translates these into JSON error responses automatically.
    """

    default_status_code: int = 500

    def __init__(self, detail: str, status_code: int | None = None):
        super().__init__(detail)
        self.detail = detail
        self.status_code = (
            status_code if status_code is not None else self.default_status_code
        )


class BadRequestError(ServiceError):
    """Raised when the caller provides invalid or missing input (HTTP 400)."""

    default_status_code = 400


class NotFoundError(ServiceError):
    """Raised when a requested resource does not exist (HTTP 404)."""

    default_status_code = 404


class ConfigurationError(ServiceError):
    """Raised when required configuration is missing or invalid (HTTP 400)."""

    default_status_code = 400


class PersistenceError(ServiceError):
    """Raised when a read/write operation on the file system fails (HTTP 500)."""

    default_status_code = 500


class UpstreamError(ServiceError):
    """Raised when a call to an external service / upstream API fails (HTTP 502)."""

    default_status_code = 502
