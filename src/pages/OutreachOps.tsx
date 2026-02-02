import { useEffect, useMemo, useState } from "react";
import {
  buildWhatsAppLink,
  importOutreachCsv,
  listOutreachLeads,
  logOutreachAction,
  updateOutreachLead,
  updateOutreachStatus,
} from "@/lib/outreach-store";
import {
  OUTREACH_ACTIONS,
  OUTREACH_STATUSES,
  OutreachActionType,
  OutreachBucket,
  OutreachChannel,
  OutreachLead,
  OutreachStatus,
} from "@/types/outreach";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import {
  CalendarCheck,
  Filter,
  Globe,
  Import,
  MapPin,
  MessageCircle,
  Phone,
  Search,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { useCRMContext } from "@/contexts/CRMContext";

const STATUS_VARIANTS: Record<OutreachStatus, "default" | "secondary" | "destructive" | "outline"> = {
  New: "outline",
  Attempting: "secondary",
  "Reached Gatekeeper": "secondary",
  "Spoke to Decision Maker": "default",
  Interested: "default",
  "Pilot Proposed": "default",
  "Pilot Live": "default",
  Won: "default",
  "Not Now": "secondary",
  No: "destructive",
  "Dead/Invalid": "destructive",
};

const CHANNEL_LABELS: Record<OutreachChannel, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
  form: "Form",
  ig: "IG DM",
  walkin: "Walk-in",
  unknown: "Unknown",
};

const OUTREACH_UI_STATE_KEY = "simplecrm_outreach_ui_v1";

type OutreachUiState = {
  search?: string;
  statusFilter?: "all" | OutreachStatus;
  bucketFilter?: "all" | OutreachBucket;
  keywordFilter?: string;
  dueOnly?: boolean;
  selectedLeadId?: string | null;
};

const BUCKETS: OutreachBucket[] = ["A", "B", "C"];

const loadOutreachUiState = (): OutreachUiState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OUTREACH_UI_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OutreachUiState;
  } catch {
    return null;
  }
};

const saveOutreachUiState = (state: OutreachUiState) => {
  try {
    localStorage.setItem(OUTREACH_UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
};

const getLeadDisplayName = (lead: OutreachLead) => lead.venueName || "Untitled lead";

const getDueStatus = (lead: OutreachLead) => {
  if (["Won", "No", "Dead/Invalid", "Not Now"].includes(lead.status)) return "";
  if (!lead.nextActionAt) return "";
  const dueDate = new Date(lead.nextActionAt);
  const startOfTomorrow = new Date();
  startOfTomorrow.setHours(24, 0, 0, 0);
  return dueDate < startOfTomorrow ? "due" : "";
};

const formatDate = (value: string | null) => {
  if (!value) return "—";
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return value;
  }
};

export default function OutreachOps() {
  const { addContact, addTask, stages } = useCRMContext();
  const [storedUi] = useState(() => loadOutreachUiState());
  const [leads, setLeads] = useState<OutreachLead[]>([]);
  const [search, setSearch] = useState(() => storedUi?.search ?? "");
  const [statusFilter, setStatusFilter] = useState<"all" | OutreachStatus>(() => {
    if (storedUi?.statusFilter === "all") return "all";
    if (storedUi?.statusFilter && OUTREACH_STATUSES.includes(storedUi.statusFilter)) {
      return storedUi.statusFilter;
    }
    return "all";
  });
  const [bucketFilter, setBucketFilter] = useState<"all" | OutreachBucket>(() => {
    if (storedUi?.bucketFilter === "all") return "all";
    if (storedUi?.bucketFilter && BUCKETS.includes(storedUi.bucketFilter)) {
      return storedUi.bucketFilter;
    }
    return "all";
  });
  const [keywordFilter, setKeywordFilter] = useState<string>(() => storedUi?.keywordFilter ?? "all");
  const [dueOnly, setDueOnly] = useState(() => Boolean(storedUi?.dueOnly));
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(() => storedUi?.selectedLeadId ?? null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [disableDedupe, setDisableDedupe] = useState(false);
  const [statusDraft, setStatusDraft] = useState<OutreachStatus>("New");
  const [actionNote, setActionNote] = useState("");
  const [leadNotes, setLeadNotes] = useState("");
  const [promoteWithTask, setPromoteWithTask] = useState(true);
  const [promoteDueDate, setPromoteDueDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? null;

  const refreshLeads = () => setLeads(listOutreachLeads());

  useEffect(() => {
    refreshLeads();
  }, []);

  useEffect(() => {
    if (!selectedLead) return;
    setStatusDraft(selectedLead.status);
    setActionNote("");
    setLeadNotes(selectedLead.notes || "");
  }, [selectedLead?.id]);
  useEffect(() => {
    if (!selectedLead) return;
    setLeadNotes(selectedLead.notes || "");
  }, [selectedLead?.notes]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        !query ||
        lead.venueName.toLowerCase().includes(query) ||
        lead.city.toLowerCase().includes(query) ||
        lead.address.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
      const matchesBucket = bucketFilter === "all" || lead.bucket === bucketFilter;
      const matchesKeyword =
        keywordFilter === "all" ||
        lead.keywordsFoundBy.some((keyword) => keyword.toLowerCase() === keywordFilter.toLowerCase());
      const matchesDue = !dueOnly || getDueStatus(lead) === "due";
      return matchesSearch && matchesStatus && matchesBucket && matchesKeyword && matchesDue;
    });
  }, [leads, search, statusFilter, bucketFilter, keywordFilter, dueOnly]);

  const keywordOptions = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((lead) => {
      lead.keywordsFoundBy.forEach((keyword) => {
        if (keyword.trim()) set.add(keyword.trim());
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [leads]);

  const dueLeads = useMemo(() => leads.filter((lead) => getDueStatus(lead) === "due"), [leads]);
  const activeLeads = useMemo(
    () => leads.filter((lead) => !["Won", "No", "Dead/Invalid", "Not Now"].includes(lead.status)),
    [leads],
  );

  useEffect(() => {
    if (keywordFilter === "all") return;
    if (keywordOptions.includes(keywordFilter)) return;
    setKeywordFilter("all");
  }, [keywordFilter, keywordOptions]);

  useEffect(() => {
    if (!selectedLeadId) return;
    if (leads.some((lead) => lead.id === selectedLeadId)) return;
    setSelectedLeadId(null);
  }, [leads, selectedLeadId]);

  useEffect(() => {
    saveOutreachUiState({
      search,
      statusFilter,
      bucketFilter,
      keywordFilter,
      dueOnly,
      selectedLeadId,
    });
  }, [search, statusFilter, bucketFilter, keywordFilter, dueOnly, selectedLeadId]);

  const handleImport = async () => {
    if (!importFile) return;
    const text = await importFile.text();
    const summary = importOutreachCsv(text, { fileName: importFile.name, disableDedupe });
    refreshLeads();
    setImportOpen(false);
    setImportFile(null);
    setDisableDedupe(false);
    toast({
      title: "Import complete",
      description: `${summary.importedCount} new, ${summary.dedupedCount} updated, ${summary.skippedCount} skipped`,
    });
  };

  const handleLogAction = (action?: OutreachActionType) => {
    if (!selectedLead) return;
    const resolvedAction = action ?? "Called";
    const saved = logOutreachAction(selectedLead.id, resolvedAction, actionNote.trim(), statusDraft);
    if (!saved) return;
    setActionNote("");
    refreshLeads();
  };

  const handleNotesSave = () => {
    if (!selectedLead) return;
    const trimmed = leadNotes.trim();
    updateOutreachLead(selectedLead.id, { notes: trimmed });
    refreshLeads();
  };

  const handlePromote = () => {
    if (!selectedLead) return;
    const stageId = stages[0]?.id ?? "lead";
    const newContact = addContact({
      fullName: selectedLead.venueName || "New lead",
      role: "",
      company: selectedLead.venueName || "",
      website: selectedLead.websiteUrl || "",
      email: "",
      phone: selectedLead.phoneE164 || selectedLead.phoneRaw || "",
      stageId,
      notes: selectedLead.notes || "",
    });

    if (promoteWithTask) {
      addTask({
        contactId: newContact.id,
        title: `Follow up with ${selectedLead.venueName || "lead"}`,
        description: "Promoted from Outreach Ops",
        dueDate: promoteDueDate || format(new Date(), "yyyy-MM-dd"),
        hasReminder: true,
        completed: false,
      });
    }

    updateOutreachStatus(selectedLead.id, "Interested");
    refreshLeads();
    toast({ title: "Promoted to contacts" });
  };

  const openExternal = (url: string) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const quickCall = () => {
    if (!selectedLead?.phoneE164 && !selectedLead?.phoneRaw) return;
    const number = selectedLead.phoneE164 ?? selectedLead.phoneRaw;
    window.open(`tel:${number}`);
  };

  const quickWhatsApp = () => {
    if (!selectedLead?.phoneE164) return;
    openExternal(buildWhatsAppLink(selectedLead.phoneE164, "Hi there!"));
  };


  return (
    <div className="p-6 lg:p-8 xl:p-10 max-w-5xl lg:max-w-6xl 2xl:max-w-7xl mx-auto space-y-6">
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Import outreach leads</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="outreach-import">CSV file</Label>
              <Input
                id="outreach-import"
                type="file"
                accept=".csv"
                onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                Expected columns: Venue_Name, City, Address, Phone, Phone_International, Website_URL,
                Google_Maps_URL, Types, Keywords_Found_By, Priority_Score, Bucket, Best_Channel.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="outreach-disable-dedupe"
                checked={disableDedupe}
                onCheckedChange={(checked) => setDisableDedupe(checked === true)}
              />
              <Label htmlFor="outreach-disable-dedupe" className="text-sm text-muted-foreground">
                Disable dedupe (import all rows)
              </Label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!importFile}>
                Import CSV
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLeadId(null)}>
        <DialogContent className="sm:max-w-[720px]">
          {selectedLead && (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="flex flex-col gap-2">
                  <span className="text-2xl font-semibold text-foreground">
                    {getLeadDisplayName(selectedLead)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {selectedLead.city || ""} {selectedLead.address ? `• ${selectedLead.address}` : ""}
                  </span>
                </DialogTitle>
              </DialogHeader>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANTS[selectedLead.status]}>{selectedLead.status}</Badge>
                <Badge variant="outline">Bucket {selectedLead.bucket}</Badge>
                {selectedLead.nextActionAt && (
                  <Badge variant="outline">Next: {formatDate(selectedLead.nextActionAt)}</Badge>
                )}
                {selectedLead.lastActionAt && (
                  <Badge variant="secondary">
                    Last contacted: {formatDate(selectedLead.lastActionAt)}
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={quickCall} disabled={!selectedLead.phoneRaw && !selectedLead.phoneE164}>
                  <Phone className="h-4 w-4 mr-2" />
                  Call
                </Button>
                <Button size="sm" variant="outline" onClick={quickWhatsApp} disabled={!selectedLead.phoneE164}>
                  <MessageCircle className="h-4 w-4 mr-2" />
                  WhatsApp
                </Button>
                <Button size="sm" variant="outline" onClick={() => openExternal(selectedLead.websiteUrl)} disabled={!selectedLead.websiteUrl}>
                  <Globe className="h-4 w-4 mr-2" />
                  Website
                </Button>
                <Button size="sm" variant="outline" onClick={() => openExternal(selectedLead.googleMapsUrl)} disabled={!selectedLead.googleMapsUrl}>
                  <MapPin className="h-4 w-4 mr-2" />
                  Maps
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Call outcome</Label>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Select value={statusDraft} onValueChange={(value) => setStatusDraft(value as OutreachStatus)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select outcome" />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTREACH_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={() => handleLogAction("Called")}>Log call</Button>
                </div>
                <Input
                  placeholder="Optional note (e.g. asked for info, call back Tuesday)"
                  value={actionNote}
                  onChange={(event) => setActionNote(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Context</Label>
                <Input
                  placeholder="Saved info (e.g. DM name, preferences, pricing notes)"
                  value={leadNotes}
                  onChange={(event) => setLeadNotes(event.target.value)}
                  onBlur={handleNotesSave}
                />
              </div>

              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">Promote to Contacts</p>
                    <p className="text-xs text-muted-foreground">Move this lead into your CRM pipeline.</p>
                  </div>
                  <Button size="sm" onClick={handlePromote}>
                    Promote
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="promote-followup"
                      checked={promoteWithTask}
                      onCheckedChange={(checked) => setPromoteWithTask(checked === true)}
                    />
                    <Label htmlFor="promote-followup" className="text-sm text-muted-foreground">
                      Create follow-up task
                    </Label>
                  </div>
                  <Input
                    type="date"
                    value={promoteDueDate}
                    onChange={(event) => setPromoteDueDate(event.target.value)}
                    className="w-[180px]"
                    disabled={!promoteWithTask}
                  />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground">Outreach Ops</h1>
          <p className="text-muted-foreground lg:text-lg mt-2">
            High-velocity outreach from imported leads. {leads.length} total.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Import className="h-4 w-4 mr-2" />
            Import CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CalendarCheck className="h-4 w-4" />
              Due today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">{dueLeads.length}</div>
            <p className="text-xs text-muted-foreground">Follow-ups scheduled through today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" />
              Active pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-foreground">{activeLeads.length}</div>
            <p className="text-xs text-muted-foreground">Leads still in play</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" />
              Buckets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(["A", "B", "C"] as OutreachBucket[]).map((bucket) => (
                <Badge key={bucket} variant="outline">
                  {bucket}: {leads.filter((lead) => lead.bucket === bucket).length}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search venue, city, address..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "all" | OutreachStatus)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {OUTREACH_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bucketFilter} onValueChange={(value) => setBucketFilter(value as "all" | OutreachBucket)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Bucket" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All buckets</SelectItem>
              <SelectItem value="A">A</SelectItem>
              <SelectItem value="B">B</SelectItem>
              <SelectItem value="C">C</SelectItem>
            </SelectContent>
          </Select>
          <Select value={keywordFilter} onValueChange={setKeywordFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All keywords" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All keywords</SelectItem>
              {keywordOptions.map((keyword) => (
                <SelectItem key={keyword} value={keyword}>
                  {keyword}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={dueOnly ? "default" : "outline"}
            onClick={() => setDueOnly((prev) => !prev)}
          >
            Due today
          </Button>
        </div>
      </div>

      {filteredLeads.length === 0 ? (
        <div className="text-center py-12 bg-card border rounded-lg">
          <p className="text-muted-foreground">No outreach leads yet. Import a CSV to get started.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {filteredLeads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => setSelectedLeadId(lead.id)}
                className={cn(
                  "w-full text-left rounded-xl border bg-card p-4 shadow-sm transition-colors",
                  getDueStatus(lead) === "due" && "border-primary/40 bg-primary/5",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-foreground truncate">{getLeadDisplayName(lead)}</div>
                    <div className="text-xs text-muted-foreground mt-1">{lead.city || "—"}</div>
                  </div>
                  <Badge variant={STATUS_VARIANTS[lead.status]}>{lead.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">Bucket {lead.bucket}</Badge>
                  {lead.keywordsFoundBy[0] && (
                    <Badge variant="secondary">{lead.keywordsFoundBy[0]}</Badge>
                  )}
                  {lead.lastActionAt && (
                    <span>Last contacted {formatDate(lead.lastActionAt)}</span>
                  )}
                  {lead.nextAction && (
                    <span>
                      {lead.nextAction} · {formatDate(lead.nextActionAt)}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
          <div className="hidden sm:block border rounded-lg overflow-hidden bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Venue</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Bucket</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Action</TableHead>
                  <TableHead>Keyword</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className={cn("cursor-pointer", getDueStatus(lead) === "due" && "bg-accent/40")}
                    onClick={() => setSelectedLeadId(lead.id)}
                  >
                <TableCell className="font-medium text-foreground">
                      <div className="flex flex-col">
                        <span>{getLeadDisplayName(lead)}</span>
                        {lead.lastActionAt && (
                          <span className="text-xs text-muted-foreground">
                            Last contacted {formatDate(lead.lastActionAt)}
                          </span>
                        )}
                      </div>
                </TableCell>
                    <TableCell>{lead.city || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{lead.bucket}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[lead.status]}>{lead.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {lead.nextAction ? (
                        <div className="text-sm text-foreground">
                          {lead.nextAction}
                          <div className="text-xs text-muted-foreground">{formatDate(lead.nextActionAt)}</div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {lead.keywordsFoundBy[0] ? (
                        <Badge variant="secondary">{lead.keywordsFoundBy[0]}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <div className="text-xs text-muted-foreground">
        Need custom actions? We support: {OUTREACH_ACTIONS.join(", ")}.
      </div>
    </div>
  );
}
