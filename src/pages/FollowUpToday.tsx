import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock,
  Mail,
  MapPin,
  Phone,
  Plus,
  Radar,
  Snowflake,
  Sparkles,
  User,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import {
  addDays,
  differenceInCalendarDays,
  format,
  formatDistanceToNow,
  startOfWeek,
} from 'date-fns';
import { useCRMContext } from '@/contexts/CRMContext';
import { TaskItem } from '@/components/TaskItem';
import { TaskDetailDialog } from '@/components/TaskDetailDialog';
import { ApprovalQueue } from '@/components/ApprovalQueue';
import { AddTaskWithContactDialog } from '@/components/AddTaskWithContactDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OPEN_DEAL_LIFECYCLES, type Activity, type Task } from '@/types/crm';
import { COLD_AFTER_DAYS, getColdCompanies } from '@/lib/follow-up-health';
import { cn, toLocalDateKey } from '@/lib/utils';

interface RecentlyCompleted {
  task: Task;
  completedAt: number;
}

interface PulseCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  detail: string;
  onClick: () => void;
}

interface Recommendation {
  id: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
}

const FIRST_TASK_NUDGE_KEY = 'simplecrm_first_task_nudge_seen';
const COLD_PREVIEW_LIMIT = 4;
const CALLS_PREVIEW_LIMIT = 4;
const CALL_STAGES = ['sourced', 'qualified', 'contacting', 'talking'];

const formatOutreachDue = (nextActionAt: string | null) => {
  if (!nextActionAt) return '';
  const days = differenceInCalendarDays(new Date(), new Date(nextActionAt));
  if (days <= 0) return 'Due today';
  return `${days} day${days !== 1 ? 's' : ''} overdue`;
};

const activityIcon = (type: Activity['type']) => {
  if (type === 'call' || type === 'call_attempted') return Phone;
  if (type === 'email') return Mail;
  if (type === 'meeting') return Users;
  if (type === 'task_completed') return CheckCircle2;
  if (type === 'stage_change') return Workflow;
  return ActivityIcon;
};

function SectionHeading({
  title,
  description,
  count,
}: {
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground lg:text-xl">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {typeof count === 'number' && count > 0 && (
        <Badge variant="secondary" className="shrink-0 rounded-full px-2.5">
          {count}
        </Badge>
      )}
    </div>
  );
}

function PulseCard({ icon: Icon, label, value, detail, onClick }: PulseCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl border border-border/70 bg-background p-3 text-left transition-colors hover:border-primary/30 hover:bg-muted/40"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </button>
  );
}

export default function FollowUpToday() {
  const navigate = useNavigate();
  const {
    tasks,
    companies,
    contacts,
    activities,
    projects,
    projectVisits,
    toggleTaskComplete,
    getContactById,
    rescheduleTask,
  } = useCRMContext();
  const [approvalCount, setApprovalCount] = useState(0);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [recentlyCompleted, setRecentlyCompleted] = useState<RecentlyCompleted[]>([]);
  const [showFirstTaskNudge, setShowFirstTaskNudge] = useState(false);

  const today = toLocalDateKey();
  const comingUpEnd = toLocalDateKey(addDays(new Date(), 7));
  const visitWindowEnd = toLocalDateKey(addDays(new Date(), 14));

  const dueCalls = useMemo(() => {
    const endOfToday = addDays(new Date(new Date().setHours(0, 0, 0, 0)), 1);
    return companies
      .filter((company) => company.phone && CALL_STAGES.includes(company.lifecycle))
      .filter((company) => company.nextActionAt && new Date(company.nextActionAt) < endOfToday)
      .sort((a, b) => (b.nextActionAt ?? '').localeCompare(a.nextActionAt ?? ''));
  }, [companies]);

  const coldCompanies = useMemo(() => getColdCompanies(companies, tasks), [companies, tasks]);
  const prospectsToReview = companies.filter((company) => company.needsReview && company.fit).length;
  const aFitProspects = companies.filter((company) => company.needsReview && company.fit === 'A').length;

  const isPersonal = (task: Task) => !task.companyId && !task.contactId;
  const openTasks = tasks.filter((task) => !task.completed && task.dueDate && !isPersonal(task));
  const personalTasks = tasks
    .filter((task) => !task.completed && task.dueDate && isPersonal(task) && task.dueDate <= comingUpEnd)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdueTasks = openTasks.filter((task) => task.dueDate < today);
  const todayTasks = openTasks.filter((task) => task.dueDate === today);
  const comingUpTasks = openTasks
    .filter((task) => task.dueDate > today && task.dueDate <= comingUpEnd)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const openDeals = companies.filter((company) => OPEN_DEAL_LIFECYCLES.includes(company.lifecycle));
  const lateStageDeals = openDeals.filter((company) => company.lifecycle === 'proposal' || company.lifecycle === 'pilot');
  const activeProjects = projects.filter((project) => project.status !== 'Closed' && project.status !== 'Archived');
  const upcomingVisits = projectVisits.filter(
    (visit) => visit.status !== 'Done' && visit.date >= today && visit.date <= visitWindowEnd,
  );
  const visitsNeedingPrep = upcomingVisits.filter(
    (visit) => !visit.briefing.trim() || visit.creatorIds.length === 0,
  );
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 }).getTime();
  const weeklyActivities = activities.filter((activity) => new Date(activity.timestamp).getTime() >= weekStart);
  const completedThisWeek = weeklyActivities.filter((activity) => activity.type === 'task_completed').length;
  const recentActivities = activities.slice(0, 6);
  const hasPulseData = companies.length > 0 || projects.length > 0 || activities.length > 0;

  const dueNowCount =
    overdueTasks.length +
    todayTasks.length +
    personalTasks.filter((task) => task.dueDate <= today).length +
    dueCalls.length;
  const decisionCount = approvalCount + prospectsToReview;

  const recommendations = useMemo<Recommendation[]>(() => {
    const items: Recommendation[] = [];

    if (overdueTasks.length > 0) {
      items.push({
        id: 'overdue',
        icon: AlertTriangle,
        title: `Clear ${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'}`,
        detail: 'These are the oldest promises currently waiting on you.',
        action: 'Review tasks',
        onClick: () => document.getElementById('today-work')?.scrollIntoView({ behavior: 'smooth' }),
      });
    }

    if (prospectsToReview > 0) {
      items.push({
        id: 'prospects',
        icon: Radar,
        title: `Review ${prospectsToReview} researched prospect${prospectsToReview === 1 ? '' : 's'}`,
        detail: aFitProspects > 0 ? `${aFitProspects} are marked A-fit.` : 'Accept the useful ones into your pipeline.',
        action: 'Open prospecting',
        onClick: () => navigate('/prospecting'),
      });
    }

    if (coldCompanies.length > 0) {
      items.push({
        id: 'cold',
        icon: Snowflake,
        title: `Rescue ${coldCompanies.length} deal${coldCompanies.length === 1 ? '' : 's'} going cold`,
        detail: `They have no open task and no touch in ${COLD_AFTER_DAYS}+ days.`,
        action: 'Review pipeline',
        onClick: () => navigate('/pipeline'),
      });
    }

    if (visitsNeedingPrep.length > 0) {
      const firstVisit = visitsNeedingPrep[0];
      items.push({
        id: 'visits',
        icon: MapPin,
        title: `Prepare ${visitsNeedingPrep.length} upcoming visit${visitsNeedingPrep.length === 1 ? '' : 's'}`,
        detail: 'A briefing or creator assignment is still missing.',
        action: 'Open projects',
        onClick: () => navigate(`/projects?projectId=${firstVisit.projectId}`),
      });
    }

    if (dueCalls.length > 0) {
      items.push({
        id: 'calls',
        icon: Phone,
        title: `Make ${dueCalls.length} due call${dueCalls.length === 1 ? '' : 's'}`,
        detail: 'Work the current call queue while the context is fresh.',
        action: 'Start Call Mode',
        onClick: () => navigate('/calls'),
      });
    }

    if (items.length === 0 && openDeals.length > 0) {
      items.push({
        id: 'pipeline',
        icon: BriefcaseBusiness,
        title: 'Your operating queue is clear',
        detail: `Use the space to move one of ${openDeals.length} open deals forward.`,
        action: 'Open pipeline',
        onClick: () => navigate('/pipeline'),
      });
    }

    return items.slice(0, 4);
  }, [aFitProspects, coldCompanies.length, dueCalls.length, navigate, openDeals.length, overdueTasks.length, prospectsToReview, visitsNeedingPrep]);

  useEffect(() => {
    if (recentlyCompleted.length === 0) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setRecentlyCompleted((current) => current.filter((item) => now - item.completedAt < 5000));
    }, 500);
    return () => window.clearInterval(interval);
  }, [recentlyCompleted.length]);

  useEffect(() => {
    if (tasks.length > 0) {
      try {
        localStorage.setItem(FIRST_TASK_NUDGE_KEY, '1');
      } catch {
        // ignore storage errors
      }
      setShowFirstTaskNudge(false);
      return;
    }
    try {
      setShowFirstTaskNudge(localStorage.getItem(FIRST_TASK_NUDGE_KEY) !== '1');
    } catch {
      setShowFirstTaskNudge(false);
    }
  }, [tasks.length]);

  const handleToggleComplete = useCallback(
    (taskId: string) => {
      const task = tasks.find((item) => item.id === taskId);
      if (task && !task.completed) {
        setRecentlyCompleted((current) => [
          ...current.filter((item) => item.task.id !== taskId),
          { task, completedAt: Date.now() },
        ]);
      } else {
        setRecentlyCompleted((current) => current.filter((item) => item.task.id !== taskId));
      }
      toggleTaskComplete(taskId);
    },
    [tasks, toggleTaskComplete],
  );

  const handleUndoComplete = useCallback(
    (taskId: string) => {
      setRecentlyCompleted((current) => current.filter((item) => item.task.id !== taskId));
      toggleTaskComplete(taskId);
    },
    [toggleTaskComplete],
  );

  const handleNewTaskClick = () => {
    if (!showFirstTaskNudge) return;
    try {
      localStorage.setItem(FIRST_TASK_NUDGE_KEY, '1');
    } catch {
      // ignore storage errors
    }
    setShowFirstTaskNudge(false);
  };

  const activityTarget = (activity: Activity) => {
    const company = activity.companyId ? companies.find((item) => item.id === activity.companyId) : undefined;
    const contact = activity.contactId ? contacts.find((item) => item.id === activity.contactId) : undefined;
    return {
      label: company?.name ?? contact?.fullName ?? 'Figtree',
      path: company ? `/companies/${company.id}` : contact ? `/contacts/${contact.id}` : null,
    };
  };

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 xl:p-10">
      <header className="mb-7 lg:mb-9">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full bg-background font-normal text-muted-foreground">
                {format(new Date(), 'EEEE, MMMM d')}
              </Badge>
              {decisionCount > 0 && (
                <Badge className="rounded-full">{decisionCount} decision{decisionCount === 1 ? '' : 's'}</Badge>
              )}
            </div>
            <h1 className="sr-only text-3xl font-semibold tracking-tight text-foreground sm:not-sr-only lg:text-4xl">Ops Home</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              {dueNowCount > 0
                ? `${dueNowCount} item${dueNowCount === 1 ? '' : 's'} due or waiting today. Keep the business moving from one place.`
                : 'Your operating queue is clear. Use the pulse below to decide what moves next.'}
            </p>
          </div>
          <div className="hidden sm:block">
            <AddTaskWithContactDialog
              trigger={
                <Button onClick={handleNewTaskClick} className="shadow-sm">
                  <Plus className="mr-2 h-4 w-4" />
                  New task
                </Button>
              }
            />
          </div>
        </div>
      </header>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)] xl:items-start">
        <main className="min-w-0 space-y-8">
          <section className="space-y-4">
            <SectionHeading
              title="Needs you"
              description="Approvals and decisions that are holding up the next step."
              count={decisionCount}
            />

            <ApprovalQueue onCountChange={setApprovalCount} />

            {prospectsToReview > 0 && (
              <button
                type="button"
                onClick={() => navigate('/prospecting')}
                className="group flex w-full items-center gap-4 rounded-xl border border-primary/25 bg-card p-4 text-left transition-colors hover:bg-muted/40"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Radar className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground">
                    {prospectsToReview} researched prospect{prospectsToReview === 1 ? '' : 's'} ready for review
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {aFitProspects > 0 ? `${aFitProspects} are marked A-fit. ` : ''}Accept, reject, or refine them before outreach.
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            )}

            {decisionCount === 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <div>
                  <p className="text-sm font-medium text-foreground">Nothing is waiting for your approval</p>
                  <p className="text-xs text-muted-foreground">New drafts and researched prospects will appear here.</p>
                </div>
              </div>
            )}
          </section>

          <section id="today-work" className="scroll-mt-6 space-y-4">
            <SectionHeading
              title="Today’s work"
              description="Promises, follow-ups, and calls that should move today."
              count={dueNowCount}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="flex h-full flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                    <CalendarCheck className="h-5 w-5" />
                    Due now
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 space-y-5">
                  {overdueTasks.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-destructive-foreground">
                        <AlertTriangle className="h-4 w-4" />
                        Overdue ({overdueTasks.length})
                      </div>
                      {overdueTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          contact={getContactById(task.contactId)}
                          onToggleComplete={handleToggleComplete}
                          onContactClick={(id) => navigate(`/contacts/${id}`)}
                          onReschedule={rescheduleTask}
                          onTaskClick={setSelectedTask}
                          showContact
                        />
                      ))}
                    </div>
                  )}

                  {todayTasks.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-accent-foreground">
                        <CalendarCheck className="h-4 w-4" />
                        Today ({todayTasks.length})
                      </div>
                      {todayTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          contact={getContactById(task.contactId)}
                          onToggleComplete={handleToggleComplete}
                          onContactClick={(id) => navigate(`/contacts/${id}`)}
                          onReschedule={rescheduleTask}
                          onTaskClick={setSelectedTask}
                          showContact
                        />
                      ))}
                    </div>
                  )}

                  {overdueTasks.length === 0 && todayTasks.length === 0 && (
                    <div className="py-7 text-center">
                      <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500/70" />
                      <p className="font-medium text-foreground">{showFirstTaskNudge ? 'Create your first task' : 'All clear'}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {showFirstTaskNudge ? 'Add a company follow-up to start your operating rhythm.' : 'No company follow-ups are due today.'}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="flex h-full flex-col">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    Next 7 days
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  {comingUpTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      contact={getContactById(task.contactId)}
                      onToggleComplete={handleToggleComplete}
                      onContactClick={(id) => navigate(`/contacts/${id}`)}
                      onReschedule={rescheduleTask}
                      onTaskClick={setSelectedTask}
                      showContact
                    />
                  ))}
                  {comingUpTasks.length === 0 && (
                    <div className="py-7 text-center">
                      <Clock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">No company tasks due in the next 7 days</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {(dueCalls.length > 0 || coldCompanies.length > 0) && (
              <div className="grid gap-4 lg:grid-cols-2">
                {dueCalls.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <Phone className="h-5 w-5" />
                        Calls due ({dueCalls.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {dueCalls.slice(0, CALLS_PREVIEW_LIMIT).map((lead) => {
                        const dueLabel = formatOutreachDue(lead.nextActionAt);
                        return (
                          <button
                            key={lead.id}
                            type="button"
                            onClick={() => navigate(`/calls?company=${lead.id}`)}
                            className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-foreground">{lead.name || 'Untitled'}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {[lead.nextAction, lead.city].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                            <span className={cn('shrink-0 text-xs', dueLabel === 'Due today' ? 'text-accent-foreground' : 'text-destructive-foreground')}>
                              {dueLabel}
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </button>
                        );
                      })}
                      {dueCalls.length > CALLS_PREVIEW_LIMIT && (
                        <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate('/calls')}>
                          +{dueCalls.length - CALLS_PREVIEW_LIMIT} more in Call Mode
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}

                {coldCompanies.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                        <Snowflake className="h-5 w-5" />
                        Going cold ({coldCompanies.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {coldCompanies.slice(0, COLD_PREVIEW_LIMIT).map(({ company, daysSinceTouch }) => (
                        <button
                          key={company.id}
                          type="button"
                          onClick={() => navigate(`/companies/${company.id}`)}
                          className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{company.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[company.city, company.industry].filter(Boolean).join(' · ') || 'Open deal'}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-amber-600 dark:text-amber-300">{daysSinceTouch}d quiet</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                      {coldCompanies.length > COLD_PREVIEW_LIMIT && (
                        <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate('/pipeline')}>
                          +{coldCompanies.length - COLD_PREVIEW_LIMIT} more in Pipeline
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {personalTasks.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                    <User className="h-5 w-5" />
                    My tasks
                  </CardTitle>
                  <AddTaskWithContactDialog
                    trigger={
                      <Button size="sm" variant="outline">
                        <Plus className="mr-1 h-4 w-4" />
                        Add
                      </Button>
                    }
                  />
                </CardHeader>
                <CardContent className="space-y-3">
                  {personalTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      onToggleComplete={handleToggleComplete}
                      onReschedule={rescheduleTask}
                      onTaskClick={setSelectedTask}
                    />
                  ))}
                </CardContent>
              </Card>
            )}
          </section>

          {recentlyCompleted.length > 0 && (
            <Card className="border-muted bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-medium text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  Just completed
                  <span className="text-xs font-normal">Click to undo</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentlyCompleted.map(({ task }) => {
                  const contact = getContactById(task.contactId);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => handleUndoComplete(task.id)}
                      className="group flex w-full items-center gap-3 rounded-lg border border-border/50 bg-background/50 p-3 text-left transition-colors hover:border-border hover:bg-background"
                    >
                      <CheckCircle2 className="h-5 w-5 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-muted-foreground line-through">{task.title}</p>
                        {contact && <p className="text-xs text-muted-foreground/70">{contact.fullName}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground group-hover:text-primary">Undo</span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </main>

        <aside className="space-y-5 xl:sticky xl:top-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                <ActivityIcon className="h-5 w-5" />
                Business pulse
              </CardTitle>
            </CardHeader>
            <CardContent className={cn(hasPulseData && 'grid grid-cols-2 gap-3')}>
              {hasPulseData ? (
                <>
                  <PulseCard
                    icon={BriefcaseBusiness}
                    label="Open deals"
                    value={openDeals.length}
                    detail={`${lateStageDeals.length} in proposal or pilot`}
                    onClick={() => navigate('/pipeline')}
                  />
                  <PulseCard
                    icon={MapPin}
                    label="Active projects"
                    value={activeProjects.length}
                    detail={`${upcomingVisits.length} visits in the next 14 days`}
                    onClick={() => navigate('/projects')}
                  />
                  <PulseCard
                    icon={Workflow}
                    label="Activity this week"
                    value={weeklyActivities.length}
                    detail={`${completedThisWeek} tasks completed`}
                    onClick={() => navigate('/companies')}
                  />
                  <PulseCard
                    icon={Radar}
                    label="Prospects ready"
                    value={prospectsToReview}
                    detail={aFitProspects > 0 ? `${aFitProspects} marked A-fit` : 'Research queue reviewed'}
                    onClick={() => navigate('/prospecting')}
                  />
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-4">
                  <p className="text-sm font-medium text-foreground">Your pulse starts with the first company</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Pipeline, project, and weekly activity signals will appear as you work.
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/companies')}>
                    Add a company
                    <ArrowRight className="ml-2 h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
                <Sparkles className="h-5 w-5 text-primary" />
                Recommended next moves
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recommendations.length > 0 ? (
                recommendations.map((recommendation) => {
                  const Icon = recommendation.icon;
                  return (
                    <button
                      key={recommendation.id}
                      type="button"
                      onClick={recommendation.onClick}
                      className="group w-full rounded-xl border border-border/70 p-3 text-left transition-colors hover:border-primary/25 hover:bg-muted/40"
                    >
                      <div className="flex gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-foreground">{recommendation.title}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">{recommendation.detail}</span>
                          <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                            {recommendation.action}
                            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="flex gap-3 rounded-xl border border-dashed border-border p-4">
                  <CircleAlert className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Add a company or task and Figtree will surface the next useful move here.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-base lg:text-lg">
                <span className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Recent activity
                </span>
                {recentActivities.length > 0 && <span className="text-xs font-normal text-muted-foreground">Latest first</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivities.length > 0 ? (
                <div className="relative space-y-1 before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-border">
                  {recentActivities.map((activity) => {
                    const Icon = activityIcon(activity.type);
                    const target = activityTarget(activity);
                    return (
                      <button
                        key={activity.id}
                        type="button"
                        disabled={!target.path}
                        onClick={() => target.path && navigate(target.path)}
                        className="relative flex w-full gap-3 rounded-lg p-2 text-left transition-colors enabled:hover:bg-muted/50"
                      >
                        <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 pt-0.5">
                          <span className="block truncate text-xs font-medium text-foreground">{target.label}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{activity.description}</span>
                          <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
                            {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-5 text-center">
                  <ActivityIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">Calls, emails, meetings, and stage changes will appear here.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <TaskDetailDialog
        task={selectedTask}
        contact={selectedTask ? getContactById(selectedTask.contactId) : undefined}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onContactClick={(id) => navigate(`/contacts/${id}`)}
        showContact
      />

      <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-[calc(1.25rem+env(safe-area-inset-right))] z-40 sm:hidden">
        <AddTaskWithContactDialog
          trigger={
            <Button
              aria-label="New task"
              onClick={handleNewTaskClick}
              className={cn(
                'relative h-12 w-12 rounded-full px-0 shadow-lg',
                showFirstTaskNudge &&
                  'animate-heartbeat ring-2 ring-primary/25 ring-offset-2 ring-offset-background shadow-[0_0_12px_rgba(59,130,246,0.12)]',
              )}
            >
              <Plus className="h-5 w-5" />
            </Button>
          }
        />
      </div>
    </div>
  );
}
