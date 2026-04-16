import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  AddPlanLineBody, ComputePlanResponse, CreatePlanBody, Plan,
  UpdatePlanBody, UpdatePlanLineBody,
} from '@market/contracts';
import { api } from '../api-client.js';

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePlanBody) => api.createPlan(body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'query'] }); },
  });
}

export function useUpdatePlan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlanBody) => api.updatePlan(id, body),
    onSuccess: (_plan: Plan) => {
      void qc.invalidateQueries({ queryKey: ['plans', 'get', id] });
      void qc.invalidateQueries({ queryKey: ['plans', 'query'] });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePlan(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'query'] }); },
  });
}

export function useAddPlanLine(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddPlanLineBody) => api.addPlanLine(id, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'get', id] }); },
  });
}

export function useUpdatePlanLine(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, body }: { lineId: string; body: UpdatePlanLineBody }) =>
      api.updatePlanLine(id, lineId, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'get', id] }); },
  });
}

export function useRemovePlanLine(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => api.removePlanLine(id, lineId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'get', id] }); },
  });
}

export function useComputePlan(id: string) {
  return useMutation<ComputePlanResponse>({
    mutationFn: () => api.computePlan(id),
  });
}
