import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useCRMContext } from '@/contexts/CRMContext';
import { AddCompanyDialog } from '@/components/AddCompanyDialog';
import { LIFECYCLE_STYLES } from '@/components/LifecycleBadge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { COLD_AFTER_DAYS, getCompanyDaysSinceTouch } from '@/lib/follow-up-health';
import { cn } from '@/lib/utils';
import { LIFECYCLES, OPEN_DEAL_LIFECYCLES, type Company, type Lifecycle } from '@/types/crm';

/** Columns on the board; "Sourced" is the backlog and lives in Companies. */
const BOARD: Lifecycle[] = ['qualified', 'contacting', 'talking', 'meeting', 'proposal', 'pilot', 'customer'];
const EXITS = LIFECYCLES.filter((stage) => stage.exit);
const label = (lifecycle: Lifecycle) => LIFECYCLES.find((stage) => stage.id === lifecycle)?.label ?? lifecycle;

function CompanyCard({ company, people, openTasks }: { company: Company; people: string[]; openTasks: number }) {
  const days = getCompanyDaysSinceTouch(company);
  const cold = OPEN_DEAL_LIFECYCLES.includes(company.lifecycle) && openTasks === 0 && days !== null && days >= COLD_AFTER_DAYS;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm hover:shadow-md transition-shadow">
      <p className="font-medium text-sm truncate">{company.name}</p>
      <p className="text-xs text-muted-foreground truncate">
        {[people[0], company.city].filter(Boolean).join(' · ') || company.industry || '—'}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className={cn(cold ? 'text-amber-600 dark:text-amber-300' : 'text-muted-foreground')}>
          {company.lastActivityAt ? formatDistanceToNow(new Date(company.lastActivityAt), { addSuffix: true }) : 'No activity'}
        </span>
        {openTasks > 0 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {openTasks} task{openTasks === 1 ? '' : 's'}
          </Badge>
        )}
      </div>
    </div>
  );
}

function DraggableCompany({ id, onClick, children }: { id: string; onClick: () => void; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      {...listeners}
      {...attributes}
      className={cn('touch-none cursor-grab', isDragging && 'opacity-40')}
      onClick={() => !isDragging && onClick()}
    >
      {children}
    </div>
  );
}

function Column({ lifecycle, count, children, compact }: { lifecycle: Lifecycle; count: number; children?: React.ReactNode; compact?: boolean }) {
  const { isOver, setNodeRef } = useDroppable({ id: lifecycle });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg p-3 transition-colors border',
        compact ? 'bg-muted/20 border-dashed' : 'w-60 flex-shrink-0 bg-muted/30 border-transparent',
        isOver && 'bg-primary/10 ring-2 ring-primary ring-inset',
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', LIFECYCLE_STYLES[lifecycle])}>
          {label(lifecycle)}
        </span>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      {children}
    </div>
  );
}

export default function Pipeline() {
  const navigate = useNavigate();
  const { companies, contacts, tasks, moveCompanyToLifecycle } = useCRMContext();
  const [active, setActive] = useState<Company | null>(null);
  const isMobile = useMediaQuery('(max-width: 639px)');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const peopleByCompany = useMemo(() => {
    const map = new Map<string, string[]>();
    contacts.forEach((contact) => {
      if (contact.companyId) map.set(contact.companyId, [...(map.get(contact.companyId) ?? []), contact.fullName]);
    });
    return map;
  }, [contacts]);

  const openTasksByCompany = useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((task) => {
      if (!task.completed && task.companyId) map.set(task.companyId, (map.get(task.companyId) ?? 0) + 1);
    });
    return map;
  }, [tasks]);

  const byStage = useMemo(() => {
    const map = new Map<Lifecycle, Company[]>();
    companies.forEach((company) => map.set(company.lifecycle, [...(map.get(company.lifecycle) ?? []), company]));
    map.forEach((list) =>
      list.sort((a, b) => (b.lastActivityAt ?? b.createdAt).localeCompare(a.lastActivityAt ?? a.createdAt)),
    );
    return map;
  }, [companies]);

  const sourcedCount = byStage.get('sourced')?.length ?? 0;

  const card = (company: Company) => (
    <CompanyCard
      company={company}
      people={peopleByCompany.get(company.id) ?? []}
      openTasks={openTasksByCompany.get(company.id) ?? 0}
    />
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActive(companies.find((company) => company.id === event.active.id) ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActive(null);
    const target = event.over?.id as Lifecycle | undefined;
    const company = companies.find((item) => item.id === event.active.id);
    if (company && target && LIFECYCLES.some((stage) => stage.id === target) && company.lifecycle !== target) {
      moveCompanyToLifecycle(company.id, target);
    }
  };

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Drag a company to move it.{' '}
          {sourcedCount > 0 && (
            <Link to="/companies?stage=sourced" className="underline underline-offset-2 hover:text-foreground">
              {sourcedCount} sourced in the backlog
            </Link>
          )}
        </p>
      </div>
      <AddCompanyDialog />
    </div>
  );

  if (isMobile) {
    return (
      <div className="p-4">
        {header}
        <Accordion type="multiple" defaultValue={['talking', 'meeting', 'proposal', 'pilot']}>
          {[...BOARD, ...EXITS.map((stage) => stage.id)].map((lifecycle) => {
            const list = byStage.get(lifecycle) ?? [];
            return (
              <AccordionItem key={lifecycle} value={lifecycle}>
                <AccordionTrigger className="py-3">
                  <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', LIFECYCLE_STYLES[lifecycle])}>
                    {label(lifecycle)}
                  </span>
                  <span className="ml-auto mr-2 text-xs text-muted-foreground">{list.length}</span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2">
                  {list.map((company) => (
                    <div key={company.id} className="flex items-center gap-2">
                      <button className="flex-1 min-w-0 text-left" onClick={() => navigate(`/companies/${company.id}`)}>
                        {card(company)}
                      </button>
                      <Select value={company.lifecycle} onValueChange={(value) => moveCompanyToLifecycle(company.id, value as Lifecycle)}>
                        <SelectTrigger className="w-24 h-8 text-xs">
                          <SelectValue placeholder="Move" />
                        </SelectTrigger>
                        <SelectContent>
                          {LIFECYCLES.map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  {list.length === 0 && <p className="text-xs text-muted-foreground py-2">Empty</p>}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {header}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <ScrollArea className="w-full whitespace-nowrap pb-4">
          <div className="flex gap-3 items-start">
            {BOARD.map((lifecycle) => {
              const list = byStage.get(lifecycle) ?? [];
              return (
                <Column key={lifecycle} lifecycle={lifecycle} count={list.length}>
                  <div className="space-y-2 whitespace-normal max-h-[calc(100vh-18rem)] overflow-y-auto pr-1">
                    {list.map((company) => (
                      <DraggableCompany key={company.id} id={company.id} onClick={() => navigate(`/companies/${company.id}`)}>
                        {card(company)}
                      </DraggableCompany>
                    ))}
                    {list.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Drop here</p>}
                  </div>
                </Column>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <div className="grid grid-cols-3 gap-3 mt-4 max-w-3xl">
          {EXITS.map((stage) => (
            <Column key={stage.id} lifecycle={stage.id} count={byStage.get(stage.id)?.length ?? 0} compact>
              <Link
                to={`/companies?stage=${stage.id}`}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                View all
              </Link>
            </Column>
          ))}
        </div>
        <DragOverlay>{active ? <div className="w-56">{card(active)}</div> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
