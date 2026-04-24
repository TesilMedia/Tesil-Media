"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CommentLikeDislike } from "@/components/LikeDislike";

export type CommentDTO = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  userId: string;
  parentId: string | null;
  likes: number;
  dislikes: number;
  userVote: 0 | 1 | -1;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    channelSlug: string | null;
  };
};

type Viewer = { id: string; name: string | null; image: string | null } | null;

type Node = { comment: CommentDTO; children: Node[] };

const MAX_BODY = 2000;
const MAX_TREE_DEPTH = 3;

export function Comments({
  videoId,
  initial,
  viewer,
}: {
  videoId: string;
  initial: CommentDTO[];
  viewer: Viewer;
}) {
  const [items, setItems] = useState<CommentDTO[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedRoots, setExpandedRoots] = useState<Set<string>>(
    () => new Set(),
  );

  const { roots, descendantCount } = useMemo(
    () => buildTree(items),
    [items],
  );

  async function postComment(
    body: string,
    parentId: string | null,
  ): Promise<CommentDTO | null> {
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, parentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Failed to post comment.");
        return null;
      }
      const created = data.comment as CommentDTO;
      setItems((prev) => {
        const next = [created, ...prev];
        if (created.parentId) {
          const rootId = findRootId(next, created.parentId);
          if (rootId) {
            setExpandedRoots((curr) => {
              const s = new Set(curr);
              s.add(rootId);
              return s;
            });
          }
        }
        return next;
      });
      return created;
    } catch {
      setError("Network error.");
      return null;
    }
  }

  async function editComment(
    id: string,
    body: string,
  ): Promise<CommentDTO | null> {
    setError(null);
    try {
      const res = await fetch(`/api/comments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Failed to save comment.");
        return null;
      }
      const updated = data.comment as CommentDTO;
      setItems((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      return updated;
    } catch {
      setError("Network error.");
      return null;
    }
  }

  async function remove(id: string) {
    const prev = items;
    const dropIds = collectSubtreeIds(prev, id);
    setItems((curr) => curr.filter((c) => !dropIds.has(c.id)));
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setItems(prev);
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Failed to delete comment.");
      }
    } catch {
      setItems(prev);
      setError("Network error.");
    }
  }

  function toggleRoot(rootId: string) {
    setExpandedRoots((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  }

  return (
    <section className="mt-6 overflow-x-hidden rounded-lg border border-border bg-surface p-4 shadow-card">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
        {items.length} {items.length === 1 ? "comment" : "comments"}
      </h2>

      {viewer ? (
        <CommentForm
          viewer={viewer}
          placeholder="Add a comment…"
          submitLabel="Comment"
          onSubmit={(body) => postComment(body, null)}
        />
      ) : (
        <p className="mb-6 text-sm text-muted">
          <Link href="/signin" className="underline hover:text-text">
            Sign in
          </Link>{" "}
          to leave a comment.
        </p>
      )}

      {error ? (
        <div className="mb-4 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}

      <ul className="flex flex-col gap-5">
        {roots.map((root) => {
          const total = descendantCount.get(root.comment.id) ?? 0;
          const expanded = expandedRoots.has(root.comment.id);
          return (
            <li key={root.comment.id} className="flex flex-col gap-2">
              <CommentNode
                node={root}
                depth={0}
                viewer={viewer}
                onDelete={remove}
                onSubmitReply={postComment}
                onSubmitEdit={editComment}
                replyOpenFor={replyOpenFor}
                setReplyOpenFor={setReplyOpenFor}
                editingId={editingId}
                setEditingId={setEditingId}
                renderChildren={false}
                showTreeConnector={expanded}
              />

              {total > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => toggleRoot(root.comment.id)}
                    className="ml-12 self-start text-xs font-medium text-accent-blue hover:text-accent-blue-hover"
                  >
                    {expanded ? "Hide" : "Show"} {total}{" "}
                    {total === 1 ? "reply" : "replies"}
                  </button>
                  {expanded ? (
                    <ul className="comment-tree-children comment-tree-root mt-3 flex flex-col gap-4 transition-colors">
                      {root.children.map((child) => (
                        <li key={child.comment.id} className="comment-tree-item">
                          <CommentNode
                            node={child}
                            depth={1}
                            viewer={viewer}
                            onDelete={remove}
                            onSubmitReply={postComment}
                            onSubmitEdit={editComment}
                            replyOpenFor={replyOpenFor}
                            setReplyOpenFor={setReplyOpenFor}
                            editingId={editingId}
                            setEditingId={setEditingId}
                            renderChildren
                            showTreeConnector={child.children.length > 0}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </li>
          );
        })}
        {roots.length === 0 ? (
          <li className="text-sm text-muted">Be the first to comment.</li>
        ) : null}
      </ul>
    </section>
  );
}

function CommentNode({
  node,
  depth,
  viewer,
  onDelete,
  onSubmitReply,
  onSubmitEdit,
  replyOpenFor,
  setReplyOpenFor,
  editingId,
  setEditingId,
  renderChildren,
  showTreeConnector = false,
  replyingTo = null,
}: {
  node: Node;
  depth: number;
  viewer: Viewer;
  onDelete: (id: string) => void;
  onSubmitReply: (
    body: string,
    parentId: string | null,
  ) => Promise<CommentDTO | null>;
  onSubmitEdit: (
    id: string,
    body: string,
  ) => Promise<CommentDTO | null>;
  replyOpenFor: string | null;
  setReplyOpenFor: (id: string | null) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  renderChildren: boolean;
  showTreeConnector?: boolean;
  replyingTo?: string | null;
}) {
  const c = node.comment;
  const replyOpen = replyOpenFor === c.id;
  const editing = editingId === c.id;
  const displayName = c.user.name ?? "User";
  const isAuthor = viewer?.id === c.userId;
  const compact = depth > 0;
  const avatarWrapperClass = [
    "comment-tree-avatar-anchor shrink-0",
    showTreeConnector ? "comment-tree-avatar-parent" : "",
    compact ? "comment-tree-avatar-parent-sm" : "comment-tree-avatar-parent-md",
  ]
    .filter(Boolean)
    .join(" ");
  const avatar = (
    <Avatar
      name={c.user.name}
      image={c.user.image}
      size={compact ? "sm" : "md"}
    />
  );

  return (
    <div
      className="flex flex-col gap-2"
      data-comment-id={c.id}
    >
      <div className="flex gap-3">
        <div className={avatarWrapperClass}>
          {c.user.channelSlug ? (
            <Link href={`/c/${c.user.channelSlug}`} className="block hover:opacity-90">
              {avatar}
            </Link>
          ) : (
            avatar
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 text-sm">
            {c.user.channelSlug ? (
              <Link
                href={`/c/${c.user.channelSlug}`}
                className="font-medium hover:underline"
              >
                {displayName}
              </Link>
            ) : (
              <span className="font-medium">{displayName}</span>
            )}
            <span className="text-xs text-muted">
              {timeAgo(c.createdAt)}
              {c.editedAt ? (
                <span
                  className="ml-1"
                  title={`Edited ${new Date(c.editedAt).toLocaleString()}`}
                >
                  (edited)
                </span>
              ) : null}
            </span>
          </div>

          {replyingTo ? (
            <button
              type="button"
              className="mt-0.5 text-left text-xs text-muted transition-colors hover:text-accent-blue"
              onClick={() => {
                if (!c.parentId) return;
                document
                  .querySelector(`[data-comment-id="${c.parentId}"]`)
                  ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }}
            >
              ↳ Replying to <span className="font-medium">{replyingTo}</span>
            </button>
          ) : null}

          {editing && viewer ? (
            <div className="mt-1">
              <CommentForm
                viewer={viewer}
                placeholder="Edit your comment…"
                submitLabel="Save"
                initialBody={c.body}
                autoFocus
                onCancel={() => setEditingId(null)}
                onSubmit={async (body) => {
                  const updated = await onSubmitEdit(c.id, body);
                  if (updated) setEditingId(null);
                  return updated;
                }}
              />
            </div>
          ) : (
            <p className="mt-0.5 whitespace-pre-line break-words text-sm">
              {c.body}
            </p>
          )}

          {!editing ? (
            <div className="mt-1 flex items-center gap-3 text-xs text-muted">
              <CommentLikeDislike
                commentId={c.id}
                initialLikes={c.likes}
                initialDislikes={c.dislikes}
                initialVote={c.userVote}
                disabled={!viewer}
              />
              {viewer ? (
                <button
                  type="button"
                  onClick={() => setReplyOpenFor(replyOpen ? null : c.id)}
                  className="font-medium hover:text-text"
                >
                  {replyOpen ? "Cancel" : "Reply"}
                </button>
              ) : null}
              {isAuthor ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(c.id);
                      setReplyOpenFor(null);
                    }}
                    className="hover:text-text"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    className="hover:text-text"
                  >
                    Delete
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {replyOpen && viewer && !editing ? (
        <div className="sm:ml-10">
          <CommentForm
            viewer={viewer}
            placeholder={`Reply to ${displayName}…`}
            submitLabel="Reply"
            autoFocus
            onCancel={() => setReplyOpenFor(null)}
            onSubmit={async (body) => {
              const created = await onSubmitReply(body, c.id);
              if (created) setReplyOpenFor(null);
              return created;
            }}
          />
        </div>
      ) : null}

      {renderChildren && node.children.length > 0 && depth + 1 <= MAX_TREE_DEPTH ? (
        <ul className="comment-tree-children comment-tree-nested mt-2 flex flex-col gap-4 transition-colors">
          {depth + 1 < MAX_TREE_DEPTH
            ? node.children.map((child) => (
                <li key={child.comment.id} className="comment-tree-item">
                  <CommentNode
                    node={child}
                    depth={depth + 1}
                    viewer={viewer}
                    onDelete={onDelete}
                    onSubmitReply={onSubmitReply}
                    onSubmitEdit={onSubmitEdit}
                    replyOpenFor={replyOpenFor}
                    setReplyOpenFor={setReplyOpenFor}
                    editingId={editingId}
                    setEditingId={setEditingId}
                    renderChildren
                    showTreeConnector={child.children.length > 0}
                  />
                </li>
              ))
            : node.children.flatMap((child) => [
                <li key={child.comment.id} className="comment-tree-item">
                  <CommentNode
                    node={child}
                    depth={depth + 1}
                    viewer={viewer}
                    onDelete={onDelete}
                    onSubmitReply={onSubmitReply}
                    onSubmitEdit={onSubmitEdit}
                    replyOpenFor={replyOpenFor}
                    setReplyOpenFor={setReplyOpenFor}
                    editingId={editingId}
                    setEditingId={setEditingId}
                    renderChildren={false}
                  />
                </li>,
                ...flattenDescendants(child).map(({ node: desc, parent }) => (
                  <li key={desc.comment.id} className="comment-tree-item">
                    <CommentNode
                      node={desc}
                      depth={depth + 1}
                      viewer={viewer}
                      onDelete={onDelete}
                      onSubmitReply={onSubmitReply}
                      onSubmitEdit={onSubmitEdit}
                      replyOpenFor={replyOpenFor}
                      setReplyOpenFor={setReplyOpenFor}
                      editingId={editingId}
                      setEditingId={setEditingId}
                      renderChildren={false}
                      replyingTo={parent.comment.user.name ?? "User"}
                    />
                  </li>
                )),
              ])}
        </ul>
      ) : null}
    </div>
  );
}

function CommentForm({
  viewer,
  placeholder,
  submitLabel,
  initialBody = "",
  autoFocus = false,
  onSubmit,
  onCancel,
}: {
  viewer: NonNullable<Viewer>;
  placeholder: string;
  submitLabel: string;
  initialBody?: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<CommentDTO | null>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [submitting, setSubmitting] = useState(false);

  const trimmed = body.trim();
  const canSubmit =
    trimmed.length > 0 && trimmed !== initialBody.trim() && !submitting;

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    const created = await onSubmit(trimmed);
    setSubmitting(false);
    if (created) setBody("");
  }

  return (
    <form onSubmit={handle} className="mb-6 flex gap-3">
      <Avatar name={viewer.name} image={viewer.image} size="md" />
      <div className="flex-1 min-w-0">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
          placeholder={placeholder}
          rows={2}
          autoFocus={autoFocus}
          className="w-full resize-y rounded-md border border-border bg-bg p-2 text-sm outline-none focus:border-accent"
          disabled={submitting}
        />
        <div className="mt-2 flex justify-end gap-2">
            {onCancel || body.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setBody("");
                  onCancel?.();
                }}
                className="rounded-full border border-border bg-surface px-3 py-1 text-sm hover:bg-surface-2 sm:px-4 sm:py-1.5"
                disabled={submitting}
              >
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-full bg-accent px-3 py-1 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-1.5"
            >
              {submitting ? "Posting…" : submitLabel}
            </button>
        </div>
      </div>
    </form>
  );
}

function Avatar({
  name,
  image,
  size,
}: {
  name: string | null;
  image: string | null;
  size: "sm" | "md";
}) {
  const initial = (name ?? "U").trim().charAt(0).toUpperCase() || "U";
  const dim = size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-semibold text-muted ${dim}`}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
}

function buildTree(items: CommentDTO[]): {
  roots: Node[];
  descendantCount: Map<string, number>;
} {
  const byId = new Map<string, Node>();
  for (const c of items) byId.set(c.id, { comment: c, children: [] });
  const roots: Node[] = [];
  for (const c of items) {
    const node = byId.get(c.id)!;
    if (c.parentId && byId.has(c.parentId)) {
      byId.get(c.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  roots.sort((a, b) =>
    b.comment.createdAt.localeCompare(a.comment.createdAt),
  );
  const sortChildren = (n: Node) => {
    n.children.sort((a, b) =>
      a.comment.createdAt.localeCompare(b.comment.createdAt),
    );
    n.children.forEach(sortChildren);
  };
  roots.forEach(sortChildren);

  const descendantCount = new Map<string, number>();
  const count = (n: Node): number => {
    let sum = n.children.length;
    for (const c of n.children) sum += count(c);
    descendantCount.set(n.comment.id, sum);
    return sum;
  };
  for (const r of roots) count(r);
  return { roots, descendantCount };
}

function flattenDescendants(
  node: Node,
): Array<{ node: Node; parent: Node }> {
  const out: Array<{ node: Node; parent: Node }> = [];
  const dfs = (n: Node) => {
    for (const child of n.children) {
      out.push({ node: child, parent: n });
      dfs(child);
    }
  };
  dfs(node);
  return out;
}

function findRootId(items: CommentDTO[], startId: string): string | null {
  const byId = new Map(items.map((c) => [c.id, c] as const));
  let cur = byId.get(startId);
  while (cur?.parentId) {
    const parent = byId.get(cur.parentId);
    if (!parent) break;
    cur = parent;
  }
  return cur?.id ?? null;
}

function collectSubtreeIds(items: CommentDTO[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const c of items) {
    if (c.parentId) {
      const arr = childrenByParent.get(c.parentId) ?? [];
      arr.push(c.id);
      childrenByParent.set(c.parentId, arr);
    }
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    const kids = childrenByParent.get(id);
    if (kids) stack.push(...kids);
  }
  return out;
}

function timeAgo(iso: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const yr = Math.floor(mo / 12);
  return `${yr} year${yr === 1 ? "" : "s"} ago`;
}
