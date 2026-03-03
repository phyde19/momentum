import { useState } from "react";
import { MessageSquare, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import type { BlockReason, InitiativeReason, TaskReason } from "../lib/types";
import { formatDate } from "../lib/utils";

type Reason = TaskReason | InitiativeReason | BlockReason;

interface ReasonSectionProps {
  reasons: Reason[];
  isLoading: boolean;
  onAdd: (text: string) => void;
  onUpdate: (reasonId: string, text: string) => void;
  onDelete: (reasonId: string) => void;
  isAdding?: boolean;
}

export function ReasonSection({
  reasons,
  isLoading,
  onAdd,
  onUpdate,
  onDelete,
  isAdding,
}: ReasonSectionProps) {
  const [newReason, setNewReason] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  function handleAdd() {
    if (!newReason.trim()) return;
    onAdd(newReason.trim());
    setNewReason("");
    setShowInput(false);
  }

  function startEdit(reason: Reason) {
    setEditingId(reason.id);
    setEditText(reason.reason_text);
  }

  function handleUpdate() {
    if (!editingId || !editText.trim()) return;
    onUpdate(editingId, editText.trim());
    setEditingId(null);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-medium text-zinc-700">Reasons</h3>
          {reasons.length > 0 && (
            <span className="text-xs text-zinc-400">({reasons.length})</span>
          )}
        </div>
        {!showInput && (
          <button
            onClick={() => setShowInput(true)}
            className="btn-ghost !px-2 !py-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        )}
      </div>

      {isLoading && (
        <p className="text-xs text-zinc-400 italic">Loading reasons...</p>
      )}

      <div className="space-y-2">
        {reasons.map((reason) => (
          <div
            key={reason.id}
            className="group flex items-start gap-2 rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2.5"
          >
            {editingId === reason.id ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUpdate();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="input flex-1 !py-1 text-sm"
                  autoFocus
                />
                <button
                  onClick={handleUpdate}
                  className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <p className="flex-1 text-sm text-zinc-700">{reason.reason_text}</p>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="mr-1 text-2xs text-zinc-400">
                    {formatDate(reason.created_at)}
                  </span>
                  <button
                    onClick={() => startEdit(reason)}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => onDelete(reason.id)}
                    className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {showInput && (
          <div className="flex items-center gap-2">
            <input
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") {
                  setShowInput(false);
                  setNewReason("");
                }
              }}
              placeholder="Why are you doing this?"
              className="input flex-1 !py-1.5 text-sm"
              autoFocus
              disabled={isAdding}
            />
            <button
              onClick={handleAdd}
              disabled={!newReason.trim() || isAdding}
              className="btn-primary !px-3 !py-1.5 text-xs"
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowInput(false);
                setNewReason("");
              }}
              className="btn-ghost !px-2 !py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        )}

        {reasons.length === 0 && !showInput && !isLoading && (
          <p className="text-xs italic text-zinc-400">
            No reasons yet. Reasons help you remember why this matters.
          </p>
        )}
      </div>
    </div>
  );
}
