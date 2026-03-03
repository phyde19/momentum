from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, select
from sqlalchemy.orm import Session

from app.models import (
    ActorType,
    AuditEvent,
    Block,
    BlockDriverLink,
    Driver,
    DriverState,
    Initiative,
    InitiativeState,
    InitiativeDriverLink,
    Task,
    TaskDriverLink,
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


def get_driver_or_404(db: Session, driver_id: str, *, include_deleted: bool = False) -> Driver:
    stmt: Select[tuple[Driver]] = select(Driver).where(Driver.id == driver_id)
    if not include_deleted:
        stmt = stmt.where(Driver.deleted_at.is_(None))
    driver = db.scalar(stmt)
    if not driver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver not found.")
    return driver


def get_initiative_or_404(
    db: Session, initiative_id: str, *, include_deleted: bool = False
) -> Initiative:
    stmt: Select[tuple[Initiative]] = select(Initiative).where(Initiative.id == initiative_id)
    if not include_deleted:
        stmt = stmt.where(Initiative.deleted_at.is_(None))
    initiative = db.scalar(stmt)
    if not initiative:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Initiative not found.")
    return initiative


def get_task_or_404(db: Session, task_id: str, *, include_deleted: bool = False) -> Task:
    stmt: Select[tuple[Task]] = select(Task).where(Task.id == task_id)
    if not include_deleted:
        stmt = stmt.where(Task.deleted_at.is_(None))
    task = db.scalar(stmt)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
    return task


def ensure_driver_is_linkable(driver: Driver) -> None:
    if driver.deleted_at is not None or driver.state == DriverState.archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Driver {driver.id} is archived or deleted and cannot be linked.",
        )


def ensure_initiative_is_linkable(initiative: Initiative) -> None:
    if initiative.deleted_at is not None or initiative.state == InitiativeState.archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Initiative {initiative.id} is archived or deleted and cannot be linked.",
        )


def ensure_driver_parent_is_valid(db: Session, parent_driver_id: str | None) -> Driver | None:
    if not parent_driver_id:
        return None
    parent = get_driver_or_404(db, parent_driver_id)
    ensure_driver_is_linkable(parent)
    if parent.parent_driver_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Drivers support only one subdriver layer.",
        )
    return parent


def ensure_driver_is_not_descendant(db: Session, driver_id: str, parent_driver_id: str | None) -> None:
    if not parent_driver_id:
        return
    if driver_id == parent_driver_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Driver cannot parent itself.",
        )
    parent = get_driver_or_404(db, parent_driver_id)
    if parent.parent_driver_id == driver_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Drivers support only one subdriver layer.",
        )


def get_task_driver_ids(db: Session, task_id: str) -> list[str]:
    return list(db.scalars(select(TaskDriverLink.driver_id).where(TaskDriverLink.task_id == task_id)))


def get_initiative_driver_ids(db: Session, initiative_id: str) -> list[str]:
    return list(
        db.scalars(
            select(InitiativeDriverLink.driver_id).where(
                InitiativeDriverLink.initiative_id == initiative_id
            )
        )
    )


def task_has_driver_link(db: Session, task_id: str, driver_id: str) -> bool:
    return (
        db.scalar(
            select(TaskDriverLink).where(
                and_(TaskDriverLink.task_id == task_id, TaskDriverLink.driver_id == driver_id)
            )
        )
        is not None
    )


def get_block_or_404(db: Session, block_id: str, *, include_deleted: bool = False) -> Block:
    stmt: Select[tuple[Block]] = select(Block).where(Block.id == block_id)
    if not include_deleted:
        stmt = stmt.where(Block.deleted_at.is_(None))
    block = db.scalar(stmt)
    if not block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block not found.")
    return block


def get_block_driver_ids(db: Session, block_id: str) -> list[str]:
    return list(db.scalars(select(BlockDriverLink.driver_id).where(BlockDriverLink.block_id == block_id)))


def block_has_driver_link(db: Session, block_id: str, driver_id: str) -> bool:
    return (
        db.scalar(
            select(BlockDriverLink).where(
                and_(BlockDriverLink.block_id == block_id, BlockDriverLink.driver_id == driver_id)
            )
        )
        is not None
    )


def initiative_has_driver_link(db: Session, initiative_id: str, driver_id: str) -> bool:
    return (
        db.scalar(
            select(InitiativeDriverLink).where(
                and_(
                    InitiativeDriverLink.initiative_id == initiative_id,
                    InitiativeDriverLink.driver_id == driver_id,
                )
            )
        )
        is not None
    )
