from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import (
    ActorType,
    ScheduleType,
    DriverState,
    DriverType,
    InitiativeState,
    PeriodicEndMode,
    PeriodicType,
    TaskPriority,
    TaskStatus,
    TimingMode,
)


class DriverBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    driver_type: DriverType
    state: DriverState = DriverState.active
    parent_driver_id: str | None = None


class DriverCreate(DriverBase):
    pass


class DriverUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    driver_type: DriverType | None = None
    state: DriverState | None = None
    parent_driver_id: str | None = None


class DriverResponse(DriverBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    version: int


class DriverTreeNode(BaseModel):
    id: str
    title: str
    description: str | None
    driver_type: DriverType
    state: DriverState
    parent_driver_id: str | None
    children: list["DriverTreeNode"] = Field(default_factory=list)


class InitiativeBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    state: InitiativeState = InitiativeState.active
    timing_mode: TimingMode = TimingMode.none
    deadline_at: datetime | None = None
    grace_days: int | None = Field(default=None, ge=1)


class InitiativeCreate(InitiativeBase):
    driver_ids: list[str] = Field(default_factory=list)


class InitiativeUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    state: InitiativeState | None = None
    timing_mode: TimingMode | None = None
    deadline_at: datetime | None = None
    grace_days: int | None = Field(default=None, ge=1)
    driver_ids: list[str] | None = None


class InitiativeResponse(InitiativeBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    driver_ids: list[str]
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    version: int


class ChecklistItem(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    is_done: bool = False


class PeriodicSpec(BaseModel):
    model_config = ConfigDict(extra="allow")


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    status: TaskStatus = TaskStatus.todo
    priority: TaskPriority = TaskPriority.medium
    initiative_id: str | None = None
    timing_mode: TimingMode = TimingMode.none
    deadline_at: datetime | None = None
    grace_days: int | None = Field(default=None, ge=1)
    periodic_type: PeriodicType | None = None
    periodic_spec: PeriodicSpec | None = None
    periodic_end_mode: PeriodicEndMode | None = None
    periodic_end_at: datetime | None = None
    periodic_end_count: int | None = Field(default=None, ge=1)
    checklist_json: list[ChecklistItem] = Field(default_factory=list)


class TaskCreate(TaskBase):
    driver_ids: list[str] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    initiative_id: str | None = None
    timing_mode: TimingMode | None = None
    deadline_at: datetime | None = None
    grace_days: int | None = Field(default=None, ge=1)
    periodic_type: PeriodicType | None = None
    periodic_spec: PeriodicSpec | None = None
    periodic_end_mode: PeriodicEndMode | None = None
    periodic_end_at: datetime | None = None
    periodic_end_count: int | None = Field(default=None, ge=1)
    checklist_json: list[ChecklistItem] | None = None
    driver_ids: list[str] | None = None


class TaskResponse(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    driver_ids: list[str]
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    version: int


class LinkDriversRequest(BaseModel):
    driver_ids: list[str] = Field(min_length=1)


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


class InitiativeReasonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    initiative_id: str
    reason_text: str
    author_type: ActorType
    author_id: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class Block(BaseModel):
    starts_at: datetime
    ends_at: datetime
    slot_key: str | None = None
    offset_days: int | None = None


class ScheduleBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    schedule_type: ScheduleType = ScheduleType.block_set
    starts_at: datetime
    ends_at: datetime
    initiative_id: str | None = None
    task_id: str | None = None
    occurrence_date: date | None = None
    blocks_json: list[Block] = Field(default_factory=list)
    periodic_type: PeriodicType | None = None
    periodic_spec: PeriodicSpec | None = None
    periodic_end_mode: PeriodicEndMode | None = None
    periodic_end_at: datetime | None = None
    periodic_end_count: int | None = Field(default=None, ge=1)


class ScheduleCreate(ScheduleBase):
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    driver_ids: list[str] = Field(default_factory=list)


class ScheduleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    schedule_type: ScheduleType | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    initiative_id: str | None = None
    task_id: str | None = None
    occurrence_date: date | None = None
    blocks_json: list[Block] | None = None
    periodic_type: PeriodicType | None = None
    periodic_spec: PeriodicSpec | None = None
    periodic_end_mode: PeriodicEndMode | None = None
    periodic_end_at: datetime | None = None
    periodic_end_count: int | None = Field(default=None, ge=1)
    driver_ids: list[str] | None = None


class ScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str | None
    schedule_type: ScheduleType
    starts_at: datetime
    ends_at: datetime
    initiative_id: str | None
    task_id: str | None
    occurrence_date: date | None
    blocks_json: list[Block]
    periodic_type: PeriodicType | None
    periodic_spec: PeriodicSpec | None
    periodic_end_mode: PeriodicEndMode | None
    periodic_end_at: datetime | None
    periodic_end_count: int | None
    driver_ids: list[str]
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    version: int


class ScheduleReasonResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    schedule_id: str
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
