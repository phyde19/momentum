from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import ActorType, GoalState, GoalType, TaskPriority, TaskStatus


class GoalBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    goal_type: GoalType = GoalType.general
    state: GoalState = GoalState.active
    parent_goal_id: str | None = None


class GoalCreate(GoalBase):
    pass


class GoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    goal_type: GoalType | None = None
    state: GoalState | None = None
    parent_goal_id: str | None = None


class GoalResponse(GoalBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_default: bool
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    version: int


class GoalTreeNode(BaseModel):
    id: str
    title: str
    description: str | None
    goal_type: GoalType
    state: GoalState
    is_default: bool
    children: list["GoalTreeNode"] = Field(default_factory=list)


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    status: TaskStatus = TaskStatus.todo
    priority: TaskPriority = TaskPriority.medium
    due_at: datetime | None = None


class TaskCreate(TaskBase):
    goal_ids: list[str] = Field(default_factory=list)
    primary_goal_id: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due_at: datetime | None = None


class TaskResponse(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    goal_ids: list[str]
    primary_goal_id: str | None
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    version: int


class LinkGoalsRequest(BaseModel):
    goal_ids: list[str] = Field(min_length=1)
    primary_goal_id: str | None = None


class ReasonCreate(BaseModel):
    reason_text: str = Field(min_length=1)


class ReasonUpdate(BaseModel):
    reason_text: str = Field(min_length=1)


class TaskReasonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    task_id: str
    reason_text: str
    author_type: ActorType
    author_id: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class GoalReasonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    goal_id: str
    reason_text: str
    author_type: ActorType
    author_id: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_type: ActorType
    actor_id: str
    action: str
    entity_type: str
    entity_id: str | None
    request_id: str | None
    before_json: dict | None
    after_json: dict | None
    metadata_json: dict | None
    created_at: datetime


class HealthResponse(BaseModel):
    status: str
    service: str
