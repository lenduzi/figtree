import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Resource, ResourceType } from "@/lib/resources-store";

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
};

export function ResourceEditorDialog({
  open,
  onOpenChange,
  resource,
  type,
  onSave,
}: ResourceEditorDialogProps) {
  const resolvedType = resource?.type ?? type ?? "email";
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
    setBody(resource?.type === "email" || resource?.type === "dm" ? resource.body : "");
    setUrl(resource?.type === "link" ? resource.url : "");
    setNotes(resource?.type === "link" ? resource.notes ?? "" : "");
    setTagsInput(resource?.tags?.join(", ") ?? "");
  }, [open, resource]);

  const isValid = useMemo(() => {
    if (!title.trim()) return false;
    if (resolvedType === "email") return !!subject.trim() && !!body.trim();
    if (resolvedType === "dm") return !!body.trim();
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
      <DialogContent className="sm:max-w-xl">
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
              placeholder={resolvedType === "dm" ? "Message" : "Email body"}
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
      </DialogContent>
    </Dialog>
  );
}
