# Copyright (C) 2026 StableLlama
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

"""Shared metadata patch models and helpers for safe partial updates."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class TextPatch(BaseModel):
    """Patch operation for text fields."""

    operation: Literal["replace", "append", "prepend", "replace_text"] = Field(
        ...,
        description=(
            "replace = set full value, append/prepend = add text while keeping"
            " existing content, replace_text = replace old_text with new_text."
        ),
    )
    value: str | None = Field(
        None,
        description="Text value used by replace/append/prepend operations.",
    )
    old_text: str | None = Field(
        None,
        description="Exact text to find when operation=replace_text.",
    )
    new_text: str | None = Field(
        None,
        description="Replacement text used when operation=replace_text.",
    )
    occurrence: Literal["first", "last", "all", "unique"] = Field(
        "first",
        description=(
            "Which match to replace when operation=replace_text. "
            "unique fails unless exactly one match exists."
        ),
    )

    @model_validator(mode="after")
    def _validate_shape(self) -> "TextPatch":
        if self.operation in ("replace", "append", "prepend"):
            if self.value is None:
                raise ValueError(
                    "value is required for replace/append/prepend operations"
                )
        if self.operation == "replace_text":
            if self.old_text is None or self.new_text is None:
                raise ValueError(
                    "old_text and new_text are required for replace_text operation"
                )
        return self


class StringListPatch(BaseModel):
    """Patch operation for string list fields (tags, synonyms, images)."""

    set: list[str] | None = Field(
        None,
        description="Optional full replacement list before add/remove operations.",
    )
    add: list[str] | None = Field(
        None,
        description="Values to add while preserving untouched existing values.",
    )
    remove: list[str] | None = Field(
        None,
        description="Values to remove from the current list.",
    )
    clear: bool = Field(False, description="Clear the existing list before add/set.")
    unique: bool = Field(
        True,
        description="If true, deduplicate while preserving first-seen order.",
    )


class ConflictPatchOperation(BaseModel):
    """One atomic conflict-list change."""

    op: Literal["add", "insert", "replace", "update", "remove", "clear"] = Field(
        ...,
        description=(
            "add appends, insert inserts at index, replace overwrites at index, "
            "update merges fields into conflict at index, remove removes at index, "
            "clear removes all conflicts."
        ),
    )
    index: int | None = Field(
        None,
        description="Required for insert/replace/update/remove operations.",
    )
    conflict: dict[str, Any] | None = Field(
        None,
        description="Conflict payload for add/insert/replace operations.",
    )
    updates: dict[str, Any] | None = Field(
        None,
        description="Field updates for update operation.",
    )

    @model_validator(mode="after")
    def _validate_shape(self) -> "ConflictPatchOperation":
        if self.op in ("insert", "replace", "update", "remove") and self.index is None:
            raise ValueError("index is required for insert/replace/update/remove")
        if self.op in ("add", "insert", "replace") and self.conflict is None:
            raise ValueError("conflict is required for add/insert/replace")
        if self.op == "update" and self.updates is None:
            raise ValueError("updates is required for update")
        return self


class ConflictListPatch(BaseModel):
    """Patch operation for conflict list fields."""

    operations: list[ConflictPatchOperation] = Field(
        ...,
        description="Ordered operations to apply to the conflicts list.",
    )


def apply_text_patch(current: str, patch: TextPatch) -> str:
    """Apply a text patch and return updated value."""
    text = current or ""
    if patch.operation == "replace":
        return patch.value or ""
    if patch.operation == "append":
        return text + (patch.value or "")
    if patch.operation == "prepend":
        return (patch.value or "") + text

    old_text = patch.old_text or ""
    new_text = patch.new_text or ""
    count = text.count(old_text)
    if count == 0:
        raise ValueError("replace_text failed: old_text was not found")

    if patch.occurrence == "unique":
        if count != 1:
            raise ValueError(f"replace_text failed: expected one match, found {count}")
        return text.replace(old_text, new_text, 1)

    if patch.occurrence == "all":
        return text.replace(old_text, new_text)

    if patch.occurrence == "last":
        idx = text.rfind(old_text)
        return text[:idx] + new_text + text[idx + len(old_text) :]

    return text.replace(old_text, new_text, 1)


def apply_string_list_patch(current: list[str], patch: StringListPatch) -> list[str]:
    """Apply string list patch while preserving existing items by default."""
    result: list[str]
    if patch.set is not None:
        result = list(patch.set)
    elif patch.clear:
        result = []
    else:
        result = list(current or [])

    if patch.add:
        result.extend(patch.add)

    if patch.remove:
        remove_set = set(patch.remove)
        result = [item for item in result if item not in remove_set]

    if patch.unique:
        deduped: list[str] = []
        seen: set[str] = set()
        for item in result:
            if item in seen:
                continue
            seen.add(item)
            deduped.append(item)
        result = deduped

    return result


def apply_conflict_list_patch(
    current: list[dict[str, Any]], patch: ConflictListPatch
) -> list[dict[str, Any]]:
    """Apply ordered conflict-list operations."""
    result = [dict(item) for item in (current or []) if isinstance(item, dict)]

    for op in patch.operations:
        if op.op == "clear":
            result = []
            continue

        if op.op == "add":
            result.append(dict(op.conflict or {}))
            continue

        if op.index is None:
            raise ValueError("Conflict operation is missing index")
        if op.index < 0 or op.index > len(result):
            raise ValueError(
                f"Conflict operation index {op.index} is out of bounds for size {len(result)}"
            )

        if op.op == "insert":
            result.insert(op.index, dict(op.conflict or {}))
        elif op.op == "replace":
            if op.index >= len(result):
                raise ValueError(
                    f"replace index {op.index} is out of bounds for size {len(result)}"
                )
            result[op.index] = dict(op.conflict or {})
        elif op.op == "update":
            if op.index >= len(result):
                raise ValueError(
                    f"update index {op.index} is out of bounds for size {len(result)}"
                )
            merged = dict(result[op.index])
            merged.update(op.updates or {})
            result[op.index] = merged
        elif op.op == "remove":
            if op.index >= len(result):
                raise ValueError(
                    f"remove index {op.index} is out of bounds for size {len(result)}"
                )
            result.pop(op.index)

    return result
