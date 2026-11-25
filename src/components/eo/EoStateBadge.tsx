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

  // Every seeded state carries the designer's default colour (#6366f1), so
  // colour cannot tell "just arrived" from "finished"; the state's TYPE can.
  // The legend is the one the workflow designer already shows beside every
  // state (WorkflowDesignerPage getStateTypeIcon): initial emerald, terminal
  // rose, normal blue. Shades are chosen for >= 4.5:1 at 12px against the
  // 10% tint, light and dark.
  //
  // An administrator-chosen colour still wins, with ONE known limit:
  // #6366f1 is both the column default and the designer's first swatch
  // (STATE_COLORS[0], "Purple"), and the stored value cannot say which of the
  // two it was. A state deliberately set to Purple therefore renders by type.
  const DESIGNER_DEFAULT = "#6366f1";
  const custom =
    state.color && state.color.toLowerCase() !== DESIGNER_DEFAULT
      ? state.color
      : undefined;
  const byType: Record<string, { pill: string; dot: string }> = {
    initial: {
      pill: "text-emerald-700 border-emerald-600/40 bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-400/40",
      dot: "bg-emerald-500",
    },
    terminal: {
      pill: "text-rose-700 border-rose-600/40 bg-rose-500/10 dark:text-rose-300 dark:border-rose-400/40",
      dot: "bg-rose-500",
    },
    normal: {
      pill: "text-blue-700 border-blue-600/40 bg-blue-500/10 dark:text-blue-300 dark:border-blue-400/40",
      dot: "bg-blue-500",
    },
  };
  const tone = byType[state.state_type] ?? byType.normal;

  return (
    <span
      data-state-type={state.state_type}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${custom ? "" : tone.pill}`}
      style={
        custom
          ? {
              color: custom,
              borderColor: `${custom}66`,
              backgroundColor: `${custom}1a`,
            }
          : undefined
      }
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${custom ? "" : tone.dot}`}
        style={custom ? { backgroundColor: custom } : undefined}
      />
      {name}
    </span>
  );
};

export default EoStateBadge;
