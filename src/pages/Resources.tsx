import { useEffect, useMemo, useRef, useState } from "react";
import {
  createResource,
  deleteResource,
  duplicateResource,
  listResources,
  updateResource,
  Resource,
  ResourceType,
} from "@/lib/resources-store";
import { ResourceEditorDialog, ResourceEditorValues } from "@/components/resources/ResourceEditorDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { formatDistanceToNow } from "date-fns";
import {
  Copy,
  ExternalLink,
  MoreHorizontal,
  Plus,
  Sparkles,
  Star,
} from "lucide-react";

const typeLabels: Record<ResourceType, string> = {
  email: "Email",
  dm: "DM",
  link: "Link",
  snippet: "Snippet",
  doc: "Memo",
};

const PLACEHOLDER_REGEX = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

const extractPlaceholders = (texts: string[]) => {
  const seen = new Set<string>();
  const placeholders: string[] = [];
  texts.forEach((text) => {
    if (!text) return;
    const regex = new RegExp(PLACEHOLDER_REGEX);
    let match = regex.exec(text);
    while (match) {
      const key = match[1];
      if (!seen.has(key)) {
        seen.add(key);
        placeholders.push(key);
      }
      match = regex.exec(text);
    }
  });
  return placeholders;
};

const replacePlaceholders = (text: string, values: Record<string, string>) =>
  text.replace(PLACEHOLDER_REGEX, (_, key) => values[key] ?? "");

const countWords = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    toast({ title: "Copied to clipboard" });
  }
};

type PlaceholderDialogState = {
  open: boolean;
  placeholders: string[];
  values: Record<string, string>;
};

export default function Resources() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | ResourceType>("all");
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorType, setEditorType] = useState<ResourceType | null>(null);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Resource | null>(null);
  const [placeholderDialog, setPlaceholderDialog] = useState<PlaceholderDialogState>({
    open: false,
    placeholders: [],
    values: {},
  });
  const placeholderActionRef = useRef<((values: Record<string, string>) => void) | null>(null);

  useEffect(() => {
    setResources(listResources());
  }, []);

  const refreshResources = () => setResources(listResources());

  const filteredResources = useMemo(() => {
    const query = search.trim().toLowerCase();
    return resources.filter((resource) => {
      if (filterType !== "all" && resource.type !== filterType) return false;
      if (!query) return true;
      const haystack = [
        resource.title,
        resource.type === "email" ? resource.subject : "",
        resource.type !== "link" ? resource.body : "",
        resource.type === "link" ? resource.url : "",
        resource.type === "link" ? resource.notes ?? "" : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [resources, search, filterType]);

  const openEditorForNew = (type: ResourceType) => {
    setEditorType(type);
    setEditingResource(null);
    setEditorOpen(true);
  };

  const openEditorForEdit = (resource: Resource) => {
    setEditorType(null);
    setEditingResource(resource);
    setEditorOpen(true);
  };

  const handleSave = (values: ResourceEditorValues) => {
    if (editingResource) {
      updateResource(editingResource.id, values);
    } else {
      createResource(values as Omit<Resource, "id" | "createdAt" | "updatedAt">);
    }
    setEditorOpen(false);
    setEditorType(null);
    setEditingResource(null);
    refreshResources();
  };

  const handleToggleStar = (resource: Resource) => {
    updateResource(resource.id, { starred: !resource.starred });
    refreshResources();
  };

  const handleDuplicate = (resource: Resource) => {
    duplicateResource(resource.id);
    refreshResources();
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteResource(deleteTarget.id);
    setDeleteTarget(null);
    refreshResources();
  };

  const openPlaceholderDialog = (
    placeholders: string[],
    action: (values: Record<string, string>) => void
  ) => {
    placeholderActionRef.current = action;
    setPlaceholderDialog({
      open: true,
      placeholders,
      values: placeholders.reduce((acc, key) => {
        acc[key] = "";
        return acc;
      }, {} as Record<string, string>),
    });
  };

  const runCopyAction = (text: string) => {
    const placeholders = extractPlaceholders([text]);
    if (placeholders.length > 0) {
      openPlaceholderDialog(placeholders, (values) => copyToClipboard(replacePlaceholders(text, values)));
      return;
    }
    copyToClipboard(text);
  };

  const runOpenUrl = (url: string) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handlePlaceholderConfirm = () => {
    placeholderActionRef.current?.(placeholderDialog.values);
    setPlaceholderDialog({ open: false, placeholders: [], values: {} });
  };

  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-4xl lg:max-w-5xl 2xl:max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="sr-only sm:not-sr-only text-3xl lg:text-4xl font-bold text-foreground">Resources</h1>
          <p className="text-muted-foreground lg:text-lg mt-1">
            Store reusable outreach templates, links, and long-form memos.
          </p>
        </div>
        <Button
          size="sm"
          className="h-8 px-3 text-xs sm:h-9 sm:px-4 sm:text-sm"
          onClick={() => setNewDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-2" />
          New
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <Input
          placeholder="Search title, subject, body, or URL..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full sm:flex-1"
        />
        <Select
          value={filterType}
          onValueChange={(value) => setFilterType(value as "all" | ResourceType)}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="dm">DM</SelectItem>
            <SelectItem value="link">Link</SelectItem>
            <SelectItem value="snippet">Snippet</SelectItem>
            <SelectItem value="doc">Memo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredResources.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No resources yet</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              Save your outreach templates, reference links, and long-form memos here for quick reuse.
            </p>
            <Button onClick={() => setNewDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create your first resource
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredResources.map((resource) => {
            const updatedText = formatDistanceToNow(new Date(resource.updatedAt), { addSuffix: true });
            const wordCount = resource.type === "doc" ? countWords(resource.body) : 0;
            return (
              <Card
                key={resource.id}
                className="cursor-pointer transition-all duration-150 ease-out hover:border-muted-foreground/30 hover:bg-muted/50 hover:shadow-[0_6px_16px_rgba(15,23,42,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-primary/40"
                onClick={() => openEditorForEdit(resource)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openEditorForEdit(resource);
                  }
                }}
                tabIndex={0}
              >
                <CardContent className="p-4 lg:p-5 flex flex-col gap-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground truncate">
                          {resource.title}
                        </h3>
                        <Badge variant="secondary" className="text-xs">
                          {typeLabels[resource.type]}
                        </Badge>
                        {resource.tags?.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Edited {updatedText}
                        {resource.type === "doc" && wordCount > 0 ? ` • ${wordCount} words` : ""}
                      </p>
                      {resource.type === "doc" && (
                        <p className="text-sm text-muted-foreground max-h-12 overflow-hidden whitespace-pre-wrap">
                          {resource.body}
                        </p>
                      )}
                    </div>
                    <div
                      className="flex items-center gap-2"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {resource.type === "email" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="whitespace-nowrap"
                          onClick={() => runCopyAction(`${resource.subject}\n\n${resource.body}`)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Email
                        </Button>
                      )}
                      {resource.type === "dm" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="whitespace-nowrap"
                          onClick={() => runCopyAction(resource.body)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Message
                        </Button>
                      )}
                      {resource.type === "snippet" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="whitespace-nowrap"
                          onClick={() => runCopyAction(resource.body)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Snippet
                        </Button>
                      )}
                      {resource.type === "doc" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="whitespace-nowrap"
                          onClick={() => runCopyAction(resource.body)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Memo
                        </Button>
                      )}
                      {resource.type === "link" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="whitespace-nowrap"
                          onClick={() => runCopyAction(resource.url)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy URL
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleToggleStar(resource)}
                        aria-label={resource.starred ? "Unstar resource" : "Star resource"}
                      >
                        <Star
                          className={`h-4 w-4 ${resource.starred ? "text-yellow-500 fill-yellow-500" : ""}`}
                        />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {resource.type === "email" && (
                            <>
                              <DropdownMenuItem onClick={() => runCopyAction(resource.subject)}>
                                Copy Subject
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => runCopyAction(resource.body)}>
                                Copy Body
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {resource.type === "link" && (
                            <>
                              <DropdownMenuItem onClick={() => runOpenUrl(resource.url)}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Open URL
                              </DropdownMenuItem>
                              {resource.notes && (
                                <DropdownMenuItem onClick={() => runCopyAction(resource.notes ?? "")}>
                                  Copy Notes
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {resource.type === "snippet" && (
                            <>
                              <DropdownMenuItem onClick={() => runCopyAction(resource.body)}>
                                Copy Snippet
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {resource.type === "doc" && (
                            <>
                              <DropdownMenuItem onClick={() => runCopyAction(resource.body)}>
                                Copy Memo
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem onClick={() => openEditorForEdit(resource)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(resource)}>
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive-foreground"
                            onClick={() => setDeleteTarget(resource)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Resource</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setNewDialogOpen(false);
                openEditorForNew("email");
              }}
            >
              Email
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setNewDialogOpen(false);
                openEditorForNew("dm");
              }}
            >
              LinkedIn DM
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setNewDialogOpen(false);
                openEditorForNew("link");
              }}
            >
              Link
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setNewDialogOpen(false);
                openEditorForNew("snippet");
              }}
            >
              Snippet
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setNewDialogOpen(false);
                openEditorForNew("doc");
              }}
            >
              Memo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ResourceEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditorOpen(false);
            setEditorType(null);
            setEditingResource(null);
          } else {
            setEditorOpen(true);
          }
        }}
        resource={editingResource}
        type={editorType}
        onSave={handleSave}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete resource?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The template will be removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={placeholderDialog.open}
        onOpenChange={(open) =>
          setPlaceholderDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fill placeholders</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {placeholderDialog.placeholders.map((placeholder, index) => (
              <div key={placeholder} className="space-y-1">
                <label className="text-sm font-medium text-foreground">{placeholder}</label>
                <Input
                  autoFocus={index === 0}
                  value={placeholderDialog.values[placeholder] ?? ""}
                  onChange={(event) =>
                    setPlaceholderDialog((prev) => ({
                      ...prev,
                      values: { ...prev.values, [placeholder]: event.target.value },
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setPlaceholderDialog({ open: false, placeholders: [], values: {} })}>
              Cancel
            </Button>
            <Button onClick={handlePlaceholderConfirm}>Copy final text</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
