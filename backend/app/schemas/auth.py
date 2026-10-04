from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class UserRegister(BaseModel):
    name: str
    email: str
    password: str
    role: str = "candidate"            # candidate, hr
    target_company: Optional[str] = None  # candidates: where they are applying
    target_role: Optional[str] = None     # HR accounts: the company they recruit for

class UserLogin(BaseModel):
    email: str
    password: str

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    target_company: Optional[str] = None
    target_role: Optional[str] = None

class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str
    target_company: Optional[str] = None
    target_role: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut

class TokenPayload(BaseModel):
    sub: Optional[str] = None
