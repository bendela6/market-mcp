import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  Input, Label, RadioGroup, RadioGroupItem, Select, SelectContent,
  SelectItem, SelectTrigger, SelectValue,
} from '@market/ui';
import type { CreatePlanBody, PlanStrategy, PlanType } from '@market/contracts';
import { useCreatePlan } from '../../hooks/use-plan-mutations.js';

export function PlanCreateDialog() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<PlanType>('mixed');
  const [strategy, setStrategy] = useState<PlanStrategy>('both');
  const create = useCreatePlan();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const body: CreatePlanBody = { name: name.trim(), type, strategy, includeOffline: false };
    const plan = await create.mutateAsync(body);
    setOpen(false);
    setName('');
    void nav({ to: '/plans/$id', params: { id: plan.id } });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New plan</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create a plan</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan-name">Name</Label>
            <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <RadioGroup value={type} onValueChange={(v) => setType(v as PlanType)}>
              {(['mixed', 'item-based', 'query-based'] as const).map((t) => (
                <div key={t} className="flex items-center space-x-2">
                  <RadioGroupItem value={t} id={`type-${t}`} />
                  <Label htmlFor={`type-${t}`}>{t}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Strategy</Label>
            <Select value={strategy} onValueChange={(v) => setStrategy(v as PlanStrategy)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cheapest-per-item">Cheapest per item</SelectItem>
                <SelectItem value="single-store">Single store</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>Create</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
