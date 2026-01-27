import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Resource, ResourceType } from "@/lib/resources-store";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export type ResourceEditorValues = {
  type: ResourceType;
  title: string;
  subject?: string;
  body?: string;
  url?: string;
  notes?: string;
  tags?: string[];
};

type ResourceEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource?: Resource | null;
  type?: ResourceType | null;
  onSave: (values: ResourceEditorValues) => void;
};

const typeLabels: Record<ResourceType, string> = {
  email: "Email",
  dm: "LinkedIn DM",
  link: "Link",
  snippet: "Snippet",
  doc: "Memo",
};

export function ResourceEditorDialog({
  open,
  onOpenChange,
  resource,
  type,
  onSave,
}: ResourceEditorDialogProps) {
  const resolvedType = resource?.type ?? type ?? "email";
  const isEmail = resolvedType === "email";
  const isDoc = resolvedType === "doc";
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(resource?.title ?? "");
    setSubject(resource?.type === "email" ? resource.subject : "");
    setBody(
      resource?.type === "email" ||
        resource?.type === "dm" ||
        resource?.type === "snippet" ||
        resource?.type === "doc"
        ? resource.body
        : ""
    );
    setUrl(resource?.type === "link" ? resource.url : "");
    setNotes(resource?.type === "link" ? resource.notes ?? "" : "");
    setTagsInput(resource?.tags?.join(", ") ?? "");
  }, [open, resource]);

  const isValid = useMemo(() => {
    if (!title.trim()) return false;
    if (resolvedType === "email") return !!subject.trim() && !!body.trim();
    if (resolvedType === "dm") return !!body.trim();
    if (resolvedType === "snippet") return !!body.trim();
    if (resolvedType === "doc") return !!body.trim();
    if (resolvedType === "link") return !!url.trim();
    return false;
  }, [title, subject, body, url, resolvedType]);

  const handleSave = () => {
    const tags = tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    onSave({
      type: resolvedType,
      title: title.trim(),
      subject: resolvedType === "email" ? subject.trim() : undefined,
      body: resolvedType !== "link" ? body.trim() : undefined,
      url: resolvedType === "link" ? url.trim() : undefined,
      notes: resolvedType === "link" ? notes.trim() || undefined : undefined,
      tags: tags.length > 0 ? tags : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose={!isEmail}
        className={cn(
          "sm:max-w-xl",
          isEmail && "sm:max-w-2xl p-0 overflow-hidden",
          isDoc && "p-0 overflow-hidden w-[min(96vw,1100px)] h-[min(82vh,900px)] sm:max-w-5xl"
        )}
      >
        {isEmail ? (
          <div className="flex flex-col">
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/40">
              <div className="flex items-center gap-1.5">
                <DialogClose
                  className="group relative flex h-3 w-3 items-center justify-center rounded-full bg-red-400 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] transition-colors hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label="Close"
                >
                  <X className="h-2.5 w-2.5 text-red-950/60 opacity-0 transition-opacity group-hover:opacity-100" />
                </DialogClose>
                <span className="h-3 w-3 rounded-full bg-amber-400 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" />
                <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]" />
              </div>
              <DialogTitle className="text-sm font-medium text-foreground">New Message</DialogTitle>
            </div>
            <DialogDescription className="sr-only">
              {resource ? "Update this template and save changes." : "Keep it short, clear, and reusable."}
            </DialogDescription>
            <div className="px-4 py-4 space-y-4">
              <div className="space-y-3">
                <div className="grid grid-cols-[84px_1fr] items-center gap-3">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Title
                  </span>
                  <Input
                    placeholder="Template title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-[84px_1fr] items-center gap-3">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Subject
                  </span>
                  <Input
                    placeholder="Subject"
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                  />
                </div>
              </div>
              <Textarea
                placeholder="Write your email..."
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-[220px]"
              />
              <div className="grid grid-cols-[84px_1fr] items-center gap-3">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Tags
                </span>
                <Input
                  placeholder="Comma separated tags"
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col gap-2 border-t border-border bg-muted/30 px-4 py-3 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!isValid}>
                Save
              </Button>
            </DialogFooter>
          </div>
        ) : isDoc ? (
          <div className="flex h-full flex-col">
            <DialogHeader className="border-b border-border bg-muted/40 px-4 py-3">
              <DialogTitle>{resource ? "Edit Memo" : "New Memo"}</DialogTitle>
              <DialogDescription>
                Long-form notes and strategy drafts. Keep it lightweight.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-hidden px-4 py-4">
              <div className="flex h-full flex-col gap-4">
                <Input
                  placeholder="Memo title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  autoFocus
                />
                <Textarea
                  placeholder="Write your memo..."
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="flex-1 min-h-[320px] resize-none"
                />
                <Input
                  placeholder="Tags (comma separated)"
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="flex flex-col gap-2 border-t border-border bg-muted/30 px-4 py-3 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!isValid}>
                Save
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{resource ? "Edit Resource" : `New ${typeLabels[resolvedType]}`}</DialogTitle>
              <DialogDescription>
                {resource ? "Update this template and save changes." : "Keep it short, clear, and reusable."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
              />
              {resolvedType === "email" && (
                <Input
                  placeholder="Subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />
              )}
              {resolvedType !== "link" && (
                <Textarea
                  placeholder={
                    resolvedType === "dm"
                      ? "Message"
                      : resolvedType === "snippet"
                        ? "Snippet text"
                        : "Email body"
                  }
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="min-h-[160px]"
                />
              )}
              {resolvedType === "link" && (
                <div className="space-y-3">
                  <Input
                    placeholder="URL"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                  />
                  <Textarea
                    placeholder="Notes (optional)"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="min-h-[120px]"
                  />
                </div>
              )}
              <Input
                placeholder="Tags (comma separated)"
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
              />
            </div>
            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!isValid}>
                Save
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
