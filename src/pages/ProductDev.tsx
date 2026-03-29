import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Download,
  MoreHorizontal,
  Plus,
  Sparkles,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
  createIdea,
  deleteIdea,
  listIdeas,
  updateIdea,
  type MoscowTier,
  type ProductIdea,
  type RoadmapLane,
  type UserType,
} from "@/lib/product-dev-store";
import { cn } from "@/lib/utils";

const USER_TYPES: UserType[] = ["B2B", "B2C", "Admin", "Multi"];
const MOSCOW_TIERS: MoscowTier[] = ["Must", "Should", "Could", "Won't"];
const ROADMAP_LANES: RoadmapLane[] = ["Now", "Next", "Later"];
const ARCHIVE_NOTE_TEMPLATES = [
  { label: "Successful implementation", tone: "success" },
  { label: "Partially shipped; follow-up needed", tone: "warning" },
  { label: "Blocked by external dependency", tone: "danger" },
  { label: "Not shipped — no longer necessary", tone: "neutral" },
] as const;

const NOTE_SECTION_LABELS = [
  "Problem",
  "Why",
  "Impact",
  "Risks",
  "Dependencies",
  "Scope",
  "Notes",
  "Open questions",
  "Success",
  "Metrics",
  "Constraints",
] as const;

const NOTE_LABEL_LOOKUP = NOTE_SECTION_LABELS.reduce<Record<string, string>>((acc, label) => {
  acc[label.toLowerCase()] = label;
  return acc;
}, {});

const extractLinks = (notes: string) => {
  const matches = notes.match(/https?:\/\/[^\s)]+/gi);
  if (!matches) return [];
  const cleaned = matches.map((url) => url.replace(/[.,!?]+$/, ""));
  return Array.from(new Set(cleaned));
};

const parseNotes = (notes: string) => {
  const lines = notes.split(/\r?\n/);
  const sections: Array<{ label: string; body: string[] }> = [];
  const general: string[] = [];
  let currentSection: { label: string; body: string[] } | null = null;

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const match = line.match(/^([A-Za-z][A-Za-z\s-]*):\s*(.*)$/);
    if (match) {
      const key = match[1].trim().toLowerCase();
      const label = NOTE_LABEL_LOOKUP[key];
      if (label) {
        currentSection = { label, body: [] };
        sections.push(currentSection);
        if (match[2]) currentSection.body.push(match[2]);
        return;
      }
    }

    if (currentSection) {
      currentSection.body.push(line);
    } else if (line.trim()) {
      general.push(line);
    }
  });

  return {
    sections,
    general,
  };
};

const archiveToneClass = (tone: (typeof ARCHIVE_NOTE_TEMPLATES)[number]["tone"]) => {
  switch (tone) {
    case "success":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-200";
    case "warning":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 dark:text-amber-200";
    case "danger":
      return "border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-200";
    case "neutral":
    default:
      return "border-slate-400/40 bg-slate-500/10 text-slate-700 hover:bg-slate-500/15 dark:text-slate-200";
  }
};

const clampScore = (value: number) => Math.min(10, Math.max(1, value));
const LAYOUT_KEY = "simplecrm_product_dev_layout";

const getIceScore = (idea: ProductIdea) => {
  const effort = idea.effort || 1;
  return Math.round(((idea.impact * idea.confidence) / effort) * 10) / 10;
};

type IdeaDraft = Omit<ProductIdea, "id" | "createdAt" | "updatedAt">;

const createDefaultDraft = (): IdeaDraft => ({
  title: "",
  value: "",
  userType: "B2B",
  moscow: "Could",
  roadmap: "Later",
  status: "active",
  impact: 5,
  confidence: 5,
  effort: 5,
  notes: "",
  archivedNote: "",
});

type IdeaCardProps = {
  idea: ProductIdea;
  onEdit: (idea: ProductIdea) => void;
  onPreview?: (idea: ProductIdea) => void;
  onRequestDelete: (idea: ProductIdea) => void;
  onRequestArchive: (idea: ProductIdea) => void;
  onQuickUpdate: (id: string, changes: Partial<ProductIdea>) => void;
  className?: string;
};

const IdeaCard = ({
  idea,
  onEdit,
  onPreview,
  onRequestDelete,
  onRequestArchive,
  onQuickUpdate,
  className,
}: IdeaCardProps) => {
  const iceScore = getIceScore(idea);
  const updatedLabel = formatDistanceToNow(idea.updatedAt, { addSuffix: true });
  const isMust = idea.moscow === "Must";
  const isDone = idea.status === "done";
  const isArchived = idea.status === "archived";
  const archiveNote = idea.archivedNote?.trim();
  const isPreviewable = Boolean(onPreview);
  const mustGradient = (() => {
    if (!isMust) return "";
    if (idea.userType === "B2B") {
      return "border-blue-200/60 bg-gradient-to-b from-blue-50/60 via-white to-white dark:border-blue-500/30 dark:from-blue-950/40 dark:via-slate-950 dark:to-slate-950 border-l-4 border-l-blue-400/80 dark:border-l-blue-400/70";
    }
    if (idea.userType === "B2C") {
      return "border-emerald-200/60 bg-gradient-to-b from-emerald-50/60 via-white to-white dark:border-emerald-500/30 dark:from-emerald-950/40 dark:via-slate-950 dark:to-slate-950 border-l-4 border-l-emerald-400/80 dark:border-l-emerald-400/70";
    }
    if (idea.userType === "Admin") {
      return "border-rose-200/60 bg-gradient-to-b from-rose-50/60 via-white to-white dark:border-rose-500/30 dark:from-rose-950/40 dark:via-slate-950 dark:to-slate-950 border-l-4 border-l-rose-400/80 dark:border-l-rose-400/70";
    }
    return "border-slate-200/60 bg-gradient-to-b from-slate-50/60 via-white to-white dark:border-slate-500/30 dark:from-slate-900/60 dark:via-slate-950 dark:to-slate-950 border-l-4 border-l-slate-300/70 dark:border-l-slate-600/50";
  })();

  return (
    <Card
      className={cn(
        "border-border/80 shadow-sm transition-shadow",
        mustGradient,
        isDone && "opacity-80",
        isArchived && "opacity-70",
        isPreviewable && "cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      role={isPreviewable ? "button" : undefined}
      tabIndex={isPreviewable ? 0 : undefined}
      onClick={isPreviewable ? () => onPreview?.(idea) : undefined}
      onKeyDown={(event) => {
        if (!isPreviewable) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPreview?.(idea);
        }
      }}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className={cn("text-base font-semibold text-foreground", (isDone || isArchived) && "line-through decoration-2 decoration-muted-foreground/60")}>
              {idea.title}
            </h3>
            {idea.value && (
              <p className="text-sm text-muted-foreground">{idea.value}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuItem onClick={() => onEdit(idea)}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  onQuickUpdate(idea.id, {
                    status: idea.status === "done" ? "active" : "done",
                  })
                }
              >
                {idea.status === "done" ? "Mark active" : "Mark done"}
              </DropdownMenuItem>
              {idea.status === "archived" ? (
                <DropdownMenuItem
                  onClick={() => onQuickUpdate(idea.id, { status: "active", archivedNote: "" })}
                >
                  Restore from archive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => onRequestArchive(idea)}>
                  Archive
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {MOSCOW_TIERS.map((tier) => (
                <DropdownMenuItem
                  key={tier}
                  onClick={() => onQuickUpdate(idea.id, { moscow: tier })}
                >
                  MoSCoW: {tier}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {ROADMAP_LANES.map((lane) => (
                <DropdownMenuItem
                  key={lane}
                  onClick={() => onQuickUpdate(idea.id, { roadmap: lane })}
                >
                  Roadmap: {lane}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onRequestDelete(idea)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDone && <Badge variant="secondary">Done</Badge>}
          {isArchived && <Badge variant="outline">Archived</Badge>}
          <Badge variant="secondary">{idea.userType}</Badge>
          <Badge variant="outline">{idea.moscow}</Badge>
          <Badge variant="outline">{idea.roadmap}</Badge>
          <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
            ICE {iceScore.toFixed(1)}
          </Badge>
        </div>
        {isArchived && archiveNote ? (
          <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm text-foreground/80">
            {archiveNote}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">Updated {updatedLabel}</p>
      </CardContent>
    </Card>
  );
};

type DraggableIdeaCardProps = {
  idea: ProductIdea;
  onEdit: (idea: ProductIdea) => void;
  onPreview?: (idea: ProductIdea) => void;
  onRequestDelete: (idea: ProductIdea) => void;
  onRequestArchive: (idea: ProductIdea) => void;
  onQuickUpdate: (id: string, changes: Partial<ProductIdea>) => void;
};

const DraggableIdeaCard = ({
  idea,
  onEdit,
  onPreview,
  onRequestDelete,
  onRequestArchive,
  onQuickUpdate,
}: DraggableIdeaCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useDraggable({
      id: idea.id,
    });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "opacity-50" : undefined}
      {...attributes}
      {...listeners}
    >
      <IdeaCard
        idea={idea}
        onEdit={onEdit}
        onPreview={onPreview}
        onRequestDelete={onRequestDelete}
        onRequestArchive={onRequestArchive}
        onQuickUpdate={onQuickUpdate}
      />
    </div>
  );
};

const DroppableLane = ({
  id,
  title,
  subtitle,
  count,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  count: number;
  children: ReactNode;
}) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-xl border border-border/80 bg-card p-3 space-y-3 transition-shadow",
        isOver && "shadow-[0_0_0_2px_hsl(var(--primary))] border-primary/60",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{subtitle ?? "Roadmap"}</p>
          <p className="text-base font-semibold">{title}</p>
        </div>
        <Badge variant="secondary">{count}</Badge>
      </div>
      {children}
    </div>
  );
};

export default function ProductDev() {
  const [ideas, setIdeas] = useState<ProductIdea[]>([]);
  const [search, setSearch] = useState("");
  const [filterUserType, setFilterUserType] = useState<"all" | UserType>("all");
  const [filterMoscow, setFilterMoscow] = useState<"all" | MoscowTier>("all");
  const [sortBy, setSortBy] = useState<"updated" | "ice">("updated");
  const [tab, setTab] = useState("inbox");

  const [quickTitle, setQuickTitle] = useState("");
  const [quickUserType, setQuickUserType] = useState<UserType>("B2B");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingIdea, setEditingIdea] = useState<ProductIdea | null>(null);
  const [draft, setDraft] = useState<IdeaDraft>(createDefaultDraft());
  const [previewIdea, setPreviewIdea] = useState<ProductIdea | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ProductIdea | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ProductIdea | null>(null);
  const [archiveNote, setArchiveNote] = useState("");
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);
  const [roadmapFirst, setRoadmapFirst] = useState(() => {
    try {
      return localStorage.getItem(LAYOUT_KEY) === "roadmap";
    } catch {
      return false;
    }
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  useEffect(() => {
    setIdeas(listIdeas());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, roadmapFirst ? "roadmap" : "ideas");
    } catch {
      // ignore storage errors
    }
  }, [roadmapFirst]);

  useEffect(() => {
    if (!previewIdea?.id) return;
    const latest = ideas.find((idea) => idea.id === previewIdea.id) || null;
    setPreviewIdea(latest);
  }, [ideas, previewIdea?.id]);

  const refreshIdeas = () => setIdeas(listIdeas());

  const activeIdeas = useMemo(
    () => ideas.filter((idea) => idea.status !== "archived"),
    [ideas],
  );

  const archivedIdeas = useMemo(
    () => ideas.filter((idea) => idea.status === "archived"),
    [ideas],
  );

  const filteredIdeas = useMemo(() => {
    const query = search.trim().toLowerCase();
    return activeIdeas.filter((idea) => {
      if (filterUserType !== "all" && idea.userType !== filterUserType) return false;
      if (filterMoscow !== "all" && idea.moscow !== filterMoscow) return false;
      if (!query) return true;
      const haystack = `${idea.title} ${idea.value} ${idea.notes} ${idea.archivedNote ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [activeIdeas, search, filterUserType, filterMoscow]);

  const filteredArchivedIdeas = useMemo(() => {
    const query = search.trim().toLowerCase();
    return archivedIdeas.filter((idea) => {
      if (filterUserType !== "all" && idea.userType !== filterUserType) return false;
      if (filterMoscow !== "all" && idea.moscow !== filterMoscow) return false;
      if (!query) return true;
      const haystack = `${idea.title} ${idea.value} ${idea.notes} ${idea.archivedNote ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [archivedIdeas, search, filterUserType, filterMoscow]);

  const sortedIdeas = useMemo(() => {
    const items = [...filteredIdeas];
    const statusWeight = (idea: ProductIdea) => (idea.status === "done" ? 1 : 0);
    if (sortBy === "ice") {
      items.sort((a, b) => {
        const weight = statusWeight(a) - statusWeight(b);
        if (weight !== 0) return weight;
        return getIceScore(b) - getIceScore(a);
      });
      return items;
    }
    items.sort((a, b) => {
      const weight = statusWeight(a) - statusWeight(b);
      if (weight !== 0) return weight;
      return b.updatedAt - a.updatedAt;
    });
    return items;
  }, [filteredIdeas, sortBy]);

  const sortedArchivedIdeas = useMemo(() => {
    const items = [...filteredArchivedIdeas];
    if (sortBy === "ice") {
      items.sort((a, b) => getIceScore(b) - getIceScore(a));
      return items;
    }
    items.sort((a, b) => b.updatedAt - a.updatedAt);
    return items;
  }, [filteredArchivedIdeas, sortBy]);

  const moscowGroups = useMemo(() => {
    const groups: Record<MoscowTier, ProductIdea[]> = {
      Must: [],
      Should: [],
      Could: [],
      "Won't": [],
    };
    filteredIdeas.forEach((idea) => {
      groups[idea.moscow].push(idea);
    });
    const statusWeight = (idea: ProductIdea) => (idea.status === "done" ? 1 : 0);
    MOSCOW_TIERS.forEach((tier) => {
      groups[tier].sort((a, b) => {
        const weight = statusWeight(a) - statusWeight(b);
        if (weight !== 0) return weight;
        return getIceScore(b) - getIceScore(a);
      });
    });
    return groups;
  }, [filteredIdeas]);

  const roadmapGroups = useMemo(() => {
    const groups: Record<RoadmapLane, ProductIdea[]> = {
      Now: [],
      Next: [],
      Later: [],
    };
    filteredIdeas.forEach((idea) => {
      groups[idea.roadmap].push(idea);
    });
    const statusWeight = (idea: ProductIdea) => (idea.status === "done" ? 1 : 0);
    ROADMAP_LANES.forEach((lane) => {
      groups[lane].sort((a, b) => {
        const weight = statusWeight(a) - statusWeight(b);
        if (weight !== 0) return weight;
        return getIceScore(b) - getIceScore(a);
      });
    });
    return groups;
  }, [filteredIdeas]);

  const handleQuickAdd = () => {
    const title = quickTitle.trim();
    if (!title) return;
    createIdea({
      title,
      value: "",
      userType: quickUserType,
      moscow: "Could",
      roadmap: "Later",
      status: "active",
      impact: 5,
      confidence: 5,
      effort: 5,
      notes: "",
      archivedNote: "",
    });
    setQuickTitle("");
    refreshIdeas();
  };

  const openEditorForNew = () => {
    setPreviewIdea(null);
    setEditingIdea(null);
    setDraft(createDefaultDraft());
    setEditorOpen(true);
  };

  const openEditorForEdit = (idea: ProductIdea) => {
    setPreviewIdea(null);
    setEditingIdea(idea);
    setDraft({
      title: idea.title,
      value: idea.value,
      userType: idea.userType,
      moscow: idea.moscow,
      roadmap: idea.roadmap,
      status: idea.status,
      impact: idea.impact,
      confidence: idea.confidence,
      effort: idea.effort,
      notes: idea.notes,
      archivedNote: idea.archivedNote ?? "",
    });
    setEditorOpen(true);
  };

  const openPreview = (idea: ProductIdea) => {
    setPreviewIdea(idea);
  };

  const handleSave = () => {
    const title = draft.title.trim();
    if (!title) return;
    const isArchived = draft.status === "archived";
    const normalizedArchivedNote = isArchived ? draft.archivedNote.trim() : "";
    const payload: IdeaDraft = {
      ...draft,
      title,
      value: draft.value.trim(),
      impact: clampScore(draft.impact),
      confidence: clampScore(draft.confidence),
      effort: clampScore(draft.effort),
      archivedNote: normalizedArchivedNote,
    };
    if (editingIdea) {
      updateIdea(editingIdea.id, payload);
    } else {
      createIdea(payload);
    }
    setEditorOpen(false);
    refreshIdeas();
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteIdea(deleteTarget.id);
    setDeleteTarget(null);
    refreshIdeas();
  };

  const handleQuickUpdate = (id: string, changes: Partial<ProductIdea>) => {
    updateIdea(id, changes);
    refreshIdeas();
  };

  const openArchiveDialog = (idea: ProductIdea) => {
    setArchiveTarget(idea);
    setArchiveNote(idea.archivedNote ?? "");
    setArchiveDialogOpen(true);
  };

  const resetArchiveDialog = () => {
    setArchiveDialogOpen(false);
    setArchiveTarget(null);
    setArchiveNote("");
  };

  const handleArchiveConfirm = () => {
    if (!archiveTarget) return;
    updateIdea(archiveTarget.id, {
      status: "archived",
      archivedNote: archiveNote.trim(),
    });
    resetArchiveDialog();
    refreshIdeas();
  };

  const handleExport = () => {
    if (!ideas.length) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      ideas,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `product-dev-export-${date}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active?.id;
    if (typeof id === "string") {
      setActiveIdeaId(id);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = event.active?.id;
    const overId = event.over?.id;
    setActiveIdeaId(null);
    if (typeof activeId !== "string" || typeof overId !== "string") return;

    const idea = ideas.find((item) => item.id === activeId);
    if (!idea) return;
    const overIdea = ideas.find((item) => item.id === overId) || null;

    if (overId.startsWith("roadmap:")) {
      const lane = overId.replace("roadmap:", "") as RoadmapLane;
      if (idea.roadmap !== lane) {
        handleQuickUpdate(activeId, { roadmap: lane });
      }
      return;
    }

    if (overId.startsWith("moscow:")) {
      const tier = overId.replace("moscow:", "") as MoscowTier;
      if (idea.moscow !== tier) {
        handleQuickUpdate(activeId, { moscow: tier });
      }
      return;
    }

    if (overIdea) {
      if (tab === "roadmap" && idea.roadmap !== overIdea.roadmap) {
        handleQuickUpdate(activeId, { roadmap: overIdea.roadmap });
      }
      if (tab === "prioritize" && idea.moscow !== overIdea.moscow) {
        handleQuickUpdate(activeId, { moscow: overIdea.moscow });
      }
    }
  };

  const activeIdea = useMemo(
    () => (activeIdeaId ? ideas.find((idea) => idea.id === activeIdeaId) || null : null),
    [activeIdeaId, ideas],
  );

  const previewUpdatedLabel = previewIdea
    ? formatDistanceToNow(previewIdea.updatedAt, { addSuffix: true })
    : "";
  const previewNotes = previewIdea?.notes?.trim() ?? "";
  const previewStructuredNotes = previewNotes ? parseNotes(previewNotes) : null;
  const previewLinks = previewNotes ? extractLinks(previewNotes) : [];

  const ideaInputSection = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="border-border/80 md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Quick add</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            value={quickTitle}
            onChange={(event) => setQuickTitle(event.target.value)}
            placeholder="Feature idea, problem, or improvement…"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleQuickAdd();
              }
            }}
          />
          <Select value={quickUserType} onValueChange={(value) => setQuickUserType(value as UserType)}>
            <SelectTrigger className="md:w-[140px]">
              <SelectValue placeholder="User type" />
            </SelectTrigger>
            <SelectContent>
              {USER_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleQuickAdd}
            className="md:w-[150px] border border-blue-200/70 bg-gradient-to-b from-blue-50 to-blue-100 text-blue-600 shadow-[0_10px_22px_rgba(59,130,246,0.15)] hover:from-blue-100 hover:to-blue-200 dark:border-blue-500/30 dark:from-blue-950/50 dark:to-blue-900/60 dark:text-blue-200 dark:hover:from-blue-900/60 dark:hover:to-blue-800/70"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Add idea
          </Button>
        </CardContent>
      </Card>
      <Card className="h-full border-border/80 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-900/80 dark:via-slate-950/40 dark:to-blue-950/40">
        <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-6">
          <span className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-600/70 dark:text-blue-200/70">
            Detailed idea
          </span>
          <Button
            onClick={openEditorForNew}
            className="h-12 w-full rounded-xl px-6 text-base font-semibold text-white shadow-[0_12px_26px_rgba(59,130,246,0.3)] bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 hover:from-blue-600 hover:via-blue-600 hover:to-indigo-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            New idea
          </Button>
          <span className="text-xs text-muted-foreground">Full context, ICE, MoSCoW.</span>
        </CardContent>
      </Card>
    </div>
  );

  const roadmapSection = (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="prioritize">Prioritize</TabsTrigger>
          <TabsTrigger value="roadmap">Roadmap</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 rounded-full border border-border/80 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            <span className={roadmapFirst ? "opacity-60" : "text-foreground"}>Idea input</span>
            <Switch checked={roadmapFirst} onCheckedChange={setRoadmapFirst} />
            <span className={roadmapFirst ? "text-foreground" : "opacity-60"}>Roadmap</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!ideas.length}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search ideas, value, notes…"
            className="md:max-w-[320px]"
          />
          <Select
            value={filterUserType}
            onValueChange={(value) => setFilterUserType(value as "all" | UserType)}
          >
            <SelectTrigger className="md:w-[150px]">
              <SelectValue placeholder="User type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All users</SelectItem>
              {USER_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filterMoscow}
            onValueChange={(value) => setFilterMoscow(value as "all" | MoscowTier)}
          >
            <SelectTrigger className="md:w-[170px]">
              <SelectValue placeholder="MoSCoW" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All MoSCoW</SelectItem>
              {MOSCOW_TIERS.map((tier) => (
                <SelectItem key={tier} value={tier}>
                  {tier}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as "updated" | "ice")}>
          <SelectTrigger className="md:w-[170px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Last updated</SelectItem>
            <SelectItem value="ice">ICE score</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <TabsContent value="inbox" className="space-y-4">
        {sortedIdeas.length === 0 ? (
          <Card className="border-border/80">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No ideas yet. Capture the first one above.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sortedIdeas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onEdit={openEditorForEdit}
                onPreview={openPreview}
                onRequestDelete={setDeleteTarget}
                onRequestArchive={openArchiveDialog}
                onQuickUpdate={handleQuickUpdate}
              />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="prioritize" className="space-y-4">
        <div className="text-sm text-muted-foreground">
          MoSCoW buckets are sorted by ICE score (Impact × Confidence ÷ Effort).
        </div>
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {MOSCOW_TIERS.map((tier) => (
              <DroppableLane
                key={tier}
                id={`moscow:${tier}`}
                title={tier}
                subtitle="MoSCoW"
                count={moscowGroups[tier].length}
              >
                {moscowGroups[tier].length === 0 ? (
                  <p className="text-xs text-muted-foreground">Drop ideas here.</p>
                ) : (
                  moscowGroups[tier].map((idea) => (
                    <DraggableIdeaCard
                      key={idea.id}
                      idea={idea}
                      onEdit={openEditorForEdit}
                      onPreview={openPreview}
                      onRequestDelete={setDeleteTarget}
                      onRequestArchive={openArchiveDialog}
                      onQuickUpdate={handleQuickUpdate}
                    />
                  ))
                )}
              </DroppableLane>
            ))}
          </div>
          <DragOverlay>
            {activeIdea ? (
              <IdeaCard
                idea={activeIdea}
                onEdit={openEditorForEdit}
                onRequestDelete={setDeleteTarget}
                onQuickUpdate={handleQuickUpdate}
                className="shadow-xl"
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </TabsContent>

      <TabsContent value="roadmap" className="space-y-4">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid gap-4 md:grid-cols-3">
            {ROADMAP_LANES.map((lane) => (
              <DroppableLane
                key={lane}
                id={`roadmap:${lane}`}
                title={lane === "Later" ? "Later (Backlog)" : lane}
                count={roadmapGroups[lane].length}
              >
                {roadmapGroups[lane].length === 0 ? (
                  <p className="text-xs text-muted-foreground">Drop ideas here.</p>
                ) : (
                  roadmapGroups[lane].map((idea) => (
                    <DraggableIdeaCard
                      key={idea.id}
                      idea={idea}
                      onEdit={openEditorForEdit}
                      onPreview={openPreview}
                      onRequestDelete={setDeleteTarget}
                      onRequestArchive={openArchiveDialog}
                      onQuickUpdate={handleQuickUpdate}
                    />
                  ))
                )}
              </DroppableLane>
            ))}
          </div>
          <DragOverlay>
            {activeIdea ? (
              <IdeaCard
                idea={activeIdea}
                onEdit={openEditorForEdit}
                onRequestDelete={setDeleteTarget}
                onQuickUpdate={handleQuickUpdate}
                className="shadow-xl"
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </TabsContent>

      <TabsContent value="archived" className="space-y-4">
        {sortedArchivedIdeas.length === 0 ? (
          <Card className="border-border/80">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No archived ideas yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sortedArchivedIdeas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onEdit={openEditorForEdit}
                onPreview={openPreview}
                onRequestDelete={setDeleteTarget}
                onRequestArchive={openArchiveDialog}
                onQuickUpdate={handleQuickUpdate}
              />
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="p-6 space-y-6">
      {roadmapFirst ? (
        <>
          {roadmapSection}
          {ideaInputSection}
        </>
      ) : (
        <>
          {ideaInputSection}
          {roadmapSection}
        </>
      )}

      <Dialog open={!!previewIdea} onOpenChange={(open) => !open && setPreviewIdea(null)}>
        <DialogContent className="max-w-4xl">
          {previewIdea ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{previewIdea.title}</DialogTitle>
                {previewIdea.value ? (
                  <p className="text-sm text-muted-foreground">{previewIdea.value}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No one-line value yet.</p>
                )}
              </DialogHeader>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-4 md:col-span-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {previewIdea.status === "done" && <Badge variant="secondary">Done</Badge>}
                    {previewIdea.status === "archived" && <Badge variant="outline">Archived</Badge>}
                    <Badge variant="secondary">{previewIdea.userType}</Badge>
                    <Badge variant="outline">{previewIdea.moscow}</Badge>
                    <Badge variant="outline">{previewIdea.roadmap}</Badge>
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
                      ICE {getIceScore(previewIdea).toFixed(1)}
                    </Badge>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Notes
                    </p>
                    <div className="mt-3 space-y-3 text-sm text-foreground">
                      {previewStructuredNotes && previewStructuredNotes.sections.length > 0 ? (
                        previewStructuredNotes.sections.map((section) => (
                          <div key={section.label} className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              {section.label}
                            </p>
                            <div className="whitespace-pre-wrap">
                              {section.body.join("\n").trim() || (
                                <span className="text-muted-foreground">No details yet.</span>
                              )}
                            </div>
                          </div>
                        ))
                      ) : previewNotes ? (
                        <div className="whitespace-pre-wrap">{previewNotes}</div>
                      ) : (
                        <span className="text-muted-foreground">No notes yet.</span>
                      )}
                      {previewStructuredNotes && previewStructuredNotes.general.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            Additional notes
                          </p>
                          <div className="whitespace-pre-wrap">
                            {previewStructuredNotes.general.join("\n")}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {previewLinks.length > 0 ? (
                    <div className="rounded-lg border border-border/70 bg-card p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Links
                      </p>
                      <div className="mt-3 space-y-2 text-sm">
                        {previewLinks.map((link) => (
                          <a
                            key={link}
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate text-primary hover:underline"
                          >
                            {link}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {previewIdea.status === "archived" && previewIdea.archivedNote?.trim() ? (
                    <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Archive note
                      </p>
                      <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">
                        {previewIdea.archivedNote}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-4">
                  <div className="rounded-lg border border-border/70 bg-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Scoring
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span>Impact</span>
                        <span className="font-semibold">{previewIdea.impact}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Confidence</span>
                        <span className="font-semibold">{previewIdea.confidence}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Effort</span>
                        <span className="font-semibold">{previewIdea.effort}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>ICE</span>
                        <span className="font-semibold text-primary">
                          {getIceScore(previewIdea).toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Details
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span>User type</span>
                        <span className="font-semibold">{previewIdea.userType}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>MoSCoW</span>
                        <span className="font-semibold">{previewIdea.moscow}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Roadmap</span>
                        <span className="font-semibold">{previewIdea.roadmap}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Status</span>
                        <span className="font-semibold">
                          {previewIdea.status === "active"
                            ? "Active"
                            : previewIdea.status === "done"
                              ? "Done"
                              : "Archived"}
                        </span>
                      </div>
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground">Updated {previewUpdatedLabel}</p>
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setPreviewIdea(null)}>
                  Close
                </Button>
                <Button onClick={() => previewIdea && openEditorForEdit(previewIdea)}>
                  Edit idea
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingIdea ? "Edit idea" : "New idea"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Title</Label>
              <Input
                value={draft.title}
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="What should be built?"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Value (one line)</Label>
              <Input
                value={draft.value}
                onChange={(event) => setDraft((prev) => ({ ...prev, value: event.target.value }))}
                placeholder="Why this matters"
              />
            </div>
            <div className="space-y-2">
              <Label>User type</Label>
              <Select
                value={draft.userType}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, userType: value as UserType }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {USER_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>MoSCoW</Label>
              <Select
                value={draft.moscow}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, moscow: value as MoscowTier }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {MOSCOW_TIERS.map((tier) => (
                    <SelectItem key={tier} value={tier}>
                      {tier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Roadmap lane</Label>
              <Select
                value={draft.roadmap}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, roadmap: value as RoadmapLane }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {ROADMAP_LANES.map((lane) => (
                    <SelectItem key={lane} value={lane}>
                      {lane}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Impact (1–10)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={draft.impact}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, impact: clampScore(Number(event.target.value || 1)) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Confidence (1–10)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={draft.confidence}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, confidence: clampScore(Number(event.target.value || 1)) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Effort (1–10)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={draft.effort}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, effort: clampScore(Number(event.target.value || 1)) }))
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={draft.notes}
                onChange={(event) => setDraft((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Context, links, or decision notes."
                className="min-h-[110px]"
              />
            </div>
            {editingIdea?.status === "archived" ? (
              <div className="space-y-2 md:col-span-2">
                <Label>Archive note</Label>
                <Textarea
                  value={draft.archivedNote}
                  onChange={(event) => setDraft((prev) => ({ ...prev, archivedNote: event.target.value }))}
                  placeholder="Optional context shown in the archive list."
                  className="min-h-[90px]"
                />
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingIdea ? "Save changes" : "Create idea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={archiveDialogOpen} onOpenChange={(open) => !open && resetArchiveDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Archive idea</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {archiveTarget ? (
              <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm font-medium text-foreground">
                {archiveTarget.title}
              </div>
            ) : null}
            <div className="space-y-1">
              <Label>Archive note (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Shown in the archived overview for quick context.
              </p>
            </div>
            <Textarea
              value={archiveNote}
              onChange={(event) => setArchiveNote(event.target.value)}
              placeholder="Add a short note for future you."
              className="min-h-[110px]"
            />
            <div className="flex flex-wrap gap-2">
              {ARCHIVE_NOTE_TEMPLATES.map((template) => (
                <Button
                  key={template.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setArchiveNote(template.label)}
                  className={cn(
                    "h-8 rounded-full px-3 text-xs font-medium whitespace-nowrap",
                    archiveToneClass(template.tone),
                  )}
                >
                  {template.label}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetArchiveDialog}>
              Cancel
            </Button>
            <Button onClick={handleArchiveConfirm}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete idea?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the idea permanently from your Product Dev list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
