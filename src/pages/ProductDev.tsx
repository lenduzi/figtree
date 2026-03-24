import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import {
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
  impact: 5,
  confidence: 5,
  effort: 5,
  notes: "",
});

type IdeaCardProps = {
  idea: ProductIdea;
  onEdit: (idea: ProductIdea) => void;
  onRequestDelete: (idea: ProductIdea) => void;
  onQuickUpdate: (id: string, changes: Partial<ProductIdea>) => void;
  className?: string;
};

const IdeaCard = ({
  idea,
  onEdit,
  onRequestDelete,
  onQuickUpdate,
  className,
}: IdeaCardProps) => {
  const iceScore = getIceScore(idea);
  const updatedLabel = formatDistanceToNow(idea.updatedAt, { addSuffix: true });
  const isMust = idea.moscow === "Must";
  const mustGradient = (() => {
    if (!isMust) return "";
    if (idea.userType === "B2B") {
      return "border-blue-200/70 bg-gradient-to-br from-blue-50/60 via-white to-blue-100/50 dark:border-blue-500/40 dark:from-blue-950/40 dark:via-slate-950/30 dark:to-blue-900/40";
    }
    if (idea.userType === "B2C") {
      return "border-emerald-200/70 bg-gradient-to-br from-emerald-50/60 via-white to-emerald-100/50 dark:border-emerald-500/40 dark:from-emerald-950/40 dark:via-slate-950/30 dark:to-emerald-900/40";
    }
    if (idea.userType === "Admin") {
      return "border-violet-200/70 bg-gradient-to-br from-violet-50/60 via-white to-violet-100/50 dark:border-violet-500/40 dark:from-violet-950/40 dark:via-slate-950/30 dark:to-violet-900/40";
    }
    return "border-slate-200/70 bg-gradient-to-br from-slate-50/60 via-white to-slate-100/50 dark:border-slate-500/40 dark:from-slate-900/60 dark:via-slate-950/30 dark:to-slate-900/50";
  })();

  return (
    <Card
      className={cn(
        "border-border/80 shadow-sm transition-shadow",
        isMust && "shadow-[0_10px_30px_rgba(59,130,246,0.12)]",
        mustGradient,
        className,
      )}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">{idea.title}</h3>
            {idea.value && (
              <p className="text-sm text-muted-foreground">{idea.value}</p>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuItem onClick={() => onEdit(idea)}>Edit</DropdownMenuItem>
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
          <Badge variant="secondary">{idea.userType}</Badge>
          <Badge variant="outline">{idea.moscow}</Badge>
          <Badge variant="outline">{idea.roadmap}</Badge>
          <Badge className="bg-primary/10 text-primary hover:bg-primary/15">
            ICE {iceScore.toFixed(1)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Updated {updatedLabel}</p>
      </CardContent>
    </Card>
  );
};

type DraggableIdeaCardProps = {
  idea: ProductIdea;
  onEdit: (idea: ProductIdea) => void;
  onRequestDelete: (idea: ProductIdea) => void;
  onQuickUpdate: (id: string, changes: Partial<ProductIdea>) => void;
};

const DraggableIdeaCard = ({
  idea,
  onEdit,
  onRequestDelete,
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
        onRequestDelete={onRequestDelete}
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

  const [deleteTarget, setDeleteTarget] = useState<ProductIdea | null>(null);
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

  const refreshIdeas = () => setIdeas(listIdeas());

  const filteredIdeas = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ideas.filter((idea) => {
      if (filterUserType !== "all" && idea.userType !== filterUserType) return false;
      if (filterMoscow !== "all" && idea.moscow !== filterMoscow) return false;
      if (!query) return true;
      const haystack = `${idea.title} ${idea.value} ${idea.notes}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [ideas, search, filterUserType, filterMoscow]);

  const sortedIdeas = useMemo(() => {
    const items = [...filteredIdeas];
    if (sortBy === "ice") {
      items.sort((a, b) => getIceScore(b) - getIceScore(a));
      return items;
    }
    items.sort((a, b) => b.updatedAt - a.updatedAt);
    return items;
  }, [filteredIdeas, sortBy]);

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
    MOSCOW_TIERS.forEach((tier) => {
      groups[tier].sort((a, b) => getIceScore(b) - getIceScore(a));
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
    ROADMAP_LANES.forEach((lane) => {
      groups[lane].sort((a, b) => getIceScore(b) - getIceScore(a));
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
      impact: 5,
      confidence: 5,
      effort: 5,
      notes: "",
    });
    setQuickTitle("");
    refreshIdeas();
  };

  const openEditorForNew = () => {
    setEditingIdea(null);
    setDraft(createDefaultDraft());
    setEditorOpen(true);
  };

  const openEditorForEdit = (idea: ProductIdea) => {
    setEditingIdea(idea);
    setDraft({
      title: idea.title,
      value: idea.value,
      userType: idea.userType,
      moscow: idea.moscow,
      roadmap: idea.roadmap,
      impact: idea.impact,
      confidence: idea.confidence,
      effort: idea.effort,
      notes: idea.notes,
    });
    setEditorOpen(true);
  };

  const handleSave = () => {
    const title = draft.title.trim();
    if (!title) return;
    const payload: IdeaDraft = {
      ...draft,
      title,
      value: draft.value.trim(),
      impact: clampScore(draft.impact),
      confidence: clampScore(draft.confidence),
      effort: clampScore(draft.effort),
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
        </TabsList>
        <div className="flex items-center gap-3 rounded-full border border-border/80 bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          <span className={roadmapFirst ? "opacity-60" : "text-foreground"}>Idea input</span>
          <Switch checked={roadmapFirst} onCheckedChange={setRoadmapFirst} />
          <span className={roadmapFirst ? "text-foreground" : "opacity-60"}>Roadmap</span>
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
                onRequestDelete={setDeleteTarget}
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
                      onRequestDelete={setDeleteTarget}
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
                      onRequestDelete={setDeleteTarget}
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
