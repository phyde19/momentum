from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    ActorType,
    AuditEvent,
    Goal,
    GoalState,
    GoalType,
    Task,
    TaskGoalLink,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def serialize_model(model: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for column in model.__table__.columns:
        value = getattr(model, column.name)
        if hasattr(value, "value"):
            payload[column.name] = value.value
        elif isinstance(value, datetime):
            payload[column.name] = value.isoformat()
        else:
            payload[column.name] = value
    return payload


def create_audit_event(
    db: Session,
    *,
    actor_type: ActorType,
    actor_id: str,
    action: str,
    entity_type: str,
    entity_id: str | None,
    request_id: str | None,
    before_json: dict[str, Any] | None,
    after_json: dict[str, Any] | None,
    metadata_json: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditEvent(
            actor_type=actor_type,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            request_id=request_id,
            before_json=before_json,
            after_json=after_json,
            metadata_json=metadata_json,
        )
    )


def ensure_default_goal(db: Session) -> Goal:
    default_goal = db.scalar(
        select(Goal).where(and_(Goal.is_default.is_(True), Goal.deleted_at.is_(None)))
    )
    if default_goal:
        return default_goal

    settings = get_settings()
    created = Goal(
        title=settings.default_goal_title,
        description=settings.default_goal_description,
        goal_type=GoalType(settings.default_goal_type),
        state=GoalState.active,
        is_default=True,
    )
    db.add(created)
    db.flush()
    return created


def get_goal_or_404(db: Session, goal_id: str, *, include_deleted: bool = False) -> Goal:
    stmt: Select[tuple[Goal]] = select(Goal).where(Goal.id == goal_id)
    if not include_deleted:
        stmt = stmt.where(Goal.deleted_at.is_(None))
    goal = db.scalar(stmt)
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found.")
    return goal


def get_task_or_404(db: Session, task_id: str, *, include_deleted: bool = False) -> Task:
    stmt: Select[tuple[Task]] = select(Task).where(Task.id == task_id)
    if not include_deleted:
        stmt = stmt.where(Task.deleted_at.is_(None))
    task = db.scalar(stmt)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    return task


def ensure_goal_is_linkable(goal: Goal) -> None:
    if goal.deleted_at is not None or goal.state == GoalState.archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Goal {goal.id} is archived or deleted and cannot be linked.",
        )


def get_task_goal_ids(db: Session, task_id: str) -> list[str]:
    return list(db.scalars(select(TaskGoalLink.goal_id).where(TaskGoalLink.task_id == task_id)))


def get_primary_goal_id(db: Session, task_id: str) -> str | None:
    return db.scalar(
        select(TaskGoalLink.goal_id).where(
            and_(TaskGoalLink.task_id == task_id, TaskGoalLink.is_primary.is_(True))
        )
    )


def ensure_task_has_goal_links(db: Session, task_id: str) -> None:
    count = db.scalar(
        select(func.count()).select_from(TaskGoalLink).where(TaskGoalLink.task_id == task_id)
    )
    if not count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task must be linked to at least one goal.",
        )
