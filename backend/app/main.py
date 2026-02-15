from __future__ import annotations

from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.auth import Actor, get_current_actor, get_request_id
from app.config import get_settings
from app.database import Base, SessionLocal, engine, get_db
from app.domain import (
    create_audit_event,
    ensure_default_goal,
    ensure_goal_is_linkable,
    ensure_task_has_goal_links,
    get_goal_or_404,
    get_primary_goal_id,
    get_task_goal_ids,
    get_task_or_404,
    serialize_model,
    utcnow,
)
from app.models import (
    Goal,
    GoalReason,
    GoalState,
    GoalType,
    Task,
    TaskGoalLink,
    TaskPriority,
    TaskReason,
    TaskStatus,
    ActorType,
    AuditEvent,
)
from app.schemas import (
    AuditEventResponse,
    GoalCreate,
    GoalReasonResponse,
    GoalResponse,
    GoalTreeNode,
    GoalUpdate,
    HealthResponse,
    LinkGoalsRequest,
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
        due_at=task.due_at,
        goal_ids=get_task_goal_ids(db, task.id),
        primary_goal_id=get_primary_goal_id(db, task.id),
        created_by=task.created_by,
        updated_by=task.updated_by,
        created_at=task.created_at,
        updated_at=task.updated_at,
        deleted_at=task.deleted_at,
        version=task.version,
    )


def _goal_tree_nodes(goals: list[Goal]) -> list[GoalTreeNode]:
    node_by_id: dict[str, GoalTreeNode] = {}
    children_by_parent: dict[str | None, list[GoalTreeNode]] = {}
    for goal in goals:
        node = GoalTreeNode(
            id=goal.id,
            title=goal.title,
            description=goal.description,
            goal_type=goal.goal_type,
            state=goal.state,
            is_default=goal.is_default,
            children=[],
        )
        node_by_id[goal.id] = node
        children_by_parent.setdefault(goal.parent_goal_id, []).append(node)

    for goal in goals:
        node = node_by_id[goal.id]
        node.children = children_by_parent.get(goal.id, [])

    return children_by_parent.get(None, [])


@app.on_event("startup")
def startup() -> None:
    if settings.auto_migrate:
        Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        ensure_default_goal(db)
        db.commit()
    finally:
        db.close()


@app.get("/health/live", response_model=HealthResponse)
def health_live() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.app_name)


@app.get("/health/ready", response_model=HealthResponse)
def health_ready(db: Session = Depends(get_db)) -> HealthResponse:
    db.execute(select(1))
    return HealthResponse(status="ok", service=settings.app_name)


@app.get(f"{settings.api_prefix}/goals", response_model=list[GoalResponse])
def list_goals(
    include_deleted: bool = False,
    goal_type: GoalType | None = None,
    state: GoalState | None = None,
    db: Session = Depends(get_db),
    _: Actor = Depends(get_current_actor),
) -> list[Goal]:
    stmt = select(Goal).order_by(Goal.created_at.asc())
    if not include_deleted:
        stmt = stmt.where(Goal.deleted_at.is_(None))
    if goal_type:
        stmt = stmt.where(Goal.goal_type == goal_type)
    if state:
        stmt = stmt.where(Goal.state == state)
    return list(db.scalars(stmt))


@app.get(f"{settings.api_prefix}/goals/tree", response_model=list[GoalTreeNode])
def get_goals_tree(
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    _: Actor = Depends(get_current_actor),
) -> list[GoalTreeNode]:
    stmt = select(Goal).order_by(Goal.created_at.asc())
    if not include_deleted:
        stmt = stmt.where(Goal.deleted_at.is_(None))
    goals = list(db.scalars(stmt))
    return _goal_tree_nodes(goals)


@app.get(f"{settings.api_prefix}/goals/{{goal_id}}", response_model=GoalResponse)
def get_goal(
    goal_id: str,
    db: Session = Depends(get_db),
    _: Actor = Depends(get_current_actor),
) -> Goal:
    return get_goal_or_404(db, goal_id)


@app.post(f"{settings.api_prefix}/goals", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: GoalCreate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> Goal:
    if payload.parent_goal_id:
        parent = get_goal_or_404(db, payload.parent_goal_id)
        ensure_goal_is_linkable(parent)

    created = Goal(**payload.model_dump())
    db.add(created)
    db.flush()
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="goal.create",
        entity_type="goal",
        entity_id=created.id,
        request_id=request_id,
        before_json=None,
        after_json=serialize_model(created),
    )
    db.commit()
    db.refresh(created)
    return created


@app.patch(f"{settings.api_prefix}/goals/{{goal_id}}", response_model=GoalResponse)
def update_goal(
    goal_id: str,
    payload: GoalUpdate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> Goal:
    goal = get_goal_or_404(db, goal_id)
    before = serialize_model(goal)
    changes = payload.model_dump(exclude_unset=True)

    if changes.get("parent_goal_id") == goal.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Goal cannot parent itself.")

    if "parent_goal_id" in changes and changes["parent_goal_id"]:
        parent = get_goal_or_404(db, changes["parent_goal_id"])
        ensure_goal_is_linkable(parent)

    if goal.is_default and changes.get("state") == GoalState.archived:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Default goal cannot be archived or deleted.",
        )

    for key, value in changes.items():
        setattr(goal, key, value)
    goal.version += 1

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="goal.update",
        entity_type="goal",
        entity_id=goal.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(goal),
    )
    db.commit()
    db.refresh(goal)
    return goal


@app.delete(f"{settings.api_prefix}/goals/{{goal_id}}", response_model=GoalResponse)
def archive_goal(
    goal_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> Goal:
    goal = get_goal_or_404(db, goal_id)
    if goal.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Default goal cannot be archived or deleted.",
        )

    children_count = db.scalar(
        select(func.count()).select_from(Goal).where(
            and_(Goal.parent_goal_id == goal.id, Goal.deleted_at.is_(None))
        )
    )
    if children_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Archive child goals first.",
        )

    linked_active_tasks = db.scalar(
        select(func.count())
        .select_from(TaskGoalLink)
        .join(Task, Task.id == TaskGoalLink.task_id)
        .where(and_(TaskGoalLink.goal_id == goal.id, Task.deleted_at.is_(None)))
    )
    if linked_active_tasks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot archive goal while active tasks are linked.",
        )

    before = serialize_model(goal)
    goal.state = GoalState.archived
    goal.deleted_at = utcnow()
    goal.version += 1
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="goal.archive",
        entity_type="goal",
        entity_id=goal.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(goal),
    )
    db.commit()
    db.refresh(goal)
    return goal


@app.delete(f"{settings.api_prefix}/goals/{{goal_id}}/hard-delete", status_code=status.HTTP_200_OK)
def hard_delete_goal(
    goal_id: str,
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
    goal = get_goal_or_404(db, goal_id, include_deleted=True)
    if goal.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Default goal cannot be hard-deleted.",
        )
    children_count = db.scalar(select(func.count()).select_from(Goal).where(Goal.parent_goal_id == goal.id))
    if children_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Goal has child goals and cannot be hard-deleted.",
        )
    task_link_count = db.scalar(
        select(func.count()).select_from(TaskGoalLink).where(TaskGoalLink.goal_id == goal.id)
    )
    if task_link_count:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unlink goal from tasks before hard-delete.",
        )

    before = serialize_model(goal)
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="goal.hard_delete",
        entity_type="goal",
        entity_id=goal.id,
        request_id=request_id,
        before_json=before,
        after_json={"deleted": True},
    )
    db.delete(goal)
    db.commit()
    return {"status": "deleted"}


@app.get(f"{settings.api_prefix}/tasks", response_model=list[TaskResponse])
def list_tasks(
    include_deleted: bool = False,
    goal_id: str | None = None,
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
    if goal_id:
        stmt = stmt.join(TaskGoalLink, TaskGoalLink.task_id == Task.id).where(TaskGoalLink.goal_id == goal_id)
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
    goal_ids = list(dict.fromkeys(payload.goal_ids))
    if not goal_ids:
        goal_ids = [ensure_default_goal(db).id]
    if payload.primary_goal_id and payload.primary_goal_id not in goal_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="primary_goal_id must be included in goal_ids.",
        )

    for goal_id in goal_ids:
        goal = get_goal_or_404(db, goal_id)
        ensure_goal_is_linkable(goal)

    task = Task(
        title=payload.title,
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        due_at=payload.due_at,
        created_by=actor.actor_id,
        updated_by=actor.actor_id,
    )
    db.add(task)
    db.flush()

    primary_goal_id = payload.primary_goal_id or goal_ids[0]
    for goal_id in goal_ids:
        db.add(
            TaskGoalLink(
                task_id=task.id,
                goal_id=goal_id,
                is_primary=goal_id == primary_goal_id,
            )
        )

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="task.create",
        entity_type="task",
        entity_id=task.id,
        request_id=request_id,
        before_json=None,
        after_json={"task": serialize_model(task), "goal_ids": goal_ids, "primary_goal_id": primary_goal_id},
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
    before = serialize_model(task)

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, key, value)
    task.updated_by = actor.actor_id
    task.version += 1

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="task.update",
        entity_type="task",
        entity_id=task.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(task),
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


@app.post(f"{settings.api_prefix}/tasks/{{task_id}}/links/goals", response_model=TaskResponse)
def link_task_goals(
    task_id: str,
    payload: LinkGoalsRequest,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> TaskResponse:
    task = get_task_or_404(db, task_id)
    before = _task_response(db, task).model_dump(mode="json")
    goal_ids = list(dict.fromkeys(payload.goal_ids))
    for goal_id in goal_ids:
        goal = get_goal_or_404(db, goal_id)
        ensure_goal_is_linkable(goal)
        existing = db.scalar(
            select(TaskGoalLink).where(
                and_(TaskGoalLink.task_id == task.id, TaskGoalLink.goal_id == goal_id)
            )
        )
        if not existing:
            db.add(TaskGoalLink(task_id=task.id, goal_id=goal_id, is_primary=False))

    db.flush()
    target_primary = payload.primary_goal_id
    if target_primary and target_primary not in get_task_goal_ids(db, task.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="primary_goal_id must be linked to the task.",
        )
    if not target_primary:
        target_primary = get_primary_goal_id(db, task.id) or get_task_goal_ids(db, task.id)[0]

    for link in db.scalars(select(TaskGoalLink).where(TaskGoalLink.task_id == task.id)):
        link.is_primary = link.goal_id == target_primary

    ensure_task_has_goal_links(db, task.id)
    task.updated_by = actor.actor_id
    task.version += 1
    after = _task_response(db, task).model_dump(mode="json")

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="task.link_goals",
        entity_type="task",
        entity_id=task.id,
        request_id=request_id,
        before_json=before,
        after_json=after,
    )
    db.commit()
    db.refresh(task)
    return _task_response(db, task)


@app.delete(f"{settings.api_prefix}/tasks/{{task_id}}/links/goals/{{goal_id}}", response_model=TaskResponse)
def unlink_task_goal(
    task_id: str,
    goal_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> TaskResponse:
    task = get_task_or_404(db, task_id)
    before = _task_response(db, task).model_dump(mode="json")
    link = db.scalar(
        select(TaskGoalLink).where(and_(TaskGoalLink.task_id == task_id, TaskGoalLink.goal_id == goal_id))
    )
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal link not found.")

    count = db.scalar(select(func.count()).select_from(TaskGoalLink).where(TaskGoalLink.task_id == task_id))
    if count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Task must remain linked to at least one goal.",
        )

    was_primary = link.is_primary
    db.delete(link)
    db.flush()

    if was_primary:
        replacement = db.scalar(select(TaskGoalLink).where(TaskGoalLink.task_id == task_id))
        if replacement:
            replacement.is_primary = True

    ensure_task_has_goal_links(db, task_id)
    task.updated_by = actor.actor_id
    task.version += 1
    after = _task_response(db, task).model_dump(mode="json")

    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="task.unlink_goal",
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


@app.get(f"{settings.api_prefix}/goals/{{goal_id}}/reasons", response_model=list[GoalReasonResponse])
def list_goal_reasons(
    goal_id: str,
    include_deleted: bool = False,
    db: Session = Depends(get_db),
    _actor: Actor = Depends(get_current_actor),
) -> list[GoalReason]:
    get_goal_or_404(db, goal_id, include_deleted=True)
    stmt = select(GoalReason).where(GoalReason.goal_id == goal_id).order_by(GoalReason.created_at.desc())
    if not include_deleted:
        stmt = stmt.where(GoalReason.deleted_at.is_(None))
    return list(db.scalars(stmt))


@app.post(
    f"{settings.api_prefix}/goals/{{goal_id}}/reasons",
    response_model=GoalReasonResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_goal_reason(
    goal_id: str,
    payload: ReasonCreate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> GoalReason:
    get_goal_or_404(db, goal_id, include_deleted=True)
    reason = GoalReason(
        goal_id=goal_id,
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
        action="goal_reason.create",
        entity_type="goal_reason",
        entity_id=reason.id,
        request_id=request_id,
        before_json=None,
        after_json=serialize_model(reason),
        metadata_json={"goal_id": goal_id},
    )
    db.commit()
    db.refresh(reason)
    return reason


@app.patch(f"{settings.api_prefix}/goals/reasons/{{reason_id}}", response_model=GoalReasonResponse)
def update_goal_reason(
    reason_id: str,
    payload: ReasonUpdate,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> GoalReason:
    reason = db.scalar(select(GoalReason).where(GoalReason.id == reason_id))
    if not reason:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal reason not found.")
    before = serialize_model(reason)
    reason.reason_text = payload.reason_text
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="goal_reason.update",
        entity_type="goal_reason",
        entity_id=reason.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(reason),
        metadata_json={"goal_id": reason.goal_id},
    )
    db.commit()
    db.refresh(reason)
    return reason


@app.delete(f"{settings.api_prefix}/goals/reasons/{{reason_id}}", status_code=status.HTTP_200_OK)
def delete_goal_reason(
    reason_id: str,
    db: Session = Depends(get_db),
    actor: Actor = Depends(get_current_actor),
    request_id: str = Depends(get_request_id),
) -> dict[str, str]:
    reason = db.scalar(select(GoalReason).where(GoalReason.id == reason_id))
    if not reason:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal reason not found.")
    before = serialize_model(reason)
    reason.deleted_at = utcnow()
    create_audit_event(
        db,
        actor_type=actor.actor_type,
        actor_id=actor.actor_id,
        action="goal_reason.delete",
        entity_type="goal_reason",
        entity_id=reason.id,
        request_id=request_id,
        before_json=before,
        after_json=serialize_model(reason),
        metadata_json={"goal_id": reason.goal_id},
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
