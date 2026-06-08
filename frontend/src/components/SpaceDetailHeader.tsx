import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { DEFAULT_SPACE_ID, type AuthMe, type Space, type User } from "@fjord/shared";
import { api } from "../lib/api.js";
import { handleError } from "../lib/toastError.js";
import { InlineEditableDescription, InlineEditableTitle } from "./InlineEditable.js";

function AvatarGlyph({ avatar }: { avatar: string }) {
  if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
    return <img src={avatar} alt="" className="h-5 w-5 rounded-full object-cover" />;
  }
  return (
    <span
      className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-subtle text-xs"
      aria-hidden
    >
      {avatar}
    </span>
  );
}

export function SpaceDetailHeader({
  space,
  owner,
  canEdit,
  currentUser,
}: {
  space: Space;
  owner: User | undefined;
  canEdit: boolean;
  currentUser: AuthMe | undefined;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isArchived = space.archived_at !== null;
  const isDefault = space.id === DEFAULT_SPACE_ID;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["space", space.id] });
    queryClient.invalidateQueries({ queryKey: ["spaces"] });
  }

  const nameMutation = useMutation({
    mutationFn: (name: string) => api.updateSpace(space.id, { name }),
    onSuccess: () => invalidate(),
    onError: (err) => handleError(err, "Rename failed"),
  });

  const descMutation = useMutation({
    mutationFn: (description: string) => api.updateSpace(space.id, { description }),
    onSuccess: () => invalidate(),
    onError: (err) => handleError(err, "Update failed"),
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.archiveSpace(space.id),
    onSuccess: () => invalidate(),
    onError: (err) => handleError(err, "Archive failed"),
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => api.unarchiveSpace(space.id),
    onSuccess: () => invalidate(),
    onError: (err) => handleError(err, "Unarchive failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSpace(space.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["archived-tasks"] });
      toast.success(`Space "${space.name}" deleted`);
      navigate("/spaces");
    },
    onError: (err) => handleError(err, "Delete failed"),
  });

  const joinMutation = useMutation({
    mutationFn: () => api.grantSpaceAccess(space.id, { user_id: currentUser!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["space", space.id] });
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      queryClient.invalidateQueries({ queryKey: ["space-access", space.id] });
      toast.success(`Joined "${space.name}"`);
    },
    onError: (err) => handleError(err, "Join failed"),
  });

  const isOwner = currentUser?.id === space.created_by;
  const showJoin = !isArchived && !isOwner && !space.affiliated && !!currentUser;

  return (
    <div className="border-b border-border pb-5">
      <div className="flex flex-wrap items-center gap-2">
        <InlineEditableTitle
          value={space.name}
          canEdit={canEdit}
          isPending={nameMutation.isPending}
          onSave={(name) => nameMutation.mutateAsync(name)}
          trailing={
            <>
              {isDefault && (
                <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                  system
                </span>
              )}
              {isArchived && (
                <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                  archived
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                {showJoin && (
                  <button
                    type="button"
                    onClick={() => joinMutation.mutate()}
                    disabled={joinMutation.isPending}
                    className="rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
                  >
                    Join this Space
                  </button>
                )}
                {canEdit && (
                  <>
                    {isArchived ? (
                      <button
                        type="button"
                        onClick={() => unarchiveMutation.mutate()}
                        disabled={unarchiveMutation.isPending}
                        className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-50"
                      >
                        Unarchive
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => archiveMutation.mutate()}
                        disabled={archiveMutation.isPending || isDefault}
                        title={isDefault ? "The default space cannot be archived" : undefined}
                        className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-muted"
                      >
                        Archive
                      </button>
                    )}
                    {!isDefault && (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            confirm(
                              `Delete "${space.name}"? Empty projects in it will be removed. Spaces with tasks cannot be deleted.`,
                            )
                          ) {
                            deleteMutation.mutate();
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="rounded-lg border border-danger-border px-2.5 py-1 text-xs font-medium text-danger-text transition-colors hover:bg-danger-bg disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          }
        />
      </div>

      <div className="mt-3">
        <InlineEditableDescription
          value={space.description}
          placeholder="Describe this space…"
          canEdit={canEdit}
          isPending={descMutation.isPending}
          onSave={(description) => descMutation.mutateAsync(description)}
        />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
          Owner
        </span>
        {owner ? (
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface-subtle px-2 py-1">
            <AvatarGlyph avatar={owner.avatar} />
            <span className="text-xs font-medium text-ink">@{owner.handle}</span>
          </div>
        ) : (
          <span className="text-sm italic text-ink-subtle">unknown</span>
        )}
      </div>
    </div>
  );
}
