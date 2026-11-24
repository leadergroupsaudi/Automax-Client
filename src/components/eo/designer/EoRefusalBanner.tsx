import React from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import type { EoServerRefusal } from "../../../lib/eoFields";

/**
 * A refusal the server answered with that is not about any one attribute of
 * the field: the §7.14 guard rail's, or any other 400 that carries a sentence
 * and no per-attribute map.
 *
 * THE SENTENCE IS ALWAYS SHOWN; THE EXPLANATION IS NOT. "This record type
 * holds records, and a confirmation overrides it" is a claim about WHY the
 * server refused, and it is only honest for a refusal that is recognisably
 * the guard rail's. A map-less 400 raised for some other reason — a malformed
 * confirmation, which is precisely what Task F5 will start sending — would
 * otherwise have been rendered under that claim, with the toast that would
 * have said otherwise suppressed behind the same test.
 *
 * It is one component rather than two copies because the editor and the
 * removal dialog must not drift: F5 attaches its confirmation to this, in one
 * place, for both.
 */
export const EoRefusalBanner: React.FC<{
  refusal: EoServerRefusal;
  testId: string;
}> = ({ refusal, testId }) => {
  const { t } = useTranslation();
  return (
    <div
      data-testid={testId}
      data-destructive={refusal.destructive ? "true" : "false"}
      className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div>
          <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {t("eo.types.field.refusedTitle", "The server refused this change")}
          </h4>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            {refusal.message}
          </p>
          {refusal.destructive && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              {t(
                "eo.types.field.refusedHint",
                "This record type, or a type beneath it, holds records. The change can be made with an explicit confirmation and a stated rule for the records it leaves behind — that flow is not built yet.",
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default EoRefusalBanner;
