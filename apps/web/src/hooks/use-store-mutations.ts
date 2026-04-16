import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RefreshAssortmentResponse } from '@market/contracts';
import { api } from '../api-client.js';

export function useRefreshStoreAssortment(id: string) {
  const qc = useQueryClient();
  return useMutation<RefreshAssortmentResponse>({
    mutationFn: () => api.refreshStoreAssortment(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stores', 'get', id] });
    },
  });
}
