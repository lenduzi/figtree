import { useState } from 'react';
import { GripVertical, Edit2, Check, X } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function Settings() {
  const { stages, updateStage, reorderStages } = useCRMContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const sortedStages = [...stages].sort((a, b) => a.order - b.order);

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditValue(name);
  };

  const handleSaveEdit = () => {
    if (editingId && editValue.trim()) {
      updateStage(editingId, { name: editValue.trim() });
    }
    setEditingId(null);
    setEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const moveStage = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sortedStages.length) return;

    const newStages = [...sortedStages];
    [newStages[index], newStages[newIndex]] = [newStages[newIndex], newStages[index]];
    reorderStages(newStages);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Customize your CRM</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline Stages</CardTitle>
          <CardDescription>
            Rename and reorder your pipeline stages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {sortedStages.map((stage, index) => (
              <div
                key={stage.id}
                className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg"
              >
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => moveStage(index, 'up')}
                    disabled={index === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveStage(index, 'down')}
                    disabled={index === sortedStages.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                
                <div
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ backgroundColor: stage.color }}
                />

                {editingId === stage.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-8"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                    />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveEdit}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCancelEdit}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 font-medium">{stage.name}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => handleStartEdit(stage.id, stage.name)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>About SimpleCRM</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>A lightweight personal CRM to manage contacts, track client stages, and never forget follow-ups.</p>
          <p className="mt-2">All data is stored locally in your browser.</p>
        </CardContent>
      </Card>
    </div>
  );
}
