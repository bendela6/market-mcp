import { useQuery } from '@tanstack/react-query';
import type { ItemQueryBody } from '@market/contracts';
import { api } from '../api-client.js';

export function useItemsQuery(body: ItemQueryBody) {
  return useQuery({
    queryKey: ['items', 'query', body],
    queryFn: () => api.queryItems(body),
  });
}
