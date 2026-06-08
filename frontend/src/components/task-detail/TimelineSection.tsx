import { useMemo } from "react";
import type { Project, Task, TaskEvent } from "@fjord/shared";
import {
  eventMatchesFilter,
  type TimelineFilterState,
} from "../../lib/useTimelineFilter.js";
import type { UseTaskEditor } from "../../lib/useTaskEditor.js";
import type { UserLookup } from "../../lib/userLabels.js";
import { FilterPill } from "../FilterPill.js";
import { TimelineComposer } from "../TimelineComposer.js";
import { SectionLabel } from "../form-fields.js";
import { EventItem } from "./EventItem.js";

export function TimelineSection({
  events,
  allTasks,
  projects,
  usersById,
  filter,
  toggle,
  solo,
  currentUserId,
  editor,
}: {
  events: TaskEvent[];
  allTasks: Task[];
  projects: Project[];
  usersById: UserLookup;
  filter: TimelineFilterState;
  toggle: (kind: keyof TimelineFilterState) => void;
  solo: (kind: keyof TimelineFilterState) => void;
  currentUserId: string | null;
  editor: UseTaskEditor;
}) {
  const visible = useMemo(
    () => events.filter((e) => eventMatchesFilter(e.kind, filter)),
    [events, filter],
  );

  const counts = useMemo(() => {
    let comments = 0;
    let journal = 0;
    let system = 0;
    for (const e of events) {
      if (e.kind === "comment") comments++;
      else if (e.kind === "journal_entry") journal++;
      else system++;
    }
    return { comments, journal, system };
  }, [events]);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <SectionLabel>Timeline</SectionLabel>
        <div className="flex items-center gap-1">
          <FilterPill
            label="Comments"
            count={counts.comments}
            active={filter.comments}
            onToggle={() => toggle("comments")}
            onSolo={() => solo("comments")}
          />
          <FilterPill
            label="Journal"
            count={counts.journal}
            active={filter.journal}
            onToggle={() => toggle("journal")}
            onSolo={() => solo("journal")}
          />
          <FilterPill
            label="System"
            count={counts.system}
            active={filter.system}
            onToggle={() => toggle("system")}
            onSolo={() => solo("system")}
          />
        </div>
      </div>
      <div className="space-y-2">
        {visible.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-xs text-ink-subtle">
            {filter.journal && !filter.comments && !filter.system
              ? "No journal entries yet. Agents and assignees use this space to record what they've tried and what's next."
              : "Nothing to show with this filter."}
          </div>
        )}
        {visible.map((e) => (
          <EventItem
            key={e.id}
            event={e}
            allTasks={allTasks}
            projects={projects}
            usersById={usersById}
            currentUserId={currentUserId}
            onEdit={(body, opts) => editor.editEvent(e.id, body, opts)}
            onDelete={(opts) => editor.deleteEvent(e.id, opts)}
          />
        ))}
      </div>
      <TimelineComposer editor={editor} />
    </section>
  );
}
