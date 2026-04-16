import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function usePlan(id: string) {
  return useQuery({
    queryKey: ['plans', 'get', id],
    queryFn: () => api.getPlan(id),
    enabled: id.length > 0,
  });
}
