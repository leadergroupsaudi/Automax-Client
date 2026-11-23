import React from "react";
import { useTranslation } from "react-i18next";
import { useLocalizedField } from "../../hooks/useLocalizedField";
import type { EoWorkflowState } from "../../types/eoRecord";

interface EoStateBadgeProps {
  state?: EoWorkflowState;
}

/**
 * EO records carry only `state_id`; the caller resolves it through
 * useEoStateMap and passes the state in. When the lookup is unavailable (the
 * states endpoint belongs to the workflows module and may be refused) the
 * badge degrades to a neutral "unknown state" pill rather than disappearing.
 */
export const EoStateBadge: React.FC<EoStateBadgeProps> = ({ state }) => {
  const { t } = useTranslation();
  const localize = useLocalizedField();

  if (!state) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
        {t("eo.table.unknownState", "—")}
      </span>
    );
  }

  const name =
    localize(state as unknown as Record<string, unknown>, "name") || state.code;

  // The workflow designer stores a hex colour per state; tint from it so the
  // badge stays legible in both themes without a per-state Tailwind class.
  const colour = state.color || "#6366f1";

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border"
      style={{
        color: colour,
        borderColor: `${colour}66`,
        backgroundColor: `${colour}1a`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: colour }}
      />
      {name}
    </span>
  );
};

export default EoStateBadge;
