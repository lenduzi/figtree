import { useEffect, useMemo, useState } from "react";
import { Plus, TrendingUp, Scale, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdditionalStream,
  createCpmAlternative,
  createPivotIdea,
  loadBusinessModel,
  saveBusinessModel,
  type AdditionalStream,
  type BusinessModelState,
  type CpmScenario,
  type CpmStream,
  type PivotIdea,
  type PivotStatus,
} from "@/lib/business-model-store";

const PIVOT_STATUSES: PivotStatus[] = ["Explore", "Validate", "Decide", "Parked"];

const formatNumber = (value: number, digits = 0) => {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
};

const formatRange = (min: number, max: number, digits = 0) => {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : 0;
  if (Math.abs(safeMax - safeMin) < 0.001) return formatNumber(safeMin, digits);
  return `${formatNumber(safeMin, digits)} - ${formatNumber(safeMax, digits)}`;
};

const formatSignedRange = (min: number, max: number, digits = 0) => {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : 0;
  const orderedMin = Math.min(safeMin, safeMax);
  const orderedMax = Math.max(safeMin, safeMax);
  const formatSigned = (value: number) => `${value > 0 ? "+" : ""}${formatNumber(value, digits)}`;
  if (Math.abs(orderedMax - orderedMin) < 0.001) return formatSigned(orderedMin);
  return `${formatSigned(orderedMin)} - ${formatSigned(orderedMax)}`;
};

const clampScore = (value: number) => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(1, Math.round(value)));
};

const clampPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
};

const getRangeTone = (min: number, max: number) => {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : 0;
  if (safeMin >= 0 && safeMax >= 0) return "text-emerald-600 dark:text-emerald-300";
  if (safeMax < 0) return "text-rose-600 dark:text-rose-300";
  return "text-amber-600 dark:text-amber-300";
};

const getCoverageTone = (min: number | null, max: number | null) => {
  if (min === null || max === null) return "";
  if (min >= 100) return "text-emerald-600 dark:text-emerald-300";
  if (max < 100) return "text-rose-600 dark:text-rose-300";
  return "text-amber-600 dark:text-amber-300";
};

const getCpmRange = (cpm: CpmStream) => {
  const minCpm = Math.min(cpm.cpmMin, cpm.cpmMax);
  const maxCpm = Math.max(cpm.cpmMin, cpm.cpmMax);
  const capRate = clampPercent(cpm.capHitRate) / 100;
  const platformShare = clampPercent(cpm.platformTakeRate) / 100;
  const creatorShare = 1 - platformShare;

  const expectedPerVideo = (rate: number) => {
    const base = (cpm.billableViewsPerVideo / 1000) * rate;
    const cappedBase = Math.min(base, cpm.capPerVideoTotal);
    const capped = cpm.capPerVideoTotal;
    return (1 - capRate) * cappedBase + capRate * capped;
  };

  const perVideoMin = expectedPerVideo(minCpm);
  const perVideoMax = expectedPerVideo(maxCpm);

  const revenueMin = cpm.videosPerMonth * perVideoMin;
  const revenueMax = cpm.videosPerMonth * perVideoMax;

  return {
    minCpm,
    maxCpm,
    perVideoMin,
    perVideoMax,
    revenueMin,
    revenueMax,
    platformMin: revenueMin * platformShare,
    platformMax: revenueMax * platformShare,
    creatorMin: revenueMin * creatorShare,
    creatorMax: revenueMax * creatorShare,
    platformShare,
    creatorShare,
  };
};

const getOptimizedCpm = (cpm: CpmStream, targetPlatformFee: number) => {
  const platformShare = clampPercent(cpm.platformTakeRate) / 100;
  if (targetPlatformFee <= 0 || platformShare <= 0) {
    return {
      requiredCpm: null,
      capped: false,
      aboveMax: false,
      requiredVideosAtMaxCpm: null,
      requiredViewsPerVideoAtMaxCpm: null,
      maxPlatformFeeAtMaxCpm: null,
    };
  }
  if (cpm.videosPerMonth <= 0 || cpm.billableViewsPerVideo <= 0) {
    return {
      requiredCpm: null,
      capped: false,
      aboveMax: false,
      requiredVideosAtMaxCpm: null,
      requiredViewsPerVideoAtMaxCpm: null,
      maxPlatformFeeAtMaxCpm: null,
    };
  }

  const targetRevenue = targetPlatformFee / platformShare;
  const targetPerVideo = targetRevenue / cpm.videosPerMonth;
  const cap = Math.max(cpm.capPerVideoTotal, 0);
  const capRate = clampPercent(cpm.capHitRate) / 100;
  const maxPerVideo = cap;

  let capped = false;
  let basePerVideo = 0;

  if (targetPerVideo > maxPerVideo + 0.0001) {
    capped = true;
    basePerVideo = cap;
  } else if (capRate >= 1) {
    basePerVideo = cap;
  } else {
    basePerVideo = (targetPerVideo - capRate * cap) / (1 - capRate);
    if (basePerVideo < 0) basePerVideo = 0;
  }

  const requiredCpm = (basePerVideo * 1000) / cpm.billableViewsPerVideo;
  if (!Number.isFinite(requiredCpm)) {
    return {
      requiredCpm: null,
      capped,
      aboveMax: false,
      requiredVideosAtMaxCpm: null,
      requiredViewsPerVideoAtMaxCpm: null,
      maxPlatformFeeAtMaxCpm: null,
    };
  }

  const aboveMax = requiredCpm > cpm.cpmMax + 0.0001;

  const expectedPerVideoAtMax = (() => {
    if (cpm.cpmMax <= 0) return 0;
    const base = (cpm.billableViewsPerVideo / 1000) * cpm.cpmMax;
    const cappedBase = Math.min(base, cap);
    return (1 - capRate) * cappedBase + capRate * cap;
  })();

  const requiredVideosAtMaxCpm =
    expectedPerVideoAtMax > 0 ? Math.ceil(targetRevenue / expectedPerVideoAtMax) : null;

  const requiredViewsPerVideoAtMaxCpm =
    !capped && cpm.cpmMax > 0
      ? (targetPerVideo * 1000) / cpm.cpmMax
      : null;

  const maxPlatformFeeAtMaxCpm = expectedPerVideoAtMax * cpm.videosPerMonth * platformShare;

  return {
    requiredCpm,
    capped,
    aboveMax,
    requiredVideosAtMaxCpm,
    requiredViewsPerVideoAtMaxCpm,
    maxPlatformFeeAtMaxCpm,
  };
};

export default function BusinessModel() {
  const [model, setModel] = useState<BusinessModelState>(() => loadBusinessModel());
  const [selectedAlternativeId, setSelectedAlternativeId] = useState<string>("none");

  useEffect(() => {
    saveBusinessModel(model);
  }, [model]);

  const cpmRange = useMemo(() => getCpmRange(model.cpm), [model.cpm]);

  const cpmAlternatives = useMemo(
    () => [...model.cpmAlternatives].sort((a, b) => b.updatedAt - a.updatedAt),
    [model.cpmAlternatives],
  );

  useEffect(() => {
    if (selectedAlternativeId === "none") return;
    if (!cpmAlternatives.some((scenario) => scenario.id === selectedAlternativeId)) {
      setSelectedAlternativeId(cpmAlternatives[0]?.id ?? "none");
    }
  }, [cpmAlternatives, selectedAlternativeId]);

  const selectedAlternative =
    selectedAlternativeId === "none"
      ? null
      : cpmAlternatives.find((scenario) => scenario.id === selectedAlternativeId) || null;

  const additionalStreams = useMemo(
    () => [...model.additionalStreams].sort((a, b) => b.updatedAt - a.updatedAt),
    [model.additionalStreams],
  );

  const pivotIdeas = useMemo(
    () => [...model.pivotIdeas].sort((a, b) => b.updatedAt - a.updatedAt),
    [model.pivotIdeas],
  );

  const additionalTotals = useMemo(() => {
    return model.additionalStreams.reduce(
      (acc, stream) => {
        const revenue = stream.pricePerUnit * stream.unitsPerMonth;
        const creator = stream.creatorPayoutPerUnit * stream.unitsPerMonth;
        const platform = revenue - creator;
        return {
          revenue: acc.revenue + revenue,
          creator: acc.creator + creator,
          platform: acc.platform + platform,
        };
      },
      { revenue: 0, creator: 0, platform: 0 },
    );
  }, [model.additionalStreams]);

  const computeTotals = (range: ReturnType<typeof getCpmRange>) => ({
    revenueMin: range.revenueMin + additionalTotals.revenue,
    revenueMax: range.revenueMax + additionalTotals.revenue,
    platformMin: range.platformMin + additionalTotals.platform,
    platformMax: range.platformMax + additionalTotals.platform,
    creatorMin: range.creatorMin + additionalTotals.creator,
    creatorMax: range.creatorMax + additionalTotals.creator,
  });

  const coreTotals = computeTotals(cpmRange);
  const selectedAlternativeRange = selectedAlternative ? getCpmRange(selectedAlternative) : null;
  const alternativeTotals = selectedAlternativeRange
    ? computeTotals(selectedAlternativeRange)
    : null;

  const targetPlatformFee = model.current.targetGrossProfit;
  const optimized = useMemo(
    () => getOptimizedCpm(model.cpm, targetPlatformFee),
    [model.cpm, targetPlatformFee],
  );
  const coverageMin = targetPlatformFee > 0 ? (coreTotals.platformMin / targetPlatformFee) * 100 : null;
  const coverageMax = targetPlatformFee > 0 ? (coreTotals.platformMax / targetPlatformFee) * 100 : null;
  const alternativeCoverageMin =
    alternativeTotals && targetPlatformFee > 0
      ? (alternativeTotals.platformMin / targetPlatformFee) * 100
      : null;
  const alternativeCoverageMax =
    alternativeTotals && targetPlatformFee > 0
      ? (alternativeTotals.platformMax / targetPlatformFee) * 100
      : null;

  const coreSurplusMin = coreTotals.platformMin - targetPlatformFee;
  const coreSurplusMax = coreTotals.platformMax - targetPlatformFee;
  const alternativeSurplusMin = alternativeTotals
    ? alternativeTotals.platformMin - targetPlatformFee
    : null;
  const alternativeSurplusMax = alternativeTotals
    ? alternativeTotals.platformMax - targetPlatformFee
    : null;

  const updateTarget = (value: number) => {
    setModel((prev) => ({
      ...prev,
      current: { ...prev.current, targetGrossProfit: value },
      updatedAt: Date.now(),
    }));
  };

  const updateCpm = (changes: Partial<CpmStream>) => {
    setModel((prev) => ({
      ...prev,
      cpm: { ...prev.cpm, ...changes },
      updatedAt: Date.now(),
    }));
  };

  const addCpmAlternative = () => {
    const scenario = createCpmAlternative(model.cpm);
    setSelectedAlternativeId(scenario.id);
    setModel((prev) => ({
      ...prev,
      cpmAlternatives: [scenario, ...prev.cpmAlternatives],
      updatedAt: Date.now(),
    }));
  };

  const updateCpmAlternative = (id: string, changes: Partial<CpmScenario>) => {
    setModel((prev) => ({
      ...prev,
      cpmAlternatives: prev.cpmAlternatives.map((scenario) =>
        scenario.id === id ? { ...scenario, ...changes, updatedAt: Date.now() } : scenario,
      ),
      updatedAt: Date.now(),
    }));
  };

  const removeCpmAlternative = (id: string) => {
    setModel((prev) => ({
      ...prev,
      cpmAlternatives: prev.cpmAlternatives.filter((scenario) => scenario.id !== id),
      updatedAt: Date.now(),
    }));
  };

  const addAdditionalStream = () => {
    const stream = createAdditionalStream();
    setModel((prev) => ({
      ...prev,
      additionalStreams: [stream, ...prev.additionalStreams],
      updatedAt: Date.now(),
    }));
  };

  const updateAdditionalStream = (id: string, changes: Partial<AdditionalStream>) => {
    setModel((prev) => ({
      ...prev,
      additionalStreams: prev.additionalStreams.map((stream) =>
        stream.id === id ? { ...stream, ...changes, updatedAt: Date.now() } : stream,
      ),
      updatedAt: Date.now(),
    }));
  };

  const removeAdditionalStream = (id: string) => {
    setModel((prev) => ({
      ...prev,
      additionalStreams: prev.additionalStreams.filter((stream) => stream.id !== id),
      updatedAt: Date.now(),
    }));
  };

  const addPivotIdea = () => {
    const idea = createPivotIdea();
    setModel((prev) => ({
      ...prev,
      pivotIdeas: [idea, ...prev.pivotIdeas],
      updatedAt: Date.now(),
    }));
  };

  const updatePivotIdea = (id: string, changes: Partial<PivotIdea>) => {
    setModel((prev) => ({
      ...prev,
      pivotIdeas: prev.pivotIdeas.map((idea) =>
        idea.id === id ? { ...idea, ...changes, updatedAt: Date.now() } : idea,
      ),
      updatedAt: Date.now(),
    }));
  };

  const removePivotIdea = (id: string) => {
    setModel((prev) => ({
      ...prev,
      pivotIdeas: prev.pivotIdeas.filter((idea) => idea.id !== id),
      updatedAt: Date.now(),
    }));
  };

  const comparisonAlternatives = cpmAlternatives.filter((scenario) => scenario.includeInCompare);
  const comparisonAdditional = additionalStreams.filter((stream) => stream.includeInCompare);

  return (
    <div className="p-6 space-y-6">
      <Card className="border-border/80 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-900/80 dark:via-slate-950/40 dark:to-blue-950/40">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
          <div className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Revenue Studio
              </h2>
              <p className="text-sm text-muted-foreground">
                Keep the CPM range flexible, then layer optional streams for quick comparison.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-sm text-muted-foreground">Target platform fee</Label>
              <Input
                type="number"
                min={0}
                value={targetPlatformFee}
                onChange={(event) => updateTarget(Number(event.target.value) || 0)}
                placeholder="0"
                className="h-10 w-[180px]"
              />
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">CPM range</Badge>
                <Badge variant="outline">Lightweight</Badge>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border/80 bg-white/70 p-4 text-xs text-muted-foreground shadow-sm dark:bg-slate-950/40">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  Revenue snapshot
                </div>
                <div className={`mt-3 grid gap-3 ${selectedAlternative ? "lg:grid-cols-2" : ""}`}>
                  <div className="rounded-lg border border-border/70 bg-white/70 p-3 text-sm dark:bg-slate-950/40">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Core CPM
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span>Platform fee</span>
                        <span className="font-semibold">
                          {formatRange(coreTotals.platformMin, coreTotals.platformMax)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Total revenue</span>
                        <span className="font-semibold">
                          {formatRange(coreTotals.revenueMin, coreTotals.revenueMax)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Creator payout</span>
                        <span className="font-semibold">
                          {formatRange(coreTotals.creatorMin, coreTotals.creatorMax)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {alternativeTotals ? (
                    <div className="rounded-lg border border-border/70 bg-white/70 p-3 text-sm dark:bg-slate-950/40">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        {selectedAlternative?.name || "Alternative"}
                      </div>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex items-center justify-between">
                          <span>Platform fee</span>
                          <span className="font-semibold">
                            {formatRange(alternativeTotals.platformMin, alternativeTotals.platformMax)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Total revenue</span>
                          <span className="font-semibold">
                            {formatRange(alternativeTotals.revenueMin, alternativeTotals.revenueMax)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Creator payout</span>
                          <span className="font-semibold">
                            {formatRange(alternativeTotals.creatorMin, alternativeTotals.creatorMax)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Target className="h-4 w-4 text-blue-500" />
                  Target check
                </div>
                {alternativeTotals ? (
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-lg border border-border/70 bg-white/70 p-3 text-sm dark:bg-slate-950/40">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        Core CPM
                      </div>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex items-center justify-between">
                          <span>Coverage</span>
                          <span className={`font-semibold ${getCoverageTone(coverageMin, coverageMax)}`}>
                            {coverageMin !== null && coverageMax !== null
                              ? `${formatRange(coverageMin, coverageMax, 1)}%`
                              : "Set target"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Gap</span>
                          <span className={`font-semibold ${getRangeTone(coreSurplusMin, coreSurplusMax)}`}>
                            {targetPlatformFee > 0
                              ? formatSignedRange(coreSurplusMin, coreSurplusMax)
                              : "Set target"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-white/70 p-3 text-sm dark:bg-slate-950/40">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        {selectedAlternative?.name || "Alternative"}
                      </div>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex items-center justify-between">
                          <span>Coverage</span>
                          <span
                            className={`font-semibold ${getCoverageTone(
                              alternativeCoverageMin,
                              alternativeCoverageMax,
                            )}`}
                          >
                            {alternativeCoverageMin !== null && alternativeCoverageMax !== null
                              ? `${formatRange(alternativeCoverageMin, alternativeCoverageMax, 1)}%`
                              : "Set target"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Gap</span>
                          <span
                            className={`font-semibold ${
                              alternativeSurplusMin !== null && alternativeSurplusMax !== null
                                ? getRangeTone(alternativeSurplusMin, alternativeSurplusMax)
                                : ""
                            }`}
                          >
                            {alternativeSurplusMin !== null && alternativeSurplusMax !== null
                              ? formatSignedRange(alternativeSurplusMin, alternativeSurplusMax)
                              : "Set target"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-border/70 bg-white/70 p-3 text-sm dark:bg-slate-950/40">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Core CPM
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span>Target platform fee</span>
                        <span className="font-semibold">{formatNumber(targetPlatformFee)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Coverage</span>
                        <span className={`font-semibold ${getCoverageTone(coverageMin, coverageMax)}`}>
                          {coverageMin !== null && coverageMax !== null
                            ? `${formatRange(coverageMin, coverageMax, 1)}%`
                            : "Set target"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Gap</span>
                        <span className={`font-semibold ${getRangeTone(coreSurplusMin, coreSurplusMax)}`}>
                          {targetPlatformFee > 0
                            ? formatSignedRange(coreSurplusMin, coreSurplusMax)
                            : "Set target"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className={`grid gap-4 ${selectedAlternative ? "md:grid-cols-2" : ""}`}>
          <Card className="border-border/80">
            <CardHeader className="flex flex-col gap-3 pb-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base">Core CPM stream</CardTitle>
                <p className="text-xs text-muted-foreground">Primary model used in the snapshot.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {cpmAlternatives.length > 0 && (
                  <Select value={selectedAlternativeId} onValueChange={setSelectedAlternativeId}>
                    <SelectTrigger className="w-[190px]">
                      <SelectValue placeholder="Compare with" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No alternative</SelectItem>
                      {cpmAlternatives.map((scenario) => (
                        <SelectItem key={scenario.id} value={scenario.id}>
                          {scenario.name || "Alternative"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" size="sm" onClick={addCpmAlternative}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add alternative
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="w-full max-w-[720px] space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Videos per month</Label>
                      <Input
                        type="number"
                        min={0}
                        value={model.cpm.videosPerMonth}
                        onChange={(event) =>
                          updateCpm({ videosPerMonth: Number(event.target.value) || 0 })
                        }
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Billable views per video (avg, incl. 0s)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={model.cpm.billableViewsPerVideo}
                        onChange={(event) =>
                          updateCpm({ billableViewsPerVideo: Number(event.target.value) || 0 })
                        }
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>CPM min (€)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={model.cpm.cpmMin}
                        onChange={(event) => updateCpm({ cpmMin: Number(event.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>CPM max (€)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={model.cpm.cpmMax}
                        onChange={(event) => updateCpm({ cpmMax: Number(event.target.value) || 0 })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Platform take %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={model.cpm.platformTakeRate}
                        onChange={(event) =>
                          updateCpm({ platformTakeRate: Number(event.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cap per video (€ total)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={model.cpm.capPerVideoTotal}
                        onChange={(event) =>
                          updateCpm({ capPerVideoTotal: Number(event.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Cap hit rate %</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={model.cpm.capHitRate}
                        onChange={(event) =>
                          updateCpm({ capHitRate: Number(event.target.value) || 0 })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>CPM notes</Label>
                    <Textarea
                      value={model.cpm.notes}
                      onChange={(event) => updateCpm({ notes: event.target.value })}
                      placeholder="Add assumptions, caps, or pricing logic."
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        <TrendingUp className="h-3 w-3" />
                        Revenue range
                      </div>
                      <div className="mt-2 text-sm font-semibold">
                        {formatRange(cpmRange.revenueMin, cpmRange.revenueMax)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        <Scale className="h-3 w-3" />
                        Platform fee range
                      </div>
                      <div className="mt-2 text-sm font-semibold">
                        {formatRange(cpmRange.platformMin, cpmRange.platformMax)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        <Target className="h-3 w-3" />
                        Creator payout
                      </div>
                      <div className="mt-2 text-sm font-semibold">
                        {formatRange(cpmRange.creatorMin, cpmRange.creatorMax)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        <TrendingUp className="h-3 w-3" />
                        Per video
                      </div>
                      <div className="mt-2 text-sm font-semibold">
                        {formatRange(cpmRange.perVideoMin, cpmRange.perVideoMax)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        <Target className="h-3 w-3" />
                        Target feasibility
                      </div>
                      {optimized.requiredCpm !== null ? (
                        optimized.capped ? (
                          <Badge variant="outline" className="text-[10px]">
                            Cap-limited
                          </Badge>
                        ) : optimized.aboveMax ? (
                          <Badge variant="outline" className="text-[10px]">
                            Above max CPM
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            Within range
                          </Badge>
                        )
                      ) : null}
                    </div>
                    <div
                      className={`mt-2 text-lg font-semibold ${
                        optimized.requiredCpm === null
                          ? "text-foreground"
                          : optimized.capped || optimized.aboveMax
                          ? "text-rose-500"
                          : "text-emerald-600"
                      }`}
                    >
                      {optimized.requiredCpm === null
                        ? "Set target"
                        : optimized.capped
                        ? "Cap-limited"
                        : `${formatNumber(optimized.requiredCpm, 2)} CPM`}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {optimized.capped
                        ? "Cap limits per-video earnings; CPM stops moving totals."
                        : "Required CPM to hit the target at current volume."}
                    </p>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span>Max CPM set</span>
                        <span className="font-semibold">
                          {model.cpm.cpmMax > 0 ? `${formatNumber(model.cpm.cpmMax, 2)} CPM` : "Set max"}
                        </span>
                      </div>
                      {optimized.capped && optimized.requiredCpm !== null ? (
                        <div className="flex items-center justify-between">
                          <span>CPM needed without cap</span>
                          <span className="font-semibold">
                            {formatNumber(optimized.requiredCpm, 2)} CPM
                          </span>
                        </div>
                      ) : null}
                      {optimized.maxPlatformFeeAtMaxCpm !== null ? (
                        <div className="flex items-center justify-between">
                          <span>Platform fee @ max CPM</span>
                          <span className="font-semibold">
                            {formatNumber(optimized.maxPlatformFeeAtMaxCpm)}
                          </span>
                        </div>
                      ) : null}
                      {optimized.requiredVideosAtMaxCpm !== null ? (
                        <div className="flex items-center justify-between">
                          <span>Videos needed @ max CPM</span>
                          <span className="font-semibold">
                            {formatNumber(optimized.requiredVideosAtMaxCpm, 0)}
                          </span>
                        </div>
                      ) : null}
                      {optimized.requiredViewsPerVideoAtMaxCpm !== null ? (
                        <div className="flex items-center justify-between">
                          <span>Views/video needed @ max CPM</span>
                          <span className="font-semibold">
                            {formatNumber(optimized.requiredViewsPerVideoAtMaxCpm, 0)}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {optimized.requiredCpm === null
                        ? "Set target, videos, and views to estimate required CPM."
                        : optimized.capped
                        ? "Cap per video limits earnings. Raise cap or volume."
                        : optimized.aboveMax
                        ? "Target needs higher CPM or more volume."
                        : "Within current CPM range at this volume."}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {selectedAlternative && selectedAlternativeRange ? (
            <Card className="border-border/80">
              <CardHeader className="flex flex-col gap-3 pb-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-base">Alternative CPM</CardTitle>
                  <p className="text-xs text-muted-foreground">Scenario to compare.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={selectedAlternative.includeInCompare}
                      onCheckedChange={(value) =>
                        updateCpmAlternative(selectedAlternative.id, { includeInCompare: value })
                      }
                    />
                    <span className="text-xs text-muted-foreground">Include in compare</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeCpmAlternative(selectedAlternative.id)}
                  >
                    Remove
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="w-full max-w-[720px] space-y-5">
                  <div className="space-y-2">
                  <Label>Scenario name</Label>
                  <Input
                    value={selectedAlternative.name}
                    onChange={(event) =>
                      updateCpmAlternative(selectedAlternative.id, { name: event.target.value })
                    }
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Videos per month</Label>
                    <Input
                      type="number"
                      min={0}
                      value={selectedAlternative.videosPerMonth}
                      onChange={(event) =>
                        updateCpmAlternative(selectedAlternative.id, {
                          videosPerMonth: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Billable views per video</Label>
                    <Input
                      type="number"
                      min={0}
                      value={selectedAlternative.billableViewsPerVideo}
                      onChange={(event) =>
                        updateCpmAlternative(selectedAlternative.id, {
                          billableViewsPerVideo: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>CPM min (€)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.1"
                      value={selectedAlternative.cpmMin}
                      onChange={(event) =>
                        updateCpmAlternative(selectedAlternative.id, {
                          cpmMin: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CPM max (€)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.1"
                      value={selectedAlternative.cpmMax}
                      onChange={(event) =>
                        updateCpmAlternative(selectedAlternative.id, {
                          cpmMax: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Platform take %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={selectedAlternative.platformTakeRate}
                      onChange={(event) =>
                        updateCpmAlternative(selectedAlternative.id, {
                          platformTakeRate: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cap per video (€ total)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={selectedAlternative.capPerVideoTotal}
                      onChange={(event) =>
                        updateCpmAlternative(selectedAlternative.id, {
                          capPerVideoTotal: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cap hit rate %</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={selectedAlternative.capHitRate}
                      onChange={(event) =>
                        updateCpmAlternative(selectedAlternative.id, {
                          capHitRate: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={selectedAlternative.notes}
                      onChange={(event) =>
                        updateCpmAlternative(selectedAlternative.id, { notes: event.target.value })
                      }
                      placeholder="Extra notes or assumptions"
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Revenue range
                    </div>
                    <div className="mt-2 text-sm font-semibold">
                      {formatRange(selectedAlternativeRange.revenueMin, selectedAlternativeRange.revenueMax)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Platform fee
                    </div>
                    <div className="mt-2 text-sm font-semibold">
                      {formatRange(selectedAlternativeRange.platformMin, selectedAlternativeRange.platformMax)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Creator payout
                    </div>
                    <div className="mt-2 text-sm font-semibold">
                      {formatRange(selectedAlternativeRange.creatorMin, selectedAlternativeRange.creatorMax)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                      Per video
                    </div>
                    <div className="mt-2 text-sm font-semibold">
                      {formatRange(selectedAlternativeRange.perVideoMin, selectedAlternativeRange.perVideoMax)}
                    </div>
                  </div>
                </div>

              </CardContent>
            </Card>
          ) : null}
        </div>

      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Additional revenue streams</h2>
            <p className="text-sm text-muted-foreground">
              Track optional monetization ideas and include the best ones in your comparison.
            </p>
          </div>
          <Button onClick={addAdditionalStream} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Add stream
          </Button>
        </div>

        {additionalStreams.length === 0 ? (
          <Card className="border-border/80">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No additional streams yet. Add one to explore upsells or alternative pricing.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {additionalStreams.map((stream) => {
              const revenue = stream.pricePerUnit * stream.unitsPerMonth;
              const creator = stream.creatorPayoutPerUnit * stream.unitsPerMonth;
              const platform = revenue - creator;
              const margin = revenue > 0 ? (platform / revenue) * 100 : 0;

              return (
                <Card key={stream.id} className="border-border/80">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex-1 space-y-2">
                        <Label>Stream name</Label>
                        <Input
                          value={stream.name}
                          onChange={(event) =>
                            updateAdditionalStream(stream.id, { name: event.target.value })
                          }
                          placeholder="Flat per video, buyout rights, production fee"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Revenue {formatNumber(revenue)}</Badge>
                        <Badge variant="secondary">Platform {formatNumber(platform)}</Badge>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="space-y-2">
                        <Label>Unit label</Label>
                        <Input
                          value={stream.unitLabel}
                          onChange={(event) =>
                            updateAdditionalStream(stream.id, { unitLabel: event.target.value })
                          }
                          placeholder="video, venue, campaign"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Price per unit (€)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={stream.pricePerUnit}
                          onChange={(event) =>
                            updateAdditionalStream(stream.id, {
                              pricePerUnit: Number(event.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Creator payout (€)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={stream.creatorPayoutPerUnit}
                          onChange={(event) =>
                            updateAdditionalStream(stream.id, {
                              creatorPayoutPerUnit: Number(event.target.value) || 0,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Units / month</Label>
                        <Input
                          type="number"
                          min={0}
                          value={stream.unitsPerMonth}
                          onChange={(event) =>
                            updateAdditionalStream(stream.id, {
                              unitsPerMonth: Number(event.target.value) || 0,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                          Platform fee
                        </div>
                        <div className="mt-2 text-sm font-semibold">
                          {formatNumber(platform)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                          Margin
                        </div>
                        <div className="mt-2 text-sm font-semibold">
                          {formatNumber(margin, 1)}%
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                        <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                          Creator payout
                        </div>
                        <div className="mt-2 text-sm font-semibold">
                          {formatNumber(creator)}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={stream.notes}
                        onChange={(event) =>
                          updateAdditionalStream(stream.id, { notes: event.target.value })
                        }
                        placeholder="How this stream works, dependencies, or risks"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={stream.includeInCompare}
                          onCheckedChange={(value) =>
                            updateAdditionalStream(stream.id, { includeInCompare: value })
                          }
                        />
                        <span className="text-xs text-muted-foreground">Include in compare</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeAdditionalStream(stream.id)}
                      >
                        Remove stream
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Card className="border-border/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Comparison snapshot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
            Core CPM is always included. Toggle CPM alternatives or streams to compare trade-offs.
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  <th className="pb-2 pr-4">Stream</th>
                  <th className="pb-2 pr-4">Revenue / mo</th>
                  <th className="pb-2 pr-4">Platform fee</th>
                  <th className="pb-2">Creator payout</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-t border-border/60">
                  <td className="py-3 pr-4 font-semibold">Core CPM</td>
                  <td className="py-3 pr-4">
                    {formatRange(cpmRange.revenueMin, cpmRange.revenueMax)}
                  </td>
                  <td className="py-3 pr-4">
                    {formatRange(cpmRange.platformMin, cpmRange.platformMax)}
                  </td>
                  <td className="py-3">
                    {formatRange(cpmRange.creatorMin, cpmRange.creatorMax)}
                  </td>
                </tr>
                {comparisonAlternatives.map((scenario) => {
                  const range = getCpmRange(scenario);
                  return (
                    <tr key={scenario.id} className="border-t border-border/60">
                      <td className="py-3 pr-4 font-semibold">{scenario.name || "Alternative"}</td>
                      <td className="py-3 pr-4">{formatRange(range.revenueMin, range.revenueMax)}</td>
                      <td className="py-3 pr-4">{formatRange(range.platformMin, range.platformMax)}</td>
                      <td className="py-3">{formatRange(range.creatorMin, range.creatorMax)}</td>
                    </tr>
                  );
                })}
                {comparisonAdditional.length === 0 && comparisonAlternatives.length === 0 ? (
                  <tr className="border-t border-border/60">
                    <td colSpan={4} className="py-4 text-sm text-muted-foreground">
                      Select CPM alternatives or additional streams to compare.
                    </td>
                  </tr>
                ) : null}
                {comparisonAdditional.map((stream) => {
                  const revenue = stream.pricePerUnit * stream.unitsPerMonth;
                  const creator = stream.creatorPayoutPerUnit * stream.unitsPerMonth;
                  const platform = revenue - creator;
                  return (
                    <tr key={stream.id} className="border-t border-border/60">
                      <td className="py-3 pr-4 font-semibold">{stream.name || "Untitled"}</td>
                      <td className="py-3 pr-4">{formatNumber(revenue)}</td>
                      <td className="py-3 pr-4">{formatNumber(platform)}</td>
                      <td className="py-3">{formatNumber(creator)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Pivot ideas</h2>
            <p className="text-sm text-muted-foreground">
              Capture adjacent bets and score them on desirability, feasibility, and viability.
            </p>
          </div>
          <Button onClick={addPivotIdea} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Add pivot idea
          </Button>
        </div>

        {pivotIdeas.length === 0 ? (
          <Card className="border-border/80">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No pivot ideas yet. Add one to compare against your current model.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pivotIdeas.map((idea) => (
              <Card key={idea.id} className="border-border/80">
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex-1 space-y-2">
                      <Label>Pivot name</Label>
                      <Input
                        value={idea.title}
                        onChange={(event) =>
                          updatePivotIdea(idea.id, { title: event.target.value })
                        }
                        placeholder="Adjacent market, pricing shift, new offering"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        Score {Math.round(((idea.desirability + idea.feasibility + idea.viability) / 3) * 10) / 10}
                      </Badge>
                      <Select
                        value={idea.status}
                        onValueChange={(value) =>
                          updatePivotIdea(idea.id, { status: value as PivotStatus })
                        }
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          {PIVOT_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Summary</Label>
                    <Textarea
                      value={idea.summary}
                      onChange={(event) =>
                        updatePivotIdea(idea.id, { summary: event.target.value })
                      }
                      placeholder="What is the idea in plain language?"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>What changes?</Label>
                    <Textarea
                      value={idea.changeSummary}
                      onChange={(event) =>
                        updatePivotIdea(idea.id, { changeSummary: event.target.value })
                      }
                      placeholder="Customer, value prop, channel, pricing, delivery..."
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Pros</Label>
                      <Textarea
                        value={idea.pros}
                        onChange={(event) => updatePivotIdea(idea.id, { pros: event.target.value })}
                        placeholder="Upside, leverage, strategic fit"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Risks</Label>
                      <Textarea
                        value={idea.risks}
                        onChange={(event) => updatePivotIdea(idea.id, { risks: event.target.value })}
                        placeholder="What could go wrong?"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Key unknowns</Label>
                    <Textarea
                      value={idea.unknowns}
                      onChange={(event) =>
                        updatePivotIdea(idea.id, { unknowns: event.target.value })
                      }
                      placeholder="Assumptions to validate"
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Desirability (1-5)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={idea.desirability}
                        onChange={(event) =>
                          updatePivotIdea(idea.id, {
                            desirability: clampScore(Number(event.target.value) || 1),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Feasibility (1-5)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={idea.feasibility}
                        onChange={(event) =>
                          updatePivotIdea(idea.id, {
                            feasibility: clampScore(Number(event.target.value) || 1),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Viability (1-5)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={idea.viability}
                        onChange={(event) =>
                          updatePivotIdea(idea.id, {
                            viability: clampScore(Number(event.target.value) || 1),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Next validation step</Label>
                    <Textarea
                      value={idea.nextStep}
                      onChange={(event) =>
                        updatePivotIdea(idea.id, { nextStep: event.target.value })
                      }
                      placeholder="One action that de-risks the pivot"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={idea.notes}
                      onChange={(event) => updatePivotIdea(idea.id, { notes: event.target.value })}
                      placeholder="Extra context or decision log"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => removePivotIdea(idea.id)}>
                      Remove idea
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
