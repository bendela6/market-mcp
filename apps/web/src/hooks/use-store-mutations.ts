import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RefreshAssortmentResponse } from '@market/contracts';
import { api } from '../api-client.js';

export function useRefreshStoreAssortment(idOrSlug: string) {
  const qc = useQueryClient();
  return useMutation<RefreshAssortmentResponse>({
    mutationFn: () => api.refreshStoreAssortment(idOrSlug),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stores', 'get', idOrSlug] });
    },
  });
}
