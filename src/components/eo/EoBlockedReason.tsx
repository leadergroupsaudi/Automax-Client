import React from "react";
import { useTranslation } from "react-i18next";
import { Hourglass } from "lucide-react";
import {
  eoBlockReason,
  eoBlockReferenceText,
  type EoBlock,
} from "../../lib/eoBlocking";

interface EoBlockedReasonProps {
  block: EoBlock;
  /**
   * `inline` sits inside the list of steps; `alert` is the server's refusal of
   * a move just attempted and is announced.
   */
  tone?: "inline" | "alert";
  className?: string;
}

/**
 * WHY THE REASON IS PLAIN, ALWAYS-VISIBLE TEXT AND NOT A TOOLTIP.
 *
 * The obvious rendering of "you cannot make this move" is a `disabled` button
 * carrying a `title`. It fails the one reader who needs it most: a `disabled`
 * button is removed from the tab order, so neither a keyboard user nor a
 * screen-reader user can ever reach the explanation, and `title` is a pointer
 * affordance besides. So the reason is rendered as ordinary text that is
 * always on screen and always in the accessibility tree, and the blocked step
 * is not a control at all — there is nothing to focus and nothing to refuse.
 *
 * The hourglass is decorative (`aria-hidden`) and the state is ALSO carried in
 * words — "Not available yet" beside the step, and this sentence — so nothing
 * here is conveyed by colour alone.
 *
 * AND THERE IS NO `id` PROP, because there is nothing to point at it. A
 * blocked step is a plain <li>, not a control: `aria-disabled` and
 * `aria-describedby` belong on something focusable, and adding them to a
 * non-control would announce an interactive element that is not there. The
 * prop was declared and documented but never once passed, so it is gone.
 *
 * ON THE WORDING. `blocking_references` names only the children this officer
 * may open; `blocking_hidden_count` counts the ones they may not. The hidden
 * ones are therefore described by HOW MANY and by nothing else: no type, no
 * state, no hint of which records they are, and no suggestion that something
 * has gone wrong. An officer who simply lacks clearance should read a fact
 * about the queue, with the one action open to them — ask a colleague who can
 * see it — not an error.
 */
export const EoBlockedReason: React.FC<EoBlockedReasonProps> = ({
  block,
  tone = "inline",
  className = "",
}) => {
  const { t } = useTranslation();
  const reason = eoBlockReason(block);

  let sentence: string;
  switch (reason.kind) {
    case "references":
      sentence = t("eo.transition.blockedByRefs", {
        count: reason.count,
        references: eoBlockReferenceText(reason.references),
        defaultValue:
          "Waiting on {{references}}. This step can run once those records are closed.",
        defaultValue_one:
          "Waiting on {{references}}. This step can run once that record is closed.",
      });
      break;
    case "hidden":
      sentence = t("eo.transition.blockedByHidden", {
        count: reason.count,
        defaultValue:
          "Waiting on {{count}} records you do not have access to. A colleague who can see them has to close them first.",
        defaultValue_one:
          "Waiting on one record you do not have access to. A colleague who can see it has to close it first.",
      });
      break;
    case "both":
      sentence = t("eo.transition.blockedByBoth", {
        count: reason.count,
        references: eoBlockReferenceText(reason.references),
        // The officer in the most complicated of the four situations was the
        // only one left without a next action; both halves now carry one.
        defaultValue:
          "Waiting on {{references}}, and on {{count}} further records you do not have access to. This step can run once all of them are closed — a colleague who can see those records has to close them.",
        defaultValue_one:
          "Waiting on {{references}}, and on one further record you do not have access to. This step can run once all of them are closed — a colleague who can see that record has to close it.",
      });
      break;
    default:
      // Blocked, with nothing said about by what. The honest answer is that
      // it is blocked; a reason is not invented to fill the sentence.
      sentence = t(
        "eo.transition.blockedUnknown",
        "This step is blocked right now.",
      );
  }

  const alert = tone === "alert";
  return (
    <div
      {...(alert ? { role: "alert" } : {})}
      className={`flex items-start gap-2.5 ${
        alert
          ? "rounded-lg border border-slate-500 dark:border-slate-500 bg-slate-100 dark:bg-slate-900/60 p-3"
          : ""
      } ${className}`}
    >
      <Hourglass
        aria-hidden="true"
        className="w-4 h-4 mt-0.5 flex-shrink-0 text-slate-700 dark:text-slate-300"
      />
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {alert && (
          <span className="block font-semibold text-slate-800 dark:text-slate-200">
            {t("eo.transition.refusedHeading", "The record did not move")}
          </span>
        )}
        {sentence}
      </p>
    </div>
  );
};

export default EoBlockedReason;
