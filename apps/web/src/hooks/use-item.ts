import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function useItem(idOrSlug: string) {
  return useQuery({
    queryKey: ['items', 'get', idOrSlug],
    queryFn: () => api.getItem(idOrSlug),
    enabled: idOrSlug.length > 0,
  });
}
