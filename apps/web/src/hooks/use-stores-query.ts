import { useQuery } from '@tanstack/react-query';
import type { StoreQueryBody } from '@market/contracts';
import { api } from '../api-client.js';

export function useStoresQuery(body: StoreQueryBody) {
  return useQuery({
    queryKey: ['stores', 'query', body],
    queryFn: () => api.queryStores(body),
  });
}
