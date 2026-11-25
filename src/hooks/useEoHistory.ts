import { useQuery } from "@tanstack/react-query";
import { eoRecordApi } from "../api/eoRecords";
import { eoKeys } from "./useEoRecords";
import type { EoRecordHistoryResponse } from "../types/eoRecord";

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
 */
export const EO_HISTORY_PAGE_SIZE = 20;

/**
 * Previous data is kept ONLY WHILE IT BELONGS TO THE SAME RECORD.
 *
 * `keepPreviousData` is per-OBSERVER, not per-key: it hands back whatever this
 * hook last held, including the previous RECORD's rows when the id changes
 * under a mounted page. The detail route is reused between records (React
 * Router renders the same element with no `key`, so a child link navigates
 * without remounting), which meant one record's audit rows — and its total, on
 * the tab's badge — rendered under another record's header for the length of a
 * round trip, unmarked. A misattributed child list is untidy; a misattributed
 * AUDIT ROW is a statutory register saying something untrue about a record.
 *
 * The rows carry `record_id`, so the question is answerable from the data
 * itself rather than from a remembered id: same record, keep the placeholder
 * (paging still does not blank the list); different record, or a previous page
 * too empty to tell, drop it and let the spinner say the read is in flight.
 */
const samePlaceholder =
  (id: string) => (previous: EoRecordHistoryResponse | undefined) =>
    previous && previous.data[0]?.record_id === id ? previous : undefined;

export function useEoHistory(id: string, page = 1) {
  return useQuery({
    queryKey: eoKeys.history(id, page),
    queryFn: () =>
      eoRecordApi.getHistory(id, { page, limit: EO_HISTORY_PAGE_SIZE }),
    enabled: !!id,
    placeholderData: samePlaceholder(id),
  });
}
