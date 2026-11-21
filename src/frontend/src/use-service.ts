import { useQuery } from '@tanstack/react-query';
import { service } from './api';
export function useService<T>(name: string, input: Record<string, unknown> = {}, enabled = true) {
  return useQuery({ queryKey: [name, input], queryFn: ({ signal }) => service<T>(name, input, signal), enabled });
}
