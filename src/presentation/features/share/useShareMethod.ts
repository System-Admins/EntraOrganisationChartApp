import type { ShareMethod } from '@/application/abstractions/employeeSharing';
import { GetShareMethodQuery } from '@/application/features/share/getShareMethod';
import { useQuery } from '../../shared/useQuery';

const QUERY = new GetShareMethodQuery();

/** Undefined until the host has answered. */
export function useShareMethod(): ShareMethod | undefined {
  return useQuery(QUERY).data;
}
