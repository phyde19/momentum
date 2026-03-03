from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class InitiativeState(str, enum.Enum):
    active = "active"
    paused = "paused"
    abandoned = "abandoned"
    completed = "completed"
    archived = "archived"


class DriverType(str, enum.Enum):
    obligation = "obligation"
    risk = "risk"
    leverage = "leverage"
    surplus = "surplus"


class DriverState(str, enum.Enum):
    active = "active"
    archived = "archived"


class TaskStatus(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    blocked = "blocked"
    done = "done"
    archived = "archived"


class TaskPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class TaskRecurrence(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    custom = "custom"


class ActorType(str, enum.Enum):
    human = "human"
    agent = "agent"
    system = "system"


INITIATIVE_STATE_ENUM = Enum(InitiativeState, name="initiative_state")
DRIVER_TYPE_ENUM = Enum(DriverType, name="driver_type")
DRIVER_STATE_ENUM = Enum(DriverState, name="driver_state")
TASK_STATUS_ENUM = Enum(TaskStatus, name="task_status")
TASK_PRIORITY_ENUM = Enum(TaskPriority, name="task_priority")
TASK_RECURRENCE_ENUM = Enum(TaskRecurrence, name="task_recurrence")
ACTOR_TYPE_ENUM = Enum(ActorType, name="actor_type")


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    driver_type: Mapped[DriverType] = mapped_column(DRIVER_TYPE_ENUM, nullable=False)
    state: Mapped[DriverState] = mapped_column(
        DRIVER_STATE_ENUM,
        nullable=False,
        default=DriverState.active,
    )
    parent_driver_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("drivers.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    parent: Mapped[Driver | None] = relationship(
        "Driver",
        remote_side=[id],
        back_populates="children",
    )
    children: Mapped[list[Driver]] = relationship("Driver", back_populates="parent")
    task_links: Mapped[list[TaskDriverLink]] = relationship(
        "TaskDriverLink",
        back_populates="driver",
        cascade="all, delete-orphan",
    )
    initiative_links: Mapped[list[InitiativeDriverLink]] = relationship(
        "InitiativeDriverLink",
        back_populates="driver",
        cascade="all, delete-orphan",
    )


class Initiative(Base):
    __tablename__ = "initiatives"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    state: Mapped[InitiativeState] = mapped_column(
        INITIATIVE_STATE_ENUM,
        nullable=False,
        default=InitiativeState.active,
    )
    due_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    due_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    tasks: Mapped[list[Task]] = relationship("Task", back_populates="initiative")
    driver_links: Mapped[list[InitiativeDriverLink]] = relationship(
        "InitiativeDriverLink",
        back_populates="initiative",
        cascade="all, delete-orphan",
    )
    reasons: Mapped[list[InitiativeReason]] = relationship(
        "InitiativeReason",
        back_populates="initiative",
        cascade="all, delete-orphan",
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(
        TASK_STATUS_ENUM,
        nullable=False,
        default=TaskStatus.todo,
    )
    priority: Mapped[TaskPriority] = mapped_column(
        TASK_PRIORITY_ENUM,
        nullable=False,
        default=TaskPriority.medium,
    )
    initiative_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("initiatives.id", ondelete="SET NULL"),
        nullable=True,
    )
    due_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    due_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recurrence: Mapped[TaskRecurrence | None] = mapped_column(TASK_RECURRENCE_ENUM, nullable=True)
    recurrence_interval: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recurrence_rule: Mapped[str | None] = mapped_column(Text, nullable=True)
    recurrence_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checklist_json: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    initiative: Mapped[Initiative | None] = relationship("Initiative", back_populates="tasks")
    driver_links: Mapped[list[TaskDriverLink]] = relationship(
        "TaskDriverLink",
        back_populates="task",
        cascade="all, delete-orphan",
    )
    reasons: Mapped[list[TaskReason]] = relationship(
        "TaskReason",
        back_populates="task",
        cascade="all, delete-orphan",
    )


class TaskDriverLink(Base):
    __tablename__ = "task_driver_links"

    task_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    driver_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("drivers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    task: Mapped[Task] = relationship("Task", back_populates="driver_links")
    driver: Mapped[Driver] = relationship("Driver", back_populates="task_links")


class InitiativeDriverLink(Base):
    __tablename__ = "initiative_driver_links"

    initiative_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("initiatives.id", ondelete="CASCADE"),
        primary_key=True,
    )
    driver_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("drivers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    initiative: Mapped[Initiative] = relationship("Initiative", back_populates="driver_links")
    driver: Mapped[Driver] = relationship("Driver", back_populates="initiative_links")


class TaskReason(Base):
    __tablename__ = "task_reasons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id: Mapped[str] = mapped_column(String(36), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    reason_text: Mapped[str] = mapped_column(Text, nullable=False)
    author_type: Mapped[ActorType] = mapped_column(
        ACTOR_TYPE_ENUM,
        nullable=False,
    )
    author_id: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    task: Mapped[Task] = relationship("Task", back_populates="reasons")


class InitiativeReason(Base):
    __tablename__ = "initiative_reasons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    initiative_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("initiatives.id", ondelete="CASCADE"),
        nullable=False,
    )
    reason_text: Mapped[str] = mapped_column(Text, nullable=False)
    author_type: Mapped[ActorType] = mapped_column(
        ACTOR_TYPE_ENUM,
        nullable=False,
    )
    author_id: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    initiative: Mapped[Initiative] = relationship("Initiative", back_populates="reasons")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor_type: Mapped[ActorType] = mapped_column(ACTOR_TYPE_ENUM, nullable=False)
    actor_id: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(120), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    before_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    after_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
