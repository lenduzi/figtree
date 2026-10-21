import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useCRMContext } from '@/contexts/CRMContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { enrichNow } from '@/lib/research';
import type { Company } from '@/types/crm';

export function CompanyResearchCard({ company }: { company: Company }) {
  const { refreshData } = useCRMContext();
  const [running, setRunning] = useState(false);

  const handleResearch = async () => {
    setRunning(true);
    try {
      const result = await enrichNow(company.id);
      await refreshData();
      toast(`Research done: fit ${result.fit}`, {
        description: result.people_added ? `${result.people_added} new people added.` : result.fit_reason,
      });
    } catch (error) {
      toast.error('Research failed', { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Research
        </CardTitle>
        <Button size="sm" variant="outline" onClick={handleResearch} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {running ? 'Researching… (~1 min)' : company.enrichedAt ? 'Refresh' : 'Research with AI'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {company.fitReason && (
          <p className="text-sm">
            <span className="font-medium">Fit {company.fit ?? '–'}:</span> {company.fitReason}
          </p>
        )}
        {company.research ? (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{company.research}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Claude looks them up on the web: contact details, decision-makers, social presence, fit against your
            target customers, and the best angle for a first message. Roughly 10–25 cents per company.
          </p>
        )}
        {company.enrichedAt && (
          <p className="text-xs text-muted-foreground">
            Researched {formatDistanceToNow(new Date(company.enrichedAt), { addSuffix: true })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
