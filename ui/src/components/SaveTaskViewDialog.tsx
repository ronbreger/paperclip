import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { SAVED_VIEW_LABEL_MAX_LENGTH } from "@/lib/saved-views";

/**
 * Names the filters currently applied to the task list. One field on purpose:
 * the filters are already chosen, and asking for anything else would make
 * saving a view more work than re-applying the filters by hand.
 */
export function SaveTaskViewDialog({
  open,
  onOpenChange,
  suggestedLabel,
  summary,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled, already de-duplicated against the existing view names. */
  suggestedLabel: string;
  /** Plain-language description of what is being saved. */
  summary: string;
  onSave: (label: string) => void;
}) {
  const [label, setLabel] = useState(suggestedLabel);

  useEffect(() => {
    if (open) setLabel(suggestedLabel);
  }, [open, suggestedLabel]);

  const trimmed = label.trim();
  const submit = () => {
    if (!trimmed) return;
    onSave(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-(--sz-420px)">
        <DialogHeader>
          <DialogTitle>Save view</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={label}
          maxLength={SAVED_VIEW_LABEL_MAX_LENGTH}
          aria-label="View name"
          placeholder="View name"
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            submit();
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!trimmed} onClick={submit}>Save view</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
