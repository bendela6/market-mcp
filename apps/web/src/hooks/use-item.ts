import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function useItem(id: string) {
  return useQuery({
    queryKey: ['items', 'get', id],
    queryFn: () => api.getItem(id),
    enabled: id.length > 0,
  });
}
