from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.auth import Actor, get_current_actor, get_request_id
from app.config import get_settings
from app.database import Base, engine, get_db
from app.domain import (
    block_has_driver_link,
    create_audit_event,
    ensure_driver_is_linkable,
    ensure_driver_is_not_descendant,
    ensure_driver_parent_is_valid,
    ensure_initiative_is_linkable,
    get_block_driver_ids,
    get_block_or_404,
    get_driver_or_404,
    get_initiative_driver_ids,
    get_initiative_or_404,
    get_task_driver_ids,
    get_task_or_404,
    initiative_has_driver_link,
    serialize_model,
    task_has_driver_link,
    utcnow,
)
from app.models import (
    AuditEvent,
    Block,
    BlockDriverLink,
    BlockReason,
    BlockType,
    Driver,
    DriverState,
    DriverType,
    Initiative,
    InitiativeDriverLink,
    InitiativeReason,
    InitiativeState,
    Task,
    TaskPriority,
    TaskDriverLink,
    TaskReason,
    TaskStatus,
    TimingMode,
)
from app.schemas import (
    AuditEventResponse,
    BlockCreate,
    BlockReasonResponse,
    BlockResponse,
    BlockUpdate,
    DriverCreate,
    DriverResponse,
    DriverTreeNode,
    DriverUpdate,
    HealthResponse,
    InitiativeCreate,
    InitiativeReasonResponse,
    InitiativeResponse,
    InitiativeUpdate,
    LinkDriversRequest,
    ReasonCreate,
    ReasonUpdate,
    TaskCreate,
    TaskReasonResponse,
    TaskResponse,
    TaskUpdate,
)

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _task_response(db: Session, task: Task) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        initiative_id=task.initiative_id,
        timing_mode=task.timing_mode,
        deadline_at=task.deadline_at,
        grace_days=task.grace_days,
        periodic_type=task.periodic_type,
        periodic_spec=task.periodic_spec,
        periodic_end_mode=task.periodic_end_mode,
        periodic_end_at=task.periodic_end_at,
        periodic_end_count=task.periodic_end_count,
        checklist_json=task.checklist_json or [],
        driver_ids=get_task_driver_ids(db, task.id),
        created_by=task.created_by,
        updated_by=task.updated_by,
        created_at=task.created_at,
        updated_at=task.updated_at,
        deleted_at=task.deleted_at,
        version=task.version,
    )


def _initiative_response(db: Session, initiative: Initiative) -> InitiativeResponse:
    return InitiativeResponse(
        id=initiative.id,
        title=initiative.title,
        description=initiative.description,
        state=initiative.state,
        timing_mode=initiative.timing_mode,
        deadline_at=initiative.deadline_at,
        grace_days=initiative.grace_days,
        driver_ids=get_initiative_driver_ids(db, initiative.id),
        created_by=initiative.created_by,
        updated_by=initiative.updated_by,
        created_at=initiative.created_at,
        updated_at=initiative.updated_at,
        deleted_at=initiative.deleted_at,
        version=initiative.version,
    )


def _driver_tree_nodes(drivers: list[Driver]) -> list[DriverTreeNode]:
    node_by_id: dict[str, DriverTreeNode] = {}
    children_by_parent: dict[str | None, list[DriverTreeNode]] = {}
    for driver in drivers:
        node = DriverTreeNode(
            id=driver.id,
            title=driver.title,
            description=driver.description,
            driver_type=driver.driver_type,
            state=driver.state,
            parent_driver_id=driver.parent_driver_id,
            children=[],
        )
        node_by_id[driver.id] = node
        children_by_parent.setdefault(driver.parent_driver_id, []).append(node)

    for driver in drivers:
        node = node_by_id[driver.id]
        node.children = children_by_parent.get(driver.id, [])

    return children_by_parent.get(None, [])


def _validate_timing(
    timing_mode: TimingMode,
    *,
    deadline_at: Any = None,
    grace_days: int | None = None,
    periodic_type: Any = None,
    periodic_spec: Any = None,
    periodic_end_mode: Any = None,
    periodic_end_at: Any = None,
    periodic_end_count: int | None = None,
    entity_kind: str = "task",
) -> None:
    def _bad(detail: str) -> None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    if entity_kind == "task" and timing_mode == TimingMode.indefinite:
        _bad("Tasks cannot use indefinite timing mode.")

    if entity_kind == "initiative" and timing_mode == TimingMode.periodic:
        _bad("Initiatives cannot use periodic timing mode.")

    if timing_mode in (TimingMode.none, TimingMode.indefinite):
        if deadline_at or grace_days or periodic_type or periodic_spec:
            _bad(f"No timing fields allowed when timing_mode is '{timing_mode.value}'.")
        return

    if timing_mode in (TimingMode.deadline, TimingMode.flexible):
        if not deadline_at:
            _bad("deadline_at is required for deadline/flexible timing.")
        if timing_mode == TimingMode.flexible:
            if not grace_days or grace_days < 1:
                _bad("grace_days (>= 1) is required for flexible timing.")
        if periodic_type or periodic_spec:
            _bad("Periodic fields not allowed for deadline/flexible timing.")
        return

    if timing_mode == TimingMode.periodic:
        if not periodic_type:
            _bad("periodic_type is required for periodic timing.")
        if not periodic_spec:
            _bad("periodic_spec is required for periodic timing.")
        return


def _dedupe_ids(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


@app.on_event("startup")
def startup() -> None:
    if settings.auto_migrate:
        Base.metadata.create_all(bind=engine)


@app.get("/health/live", response_model=HealthResponse)
def health_live() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.app_name)


@app.get("/health/ready", response_model=HealthResponse)
def health_ready(db: Session = Depends(get_db)) -> HealthResponse:
    db.execute(select(1))
    return HealthResponse(status="ok", service=settings.app_name)


@app.get(f"{settings.api_prefix}/drivers", response_model=list[DriverResponse])
def list_drivers(
    include_deleted: bool = False,
    driver_type: DriverType | None = None,
    state: DriverState | None = None,
    parent_driver_id: str | None = None,
    db: Session = Depends(get_db),
    _: Actor = Depends(get_current_actor),
) -> list[Driver]:
    stmt = select(Driver).order_by(Driver.created_at.asc())
    if not include_deleted:
        stmt = stmt.where(Driver.deleted_at.is_(None))
    if driver_type:
        stmt = stmt.where(Driver.driver_type == driver_type)
    if state:
        stmt = stmt.where(Driver.state == state)
    if parent_driver_id is not None:
        stmt = stmt.where(Driver.parent_driver_id == parent_driver_id)
    return list(db.scalars(stmt))


@app.get(f"{settings.api_prefix}/drivers/tree", response_model=list[DriverTreeNode])
def get_drivers_tree(
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    _: Actor = Depends(get_current_actor),
) -> list[DriverTreeNode]:
    stmt = select(Driver).order_by(Driver.created_at.asc())
    if not include_deleted:
        stmt = stmt.where(Driver.deleted_at.is_(None))
    drivers = list(db.scalars(stmt))
    return _driver_tree_nodes(drivers)


@app.get(f"{settings.api_prefix}/drivers/{{driver_id}}", response_model=DriverResponse)
def get_driver(
    driver_id: str,
    db: Session = Depends(get_db),
    _: Actor = Depends(get_current_actor),
) -> Driver:
    return get_driver_or_404(db, driver_id)


@app.post(
    f"{settings.api_prefix}/drivers", response_model=DriverResponse, status_code=status.HTTP_201_CREATED
)
def create_driver(
    payload: DriverCreate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> Driver:
    ensure_driver_parent_is_valid(db, payload.parent_driver_id)

    created = Driver(**payload.model_dump())
    db.add(created)
    db.flush()
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="driver.create",
        entity_type="driver",
        entity_id=created.id,
        request_id=request_id,
        before_json=None,
        after_json=serialize_model(created),
    )
    db.commit()
    db.refresh(created)
    return created


@app.patch(f"{settings.api_prefix}/drivers/{{driver_id}}", response_model=DriverResponse)
def update_driver(
    driver_id: str,
    payload: DriverUpdate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> Driver:
    driver = get_driver_or_404(db, driver_id)
    before = serialize_model(driver)
    changes = payload.model_dump(exclude_unset=True)

    if "parent_driver_id" in changes:
        ensure_driver_is_not_descendant(db, driver.id, changes["parent_driver_id"])
        ensure_driver_parent_is_valid(db, changes["parent_driver_id"])

    for key, value in changes.items():
        setattr(driver, key, value)
    driver.version += 1

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="driver.update",
        entity_type="driver",
        entity_id=driver.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(driver),
    )
    db.commit()
    db.refresh(driver)
    return driver


@app.delete(f"{settings.api_prefix}/drivers/{{driver_id}}", response_model=DriverResponse)
def archive_driver(
    driver_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> Driver:
    driver = get_driver_or_404(db, driver_id)
    children_count = db.scalar(
        select(func.count()).select_from(Driver).where(
            and_(Driver.parent_driver_id == driver.id, Driver.deleted_at.is_(None))
        )
    )
    if children_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archive child drivers first.",
        )

    linked_tasks = db.scalar(
        select(func.count())
        .select_from(TaskDriverLink)
        .join(Task, Task.id == TaskDriverLink.task_id)
        .where(and_(TaskDriverLink.driver_id == driver.id, Task.deleted_at.is_(None)))
    )
    if linked_tasks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot archive driver while active tasks are linked.",
        )

    linked_initiatives = db.scalar(
        select(func.count())
        .select_from(InitiativeDriverLink)
        .join(Initiative, Initiative.id == InitiativeDriverLink.initiative_id)
        .where(
            and_(
                InitiativeDriverLink.driver_id == driver.id,
                Initiative.deleted_at.is_(None),
            )
        )
    )
    if linked_initiatives:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot archive driver while active initiatives are linked.",
        )

    before = serialize_model(driver)
    driver.state = DriverState.archived
    driver.deleted_at = utcnow()
    driver.version += 1
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="driver.archive",
        entity_type="driver",
        entity_id=driver.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(driver),
    )
    db.commit()
    db.refresh(driver)
    return driver


@app.delete(f"{settings.api_prefix}/drivers/{{driver_id}}/hard-delete", status_code=status.HTTP_200_OK)
def hard_delete_driver(
    driver_id: str,
    confirm: bool = Query(default=False),
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> dict[str, str]:
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hard delete requires confirm=true.",
        )
    driver = get_driver_or_404(db, driver_id, include_deleted=True)
    children_count = db.scalar(
        select(func.count()).select_from(Driver).where(Driver.parent_driver_id == driver.id)
    )
    if children_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Driver has child drivers and cannot be hard-deleted.",
        )
    task_link_count = db.scalar(
        select(func.count()).select_from(TaskDriverLink).where(TaskDriverLink.driver_id == driver.id)
    )
    initiative_link_count = db.scalar(
        select(func.count())
        .select_from(InitiativeDriverLink)
        .where(InitiativeDriverLink.driver_id == driver.id)
    )
    if task_link_count or initiative_link_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unlink driver from tasks/initiatives before hard-delete.",
        )

    before = serialize_model(driver)
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="driver.hard_delete",
        entity_type="driver",
        entity_id=driver.id,
        request_id=request_id,
        before_json=before,
        after_json={"deleted": True},
    )
    db.delete(driver)
    db.commit()
    return {"status": "deleted"}


@app.get(f"{settings.api_prefix}/initiatives", response_model=list[InitiativeResponse])
def list_initiatives(
    include_deleted: bool = False,
    state: InitiativeState | None = None,
    driver_id: str | None = None,
    query: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: Actor = Depends(get_current_actor),
) -> list[InitiativeResponse]:
    stmt = select(Initiative).order_by(Initiative.created_at.desc()).limit(limit).offset(offset)
    if not include_deleted:
        stmt = stmt.where(Initiative.deleted_at.is_(None))
    if state:
        stmt = stmt.where(Initiative.state == state)
    if query:
        like_term = f"%{query}%"
        stmt = stmt.where(
            or_(Initiative.title.ilike(like_term), Initiative.description.ilike(like_term))
        )
    if driver_id:
        stmt = stmt.join(
            InitiativeDriverLink, InitiativeDriverLink.initiative_id == Initiative.id
        ).where(InitiativeDriverLink.driver_id == driver_id)

    initiatives = list(db.scalars(stmt))
    return [_initiative_response(db, initiative) for initiative in initiatives]


@app.get(f"{settings.api_prefix}/initiatives/{{initiative_id}}", response_model=InitiativeResponse)
def get_initiative(
    initiative_id: str,
    db: Session = Depends(get_db),
    _: Actor = Depends(get_current_actor),
) -> InitiativeResponse:
    initiative = get_initiative_or_404(db, initiative_id)
    return _initiative_response(db, initiative)


@app.post(
    f"{settings.api_prefix}/initiatives",
    response_model=InitiativeResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_initiative(
    payload: InitiativeCreate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> InitiativeResponse:
    driver_ids = _dedupe_ids(payload.driver_ids)
    _validate_timing(
        payload.timing_mode,
        deadline_at=payload.deadline_at,
        grace_days=payload.grace_days,
        entity_kind="initiative",
    )
    for driver_id in driver_ids:
        driver = get_driver_or_404(db, driver_id)
        ensure_driver_is_linkable(driver)

    initiative = Initiative(
        title=payload.title,
        description=payload.description,
        state=payload.state,
        timing_mode=payload.timing_mode,
        deadline_at=payload.deadline_at,
        grace_days=payload.grace_days,
        created_by=actor.actor_id,
        updated_by=actor.actor_id,
    )
    db.add(initiative)
    db.flush()

    for driver_id in driver_ids:
        db.add(InitiativeDriverLink(initiative_id=initiative.id, driver_id=driver_id))

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="initiative.create",
        entity_type="initiative",
        entity_id=initiative.id,
        request_id=request_id,
        before_json=None,
        after_json={"initiative": serialize_model(initiative), "driver_ids": driver_ids},
    )
    db.commit()
    db.refresh(initiative)
    return _initiative_response(db, initiative)


@app.patch(f"{settings.api_prefix}/initiatives/{{initiative_id}}", response_model=InitiativeResponse)
def update_initiative(
    initiative_id: str,
    payload: InitiativeUpdate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> InitiativeResponse:
    initiative = get_initiative_or_404(db, initiative_id)
    before = _initiative_response(db, initiative).model_dump(mode="json")
    changes = payload.model_dump(exclude_unset=True)

    timing_mode = changes.get("timing_mode", initiative.timing_mode)
    _validate_timing(
        timing_mode,
        deadline_at=changes.get("deadline_at", initiative.deadline_at),
        grace_days=changes.get("grace_days", initiative.grace_days),
        entity_kind="initiative",
    )

    driver_ids = changes.pop("driver_ids", None)
    if driver_ids is not None:
        target_driver_ids = _dedupe_ids(driver_ids)
        for driver_id in target_driver_ids:
            driver = get_driver_or_404(db, driver_id)
            ensure_driver_is_linkable(driver)

        existing_links = list(
            db.scalars(
                select(InitiativeDriverLink).where(
                    InitiativeDriverLink.initiative_id == initiative.id
                )
            )
        )
        existing_driver_ids = {link.driver_id for link in existing_links}
        target_driver_set = set(target_driver_ids)

        for link in existing_links:
            if link.driver_id not in target_driver_set:
                db.delete(link)
        for driver_id in target_driver_ids:
            if driver_id not in existing_driver_ids:
                db.add(InitiativeDriverLink(initiative_id=initiative.id, driver_id=driver_id))

    for key, value in changes.items():
        setattr(initiative, key, value)

    initiative.updated_by = actor.actor_id
    initiative.version += 1
    after = _initiative_response(db, initiative).model_dump(mode="json")

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="initiative.update",
        entity_type="initiative",
        entity_id=initiative.id,
        request_id=request_id,
        before_json=before,
        after_json=after,
    )
    db.commit()
    db.refresh(initiative)
    return _initiative_response(db, initiative)


@app.delete(f"{settings.api_prefix}/initiatives/{{initiative_id}}", response_model=InitiativeResponse)
def archive_initiative(
    initiative_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> InitiativeResponse:
    initiative = get_initiative_or_404(db, initiative_id)
    linked_active_tasks = db.scalar(
        select(func.count()).select_from(Task).where(
            and_(Task.initiative_id == initiative.id, Task.deleted_at.is_(None))
        )
    )
    if linked_active_tasks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot archive initiative while active tasks are linked.",
        )

    before = serialize_model(initiative)
    initiative.state = InitiativeState.archived
    initiative.deleted_at = utcnow()
    initiative.updated_by = actor.actor_id
    initiative.version += 1
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="initiative.archive",
        entity_type="initiative",
        entity_id=initiative.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(initiative),
    )
    db.commit()
    db.refresh(initiative)
    return _initiative_response(db, initiative)


@app.delete(
    f"{settings.api_prefix}/initiatives/{{initiative_id}}/hard-delete",
    status_code=status.HTTP_200_OK,
)
def hard_delete_initiative(
    initiative_id: str,
    confirm: bool = Query(default=False),
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> dict[str, str]:
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hard delete requires confirm=true.",
        )
    initiative = get_initiative_or_404(db, initiative_id, include_deleted=True)
    linked_tasks = db.scalar(
        select(func.count()).select_from(Task).where(Task.initiative_id == initiative.id)
    )
    if linked_tasks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unlink initiative from tasks before hard-delete.",
        )

    before = serialize_model(initiative)
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="initiative.hard_delete",
        entity_type="initiative",
        entity_id=initiative.id,
        request_id=request_id,
        before_json=before,
        after_json={"deleted": True},
    )
    db.delete(initiative)
    db.commit()
    return {"status": "deleted"}


@app.get(f"{settings.api_prefix}/tasks", response_model=list[TaskResponse])
def list_tasks(
    include_deleted: bool = False,
    initiative_id: str | None = None,
    driver_id: str | None = None,
    status_filter: TaskStatus | None = Query(default=None, alias="status"),
    priority: TaskPriority | None = None,
    query: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: Actor = Depends(get_current_actor),
) -> list[TaskResponse]:
    stmt = select(Task).order_by(Task.created_at.desc()).limit(limit).offset(offset)
    if not include_deleted:
        stmt = stmt.where(Task.deleted_at.is_(None))
    if status_filter:
        stmt = stmt.where(Task.status == status_filter)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if query:
        like_term = f"%{query}%"
        stmt = stmt.where(or_(Task.title.ilike(like_term), Task.description.ilike(like_term)))
    if initiative_id:
        stmt = stmt.where(Task.initiative_id == initiative_id)
    if driver_id:
        stmt = stmt.join(TaskDriverLink, TaskDriverLink.task_id == Task.id).where(
            TaskDriverLink.driver_id == driver_id
        )
    tasks = list(db.scalars(stmt))
    return [_task_response(db, task) for task in tasks]


@app.get(f"{settings.api_prefix}/tasks/{{task_id}}", response_model=TaskResponse)
def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    _: Actor = Depends(get_current_actor),
) -> TaskResponse:
    task = get_task_or_404(db, task_id)
    return _task_response(db, task)


@app.post(f"{settings.api_prefix}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> TaskResponse:
    driver_ids = _dedupe_ids(payload.driver_ids)
    if payload.initiative_id:
        initiative = get_initiative_or_404(db, payload.initiative_id)
        ensure_initiative_is_linkable(initiative)
    for driver_id in driver_ids:
        driver = get_driver_or_404(db, driver_id)
        ensure_driver_is_linkable(driver)

    _validate_timing(
        payload.timing_mode,
        deadline_at=payload.deadline_at,
        grace_days=payload.grace_days,
        periodic_type=payload.periodic_type,
        periodic_spec=payload.periodic_spec,
        periodic_end_mode=payload.periodic_end_mode,
        periodic_end_at=payload.periodic_end_at,
        periodic_end_count=payload.periodic_end_count,
        entity_kind="task",
    )

    periodic_spec_dict = payload.periodic_spec.model_dump() if payload.periodic_spec else None

    task = Task(
        title=payload.title,
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        initiative_id=payload.initiative_id,
        timing_mode=payload.timing_mode,
        deadline_at=payload.deadline_at,
        grace_days=payload.grace_days,
        periodic_type=payload.periodic_type,
        periodic_spec=periodic_spec_dict,
        periodic_end_mode=payload.periodic_end_mode,
        periodic_end_at=payload.periodic_end_at,
        periodic_end_count=payload.periodic_end_count,
        checklist_json=[item.model_dump() for item in payload.checklist_json],
        created_by=actor.actor_id,
        updated_by=actor.actor_id,
    )
    db.add(task)
    db.flush()

    for driver_id in driver_ids:
        db.add(TaskDriverLink(task_id=task.id, driver_id=driver_id))

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="task.create",
        entity_type="task",
        entity_id=task.id,
        request_id=request_id,
        before_json=None,
        after_json={"task": serialize_model(task), "driver_ids": driver_ids},
    )
    db.commit()
    db.refresh(task)
    return _task_response(db, task)


@app.patch(f"{settings.api_prefix}/tasks/{{task_id}}", response_model=TaskResponse)
def update_task(
    task_id: str,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> TaskResponse:
    task = get_task_or_404(db, task_id)
    before = _task_response(db, task).model_dump(mode="json")
    changes = payload.model_dump(exclude_unset=True)
    driver_ids = changes.pop("driver_ids", None)

    if "initiative_id" in changes and changes["initiative_id"]:
        initiative = get_initiative_or_404(db, changes["initiative_id"])
        ensure_initiative_is_linkable(initiative)

    timing_mode = changes.get("timing_mode", task.timing_mode)
    _validate_timing(
        timing_mode,
        deadline_at=changes.get("deadline_at", task.deadline_at),
        grace_days=changes.get("grace_days", task.grace_days),
        periodic_type=changes.get("periodic_type", task.periodic_type),
        periodic_spec=changes.get("periodic_spec", task.periodic_spec),
        periodic_end_mode=changes.get("periodic_end_mode", task.periodic_end_mode),
        periodic_end_at=changes.get("periodic_end_at", task.periodic_end_at),
        periodic_end_count=changes.get("periodic_end_count", task.periodic_end_count),
        entity_kind="task",
    )

    if "periodic_spec" in changes and changes["periodic_spec"] is not None:
        changes["periodic_spec"] = changes["periodic_spec"].model_dump()

    if "checklist_json" in changes and changes["checklist_json"] is not None:
        changes["checklist_json"] = [item.model_dump() for item in changes["checklist_json"]]

    if driver_ids is not None:
        target_driver_ids = _dedupe_ids(driver_ids)
        for driver_id in target_driver_ids:
            driver = get_driver_or_404(db, driver_id)
            ensure_driver_is_linkable(driver)
        existing_links = list(
            db.scalars(select(TaskDriverLink).where(TaskDriverLink.task_id == task.id))
        )
        existing_driver_ids = {link.driver_id for link in existing_links}
        target_driver_set = set(target_driver_ids)

        for link in existing_links:
            if link.driver_id not in target_driver_set:
                db.delete(link)
        for driver_id in target_driver_ids:
            if driver_id not in existing_driver_ids:
                db.add(TaskDriverLink(task_id=task.id, driver_id=driver_id))

    for key, value in changes.items():
        setattr(task, key, value)
    task.updated_by = actor.actor_id
    task.version += 1
    after = _task_response(db, task).model_dump(mode="json")

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="task.update",
        entity_type="task",
        entity_id=task.id,
        request_id=request_id,
        before_json=before,
        after_json=after,
    )
    db.commit()
    db.refresh(task)
    return _task_response(db, task)


@app.delete(f"{settings.api_prefix}/tasks/{{task_id}}", response_model=TaskResponse)
def archive_task(
    task_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> TaskResponse:
    task = get_task_or_404(db, task_id)
    before = serialize_model(task)
    task.status = TaskStatus.archived
    task.deleted_at = utcnow()
    task.updated_by = actor.actor_id
    task.version += 1

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="task.archive",
        entity_type="task",
        entity_id=task.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(task),
    )
    db.commit()
    db.refresh(task)
    return _task_response(db, task)


@app.delete(f"{settings.api_prefix}/tasks/{{task_id}}/hard-delete", status_code=status.HTTP_200_OK)
def hard_delete_task(
    task_id: str,
    confirm: bool = Query(default=False),
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> dict[str, str]:
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hard delete requires confirm=true.",
        )
    task = get_task_or_404(db, task_id, include_deleted=True)
    before = serialize_model(task)
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="task.hard_delete",
        entity_type="task",
        entity_id=task.id,
        request_id=request_id,
        before_json=before,
        after_json={"deleted": True},
    )
    db.delete(task)
    db.commit()
    return {"status": "deleted"}


@app.post(f"{settings.api_prefix}/tasks/{{task_id}}/links/drivers", response_model=TaskResponse)
def link_task_drivers(
    task_id: str,
    payload: LinkDriversRequest,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> TaskResponse:
    task = get_task_or_404(db, task_id)
    before = _task_response(db, task).model_dump(mode="json")
    driver_ids = _dedupe_ids(payload.driver_ids)
    for driver_id in driver_ids:
        driver = get_driver_or_404(db, driver_id)
        ensure_driver_is_linkable(driver)
        if not task_has_driver_link(db, task.id, driver_id):
            db.add(TaskDriverLink(task_id=task.id, driver_id=driver_id))

    task.updated_by = actor.actor_id
    task.version += 1
    after = _task_response(db, task).model_dump(mode="json")

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="task.link_drivers",
        entity_type="task",
        entity_id=task.id,
        request_id=request_id,
        before_json=before,
        after_json=after,
    )
    db.commit()
    db.refresh(task)
    return _task_response(db, task)


@app.delete(
    f"{settings.api_prefix}/tasks/{{task_id}}/links/drivers/{{driver_id}}", response_model=TaskResponse
)
def unlink_task_driver(
    task_id: str,
    driver_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> TaskResponse:
    task = get_task_or_404(db, task_id)
    before = _task_response(db, task).model_dump(mode="json")
    link = db.scalar(
        select(TaskDriverLink).where(
            and_(TaskDriverLink.task_id == task_id, TaskDriverLink.driver_id == driver_id)
        )
    )
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver link not found.")
    db.delete(link)
    task.updated_by = actor.actor_id
    task.version += 1
    after = _task_response(db, task).model_dump(mode="json")

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="task.unlink_driver",
        entity_type="task",
        entity_id=task.id,
        request_id=request_id,
        before_json=before,
        after_json=after,
    )
    db.commit()
    db.refresh(task)
    return _task_response(db, task)


@app.get(f"{settings.api_prefix}/tasks/{{task_id}}/reasons", response_model=list[TaskReasonResponse])
def list_task_reasons(
    task_id: str,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(get_current_actor),
) -> list[TaskReason]:
    get_task_or_404(db, task_id, include_deleted=True)
    stmt = select(TaskReason).where(TaskReason.task_id == task_id).order_by(TaskReason.created_at.desc())
    if not include_deleted:
        stmt = stmt.where(TaskReason.deleted_at.is_(None))
    return list(db.scalars(stmt))


@app.post(
    f"{settings.api_prefix}/tasks/{{task_id}}/reasons",
    response_model=TaskReasonResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_task_reason(
    task_id: str,
    payload: ReasonCreate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> TaskReason:
    get_task_or_404(db, task_id, include_deleted=True)
    reason = TaskReason(
        task_id=task_id,
        reason_text=payload.reason_text,
        author_type=actor.actor_type,
        author_id=actor.actor_id,
    )
    db.add(reason)
    db.flush()
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="task_reason.create",
        entity_type="task_reason",
        entity_id=reason.id,
        request_id=request_id,
        before_json=None,
        after_json=serialize_model(reason),
        metadata_json={"task_id": task_id},
    )
    db.commit()
    db.refresh(reason)
    return reason


@app.patch(f"{settings.api_prefix}/tasks/reasons/{{reason_id}}", response_model=TaskReasonResponse)
def update_task_reason(
    reason_id: str,
    payload: ReasonUpdate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> TaskReason:
    reason = db.scalar(select(TaskReason).where(TaskReason.id == reason_id))
    if not reason:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task reason not found.")
    before = serialize_model(reason)
    reason.reason_text = payload.reason_text
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="task_reason.update",
        entity_type="task_reason",
        entity_id=reason.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(reason),
        metadata_json={"task_id": reason.task_id},
    )
    db.commit()
    db.refresh(reason)
    return reason


@app.delete(f"{settings.api_prefix}/tasks/reasons/{{reason_id}}", status_code=status.HTTP_200_OK)
def delete_task_reason(
    reason_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> dict[str, str]:
    reason = db.scalar(select(TaskReason).where(TaskReason.id == reason_id))
    if not reason:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task reason not found.")
    before = serialize_model(reason)
    reason.deleted_at = utcnow()
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="task_reason.delete",
        entity_type="task_reason",
        entity_id=reason.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(reason),
        metadata_json={"task_id": reason.task_id},
    )
    db.commit()
    return {"status": "deleted"}


@app.post(
    f"{settings.api_prefix}/initiatives/{{initiative_id}}/links/drivers",
    response_model=InitiativeResponse,
)
def link_initiative_drivers(
    initiative_id: str,
    payload: LinkDriversRequest,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> InitiativeResponse:
    initiative = get_initiative_or_404(db, initiative_id)
    before = _initiative_response(db, initiative).model_dump(mode="json")
    driver_ids = _dedupe_ids(payload.driver_ids)
    for driver_id in driver_ids:
        driver = get_driver_or_404(db, driver_id)
        ensure_driver_is_linkable(driver)
        if not initiative_has_driver_link(db, initiative.id, driver_id):
            db.add(InitiativeDriverLink(initiative_id=initiative.id, driver_id=driver_id))

    initiative.updated_by = actor.actor_id
    initiative.version += 1
    after = _initiative_response(db, initiative).model_dump(mode="json")
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="initiative.link_drivers",
        entity_type="initiative",
        entity_id=initiative.id,
        request_id=request_id,
        before_json=before,
        after_json=after,
    )
    db.commit()
    db.refresh(initiative)
    return _initiative_response(db, initiative)


@app.delete(
    f"{settings.api_prefix}/initiatives/{{initiative_id}}/links/drivers/{{driver_id}}",
    response_model=InitiativeResponse,
)
def unlink_initiative_driver(
    initiative_id: str,
    driver_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> InitiativeResponse:
    initiative = get_initiative_or_404(db, initiative_id)
    before = _initiative_response(db, initiative).model_dump(mode="json")
    link = db.scalar(
        select(InitiativeDriverLink).where(
            and_(
                InitiativeDriverLink.initiative_id == initiative_id,
                InitiativeDriverLink.driver_id == driver_id,
            )
        )
    )
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver link not found.")

    db.delete(link)
    initiative.updated_by = actor.actor_id
    initiative.version += 1
    after = _initiative_response(db, initiative).model_dump(mode="json")
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="initiative.unlink_driver",
        entity_type="initiative",
        entity_id=initiative.id,
        request_id=request_id,
        before_json=before,
        after_json=after,
    )
    db.commit()
    db.refresh(initiative)
    return _initiative_response(db, initiative)


@app.get(
    f"{settings.api_prefix}/initiatives/{{initiative_id}}/reasons",
    response_model=list[InitiativeReasonResponse],
)
def list_initiative_reasons(
    initiative_id: str,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(get_current_actor),
) -> list[InitiativeReason]:
    get_initiative_or_404(db, initiative_id, include_deleted=True)
    stmt = (
        select(InitiativeReason)
        .where(InitiativeReason.initiative_id == initiative_id)
        .order_by(InitiativeReason.created_at.desc())
    )
    if not include_deleted:
        stmt = stmt.where(InitiativeReason.deleted_at.is_(None))
    return list(db.scalars(stmt))


@app.post(
    f"{settings.api_prefix}/initiatives/{{initiative_id}}/reasons",
    response_model=InitiativeReasonResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_initiative_reason(
    initiative_id: str,
    payload: ReasonCreate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> InitiativeReason:
    get_initiative_or_404(db, initiative_id, include_deleted=True)
    reason = InitiativeReason(
        initiative_id=initiative_id,
        reason_text=payload.reason_text,
        author_type=actor.actor_type,
        author_id=actor.actor_id,
    )
    db.add(reason)
    db.flush()
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="initiative_reason.create",
        entity_type="initiative_reason",
        entity_id=reason.id,
        request_id=request_id,
        before_json=None,
        after_json=serialize_model(reason),
        metadata_json={"initiative_id": initiative_id},
    )
    db.commit()
    db.refresh(reason)
    return reason


@app.patch(
    f"{settings.api_prefix}/initiatives/reasons/{{reason_id}}",
    response_model=InitiativeReasonResponse,
)
def update_initiative_reason(
    reason_id: str,
    payload: ReasonUpdate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> InitiativeReason:
    reason = db.scalar(select(InitiativeReason).where(InitiativeReason.id == reason_id))
    if not reason:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Initiative reason not found.")
    before = serialize_model(reason)
    reason.reason_text = payload.reason_text
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="initiative_reason.update",
        entity_type="initiative_reason",
        entity_id=reason.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(reason),
        metadata_json={"initiative_id": reason.initiative_id},
    )
    db.commit()
    db.refresh(reason)
    return reason


@app.delete(f"{settings.api_prefix}/initiatives/reasons/{{reason_id}}", status_code=status.HTTP_200_OK)
def delete_initiative_reason(
    reason_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> dict[str, str]:
    reason = db.scalar(select(InitiativeReason).where(InitiativeReason.id == reason_id))
    if not reason:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Initiative reason not found.")
    before = serialize_model(reason)
    reason.deleted_at = utcnow()
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="initiative_reason.delete",
        entity_type="initiative_reason",
        entity_id=reason.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(reason),
        metadata_json={"initiative_id": reason.initiative_id},
    )
    db.commit()
    return {"status": "deleted"}


# ── Block routes ──────────────────────────────────────────────────────────────


def _block_response(db: Session, block: Block) -> BlockResponse:
    return BlockResponse(
        id=block.id,
        title=block.title,
        description=block.description,
        block_type=block.block_type,
        starts_at=block.starts_at,
        ends_at=block.ends_at,
        initiative_id=block.initiative_id,
        task_id=block.task_id,
        occurrence_date=block.occurrence_date,
        spans_json=block.spans_json or [],
        periodic_type=block.periodic_type,
        periodic_spec=block.periodic_spec,
        periodic_end_mode=block.periodic_end_mode,
        periodic_end_at=block.periodic_end_at,
        periodic_end_count=block.periodic_end_count,
        driver_ids=get_block_driver_ids(db, block.id),
        created_by=block.created_by,
        updated_by=block.updated_by,
        created_at=block.created_at,
        updated_at=block.updated_at,
        deleted_at=block.deleted_at,
        version=block.version,
    )


def _validate_block_times(starts_at: Any, ends_at: Any) -> None:
    if starts_at and ends_at and starts_at >= ends_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="starts_at must be before ends_at.",
        )


def _serialize_spans(spans_list: list) -> list[dict[str, Any]]:
    """Convert span dicts/Pydantic models to JSON-safe dicts (datetime → ISO str)."""
    result = []
    for s in spans_list:
        d = dict(s) if isinstance(s, dict) else s.model_dump()
        for key in ("starts_at", "ends_at"):
            v = d.get(key)
            if isinstance(v, datetime):
                d[key] = v.isoformat()
        result.append(d)
    return result


def _parse_dt(v: Any) -> datetime:
    if isinstance(v, datetime):
        return v
    return datetime.fromisoformat(v)


def _compute_span_bounds(
    spans: list[dict[str, Any]],
) -> tuple[datetime, datetime]:
    """Derive starts_at/ends_at from the min/max of span times."""
    if not spans:
        now = datetime.now(timezone.utc)
        return now, now
    all_starts = [_parse_dt(s["starts_at"]) for s in spans]
    all_ends = [_parse_dt(s["ends_at"]) for s in spans]
    return min(all_starts), max(all_ends)


def _validate_block_type_fields(
    block_type: BlockType,
    *,
    starts_at: Any = None,
    ends_at: Any = None,
    task_id: Any = None,
    periodic_type: Any = None,
    periodic_spec: Any = None,
) -> None:
    if block_type == BlockType.one_time:
        if not starts_at or not ends_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="starts_at and ends_at are required for one_time blocks.",
            )
        if task_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="task_id is not allowed for one_time blocks.",
            )
        if periodic_type or periodic_spec:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Periodic fields are not allowed for one_time blocks.",
            )
    elif block_type == BlockType.periodic:
        if not starts_at or not ends_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="starts_at and ends_at are required for periodic blocks.",
            )
        if task_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="task_id is not allowed for periodic blocks.",
            )
    elif block_type == BlockType.task:
        if not task_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="task_id is required for task blocks.",
            )
        if periodic_type or periodic_spec:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Periodic fields are not allowed for task blocks (periodicity comes from the linked task).",
            )


def _validate_block_periodic(
    periodic_type: Any = None,
    periodic_spec: Any = None,
) -> None:
    if periodic_type and not periodic_spec:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="periodic_spec is required when periodic_type is set.",
        )
    if periodic_spec and not periodic_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="periodic_type is required when periodic_spec is set.",
        )


@app.get(f"{settings.api_prefix}/blocks", response_model=list[BlockResponse])
def list_blocks(
    include_deleted: bool = False,
    initiative_id: str | None = None,
    task_id: str | None = None,
    driver_id: str | None = None,
    starts_after: str | None = None,
    starts_before: str | None = None,
    query: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: Actor = Depends(get_current_actor),
) -> list[BlockResponse]:
    stmt = select(Block).order_by(Block.starts_at.desc()).limit(limit).offset(offset)
    if not include_deleted:
        stmt = stmt.where(Block.deleted_at.is_(None))
    if query:
        like_term = f"%{query}%"
        stmt = stmt.where(or_(Block.title.ilike(like_term), Block.description.ilike(like_term)))
    if initiative_id:
        stmt = stmt.where(Block.initiative_id == initiative_id)
    if task_id:
        stmt = stmt.where(Block.task_id == task_id)
    if starts_after:
        stmt = stmt.where(Block.starts_at >= starts_after)
    if starts_before:
        stmt = stmt.where(Block.starts_at <= starts_before)
    if driver_id:
        stmt = stmt.join(BlockDriverLink, BlockDriverLink.block_id == Block.id).where(
            BlockDriverLink.driver_id == driver_id
        )
    blocks = list(db.scalars(stmt))
    return [_block_response(db, block) for block in blocks]


@app.get(f"{settings.api_prefix}/blocks/{{block_id}}", response_model=BlockResponse)
def get_block(
    block_id: str,
    db: Session = Depends(get_db),
    _: Actor = Depends(get_current_actor),
) -> BlockResponse:
    block = get_block_or_404(db, block_id)
    return _block_response(db, block)


@app.post(
    f"{settings.api_prefix}/blocks",
    response_model=BlockResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_block(
    payload: BlockCreate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> BlockResponse:
    driver_ids = _dedupe_ids(payload.driver_ids)

    if payload.initiative_id:
        initiative = get_initiative_or_404(db, payload.initiative_id)
        ensure_initiative_is_linkable(initiative)
    if payload.task_id:
        get_task_or_404(db, payload.task_id)
    for did in driver_ids:
        driver = get_driver_or_404(db, did)
        ensure_driver_is_linkable(driver)

    block_type = payload.block_type
    starts_at = payload.starts_at
    ends_at = payload.ends_at
    spans_raw = _serialize_spans(payload.spans_json) if payload.spans_json else []

    if block_type == BlockType.task and (not starts_at or not ends_at):
        starts_at, ends_at = _compute_span_bounds(spans_raw)

    _validate_block_type_fields(
        block_type,
        starts_at=starts_at,
        ends_at=ends_at,
        task_id=payload.task_id,
        periodic_type=payload.periodic_type,
        periodic_spec=payload.periodic_spec,
    )
    if block_type != BlockType.task:
        _validate_block_times(starts_at, ends_at)
    _validate_block_periodic(payload.periodic_type, payload.periodic_spec)

    periodic_spec_dict = payload.periodic_spec.model_dump() if payload.periodic_spec else None

    block = Block(
        title=payload.title,
        description=payload.description,
        block_type=block_type,
        starts_at=starts_at,
        ends_at=ends_at,
        initiative_id=payload.initiative_id,
        task_id=payload.task_id,
        occurrence_date=payload.occurrence_date,
        spans_json=spans_raw,
        periodic_type=payload.periodic_type,
        periodic_spec=periodic_spec_dict,
        periodic_end_mode=payload.periodic_end_mode,
        periodic_end_at=payload.periodic_end_at,
        periodic_end_count=payload.periodic_end_count,
        created_by=actor.actor_id,
        updated_by=actor.actor_id,
    )
    db.add(block)
    db.flush()

    for did in driver_ids:
        db.add(BlockDriverLink(block_id=block.id, driver_id=did))

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="block.create",
        entity_type="block",
        entity_id=block.id,
        request_id=request_id,
        before_json=None,
        after_json={"block": serialize_model(block), "driver_ids": driver_ids},
    )
    db.commit()
    db.refresh(block)
    return _block_response(db, block)


@app.patch(f"{settings.api_prefix}/blocks/{{block_id}}", response_model=BlockResponse)
def update_block(
    block_id: str,
    payload: BlockUpdate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> BlockResponse:
    block = get_block_or_404(db, block_id)
    before = _block_response(db, block).model_dump(mode="json")
    changes = payload.model_dump(exclude_unset=True)
    driver_ids = changes.pop("driver_ids", None)

    effective_type = changes.get("block_type", block.block_type)
    if isinstance(effective_type, str):
        effective_type = BlockType(effective_type)

    if "initiative_id" in changes and changes["initiative_id"]:
        initiative = get_initiative_or_404(db, changes["initiative_id"])
        ensure_initiative_is_linkable(initiative)
    if "task_id" in changes and changes["task_id"]:
        get_task_or_404(db, changes["task_id"])

    if "periodic_spec" in changes and changes["periodic_spec"] is not None:
        v = changes["periodic_spec"]
        changes["periodic_spec"] = v if isinstance(v, dict) else v.model_dump()

    if "spans_json" in changes and changes["spans_json"] is not None:
        changes["spans_json"] = _serialize_spans(changes["spans_json"])

    # Apply changes first so we can validate the resulting state
    for key, value in changes.items():
        setattr(block, key, value)

    # For task-type blocks, auto-sync bounds from spans
    if effective_type == BlockType.task:
        spans = block.spans_json or []
        if spans:
            block.starts_at, block.ends_at = _compute_span_bounds(spans)
    else:
        _validate_block_times(block.starts_at, block.ends_at)

    _validate_block_periodic(block.periodic_type, block.periodic_spec)

    if driver_ids is not None:
        target_driver_ids = _dedupe_ids(driver_ids)
        for did in target_driver_ids:
            driver = get_driver_or_404(db, did)
            ensure_driver_is_linkable(driver)
        existing_links = list(
            db.scalars(select(BlockDriverLink).where(BlockDriverLink.block_id == block.id))
        )
        existing_driver_ids = {link.driver_id for link in existing_links}
        target_driver_set = set(target_driver_ids)
        for link in existing_links:
            if link.driver_id not in target_driver_set:
                db.delete(link)
        for did in target_driver_ids:
            if did not in existing_driver_ids:
                db.add(BlockDriverLink(block_id=block.id, driver_id=did))

    block.updated_by = actor.actor_id
    block.version += 1
    after = _block_response(db, block).model_dump(mode="json")

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="block.update",
        entity_type="block",
        entity_id=block.id,
        request_id=request_id,
        before_json=before,
        after_json=after,
    )
    db.commit()
    db.refresh(block)
    return _block_response(db, block)


@app.delete(f"{settings.api_prefix}/blocks/{{block_id}}", response_model=BlockResponse)
def archive_block(
    block_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> BlockResponse:
    block = get_block_or_404(db, block_id)
    before = serialize_model(block)
    block.deleted_at = utcnow()
    block.updated_by = actor.actor_id
    block.version += 1
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="block.archive",
        entity_type="block",
        entity_id=block.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(block),
    )
    db.commit()
    db.refresh(block)
    return _block_response(db, block)


@app.delete(f"{settings.api_prefix}/blocks/{{block_id}}/hard-delete", status_code=status.HTTP_200_OK)
def hard_delete_block(
    block_id: str,
    confirm: bool = Query(default=False),
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> dict[str, str]:
    if not confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hard delete requires confirm=true.",
        )
    block = get_block_or_404(db, block_id, include_deleted=True)
    before = serialize_model(block)
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="block.hard_delete",
        entity_type="block",
        entity_id=block.id,
        request_id=request_id,
        before_json=before,
        after_json={"deleted": True},
    )
    db.delete(block)
    db.commit()
    return {"status": "deleted"}


@app.post(f"{settings.api_prefix}/blocks/{{block_id}}/links/drivers", response_model=BlockResponse)
def link_block_drivers(
    block_id: str,
    payload: LinkDriversRequest,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> BlockResponse:
    block = get_block_or_404(db, block_id)
    before = _block_response(db, block).model_dump(mode="json")
    driver_ids = _dedupe_ids(payload.driver_ids)
    for did in driver_ids:
        driver = get_driver_or_404(db, did)
        ensure_driver_is_linkable(driver)
        if not block_has_driver_link(db, block.id, did):
            db.add(BlockDriverLink(block_id=block.id, driver_id=did))

    block.updated_by = actor.actor_id
    block.version += 1
    after = _block_response(db, block).model_dump(mode="json")
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="block.link_drivers",
        entity_type="block",
        entity_id=block.id,
        request_id=request_id,
        before_json=before,
        after_json=after,
    )
    db.commit()
    db.refresh(block)
    return _block_response(db, block)


@app.delete(
    f"{settings.api_prefix}/blocks/{{block_id}}/links/drivers/{{driver_id}}",
    response_model=BlockResponse,
)
def unlink_block_driver(
    block_id: str,
    driver_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> BlockResponse:
    block = get_block_or_404(db, block_id)
    before = _block_response(db, block).model_dump(mode="json")
    link = db.scalar(
        select(BlockDriverLink).where(
            and_(BlockDriverLink.block_id == block_id, BlockDriverLink.driver_id == driver_id)
        )
    )
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Driver link not found.")
    db.delete(link)
    block.updated_by = actor.actor_id
    block.version += 1
    after = _block_response(db, block).model_dump(mode="json")
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="block.unlink_driver",
        entity_type="block",
        entity_id=block.id,
        request_id=request_id,
        before_json=before,
        after_json=after,
    )
    db.commit()
    db.refresh(block)
    return _block_response(db, block)


@app.get(
    f"{settings.api_prefix}/blocks/{{block_id}}/reasons",
    response_model=list[BlockReasonResponse],
)
def list_block_reasons(
    block_id: str,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(get_current_actor),
) -> list[BlockReason]:
    get_block_or_404(db, block_id, include_deleted=True)
    stmt = (
        select(BlockReason)
        .where(BlockReason.block_id == block_id)
        .order_by(BlockReason.created_at.desc())
    )
    if not include_deleted:
        stmt = stmt.where(BlockReason.deleted_at.is_(None))
    return list(db.scalars(stmt))


@app.post(
    f"{settings.api_prefix}/blocks/{{block_id}}/reasons",
    response_model=BlockReasonResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_block_reason(
    block_id: str,
    payload: ReasonCreate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> BlockReason:
    get_block_or_404(db, block_id, include_deleted=True)
    reason = BlockReason(
        block_id=block_id,
        reason_text=payload.reason_text,
        author_type=actor.actor_type,
        author_id=actor.actor_id,
    )
    db.add(reason)
    db.flush()
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="block_reason.create",
        entity_type="block_reason",
        entity_id=reason.id,
        request_id=request_id,
        before_json=None,
        after_json=serialize_model(reason),
        metadata_json={"block_id": block_id},
    )
    db.commit()
    db.refresh(reason)
    return reason


@app.patch(
    f"{settings.api_prefix}/blocks/reasons/{{reason_id}}",
    response_model=BlockReasonResponse,
)
def update_block_reason(
    reason_id: str,
    payload: ReasonUpdate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> BlockReason:
    reason = db.scalar(select(BlockReason).where(BlockReason.id == reason_id))
    if not reason:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block reason not found.")
    before = serialize_model(reason)
    reason.reason_text = payload.reason_text
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="block_reason.update",
        entity_type="block_reason",
        entity_id=reason.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(reason),
        metadata_json={"block_id": reason.block_id},
    )
    db.commit()
    db.refresh(reason)
    return reason


@app.delete(f"{settings.api_prefix}/blocks/reasons/{{reason_id}}", status_code=status.HTTP_200_OK)
def delete_block_reason(
    reason_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> dict[str, str]:
    reason = db.scalar(select(BlockReason).where(BlockReason.id == reason_id))
    if not reason:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Block reason not found.")
    before = serialize_model(reason)
    reason.deleted_at = utcnow()
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="block_reason.delete",
        entity_type="block_reason",
        entity_id=reason.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(reason),
        metadata_json={"block_id": reason.block_id},
    )
    db.commit()
    return {"status": "deleted"}


@app.get(f"{settings.api_prefix}/audit-events", response_model=list[AuditEventResponse])
def list_audit_events(
    limit: int = Query(default=200, ge=1, le=500),
    entity_type: str | None = None,
    entity_id: str | None = None,
    db: Session = Depends(get_db),
    _: Actor = Depends(get_current_actor),
) -> list[AuditEvent]:
    stmt = select(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(limit)
    if entity_type:
        stmt = stmt.where(AuditEvent.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditEvent.entity_id == entity_id)
    return list(db.scalars(stmt))


@app.get("/", response_model=dict[str, Any])
def root() -> dict[str, Any]:
    return {
        "service": settings.app_name,
        "api_prefix": settings.api_prefix,
        "auth_mode": settings.auth_mode,
        "docs_url": "/docs",
    }
