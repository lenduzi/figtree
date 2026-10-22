import { useEffect, useState } from 'react';
import { BookmarkPlus, Loader2, Undo2, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  answerRewriteDefault,
  BUILT_IN_REWRITES,
  customPresetKey,
  getCustomRewrites,
  labelFor,
  rewriteEmail,
  saveCustomRewrites,
  type RewritePreset,
} from '@/lib/rewrites';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

type EmailRewriteBarProps = {
  subject: string;
  body: string;
  /** Drafting or sending is in progress. */
  disabled?: boolean;
  onRewritingChange: (rewriting: boolean) => void;
  /** Replace the text with the rewrite; `label` names the change. */
  onApply: (result: { subject: string; body: string }, label: string) => void;
  canUndo: boolean;
  onUndo: () => void;
};

/** One-click rewrites of the current email (shorter, warmer, ...), plus your own saved ones. */
export function EmailRewriteBar({ subject, body, disabled, onRewritingChange, onApply, canUndo, onUndo }: EmailRewriteBarProps) {
  const [custom, setCustom] = useState<RewritePreset[]>([]);
  const [instruction, setInstruction] = useState('');
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<RewritePreset | null>(null);

  useEffect(() => {
    getCustomRewrites().then(setCustom).catch(() => undefined);
  }, []);

  const busy = disabled || runningKey !== null;
  const hasText = body.trim() !== '';

  const run = async (preset: RewritePreset) => {
    if (busy || !hasText) return;
    setRunningKey(preset.key);
    onRewritingChange(true);
    try {
      const result = await rewriteEmail({ subject, body, instruction: preset.instruction, key: preset.key });
      onApply(result, preset.label);
      if (result.suggestDefault && preset.rule) setSuggestion(preset);
    } catch (error) {
      toast.error('Rewrite failed', { description: errorMessage(error) });
    } finally {
      setRunningKey(null);
      onRewritingChange(false);
    }
  };

  const runCustom = async () => {
    const text = instruction.trim();
    if (!text) return;
    const saved = custom.find((preset) => preset.key === customPresetKey(text));
    await run(saved ?? { key: customPresetKey(text), label: labelFor(text), instruction: text, rule: text, custom: true });
  };

  const saveButton = async () => {
    const text = instruction.trim();
    if (!text || custom.some((preset) => preset.key === customPresetKey(text))) return;
    const next = [...custom, { key: customPresetKey(text), label: labelFor(text), instruction: text, rule: text, custom: true }];
    try {
      await saveCustomRewrites(next);
      setCustom(next);
      setInstruction('');
      toast('Saved as a button', { description: labelFor(text) });
    } catch (error) {
      toast.error('Could not save', { description: errorMessage(error) });
    }
  };

  const removeButton = async (key: string) => {
    const next = custom.filter((preset) => preset.key !== key);
    try {
      await saveCustomRewrites(next);
      setCustom(next);
    } catch (error) {
      toast.error('Could not remove', { description: errorMessage(error) });
    }
  };

  const answer = async (accept: boolean) => {
    const preset = suggestion;
    setSuggestion(null);
    if (!preset) return;
    try {
      await answerRewriteDefault(preset, accept);
      if (accept) toast('Added to your Brain', { description: 'First drafts follow it from now on (Voice & style).' });
    } catch (error) {
      toast.error('Could not save that', { description: errorMessage(error) });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1">
          <Wand2 className="h-3 w-3" /> Rewrite
        </span>
        {[...BUILT_IN_REWRITES, ...custom].map((preset) => (
          <span key={preset.key} className="group relative">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-3 text-xs"
              disabled={busy || !hasText}
              title={preset.instruction}
              onClick={() => run(preset)}
            >
              {runningKey === preset.key && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {preset.label}
            </Button>
            {preset.custom && !busy && (
              <button
                type="button"
                aria-label={`Remove ${preset.label}`}
                className="absolute -right-1 -top-1 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
                onClick={() => removeButton(preset.key)}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        ))}
        {canUndo && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={onUndo}>
            <Undo2 className="h-3 w-3 mr-1" />
            Undo
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Or describe a change, e.g. mention our Munich pilot, drop the second paragraph"
          value={instruction}
          className="h-8 text-sm"
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              runCustom();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          disabled={busy || !hasText || !instruction.trim()}
          onClick={runCustom}
        >
          {instruction.trim() && runningKey === customPresetKey(instruction) && (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          )}
          Rewrite
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          disabled={!instruction.trim() || custom.some((preset) => preset.key === customPresetKey(instruction))}
          title="Save as a button"
          aria-label="Save as a button"
          onClick={saveButton}
        >
          <BookmarkPlus className="h-4 w-4" />
        </Button>
      </div>

      {suggestion && (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>
            You often use “{suggestion.label}”. Write first drafts this way from now on?
          </span>
          <span className="flex gap-2 shrink-0">
            <Button type="button" size="sm" className="h-7 text-xs" onClick={() => answer(true)}>
              Yes, make it default
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => answer(false)}>
              No thanks
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
