import { cn } from '@/lib/utils';
import { lifecycleLabel, type Lifecycle } from '@/types/crm';

export const LIFECYCLE_STYLES: Record<Lifecycle, string> = {
  sourced: 'bg-muted text-muted-foreground border-border',
  qualified: 'bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300',
  contacting: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-300',
  talking: 'bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300',
  meeting: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300',
  proposal: 'bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-300',
  pilot: 'bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-300',
  customer: 'bg-green-600/10 text-green-700 border-green-600/30 dark:text-green-300',
  not_now: 'bg-slate-500/10 text-slate-600 border-slate-500/30 dark:text-slate-300',
  lost: 'bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300',
  disqualified: 'bg-muted text-muted-foreground/70 border-border line-through',
};

export function LifecycleBadge({ lifecycle, className }: { lifecycle: Lifecycle; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        LIFECYCLE_STYLES[lifecycle],
        className,
      )}
    >
      {lifecycleLabel(lifecycle)}
    </span>
  );
}
