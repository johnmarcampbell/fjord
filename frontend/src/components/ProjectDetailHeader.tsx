import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@fjord/shared";
import { api } from "../lib/api.js";
import { handleError } from "../lib/toastError.js";
import { InlineEditableDescription, InlineEditableTitle } from "./InlineEditable.js";

/**
 * Inline-editable name + description for the project detail page.
 *
 * `canEdit` is always true for anyone who can load the page: `GET` and `PATCH`
 * on `/api/projects/:id` share the same `canAccessSpace` check, so reaching
 * this surface already proves write access. The prop is kept explicit so the
 * affordance is easy to gate differently later if that ever changes.
 *
 * The edit UX lives in the shared `InlineEditableTitle` / `InlineEditableDescription`
 * primitives (also used by `SpaceDetailHeader`).
 */
export function ProjectDetailHeader({
  project,
  canEdit,
}: {
  project: Project;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  }

  const nameMutation = useMutation({
    mutationFn: (name: string) => api.updateProject(project.id, { name }),
    onSuccess: () => invalidate(),
    onError: (err) => handleError(err, "Rename failed"),
  });

  const descMutation = useMutation({
    mutationFn: (description: string) => api.updateProject(project.id, { description }),
    onSuccess: () => invalidate(),
    onError: (err) => handleError(err, "Update failed"),
  });

  return (
    <div className="border-b border-border pb-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2">
          <InlineEditableTitle
            value={project.name}
            canEdit={canEdit}
            isPending={nameMutation.isPending}
            onSave={(name) => nameMutation.mutateAsync(name)}
            leading={
              project.color ? (
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ background: project.color }}
                />
              ) : null
            }
          />
        </div>
      </div>

      <div className="mt-3">
        <InlineEditableDescription
          value={project.description}
          placeholder="Describe this project…"
          canEdit={canEdit}
          isPending={descMutation.isPending}
          onSave={(description) => descMutation.mutateAsync(description)}
        />
      </div>
    </div>
  );
}
