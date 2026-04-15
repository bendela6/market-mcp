import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function usePlan(idOrSlug: string) {
  return useQuery({
    queryKey: ['plans', 'get', idOrSlug],
    queryFn: () => api.getPlan(idOrSlug),
    enabled: idOrSlug.length > 0,
  });
}
