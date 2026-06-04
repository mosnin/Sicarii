"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Reply, MessageCircle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

interface CommentData {
  id: string;
  userId: string;
  parentId: string | null;
  content: string;
  createdAt: string;
}

interface CommentTree {
  id: string;
  userName: string;
  role: "client" | "admin";
  content: string;
  createdAt: string;
  replies: CommentTree[];
}

interface ProjectCommentsProps {
  projectId: string;
}

function buildTree(comments: CommentData[]): CommentTree[] {
  const map = new Map<string, CommentTree>();
  const roots: CommentTree[] = [];

  // First pass — create nodes
  for (const c of comments) {
    map.set(c.id, {
      id: c.id,
      userName: "User", // We don't have user names from API, will show role
      role: "client",
      content: c.content,
      createdAt: new Date(c.createdAt).toLocaleString(),
      replies: [],
    });
  }

  // Second pass — wire parent/child
  for (const c of comments) {
    const node = map.get(c.id)!;
    if (c.parentId && map.has(c.parentId)) {
      map.get(c.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function CommentItem({
  comment,
  depth = 0,
  projectId,
  onReplyPosted,
}: {
  comment: CommentTree;
  depth?: number;
  projectId: string;
  onReplyPosted: () => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          content: replyText,
          parentId: comment.id,
        }),
      });
      if (res.ok) {
        setReplyText("");
        setReplyOpen(false);
        onReplyPosted();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={cn("space-y-3", depth > 0 && "ml-8 pl-4 border-l-2 border-border")}>
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-2">
          <div
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold",
              comment.role === "admin"
                ? "bg-orange/10 text-orange"
                : "bg-muted text-muted-foreground"
            )}
          >
            {comment.userName[0]}
          </div>
          <span className="text-sm font-medium">{comment.userName}</span>
          {comment.role === "admin" && (
            <span className="text-[10px] bg-orange/10 text-orange px-1.5 py-0.5 rounded-full font-medium">
              Team
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {comment.createdAt}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{comment.content}</p>
        <button
          onClick={() => setReplyOpen(!replyOpen)}
          className="flex items-center gap-1 mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <Reply className="h-3 w-3" />
          Reply
        </button>

        {replyOpen && (
          <div className="mt-3 flex gap-2">
            <Textarea
              placeholder="Write a reply..."
              rows={2}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              className="text-sm"
            />
            <Button
              size="sm"
              disabled={!replyText.trim() || submitting}
              onClick={handleReply}
              className="shrink-0 self-end"
            >
              <Send className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {comment.replies.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          depth={depth + 1}
          projectId={projectId}
          onReplyPosted={onReplyPosted}
        />
      ))}
    </div>
  );
}

export function ProjectComments({ projectId }: ProjectCommentsProps) {
  const [comments, setComments] = useState<CommentData[]>([]);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchComments = () => {
    fetch(`/api/comments?projectId=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setComments(data);
      })
      .catch(() => {
        setComments([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchComments();
  }, [projectId]);

  const handleNewComment = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          content: newComment,
        }),
      });
      if (res.ok) {
        setNewComment("");
        fetchComments();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const tree = buildTree(comments);

  return (
    <div className="space-y-4">
      {/* New comment */}
      <div className="space-y-2">
        <Textarea
          placeholder="Add a comment or annotation..."
          rows={3}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
        />
        <div className="flex justify-end">
          <Button
            disabled={!newComment.trim() || submitting}
            onClick={handleNewComment}
          >
            <MessageCircle className="mr-1 h-4 w-4" />
            {submitting ? "Posting..." : "Comment"}
          </Button>
        </div>
      </div>

      {/* Comments list */}
      <div className="space-y-4">
        {loading ? (
          <div className="py-6">
            <EmptyState icon={MessageCircle} title="Loading comments..." description="" />
          </div>
        ) : tree.length === 0 ? (
          <div className="py-2">
            <EmptyState
              icon={MessageCircle}
              title="No comments yet"
              description="Leave a comment above to start the conversation with the team."
            />
          </div>
        ) : (
          tree.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              projectId={projectId}
              onReplyPosted={fetchComments}
            />
          ))
        )}
      </div>
    </div>
  );
}
