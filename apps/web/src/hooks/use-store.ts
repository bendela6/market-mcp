import { useQuery } from '@tanstack/react-query';
import { api } from '../api-client.js';

export function useStore(id: string) {
  return useQuery({
    queryKey: ['stores', 'get', id],
    queryFn: () => api.getStore(id),
    enabled: id.length > 0,
  });
}
