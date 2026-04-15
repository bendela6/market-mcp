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

export function useUpdatePlan(idOrSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePlanBody) => api.updatePlan(idOrSlug, body),
    onSuccess: (plan: Plan) => {
      void qc.invalidateQueries({ queryKey: ['plans', 'get', idOrSlug] });
      void qc.invalidateQueries({ queryKey: ['plans', 'get', plan.slug] });
      void qc.invalidateQueries({ queryKey: ['plans', 'query'] });
    },
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idOrSlug: string) => api.deletePlan(idOrSlug),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'query'] }); },
  });
}

export function useAddPlanLine(idOrSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AddPlanLineBody) => api.addPlanLine(idOrSlug, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'get', idOrSlug] }); },
  });
}

export function useUpdatePlanLine(idOrSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, body }: { lineId: string; body: UpdatePlanLineBody }) =>
      api.updatePlanLine(idOrSlug, lineId, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'get', idOrSlug] }); },
  });
}

export function useRemovePlanLine(idOrSlug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => api.removePlanLine(idOrSlug, lineId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['plans', 'get', idOrSlug] }); },
  });
}

export function useComputePlan(idOrSlug: string) {
  return useMutation<ComputePlanResponse>({
    mutationFn: () => api.computePlan(idOrSlug),
  });
}
