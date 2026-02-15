from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class GoalType(str, enum.Enum):
    path = "path"
    vehicle = "vehicle"
    general = "general"


class GoalState(str, enum.Enum):
    active = "active"
    paused = "paused"
    abandoned = "abandoned"
    completed = "completed"
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


class ActorType(str, enum.Enum):
    human = "human"
    agent = "agent"
    system = "system"


GOAL_TYPE_ENUM = Enum(GoalType, name="goal_type")
GOAL_STATE_ENUM = Enum(GoalState, name="goal_state")
TASK_STATUS_ENUM = Enum(TaskStatus, name="task_status")
TASK_PRIORITY_ENUM = Enum(TaskPriority, name="task_priority")
ACTOR_TYPE_ENUM = Enum(ActorType, name="actor_type")


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    goal_type: Mapped[GoalType] = mapped_column(GOAL_TYPE_ENUM, nullable=False)
    state: Mapped[GoalState] = mapped_column(
        GOAL_STATE_ENUM,
        nullable=False,
        default=GoalState.active,
    )
    parent_goal_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("goals.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utcnow,
        onupdate=utcnow,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    parent: Mapped[Goal | None] = relationship(
        "Goal",
        remote_side=[id],
        back_populates="children",
    )
    children: Mapped[list[Goal]] = relationship("Goal", back_populates="parent")
    task_links: Mapped[list[TaskGoalLink]] = relationship(
        "TaskGoalLink",
        back_populates="goal",
        cascade="all, delete-orphan",
    )
    reasons: Mapped[list[GoalReason]] = relationship(
        "GoalReason",
        back_populates="goal",
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
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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

    goal_links: Mapped[list[TaskGoalLink]] = relationship(
        "TaskGoalLink",
        back_populates="task",
        cascade="all, delete-orphan",
    )
    reasons: Mapped[list[TaskReason]] = relationship(
        "TaskReason",
        back_populates="task",
        cascade="all, delete-orphan",
    )


class TaskGoalLink(Base):
    __tablename__ = "task_goal_links"

    task_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        primary_key=True,
    )
    goal_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("goals.id", ondelete="CASCADE"),
        primary_key=True,
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    task: Mapped[Task] = relationship("Task", back_populates="goal_links")
    goal: Mapped[Goal] = relationship("Goal", back_populates="task_links")


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


class GoalReason(Base):
    __tablename__ = "goal_reasons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    goal_id: Mapped[str] = mapped_column(String(36), ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
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

    goal: Mapped[Goal] = relationship("Goal", back_populates="reasons")


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
