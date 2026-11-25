import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { eoRecordApi } from "../api/eoRecords";
import { eoKeys } from "./useEoRecords";

/**
 * One page of a record's audit trail.
 *
 * THE SAME PAGING THE CHILDREN TAB USES, deliberately: GET
 * /eo-records/:id/history is served by the handler's shared clamp and the
 * shared paginated response, so it has the register's default, the register's
 * maximum of 100 and the register's `total_items`/`total_pages` envelope.
 * Reusing the size keeps one convention on one page instead of two.
 *
 * The server orders the rows NEWEST FIRST with a stable tiebreak — a create
 * writes several rows in one transaction, sharing a timestamp to the
 * microsecond — so nothing here sorts them. A client-side sort would undo the
 * tiebreak, and under paging that makes rows vanish between pages.
 *
 * keepPreviousData so paging does not blank the list between pages, exactly
 * as useEoChildren does.
 */
export const EO_HISTORY_PAGE_SIZE = 20;

export function useEoHistory(id: string, page = 1) {
  return useQuery({
    queryKey: eoKeys.history(id, page),
    queryFn: () =>
      eoRecordApi.getHistory(id, { page, limit: EO_HISTORY_PAGE_SIZE }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}
