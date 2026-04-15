import { useQuery } from '@tanstack/react-query';
import type { PlanQueryBody } from '@market/contracts';
import { api } from '../api-client.js';

export function usePlansQuery(body: PlanQueryBody) {
  return useQuery({
    queryKey: ['plans', 'query', body],
    queryFn: () => api.queryPlans(body),
  });
}
