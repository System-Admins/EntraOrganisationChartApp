import type { ContactDestinations } from '@/application/abstractions/contactLauncher';
import { GetContactDestinationsQuery } from '@/application/features/contact/getContactDestinations';
import { useQuery } from '../../shared/useQuery';

const QUERY = new GetContactDestinationsQuery();

/** Undefined until the host has answered. */
export function useContactDestinations(): ContactDestinations | undefined {
  return useQuery(QUERY).data;
}
