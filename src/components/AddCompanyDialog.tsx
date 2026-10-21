import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useCRMContext } from '@/contexts/CRMContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COMPANY_TYPES, LIFECYCLES, type CompanyType, type Lifecycle } from '@/types/crm';

type AddCompanyDialogProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Render without its own trigger button (opened from elsewhere). */
  triggerless?: boolean;
  /** Pre-fill the list tag, e.g. when adding from a filtered list. */
  defaultList?: string;
};

const EMPTY = {
  name: '',
  type: 'venue' as CompanyType,
  city: '',
  website: '',
  phone: '',
  lifecycle: 'qualified' as Lifecycle,
  personName: '',
  personRole: '',
  personEmail: '',
};

export function AddCompanyDialog({ open, onOpenChange, triggerless, defaultList }: AddCompanyDialogProps) {
  const { addCompany, addPerson } = useCRMContext();
  const navigate = useNavigate();
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [form, setForm] = useState(EMPTY);

  const update = (changes: Partial<typeof EMPTY>) => setForm((current) => ({ ...current, ...changes }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    const company = addCompany({
      name: form.name.trim(),
      type: form.type,
      city: form.city.trim(),
      website: form.website.trim(),
      phone: form.phone.trim(),
      lifecycle: form.lifecycle,
      lists: defaultList ? [defaultList] : [],
    });
    if (form.personName.trim()) {
      addPerson(company.id, {
        fullName: form.personName.trim(),
        role: form.personRole.trim(),
        email: form.personEmail.trim(),
      });
    }
    setForm(EMPTY);
    setOpen(false);
    navigate(`/companies/${company.id}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {!triggerless && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add company
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add company</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="company-name">Name *</Label>
            <Input
              id="company-name"
              autoFocus
              value={form.name}
              placeholder="e.g. Entkorkte Kunst"
              onChange={(event) => update({ name: event.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(value) => update({ type: value as CompanyType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_TYPES.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Stage</Label>
              <Select value={form.lifecycle} onValueChange={(value) => update({ lifecycle: value as Lifecycle })}>
                <SelectTrigger>
                  <SelectValue />
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
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="company-city">City</Label>
              <Input id="company-city" value={form.city} onChange={(event) => update({ city: event.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="company-phone">Phone</Label>
              <Input id="company-phone" value={form.phone} onChange={(event) => update({ phone: event.target.value })} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="company-website">Website</Label>
            <Input
              id="company-website"
              value={form.website}
              placeholder="https://"
              onChange={(event) => update({ website: event.target.value })}
            />
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-sm font-medium">Person (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Name"
                value={form.personName}
                onChange={(event) => update({ personName: event.target.value })}
              />
              <Input
                placeholder="Role"
                value={form.personRole}
                onChange={(event) => update({ personRole: event.target.value })}
              />
            </div>
            <Input
              type="email"
              placeholder="Email"
              value={form.personEmail}
              onChange={(event) => update({ personEmail: event.target.value })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!form.name.trim()}>
              Add company
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
