# Entity Concepts: Blocks vs Tasks

This document clarifies the semantic distinction between **Blocks** and **Tasks** — the two actionable entity types in the system.

---

## Tasks

A **Task** is a discrete action item. It can be done at any point — possibly with a deadline for urgency, possibly on a schedule, or possibly whenever you get to it. The defining quality: a task does not demand sustained attention for a continuous window. You pick it up, do it, and it's done.

**Examples:**
- Take out the trash
- Reply to an email
- Submit expense report
- Buy groceries
- Review a pull request

Tasks support the full timing mode system:

| Mode | Meaning |
|---|---|
| `none` | No time pressure. Do whenever. |
| `deadline` | Due by a specific date/time. Urgency escalates as it approaches. |
| `flexible` | Target date with a grace period — soft deadline. |
| `periodic` | Repeats on a schedule (weekly, monthly, etc). |

Tasks also support a **`scheduled_at`** field — a lightweight scheduling primitive that says "I plan to do this at this time." This is independent of the timing mode. A task can be both scheduled ("do it Sunday 8am") and have a deadline ("due Monday 5pm"). `scheduled_at` is for quick actions you want to pin to a time without creating a block.

**Use `scheduled_at` for:** Taking out the trash Sunday morning. Calling the dentist at 2pm. Picking up dry cleaning after work. These are discrete actions pinned to a time, not sustained-attention windows.

Tasks have a full status lifecycle: `todo` → `in_progress` → `done` (or `blocked`, `archived`).

---

## Blocks

A **Block** is a time-bound window that requires your sustained attention for the entire duration. If you wouldn't sit down (or show up) and give it continuous focus from start to end, it's not a block — it's a task.

**Examples:**
- Deep work / focused study session (2pm - 5pm)
- Meeting with a client (10am - 11am)
- Family dinner outing (6pm - 9pm)
- Weekly 1-on-1 (recurring, Tuesdays 3pm - 3:30pm)
- Gym session (7am - 8:30am)

Blocks always have a `starts_at` and `ends_at` datetime defining their window. They can be one-time or recurring (using the same periodic system as tasks). They link to Initiatives and Drivers the same way tasks do.

Blocks **do not** have a status lifecycle. They simply exist — they are calendar placements, not workflow items. They can be archived or deleted, but there is no "in progress" or "done" state.

---

## Decision Heuristic

When deciding between a Block and a Task:

1. **Does it consume a continuous window of your time?** → Block
2. **Can you do it in a few minutes at any point?** → Task (optionally with `scheduled_at`)
3. **Would an AI agent say "you have this coming up at 2pm" vs "this is approaching its deadline"?** The first is a Block, the second is a Task.

The boundary case: "I want to take out the trash on Sunday." That's a Task with `scheduled_at` set to Sunday morning — not a Block. You're not giving the trash sustained attention from 8am to 8:30am. You're doing a quick action at a roughly planned time.

The clear block case: "I have a study session from 2pm to 5pm." That's a Block. You are giving it your sustained focus for that entire window.

---

## Scheduling Primitives Summary

| What you want | Entity | Fields |
|---|---|---|
| Track a to-do with no time constraint | Task | `timing_mode: none` |
| To-do due by a date/time | Task | `timing_mode: deadline`, `deadline_at` |
| To-do with a soft target date | Task | `timing_mode: flexible`, `deadline_at`, `grace_days` |
| Repeating to-do (weekly chores, etc) | Task | `timing_mode: periodic`, periodic fields |
| Quick action pinned to a time | Task | `scheduled_at` (any timing mode) |
| Sustained-attention time window | Block | `starts_at`, `ends_at` |
| Recurring sustained-attention window | Block | `starts_at`, `ends_at`, periodic fields |
