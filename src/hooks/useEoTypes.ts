import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { eoTypeApi, eoTypeFieldApi } from "../api/eoTypes";
import { eoRecordApi, eoRecordTypeApi } from "../api/eoRecords";
import { eoRefusalMessage } from "../lib/eoFields";
import { eoKeys } from "./useEoRecords";
import usePermissions from "./usePermissions";
import type {
  EoDestructiveConfirmation,
  EoFieldDefinition,
  EoFieldDefRequest,
  EoRecordType,
  EoRecordTypeRequest,
} from "../types/eoRecord";

// ──────────────────────────────────────────────────
// Query Keys
// ──────────────────────────────────────────────────

/**
 * The designer's key factory, in the house shape (see goalKeys,
 * hooks/useGoals.ts).
 *
 * It is a SECOND namespace over the same catalogue the record module caches
 * under `eoKeys.types()`, because the two want different things of it: the
 * record module reads it on every EO screen and wants it long-lived, while
 * the designer writes it and must see its own writes at once. Keeping them
 * apart is only safe because every mutation below invalidates BOTH — see
 * invalidateCatalogue. A write that refreshed only this namespace would put
 * a type in the designer's list that the EO sidebar and the register could
 * not see until a hard reload, which is precisely the restart that Plan 3's
 * Task A3 removed at the API.
 */
export const eoTypeKeys = {
  all: ["eo-types"] as const,
  lists: () => [...eoTypeKeys.all, "list"] as const,
  list: () => [...eoTypeKeys.lists()] as const,
  details: () => [...eoTypeKeys.all, "detail"] as const,
  detail: (id: string) => [...eoTypeKeys.details(), id] as const,
  recordCounts: () => [...eoTypeKeys.all, "record-count"] as const,
  recordCount: (typeId: string) =>
    [...eoTypeKeys.recordCounts(), typeId] as const,
};

/**
 * Short enough that an administrator who adds a type sees it, long enough
 * that moving between the list and the designer does not re-fetch. The same
 * reasoning as EO_CATALOGUE_STALE_MS in useEoRecords.ts, one notch tighter
 * because this is the screen that does the writing.
 */
const DESIGNER_STALE_MS = 60 * 1000;

// ──────────────────────────────────────────────────
// Reads
// ──────────────────────────────────────────────────

export function useEoTypeList() {
  return useQuery({
    queryKey: eoTypeKeys.list(),
    queryFn: () => eoTypeApi.list(),
    staleTime: DESIGNER_STALE_MS,
  });
}

/** One type with its OWN field definitions. `enabled` on the id, as house. */
export function useEoType(id?: string) {
  return useQuery({
    queryKey: eoTypeKeys.detail(id ?? ""),
    queryFn: () => eoTypeApi.getById(id as string),
    enabled: !!id,
    staleTime: DESIGNER_STALE_MS,
  });
}

// ──────────────────────────────────────────────────
// The type tree
// ──────────────────────────────────────────────────

/**
 * `rootId` and every type beneath it, by `parent_type_id`.
 *
 * Mirrors repository.EORecordTypeRepository.DescendantIDs, which is what the
 * server's own guard rails ask. It carries that function's two safety rails
 * as well: a visited set, so a cycle in the stored parent links terminates
 * rather than hanging the screen, and a depth bound.
 */
export function eoDescendantIds(
  rootId: string,
  types: EoRecordType[],
): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const t of types) {
    if (!t.parent_type_id) continue;
    const siblings = childrenOf.get(t.parent_type_id) ?? [];
    siblings.push(t.id);
    childrenOf.set(t.parent_type_id, siblings);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const queue = [rootId];
  // Matches eoMaxTypeDepth's intent server-side: a bound, not a limit anyone
  // is expected to reach.
  let guard = 0;
  while (queue.length > 0 && guard++ < 1024) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const child of childrenOf.get(id) ?? []) queue.push(child);
  }
  return out;
}

/**
 * How many records each record type holds — ITS OWN AND EVERY TYPE'S BENEATH
 * IT, which is the only reading that answers the question the designer asks.
 *
 * WHY IT IS COMPUTED HERE. There is no endpoint that reports it. The server
 * works it out in handlers.eoTypeHasRecords (DescendantIDs, then a count over
 * the subtree with IsAdmin) and keeps the answer to itself: neither the list
 * nor the by-id read carries a `has_records` or a record count, so the client
 * has to ask the register the same question. Verified against the live
 * server: GET /eo-records accepts a repeated `record_type_id` and answers
 * with `total_items`, and the twelve seeded types summed to the register's
 * own 48.
 *
 * WHY IT ASKS PER CONCRETE TYPE AND SUMS, rather than once per type over its
 * subtree: a subtree query per type is twelve overlapping queries for the
 * same rows, and it would still need the concrete breakdown to show a count
 * per row. One query per concrete type is the smaller set and the roll-up is
 * exact.
 *
 * WHY AN ABSTRACT TYPE CANNOT BE ASKED DIRECTLY. `record_type_id=<eo_base>`
 * returns 0 — an abstract type holds no records of its own BY DEFINITION —
 * while its descendants held all 48. Reading that 0 as "safe to edit" is the
 * exact mistake the server's own comment calls out, and it would void every
 * §7.14 guard rail on precisely the types the rules matter most on.
 *
 * ⚠ THE COUNT IS ADVISORY, NOT AUTHORITATIVE. The server counts with
 * `IsAdmin: true`; this one is the caller's own register view, which
 * repository.applyEORecordVisibility and applyEORecordTypePermissions narrow
 * for anyone who is not a super admin. A designer who holds `eo:types:manage`
 * but no per-type view codes sees 0 where the server sees records, so a
 * reading of 0 may NOT be used to permit a destructive edit — only the
 * server's refusal decides that (Task F5).
 *
 * THE TWO WAYS A COUNT CAN BE WRONG ARE DIFFERENT THINGS, and are reported
 * separately because only one of them is reachable in the case the warning
 * above is about:
 *
 *  - `isNarrowed` — the caller is not a super admin, so the register answered
 *    about THEIR view. The three list routes carry NO per-type middleware
 *    (backend eo_record_handler.go RegisterRoutes: "a 403 is the wrong answer
 *    for a register: they are filtered instead"), so a restricted designer
 *    gets 200 and `total_items: 0`, not an error. Deriving the warning from a
 *    failed query therefore could never fire for the very caller it names —
 *    they would open an abstract type in the destructive-edit flow, see no
 *    warning at all, and confirm believing nothing sits beneath it. The
 *    condition is "who is asking", not "did a query fail".
 *  - `isUnreadable` — a count query actually failed, so the count is not
 *    understated but MISSING, and `recordCount` returns undefined for the
 *    types it covered.
 */
export function useEoTypeRecordCounts(types: EoRecordType[]) {
  const { isSuperAdmin } = usePermissions();
  const concrete = useMemo(() => types.filter((t) => !t.is_abstract), [types]);

  const results = useQueries({
    queries: concrete.map((t) => ({
      queryKey: eoTypeKeys.recordCount(t.id),
      queryFn: () =>
        eoRecordApi.list({ record_type_id: [t.id], page: 1, limit: 1 }),
      staleTime: DESIGNER_STALE_MS,
      // No retries. A register failure here is not worth a second round trip
      // across every type at once, and the screen says "could not be read"
      // rather than waiting.
      retry: false,
    })),
  });

  const ownCounts = useMemo(() => {
    const map = new Map<string, number>();
    concrete.forEach((t, i) => {
      const total = results[i]?.data?.total_items;
      if (typeof total === "number") map.set(t.id, total);
    });
    return map;
  }, [concrete, results]);

  /**
   * The register answered about this caller's own view, so every count may be
   * lower than what the server holds. True for everyone but a super admin —
   * no query has to fail for it, and none will.
   */
  const isNarrowed = !isSuperAdmin;
  /** A count query failed, so those types have no count at all. */
  const isUnreadable = results.some((r) => r.isError);

  const recordCount = useCallback(
    (typeId?: string): number | undefined => {
      if (!typeId) return undefined;
      let sum = 0;
      let known = false;
      for (const id of eoDescendantIds(typeId, types)) {
        const own = ownCounts.get(id);
        if (own === undefined) continue;
        known = true;
        sum += own;
      }
      return known ? sum : undefined;
    },
    [ownCounts, types],
  );

  return { recordCount, isNarrowed, isUnreadable };
}

// ──────────────────────────────────────────────────
// Writes
// ──────────────────────────────────────────────────

/**
 * Both catalogue caches, after any write.
 *
 * `eoTypeKeys.all` is this screen's. `eoKeys.all` is the record module's, and
 * it is NOT optional: the EO sidebar, every register and every record form
 * read the type catalogue from `eoKeys.types()`, and the effective-field
 * merge reads `eoKeys.typeFields(id)`. Refreshing only the designer's copy is
 * how a type created without a restart would still look like it needed one.
 */
const useInvalidateCatalogue = () => {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: eoTypeKeys.all });
    queryClient.invalidateQueries({ queryKey: eoKeys.all });
  }, [queryClient]);
};

/**
 * The mutations carry NO onError toast, deliberately and for the reason the
 * record form has the same deviation: a 400 is
 * `{errors:{field: message}, error:"<headline>"}` and the form needs that map
 * to put each message under its own control. The page handles the rejection
 * in its `mutateAsync` catch and toasts the headline there. The DELETE is the
 * exception — it has no per-field surface, so it toasts here.
 */
export function useCreateEoType() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (data: EoRecordTypeRequest) => eoTypeApi.create(data),
    onSuccess: invalidate,
  });
}

export function useUpdateEoType() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: EoRecordTypeRequest }) =>
      eoTypeApi.update(id, data),
    // `invalidate` already covers eoTypeKeys.all, which is a PREFIX of
    // eoTypeKeys.detail(id): a second call naming the detail key invalidates
    // nothing the first did not, and reads as a guarantee the first does not
    // provide.
    onSuccess: invalidate,
  });
}

export function useDeleteEoType() {
  const { t } = useTranslation();
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (id: string) => eoTypeApi.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success(t("eo.types.deleted", "Record type deleted"));
    },
    onError: (error: unknown) => {
      // The 409 names WHY — records, or a type that still calls this one its
      // parent — and that sentence is the whole value of the refusal.
      toast.error(
        eoRefusalMessage(
          error,
          t("eo.types.deleteFailed", "Could not delete that record type"),
        ),
      );
    },
  });
}

/**
 * How many field definitions each type declares ITSELF.
 *
 * Own, not effective: that is what the designer's Fields tab edits and what
 * §7.14 is stated over — an ancestor's field is not this type's to remove.
 * It reuses `eoKeys.typeFields(id)`, the key the record module's
 * effective-field merge already fills, so the list page and every record form
 * share one cache rather than fetching the same definitions twice.
 *
 * A FAILED COUNT IS REPORTED, NOT LEFT PENDING. `fieldCount` returns
 * undefined both while a query is in flight and after it has failed, and the
 * cell that renders it cannot tell the two apart — so a failing
 * /:id/fields left a spinner turning forever, once per type. `fieldCountFailed`
 * is the second half the sibling count hook already had, and `retry: false`
 * stops the wait being three times longer than it needs to be.
 */
export function useEoTypeFieldCounts(types: EoRecordType[]) {
  const results = useQueries({
    queries: types.map((t) => ({
      queryKey: eoKeys.typeFields(t.id),
      queryFn: () => eoRecordTypeApi.listFields(t.id),
      staleTime: DESIGNER_STALE_MS,
      retry: false,
    })),
  });

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    types.forEach((t, i) => {
      // The server normalises nil to [], so an empty array is a real answer
      // of zero and only a non-array is a missing one.
      const defs = results[i]?.data?.data;
      if (Array.isArray(defs)) map.set(t.id, defs.length);
    });
    return map;
  }, [types, results]);

  const failed = useMemo(() => {
    const set = new Set<string>();
    types.forEach((t, i) => {
      if (results[i]?.isError) set.add(t.id);
    });
    return set;
  }, [types, results]);

  return {
    fieldCount: (id: string) => counts.get(id),
    fieldCountFailed: (id: string) => failed.has(id),
  };
}

// ──────────────────────────────────────────────────
// Field definitions
// ──────────────────────────────────────────────────

/**
 * One type's OWN field definitions — what the Fields tab edits.
 *
 * Keyed on `eoKeys.typeFields(id)`, the SAME key the record module's
 * effective-field merge fills, which is the point: a field added in the
 * designer must reach an already-open record form, and it does because both
 * read one cache that every field write invalidates.
 *
 * The by-id type read carries `fields` too, and it is deliberately not used
 * as the tab's source: the designer writes fields one at a time and this is
 * the read that each write invalidates, while the type read also carries the
 * attribute set that Task F3 edits and would be refetched for no reason.
 */
export function useEoTypeOwnFields(typeId?: string) {
  return useQuery({
    queryKey: eoKeys.typeFields(typeId ?? ""),
    queryFn: () => eoRecordTypeApi.listFields(typeId as string),
    enabled: !!typeId,
    staleTime: DESIGNER_STALE_MS,
  });
}

/** A type's ancestor chain, nearest parent first. */
export function eoAncestorTypes(
  typeId: string | undefined,
  types: EoRecordType[],
): EoRecordType[] {
  if (!typeId) return [];
  const byId = new Map(types.map((x) => [x.id, x]));
  const out: EoRecordType[] = [];
  const seen = new Set<string>([typeId]);
  let cur = byId.get(typeId);
  while (cur?.parent_type_id && out.length < 32) {
    const parent: EoRecordType | undefined = byId.get(cur.parent_type_id);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    out.push(parent);
    cur = parent;
  }
  return out;
}

/** One inherited field, with the ancestor that declares it. */
export interface EoInheritedField {
  field: EoFieldDefinition;
  owner: EoRecordType;
}

/**
 * The fields this type INHERITS: every ancestor's own definitions, nearest
 * ancestor last so the list reads base-type-first the way a record form does.
 *
 * THEY HAVE TO BE FETCHED PER ANCESTOR. Neither
 * `GET /admin/eo-record-types/:id` nor `GET /:id/fields` resolves the
 * ancestor chain — both answer about the type's OWN definitions only
 * (handlers.ListFields calls eoOwnFields, and Get sets t.Fields from the same
 * place) — so the merge is the client's to do, as
 * services.ResolveEffectiveFields does it on the server.
 *
 * They are READ-ONLY on this screen and that is not a style choice: the three
 * write routes are scoped to `:id/fields`, so an ancestor's definition is
 * literally not addressable from a descendant's designer. The tab says where
 * each one comes from and links to the type that owns it.
 */
export function useEoTypeInheritedFields(
  typeId: string | undefined,
  types: EoRecordType[],
) {
  const ancestors = useMemo(
    () => eoAncestorTypes(typeId, types),
    [typeId, types],
  );

  const results = useQueries({
    queries: ancestors.map((a) => ({
      queryKey: eoKeys.typeFields(a.id),
      queryFn: () => eoRecordTypeApi.listFields(a.id),
      staleTime: DESIGNER_STALE_MS,
      retry: false,
    })),
  });

  // useQueries hands back a fresh array each render; key the memo off the
  // settle timestamps, as useEoEffectiveFields does.
  const signature = results.map((r) => r.dataUpdatedAt).join(",");
  const fields = useMemo<EoInheritedField[]>(() => {
    const out: EoInheritedField[] = [];
    // `ancestors` is nearest-parent-first; walk it backwards so the ROOT
    // type's fields lead — the same order a record form shows them in.
    for (let at = ancestors.length - 1; at >= 0; at -= 1) {
      const owner = ancestors[at];
      const defs = results[at]?.data?.data ?? [];
      [...defs]
        .sort((a, b) =>
          a.sort_order !== b.sort_order
            ? a.sort_order - b.sort_order
            : a.key.localeCompare(b.key),
        )
        .forEach((field) => out.push({ field, owner }));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ancestors, signature]);

  return {
    fields,
    isLoading: results.some((r) => r.isLoading),
    /** An ancestor's definitions could not be read, so some are MISSING. */
    isUnreadable: results.some((r) => r.isError),
  };
}

// ──────────────────────────────────────────────────
// Field writes
// ──────────────────────────────────────────────────

/**
 * NO `onError` TOAST on any of the three, including the delete.
 *
 * The type delete toasts because it has no form to put a message in. A field
 * write does: a 400 is either the per-attribute map, which belongs under the
 * controls that caused it, or the §7.14 refusal, which is a sentence the
 * operator has to read in full before Task F5 can offer to override it.
 * Flattening either into a toast that disappears after four seconds loses the
 * one thing the refusal was for.
 */
export function useCreateEoField() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({
      typeId,
      data,
    }: {
      typeId: string;
      data: EoFieldDefRequest;
    }) => eoTypeFieldApi.create(typeId, data),
    onSuccess: invalidate,
  });
}

export function useUpdateEoField() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({
      typeId,
      fieldId,
      data,
    }: {
      typeId: string;
      fieldId: string;
      data: EoFieldDefRequest;
    }) => eoTypeFieldApi.update(typeId, fieldId, data),
    onSuccess: invalidate,
  });
}

export function useDeleteEoField() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({
      typeId,
      fieldId,
      confirm,
    }: {
      typeId: string;
      fieldId: string;
      confirm?: EoDestructiveConfirmation;
    }) => eoTypeFieldApi.remove(typeId, fieldId, confirm),
    onSuccess: invalidate,
  });
}
