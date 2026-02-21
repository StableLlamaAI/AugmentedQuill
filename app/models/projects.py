from pydantic import BaseModel
from typing import Optional


class ProjectDeleteRequest(BaseModel):
    name: str


class ProjectSelectRequest(BaseModel):
    name: str


class ProjectCreateRequest(BaseModel):
    name: str
    type: str  # 'short-story', 'novel', 'series'


class ProjectConvertRequest(BaseModel):
    target_type: str


class BookCreateRequest(BaseModel):
    name: str


class BookDeleteRequest(BaseModel):
    name: str


class ImageDescriptionUpdateRequest(BaseModel):
    filename: str
    description: Optional[str] = ""
    title: Optional[str] = ""


class ImagePlaceholderRequest(BaseModel):
    name: Optional[str] = ""
    title: Optional[str] = ""
    description: Optional[str] = ""


class ImageDeleteRequest(BaseModel):
    filename: str
