import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { StoreMapQueryBody } from '@market/contracts';
import { api } from '../api-client.js';

export function useStoresMapQuery(body: StoreMapQueryBody) {
  return useQuery({
    queryKey: ['stores-map', body],
    queryFn: () => api.queryStoresMap(body),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}
