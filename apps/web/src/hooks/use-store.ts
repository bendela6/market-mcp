import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function useStore(idOrSlug: string) {
  return useQuery({
    queryKey: ['stores', 'get', idOrSlug],
    queryFn: () => api.getStore(idOrSlug),
    enabled: idOrSlug.length > 0,
  });
}
