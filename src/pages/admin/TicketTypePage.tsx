import React, { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Info,
  Check,
  ChevronDown,
  GripVertical,
  Eye,
  Bookmark,
  PlusSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";

type Level = "Main" | "Sub" | "Sub-sub" | "Universal";
type Status = "Live" | "Draft" | "Not started";

interface TicketType {
  id: string;
  name: string;
  code?: string;
  level: Level;
  parent?: string;
  reference: string;
  subTypes?: number;
  status: Status;
  depth: number;
}

const TICKET_TYPES: TicketType[] = [
  {
    id: "directive",
    name: "Directive",
    code: "EO-DIR",
    level: "Main",
    reference: "EO-DIR-YYYY-NNN",
    subTypes: 3,
    status: "Live",
    depth: 0,
  },
  {
    id: "execution-plan",
    name: "Execution Plan",
    level: "Sub",
    parent: "Directive",
    reference: "EO-DIR-YYYY-NNN-P",
    status: "Live",
    depth: 1,
  },
  {
    id: "assignment",
    name: "Assignment",
    level: "Sub",
    parent: "Execution Plan",
    reference: "EO-DIR-YYYY-NNN-A#",
    status: "Live",
    depth: 1,
  },
  {
    id: "committee",
    name: "Committee",
    code: "EO-CMT",
    level: "Main",
    reference: "CMT-YYYY-NN",
    subTypes: 2,
    status: "Draft",
    depth: 0,
  },
  {
    id: "meeting",
    name: "Meeting",
    level: "Sub",
    parent: "Committee",
    reference: "CMT-YYYY-NN-M#",
    subTypes: 2,
    status: "Draft",
    depth: 1,
  },
  {
    id: "agenda-item",
    name: "Agenda Item",
    level: "Sub-sub",
    parent: "Meeting",
    reference: "CMT-YYYY-NN-M#-I#",
    status: "Draft",
    depth: 2,
  },
  {
    id: "incoming-correspondence",
    name: "Incoming Correspondence",
    code: "EO-COM",
    level: "Main",
    reference: "IN-YYYY-NNNN",
    subTypes: 2,
    status: "Not started",
    depth: 0,
  },
  {
    id: "task",
    name: "Task",
    code: "All seven",
    level: "Universal",
    parent: "Any type",
    reference: "TSK-YYYY-NNNNN",
    status: "Live",
    depth: 0,
  },
];

const LEVEL_BADGE: Record<Level, string> = {
  Main: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  Sub: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  "Sub-sub": "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  Universal:
    "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
};

const STATUS_BADGE: Record<Status, string> = {
  Live: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  Draft: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Not started":
    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

type FilterKey = "all" | "main" | "sub" | "universal";

const FILTERS: { key: FilterKey; label: string; count: number }[] = [
  { key: "all", label: "All", count: 25 },
  { key: "main", label: "Main", count: 7 },
  { key: "sub", label: "Sub", count: 17 },
  { key: "universal", label: "Universal", count: 1 },
];

type DialogTab =
  | "general"
  | "fields"
  | "linked-types"
  | "states-transitions"
  | "sources"
  | "permissions";

type LevelOption = "Main" | "Sub" | "Universal";

const TABS: { key: DialogTab; label: string; count?: number }[] = [
  { key: "general", label: "General" },
  { key: "fields", label: "Fields", count: 8 },
  { key: "linked-types", label: "Linked types" },
  { key: "states-transitions", label: "States and transitions" },
  { key: "sources", label: "Sources", count: 4 },
  { key: "permissions", label: "Permissions" },
];

interface NewTicketForm {
  nameEn: string;
  nameAr: string;
  handle: string;
  referencePattern: string;
  level: LevelOption;
  parentType: string;
  subsystem: string;
}

const INITIAL_FORM: NewTicketForm = {
  nameEn: "Execution Plan",
  nameAr: "خطة التنفيذ",
  handle: "execution_plan",
  referencePattern: "EO-DIR-{YYYY}-{NNN}-P",
  level: "Sub",
  parentType: "Directive — EO-DIR",
  subsystem: "EO-DIR — Directives",
};

const LEVEL_OPTIONS: {
  value: LevelOption;
  title: string;
  description: string;
}[] = [
  { value: "Main", title: "Main", description: "Opens its own case" },
  { value: "Sub", title: "Sub", description: "Hangs off a parent" },
  {
    value: "Universal",
    title: "Universal",
    description: "Hangs off anything",
  },
];

const PARENT_TYPE_OPTIONS = [
  "Directive — EO-DIR",
  "Committee — EO-CMT",
  "Incoming Correspondence — EO-COM",
];

const SUBSYSTEM_OPTIONS = [
  "EO-DIR — Directives",
  "EO-CMT — Committees",
  "EO-COM — Correspondence",
];

type FieldType =
  | "Text"
  | "Number"
  | "Date"
  | "Select"
  | "Checkbox"
  | "User"
  | "Org unit"
  | "File"
  | "Linked ticket type";

const FIELD_TYPE_OPTIONS: FieldType[] = [
  "Text",
  "Number",
  "Date",
  "Select",
  "Checkbox",
  "User",
  "Org unit",
  "File",
  "Linked ticket type",
];

interface FieldRow {
  id: string;
  label: string;
  handle: string;
  type: FieldType;
  typeDetail?: string;
  required: boolean;
  multi: boolean | null;
}

const DIRECTIVE_FIELDS: FieldRow[] = [
  {
    id: "subject",
    label: "Subject",
    handle: "subject",
    type: "Text",
    required: true,
    multi: null,
  },
  {
    id: "issued_by",
    label: "Issued by",
    handle: "issued_by",
    type: "User",
    required: true,
    multi: null,
  },
  {
    id: "owning_body",
    label: "Owning body",
    handle: "owning_body",
    type: "Org unit",
    typeDetail: "from directory",
    required: true,
    multi: null,
  },
  {
    id: "due_date",
    label: "Due date",
    handle: "due_date",
    type: "Date",
    typeDetail: "Hijri and Gregorian",
    required: true,
    multi: null,
  },
  {
    id: "classification",
    label: "Classification",
    handle: "classification",
    type: "Select",
    typeDetail: "4 options",
    required: true,
    multi: null,
  },
  {
    id: "evidence",
    label: "Evidence",
    handle: "evidence",
    type: "File",
    required: false,
    multi: true,
  },
  {
    id: "execution_plan",
    label: "Execution plan",
    handle: "execution_plan",
    type: "Linked ticket type",
    required: false,
    multi: false,
  },
  {
    id: "assignments",
    label: "Assignments",
    handle: "assignments",
    type: "Linked ticket type",
    required: false,
    multi: true,
  },
];

type LinkBehaviour =
  | "Blocks parent closure"
  | "Blocks an earlier step"
  | "Closes the parent"
  | "Deadline derived from the parent"
  | "Repeating cycle"
  | "Fallback sibling"
  | "Spawns into another subsystem";

const LINK_BEHAVIOURS: LinkBehaviour[] = [
  "Blocks parent closure",
  "Blocks an earlier step",
  "Closes the parent",
  "Deadline derived from the parent",
  "Repeating cycle",
  "Fallback sibling",
  "Spawns into another subsystem",
];

interface LinkedTypeRow {
  id: string;
  name: string;
  universal?: boolean;
  tags: string[];
  cardinality: string;
  description?: string;
}

const LINKED_TYPES: LinkedTypeRow[] = [
  {
    id: "execution-plan",
    name: "Execution Plan",
    tags: ["Blocks parent closure", "Optional — only where a plan is needed"],
    cardinality: "one per directive",
  },
  {
    id: "assignment",
    name: "Assignment",
    tags: ["Blocks parent closure", "Deadline must fall before the parent's"],
    cardinality: "many per directive",
  },
  {
    id: "task",
    name: "Task",
    universal: true,
    tags: ["Blocks parent closure", "Accepts children from other subsystems"],
    cardinality: "many, from any type",
    description:
      "An On-air Commitment in EO-MED and a Visitor Direction in EO-VIS both land here. A promise made on air and a directive given in a meeting are the same object once they become work.",
  },
];

type StateKind = "initial" | "normal" | "terminal";

interface StateRow {
  id: string;
  name: string;
  code: string;
  kind: StateKind;
  sla: string;
  viewableBy: string;
  editableBy: string;
  color: string;
}

const DIRECTIVE_STATES: StateRow[] = [
  {
    id: "registered",
    name: "Registered",
    code: "registered",
    kind: "initial",
    sla: "1 day",
    viewableBy: "Admin, EO, Secretary",
    editableBy: "Admin, EO",
    color: "bg-emerald-500",
  },
  {
    id: "planning",
    name: "Planning",
    code: "planning",
    kind: "normal",
    sla: "5 days",
    viewableBy: "Admin, EO, Executing body",
    editableBy: "Executing body",
    color: "bg-sky-500",
  },
  {
    id: "assigned",
    name: "Assigned",
    code: "assigned",
    kind: "normal",
    sla: "3 days",
    viewableBy: "Admin, EO, Executing body",
    editableBy: "EO",
    color: "bg-violet-500",
  },
  {
    id: "in_execution",
    name: "In execution",
    code: "in_execution",
    kind: "normal",
    sla: "per due date",
    viewableBy: "All",
    editableBy: "Executing body",
    color: "bg-amber-500",
  },
  {
    id: "returned",
    name: "Returned",
    code: "returned",
    kind: "normal",
    sla: "2 days",
    viewableBy: "Admin, EO",
    editableBy: "EO",
    color: "bg-orange-500",
  },
  {
    id: "verification",
    name: "Verification",
    code: "verification",
    kind: "normal",
    sla: "3 days",
    viewableBy: "Admin, EO, Secretary",
    editableBy: "EO",
    color: "bg-cyan-500",
  },
  {
    id: "closed",
    name: "Closed",
    code: "closed",
    kind: "terminal",
    sla: "—",
    viewableBy: "All",
    editableBy: "Admin",
    color: "bg-indigo-500",
  },
];

interface TransitionRow {
  id: string;
  name: string;
  from: string;
  to: string;
  roles: string;
  requirements: string;
  requirementsHighlight?: string;
  actions: string;
  highlight?: boolean;
}

const DIRECTIVE_TRANSITIONS: TransitionRow[] = [
  {
    id: "needs_a_plan",
    name: "Needs a plan",
    from: "registered",
    to: "planning",
    roles: "EO",
    requirements: "—",
    actions: "1 — create linked",
  },
  {
    id: "approve_plan",
    name: "Approve plan",
    from: "planning",
    to: "assigned",
    roles: "Admin, EO",
    requirements: "comment",
    actions: "2 — email, SMS",
  },
  {
    id: "send_back",
    name: "Send back",
    from: "planning",
    to: "returned",
    roles: "EO",
    requirements: "comment (required)",
    actions: "1 — email",
  },
  {
    id: "start_execution",
    name: "Start execution",
    from: "assigned",
    to: "in_execution",
    roles: "Executing body",
    requirements: "—",
    actions: "—",
  },
  {
    id: "submit_for_verification",
    name: "Submit for verification",
    from: "in_execution",
    to: "verification",
    roles: "Executing body",
    requirements: "attachment, comment",
    actions: "1 — email",
  },
  {
    id: "final_close",
    name: "Final close",
    from: "verification",
    to: "closed",
    roles: "Admin, EO",
    requirements: "feedback",
    requirementsHighlight: "3 linked closed",
    actions: "2 — email, SMS",
    highlight: true,
  },
  {
    id: "reopen",
    name: "Reopen",
    from: "closed",
    to: "in_execution",
    roles: "Admin",
    requirements: "feedback (required)",
    actions: "1 — email",
  },
];

const TicketTypePage: React.FC = () => {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DialogTab>("general");
  const [form, setForm] = useState<NewTicketForm>(INITIAL_FORM);
  const [fields, setFields] = useState<FieldRow[]>(DIRECTIVE_FIELDS);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(
    "execution_plan",
  );
  const [selectedLinkedTypeId, setSelectedLinkedTypeId] =
    useState<string>("task");
  const [linkChildType, setLinkChildType] = useState("Task — universal");
  const [linkHowMany, setLinkHowMany] = useState("Many");
  const [linkBehaviour, setLinkBehaviour] = useState<LinkBehaviour>(
    "Blocks parent closure",
  );
  const [transitionDetailId, setTransitionDetailId] = useState<string | null>(
    null,
  );
  const [showRecordDemo, setShowRecordDemo] = useState(false);
  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false);
  const [addFieldForm, setAddFieldForm] = useState<{
    label: string;
    handle: string;
    type: FieldType;
    required: boolean;
    multi: boolean;
  }>({
    label: "",
    handle: "",
    type: "Text",
    required: false,
    multi: false,
  });

  const openAddField = () => {
    setAddFieldForm({
      label: "",
      handle: "",
      type: "Text",
      required: false,
      multi: false,
    });
    setIsAddFieldOpen(true);
  };

  const submitAddField = () => {
    const label = addFieldForm.label.trim();
    const handle =
      addFieldForm.handle.trim() ||
      label
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
    if (!label || !handle) return;
    setFields((prev) => [
      ...prev,
      {
        id: `${handle}_${Date.now()}`,
        label,
        handle,
        type: addFieldForm.type,
        required: addFieldForm.required,
        multi: addFieldForm.multi,
      },
    ]);
    setIsAddFieldOpen(false);
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TICKET_TYPES.filter((t) => {
      if (activeFilter === "main" && t.level !== "Main") return false;
      if (activeFilter === "sub" && t.level !== "Sub" && t.level !== "Sub-sub")
        return false;
      if (activeFilter === "universal" && t.level !== "Universal") return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.reference.toLowerCase().includes(q) ||
        (t.code?.toLowerCase().includes(q) ?? false) ||
        (t.parent?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [search, activeFilter]);

  const openDialog = () => {
    setForm(INITIAL_FORM);
    setActiveTab("general");
    setIsDialogOpen(true);
  };

  const closeDialog = () => setIsDialogOpen(false);

  const updateForm = <K extends keyof NewTicketForm>(
    key: K,
    value: NewTicketForm[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const nextReferencePreview = form.referencePattern
    .replace("{YYYY}", "2027")
    .replace("{NNN}", "001")
    .replace("{NNNN}", "0001")
    .replace("{NN}", "01");

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">
            Ticket types
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
            25 types across seven subsystems. 7 main, 17 sub, 1 universal.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search types"
              className="w-64 pl-9 pr-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:border-[hsl(var(--primary))]"
            />
          </div>
          <button
            onClick={openDialog}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0e5a6f] hover:bg-[#0c4e60] text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New ticket type
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => {
          const isActive = activeFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors",
                isActive
                  ? "bg-[#0e5a6f] text-white border-[#0e5a6f]"
                  : "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.5)]",
              )}
            >
              {f.label}{" "}
              <span className={cn(isActive ? "opacity-90" : "opacity-70")}>
                {f.count}
              </span>
            </button>
          );
        })}
        <button className="px-3.5 py-1.5 rounded-full text-sm font-medium border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.5)] transition-colors">
          Subsystem: all
        </button>
      </div>

      <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[hsl(var(--muted)/0.4)] border-b border-[hsl(var(--border))]">
                <th className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-6 py-3">
                  Ticket type
                </th>
                <th className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-6 py-3">
                  Level
                </th>
                <th className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-6 py-3">
                  Parent type
                </th>
                <th className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-6 py-3">
                  Reference
                </th>
                <th className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-6 py-3">
                  Sub-types
                </th>
                <th className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-6 py-3">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--border))]">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-[hsl(var(--muted)/0.3)] transition-colors"
                >
                  <td className="px-6 py-4">
                    <div
                      className="flex items-center"
                      style={{ paddingLeft: `${row.depth * 24}px` }}
                    >
                      {row.depth > 0 && (
                        <span className="text-[hsl(var(--muted-foreground))] mr-2 select-none">
                          └
                        </span>
                      )}
                      <div>
                        <div
                          className={cn(
                            "font-medium text-[hsl(var(--foreground))]",
                            row.id === "directive" &&
                              "text-[#0e5a6f] font-semibold",
                          )}
                        >
                          {row.name}
                        </div>
                        {row.code && (
                          <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                            {row.code}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium",
                        LEVEL_BADGE[row.level],
                      )}
                    >
                      {row.level}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[hsl(var(--foreground))]">
                    {row.parent ?? (
                      <span className="text-[hsl(var(--muted-foreground))]">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-[hsl(var(--muted-foreground))] font-mono text-xs">
                    {row.reference}
                  </td>
                  <td className="px-6 py-4">
                    {row.subTypes ? (
                      <button className="text-[#0e5a6f] hover:underline font-medium">
                        {row.subTypes} linked
                      </button>
                    ) : (
                      <span className="text-[hsl(var(--muted-foreground))]">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium",
                        STATUS_BADGE[row.status],
                      )}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        Indented rows are sub-types. A type is listed once, under its parent, so
        the tree is the list.
      </p>

      <Modal
        isOpen={isDialogOpen}
        onClose={closeDialog}
        size="5xl"
        showCloseButton={false}
      >
        <div className="px-8 pt-6 pb-4 border-b border-[hsl(var(--border))] shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <button
                  onClick={closeDialog}
                  className="text-[#0e5a6f] hover:underline"
                >
                  Ticket types
                </button>
                <span className="text-[hsl(var(--muted-foreground))]">/</span>
                {transitionDetailId ? (
                  <>
                    <button
                      onClick={() => setTransitionDetailId(null)}
                      className="text-[#0e5a6f] hover:underline"
                    >
                      Directive
                    </button>
                    <span className="text-[hsl(var(--muted-foreground))]">
                      /
                    </span>
                    <button
                      onClick={() => setTransitionDetailId(null)}
                      className="text-[#0e5a6f] hover:underline"
                    >
                      Transitions
                    </button>
                  </>
                ) : (
                  <span className="text-[hsl(var(--muted-foreground))]">
                    {activeTab === "general" || activeTab === "fields"
                      ? form.nameEn || "New ticket type"
                      : "Directive"}
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-3 flex-wrap">
                <h2 className="text-2xl font-semibold text-[hsl(var(--foreground))]">
                  {transitionDetailId
                    ? DIRECTIVE_TRANSITIONS.find(
                        (t) => t.id === transitionDetailId,
                      )?.name
                    : activeTab === "general" || activeTab === "fields"
                      ? form.nameEn || "New ticket type"
                      : "Directive"}
                </h2>
                {!transitionDetailId &&
                  (activeTab === "general" || activeTab === "fields") && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-900/50 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="font-mono">EO-DIR</span>
                      <span className="opacity-60">·</span>
                      Draft
                    </span>
                  )}
              </div>
              {transitionDetailId ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-500" />
                    Verification
                  </span>
                  <span>→</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    Closed
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 text-xs font-medium">
                    terminal
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-[hsl(var(--muted))] font-mono text-xs">
                    final_close
                  </span>
                </div>
              ) : activeTab === "general" || activeTab === "fields" ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  Sub-type of Directive ·{" "}
                  <span className="font-mono">EO-DIR</span> ·{" "}
                  <span className="italic">
                    Draft, not yet live in production queue
                  </span>
                </p>
              ) : (
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                  {activeTab === "states-transitions"
                    ? "Workflow directive-management · record type directive · 7 states · 7 transitions"
                    : "Main type · EO-DIR · live"}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={closeDialog}
                className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm font-medium text-[hsl(var(--foreground))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted)/0.5)] transition-colors"
              >
                Discard
              </button>
              <button
                onClick={() => setShowRecordDemo(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm font-medium text-[hsl(var(--foreground))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted)/0.5)] transition-colors"
                title="Preview a sample Directive record"
              >
                <Eye className="w-4 h-4" />
                Simulate Roles
              </button>
              <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0e5a6f] hover:bg-[#0c4e60] text-white text-sm font-medium transition-colors shadow-sm">
                <Bookmark className="w-4 h-4" />
                Create Directive
              </button>
            </div>
          </div>

          {!transitionDetailId && (
            <div className="mt-5 flex items-center gap-6 border-b border-[hsl(var(--border))] -mb-4">
              {TABS.map((tab) => {
                const isActive = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "pb-3 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-2",
                      isActive
                        ? "text-[#0e5a6f] border-[#0e5a6f]"
                        : "text-[hsl(var(--muted-foreground))] border-transparent hover:text-[hsl(var(--foreground))]",
                    )}
                  >
                    {tab.label}
                    {tab.count !== undefined && (
                      <span
                        className={cn(
                          "inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold",
                          isActive
                            ? "bg-[#0e5a6f] text-white"
                            : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
                        )}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto bg-[hsl(var(--muted)/0.25)]">
          {transitionDetailId ? (
            <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
              <div className="space-y-5">
                <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6">
                  <h3 className="text-base font-semibold text-[hsl(var(--foreground))] mb-4">
                    Who may do it, and who it goes to
                  </h3>
                  <p className="text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                    Allowed roles
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mb-5">
                    <span className="px-3 py-1 rounded-md bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-sm">
                      Administrator
                    </span>
                    <span className="px-3 py-1 rounded-md bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-sm">
                      Executive Office
                    </span>
                    <button className="px-3 py-1 rounded-md border border-dashed border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.4)]">
                      + role
                    </button>
                  </div>
                  <div className="space-y-2.5 text-sm">
                    {[
                      {
                        label: "Detect the department automatically",
                        code: "auto_detect_department",
                        checked: false,
                      },
                      {
                        label: "Match the user automatically",
                        code: "auto_match_user",
                        checked: true,
                      },
                      {
                        label: "Let the user pick the assignee",
                        code: "manual_select_user",
                        checked: false,
                      },
                      {
                        label: "Show the assignee list",
                        code: "view_assignee_user_list",
                        checked: false,
                      },
                    ].map((opt) => (
                      <label
                        key={opt.code}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          defaultChecked={opt.checked}
                          className="w-4 h-4 accent-[#0e5a6f]"
                        />
                        <span className="text-[hsl(var(--foreground))]">
                          {opt.label}
                        </span>
                        <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">
                          {opt.code}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                        Requirements
                      </h3>
                      <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                        What must be true, or supplied, before the move is
                        allowed.
                      </p>
                    </div>
                    <button className="px-3 py-1.5 rounded-lg border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.4)]">
                      Add requirement
                    </button>
                  </div>
                  <div className="space-y-2">
                    {[
                      {
                        tag: "feedback",
                        label: "Closing note from the Office",
                        right: "Mandatory",
                        highlight: false,
                      },
                      {
                        tag: "attachment",
                        label: "Evidence of completion",
                        right: "Mandatory",
                        highlight: false,
                      },
                      {
                        tag: "linked_closed",
                        label: "Execution Plan",
                        detail: "new type",
                        right: "Mandatory",
                        highlight: true,
                      },
                      {
                        tag: "linked_closed",
                        label: "Assignment",
                        detail: "all of them",
                        right: "Mandatory",
                        highlight: true,
                      },
                      {
                        tag: "linked_closed",
                        label: "Task",
                        detail: "including tasks raised in EO-MED and EO-VIS",
                        right: "Mandatory",
                        highlight: true,
                      },
                      {
                        tag: "rating",
                        label: "Satisfaction of the Office",
                        right: "Optional",
                        highlight: false,
                      },
                    ].map((r, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-sm",
                          r.highlight
                            ? "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900/40"
                            : "bg-[hsl(var(--background))] border-[hsl(var(--border))]",
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                            {r.tag}
                          </span>
                          <span className="text-[hsl(var(--foreground))] font-medium">
                            {r.label}
                          </span>
                          {r.detail && (
                            <span className="text-[hsl(var(--muted-foreground))]">
                              {r.detail}
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-sm font-medium",
                            r.right === "Mandatory"
                              ? r.highlight
                                ? "text-amber-700 dark:text-amber-300"
                                : "text-rose-600 dark:text-rose-400"
                              : "text-[hsl(var(--muted-foreground))]",
                          )}
                        >
                          {r.right}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                        Actions
                      </h3>
                      <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                        Fired in order once the move is made.
                      </p>
                    </div>
                    <button className="px-3 py-1.5 rounded-lg border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.4)]">
                      Add action
                    </button>
                  </div>
                  <div className="space-y-2">
                    {[
                      {
                        n: 1,
                        tag: "email",
                        text: "to reporter",
                        code: "DIR_CLOSURE",
                        right: "Active",
                        highlight: false,
                      },
                      {
                        n: 2,
                        tag: "sms",
                        text: "to creator, assignee",
                        code: "DIR_CLOSURE_SMS",
                        right: "Active",
                        highlight: false,
                      },
                      {
                        n: 3,
                        tag: "create_linked",
                        text: "Raise an Execution Plan on",
                        detail: "Needs a plan",
                        detailTag: "new type",
                        right: "On another transition",
                        highlight: true,
                      },
                    ].map((a) => (
                      <div
                        key={a.n}
                        className={cn(
                          "flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-sm",
                          a.highlight
                            ? "bg-violet-50/70 border-violet-200 dark:bg-violet-900/20 dark:border-violet-900/40"
                            : "bg-[hsl(var(--background))] border-[hsl(var(--border))]",
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-wrap">
                          <span className="text-[hsl(var(--muted-foreground))] text-sm">
                            {a.n}
                          </span>
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                            {a.tag}
                          </span>
                          <span className="text-[hsl(var(--foreground))]">
                            {a.text}
                          </span>
                          {a.code && (
                            <span className="text-[hsl(var(--muted-foreground))]">
                              · {a.code}
                            </span>
                          )}
                          {a.detail && (
                            <span className="text-[hsl(var(--foreground))] font-semibold">
                              {a.detail}
                            </span>
                          )}
                          {a.detailTag && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                              {a.detailTag}
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-sm font-medium",
                            a.highlight
                              ? "text-violet-700 dark:text-violet-300"
                              : "text-emerald-600 dark:text-emerald-400",
                          )}
                        >
                          {a.right}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="space-y-5">
                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
                  <p className="text-[11px] font-semibold tracking-wider text-[hsl(var(--muted-foreground))] uppercase mb-3">
                    What changes in the export
                  </p>
                  <p className="text-sm text-[hsl(var(--foreground))] mb-3">
                    Two additive values. No new object, no change to any
                    existing field, so an incident workflow exported today still
                    imports.
                  </p>
                  <ol className="list-decimal ps-5 space-y-2 text-sm text-[hsl(var(--foreground))]">
                    <li>
                      A{" "}
                      <span className="font-mono text-xs">
                        requirement_type
                      </span>{" "}
                      of{" "}
                      <span className="font-mono text-xs">linked_closed</span>,
                      beside feedback, comment, rating and attachment.
                    </li>
                    <li>
                      An <span className="font-mono text-xs">action_type</span>{" "}
                      of{" "}
                      <span className="font-mono text-xs">create_linked</span>,
                      beside email and sms.
                    </li>
                  </ol>
                  <pre className="mt-4 p-4 rounded-lg bg-slate-900 text-slate-100 text-xs overflow-x-auto font-mono leading-relaxed">
                    {`{
  "name": "Final close",
  "code": "final_close",
  "from_state_code": "verification",
  "to_state_code": "closed",
  "requirements": [
    { "requirement_type": "feedback",
      "is_mandatory": true },
    { "requirement_type": "linked_closed",
      "config": "{\\"type\\":\\"assignment\\",
                  \\"scope\\":\\"all\\"}",
      "is_mandatory": true }
  ],
  "actions": [
    { "action_type": "sms",
      "config": "{...}",
      "execution_order": 1 }
  ]
}`}
                  </pre>
                </div>

                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
                  <p className="text-[11px] font-semibold tracking-wider text-[hsl(var(--muted-foreground))] uppercase mb-3">
                    Why a requirement, not a gate
                  </p>
                  <p className="text-sm text-[hsl(var(--foreground))]">
                    The workflow module already refuses a move when a mandatory
                    requirement is unmet, and already shows the reason to the
                    user. A sub-type link needs exactly that, so it becomes one
                    more requirement rather than a second mechanism.
                  </p>
                  <p className="text-sm text-[hsl(var(--foreground))] mt-3">
                    The link is still defined once, on the{" "}
                    <button
                      onClick={() => {
                        setTransitionDetailId(null);
                        setActiveTab("linked-types");
                      }}
                      className="text-[#0e5a6f] underline underline-offset-2 hover:no-underline font-medium"
                    >
                      Linked types
                    </button>{" "}
                    tab. Saving it writes the requirement onto whichever
                    transition enters a terminal state, and it appears there
                    read-only.
                  </p>
                </div>

                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
                  <p className="text-[11px] font-semibold tracking-wider text-[hsl(var(--muted-foreground))] uppercase mb-3">
                    Carried over unchanged
                  </p>
                  <ul className="space-y-1.5 text-sm text-[hsl(var(--foreground))]">
                    {[
                      "State types: initial, normal, terminal",
                      "Per-state SLA, colour, view and edit roles",
                      "Assignment flags on the transition",
                      "Email and SMS actions with template codes",
                      "Sources, priorities and classifications",
                    ].map((line) => (
                      <li key={line} className="flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-[hsl(var(--muted-foreground))] mt-2 shrink-0" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => setTransitionDetailId(null)}
                  className="text-sm text-[#0e5a6f] hover:underline"
                >
                  ← Back to States and transitions
                </button>
              </div>
            </div>
          ) : activeTab === "general" ? (
            <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 space-y-8">
                <section>
                  <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                    Identity
                  </h3>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                    What this type is called, and how its records are numbered.
                  </p>

                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
                        Name (English)
                      </label>
                      <input
                        type="text"
                        value={form.nameEn}
                        onChange={(e) => updateForm("nameEn", e.target.value)}
                        className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:border-[hsl(var(--primary))]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
                        Name (Arabic)
                      </label>
                      <input
                        type="text"
                        dir="rtl"
                        value={form.nameAr}
                        onChange={(e) => updateForm("nameAr", e.target.value)}
                        className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:border-[hsl(var(--primary))]"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
                        Handle
                      </label>
                      <input
                        type="text"
                        value={form.handle}
                        onChange={(e) => updateForm("handle", e.target.value)}
                        className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm font-mono text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:border-[hsl(var(--primary))]"
                      />
                      <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                        Used in workflows and the API. Cannot change once live.
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
                        Reference pattern
                      </label>
                      <input
                        type="text"
                        value={form.referencePattern}
                        onChange={(e) =>
                          updateForm("referencePattern", e.target.value)
                        }
                        className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm font-mono text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:border-[hsl(var(--primary))]"
                      />
                      <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">
                        Next reference: {nextReferencePreview}
                      </p>
                    </div>
                  </div>
                </section>

                <div className="border-t border-[hsl(var(--border))]" />

                <section>
                  <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                    Where it sits
                  </h3>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                    A main type stands alone. A sub-type always has a parent,
                    and the link to that parent carries a behaviour.
                  </p>

                  <div className="mt-5">
                    <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-2">
                      Level
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {LEVEL_OPTIONS.map((opt) => {
                        const isSelected = form.level === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => updateForm("level", opt.value)}
                            className={cn(
                              "flex items-start gap-3 text-left px-4 py-3 rounded-lg border transition-colors",
                              isSelected
                                ? "border-[#0e5a6f] ring-2 ring-[#0e5a6f]/20 bg-[hsl(var(--background))]"
                                : "border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted)/0.4)]",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-1 w-4 h-4 rounded-full border flex items-center justify-center shrink-0",
                                isSelected
                                  ? "border-[#0e5a6f]"
                                  : "border-[hsl(var(--border))]",
                              )}
                            >
                              {isSelected && (
                                <span className="w-2 h-2 rounded-full bg-[#0e5a6f]" />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-[hsl(var(--foreground))]">
                                {opt.title}
                              </span>
                              <span className="block text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                                {opt.description}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
                        Parent type
                      </label>
                      <select
                        value={form.parentType}
                        onChange={(e) =>
                          updateForm("parentType", e.target.value)
                        }
                        disabled={form.level === "Main"}
                        className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:border-[hsl(var(--primary))] disabled:opacity-50"
                      >
                        {PARENT_TYPE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
                        Subsystem
                      </label>
                      <select
                        value={form.subsystem}
                        onChange={(e) =>
                          updateForm("subsystem", e.target.value)
                        }
                        className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:border-[hsl(var(--primary))]"
                      >
                        {SUBSYSTEM_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-5 flex items-start gap-3 px-4 py-3 rounded-lg bg-sky-50 border border-sky-100 dark:bg-sky-900/20 dark:border-sky-900/40">
                    <Info className="w-4 h-4 mt-0.5 text-[#0e5a6f] shrink-0" />
                    <p className="text-sm text-[hsl(var(--foreground))]">
                      Choosing a parent here creates the link. How that link
                      behaves — whether it blocks the parent from closing,
                      derives its deadline, or repeats — is set on the{" "}
                      <button
                        onClick={() => setActiveTab("linked-types")}
                        className="text-[#0e5a6f] underline underline-offset-2 hover:no-underline font-medium"
                      >
                        Linked types
                      </button>{" "}
                      tab of the parent.
                    </p>
                  </div>
                </section>
              </div>

              <div className="space-y-5">
                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
                  <p className="text-[11px] font-semibold tracking-wider text-[hsl(var(--muted-foreground))] uppercase mb-4">
                    Where it sits
                  </p>
                  <div className="space-y-0">
                    <div className="px-3 py-2 rounded-md text-sm text-[hsl(var(--foreground))]">
                      Directive
                    </div>
                    <div className="h-3 ms-6 border-s border-[hsl(var(--border))]" />
                    <div className="px-3 py-2 rounded-md text-sm font-medium text-[#0e5a6f] bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-900/40">
                      Execution Plan
                    </div>
                    <div className="h-3 ms-6 border-s border-[hsl(var(--border))]" />
                    <div className="px-3 py-2 rounded-md text-sm text-[hsl(var(--foreground))] ps-6">
                      Assignment
                    </div>
                    <div className="h-3 ms-10 border-s border-[hsl(var(--border))]" />
                    <div className="px-3 py-2 rounded-md text-sm text-[hsl(var(--foreground))] ps-10">
                      Task{" "}
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        universal
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
                  <p className="text-[11px] font-semibold tracking-wider text-[hsl(var(--muted-foreground))] uppercase mb-4">
                    Before it can go live
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2 text-[hsl(var(--foreground))]">
                      <span className="w-1 h-1 rounded-full bg-[hsl(var(--muted-foreground))]" />
                      At least one field
                    </li>
                    <li className="flex items-center gap-2 text-[hsl(var(--foreground))]">
                      <span className="w-1 h-1 rounded-full bg-[hsl(var(--muted-foreground))]" />
                      At least two states
                    </li>
                    <li className="flex items-center gap-2 text-[hsl(var(--foreground))]">
                      <span className="w-1 h-1 rounded-full bg-[hsl(var(--muted-foreground))]" />
                      A closure condition
                    </li>
                    <li className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      <span className="w-1 h-1 rounded-full bg-amber-500" />
                      Link behaviour set on the parent
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          ) : activeTab === "fields" ? (
            <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                      Fields
                    </h3>
                    <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                      Eight fields on this type. Drag to reorder.
                    </p>
                  </div>
                  <button
                    onClick={openAddField}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0e5a6f] hover:bg-[#0c4e60] text-white text-sm font-medium transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add field
                  </button>
                </div>

                <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[hsl(var(--muted)/0.4)] border-b border-[hsl(var(--border))]">
                        <th className="w-8 px-2 py-3" />
                        <th className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-4 py-3">
                          Label
                        </th>
                        <th className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-4 py-3">
                          Handle
                        </th>
                        <th className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-4 py-3">
                          Type
                        </th>
                        <th className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-4 py-3">
                          Required
                        </th>
                        <th className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-4 py-3">
                          Multi
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--card))]">
                      {fields.map((field) => {
                        const isEditingType = editingFieldId === field.id;
                        return (
                          <tr
                            key={field.id}
                            className={cn(
                              "transition-colors group",
                              isEditingType
                                ? "bg-sky-50/70 dark:bg-sky-900/10"
                                : "hover:bg-[hsl(var(--muted)/0.3)]",
                            )}
                          >
                            <td className="w-8 px-2 py-3 text-center">
                              <GripVertical
                                className={cn(
                                  "w-4 h-4 mx-auto cursor-grab text-[hsl(var(--muted-foreground))] transition-opacity",
                                  isEditingType
                                    ? "opacity-100"
                                    : "opacity-40 group-hover:opacity-100",
                                )}
                              />
                            </td>
                            <td className="px-4 py-3 font-medium text-[hsl(var(--foreground))]">
                              {field.label}
                            </td>
                            <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] font-mono text-xs">
                              {field.handle}
                            </td>
                            <td className="px-4 py-3">
                              {isEditingType ? (
                                <button
                                  onClick={() => setEditingFieldId(null)}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#0e5a6f] text-[#0e5a6f] bg-[hsl(var(--card))] text-sm font-medium"
                                >
                                  {field.type}
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              ) : field.type === "Linked ticket type" ? (
                                <button
                                  onClick={() => setEditingFieldId(field.id)}
                                  className="inline-flex px-2.5 py-1 rounded-md bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 text-sm font-medium"
                                >
                                  {field.type}
                                </button>
                              ) : (
                                <button
                                  onClick={() => setEditingFieldId(field.id)}
                                  className="text-[hsl(var(--foreground))] text-sm text-left hover:underline"
                                >
                                  {field.type}
                                  {field.typeDetail && (
                                    <span className="text-[hsl(var(--muted-foreground))]">
                                      {" · "}
                                      {field.typeDetail}
                                    </span>
                                  )}
                                </button>
                              )}
                            </td>
                            <td
                              className={cn(
                                "px-4 py-3 text-sm font-medium",
                                field.required
                                  ? "text-[#0e5a6f] dark:text-cyan-400"
                                  : "text-[hsl(var(--muted-foreground))]",
                              )}
                            >
                              {field.required ? "Yes" : "No"}
                            </td>
                            <td
                              className={cn(
                                "px-4 py-3 text-sm font-medium",
                                field.multi === null
                                  ? "text-[hsl(var(--muted-foreground))]"
                                  : field.multi
                                    ? "text-[#0e5a6f] dark:text-cyan-400"
                                    : "text-[hsl(var(--muted-foreground))]",
                              )}
                            >
                              {field.multi === null
                                ? "—"
                                : field.multi
                                  ? "Yes"
                                  : "No"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-4">
                  Two of the eight fields are links to other ticket types. Those
                  are what build the tree.
                </p>
              </div>

              {editingFieldId && (
                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden shadow-sm">
                  <div className="px-5 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)]">
                    <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                      Field type
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                      {fields.find((f) => f.id === editingFieldId)?.label}
                    </p>
                  </div>
                  <ul className="py-1">
                    {FIELD_TYPE_OPTIONS.map((opt) => {
                      const currentField = fields.find(
                        (f) => f.id === editingFieldId,
                      );
                      const isSelected = currentField?.type === opt;
                      return (
                        <li key={opt}>
                          <button
                            onClick={() => {
                              setFields((prev) =>
                                prev.map((f) =>
                                  f.id === editingFieldId
                                    ? { ...f, type: opt, typeDetail: undefined }
                                    : f,
                                ),
                              );
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-5 py-2.5 text-sm transition-colors",
                              isSelected
                                ? "bg-[#0e5a6f] text-white font-medium"
                                : "text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.5)]",
                            )}
                          >
                            <span>{opt}</span>
                            {isSelected && <Check className="w-4 h-4" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="px-5 py-4 border-t border-[hsl(var(--border))] space-y-3">
                    <p className="text-sm text-[hsl(var(--muted-foreground))] leading-relaxed">
                      A linked field points at another ticket type. Picking one
                      opens the link settings, where the behaviour is chosen.
                    </p>
                    <button
                      onClick={() => {
                        setEditingFieldId(null);
                        setActiveTab("linked-types");
                      }}
                      className="w-full px-3 py-2.5 rounded-lg bg-gradient-to-r from-[#0e5a6f] to-cyan-600 hover:from-[#0c4e60] hover:to-cyan-700 text-white text-sm font-semibold transition-colors shadow-sm"
                    >
                      Open link settings
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === "linked-types" ? (
            <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                      Linked ticket types
                    </h3>
                    <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                      Types that hang off a Directive, and what each link does.
                    </p>
                  </div>
                  <button className="px-4 py-2 rounded-lg bg-[#0e5a6f] hover:bg-[#0c4e60] text-white text-sm font-medium transition-colors">
                    Link a type
                  </button>
                </div>

                <div className="space-y-3">
                  {LINKED_TYPES.map((lt) => {
                    const isSelected = selectedLinkedTypeId === lt.id;
                    return (
                      <button
                        key={lt.id}
                        onClick={() => setSelectedLinkedTypeId(lt.id)}
                        className={cn(
                          "w-full text-left px-5 py-4 rounded-xl border transition-colors",
                          isSelected
                            ? "border-[#0e5a6f] ring-1 ring-[#0e5a6f]/30 bg-sky-50/40 dark:bg-sky-900/10"
                            : "border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted)/0.4)]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] font-semibold text-[hsl(var(--foreground))]">
                              {lt.name}
                            </span>
                            {lt.universal && (
                              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                                universal
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0">
                            {lt.cardinality}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          {lt.tags.map((tag, i) => (
                            <span
                              key={tag}
                              className={cn(
                                "px-2.5 py-0.5 rounded-full text-xs font-medium",
                                i === 0
                                  ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                  : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                              )}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                        {lt.description && (
                          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 leading-relaxed">
                            {lt.description}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-5 p-5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))]">
                  <p className="text-[11px] font-semibold tracking-wider text-[hsl(var(--muted-foreground))] uppercase mb-3">
                    What the tree looks like
                  </p>
                  <div className="font-mono text-sm leading-7 text-[hsl(var(--foreground))]">
                    <div>
                      Directive{" "}
                      <span className="text-[hsl(var(--muted-foreground))]">
                        EO-DIR-2027-001
                      </span>
                    </div>
                    <div className="ps-5">
                      └ Execution Plan{" "}
                      <span className="text-[hsl(var(--muted-foreground))]">
                        blocks closure
                      </span>
                    </div>
                    <div className="ps-10">
                      └ Assignment × 3{" "}
                      <span className="text-[hsl(var(--muted-foreground))]">
                        blocks closure · date inside the parent's
                      </span>
                    </div>
                    <div className="ps-14">
                      └ Task × 7{" "}
                      <span className="text-[hsl(var(--muted-foreground))]">
                        blocks closure
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[hsl(var(--border))]">
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    Link settings
                  </p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                    Directive →{" "}
                    {LINKED_TYPES.find((l) => l.id === selectedLinkedTypeId)
                      ?.name ?? ""}
                  </p>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
                      Child type
                    </label>
                    <select
                      value={linkChildType}
                      onChange={(e) => setLinkChildType(e.target.value)}
                      className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:border-[hsl(var(--primary))]"
                    >
                      <option>Task — universal</option>
                      <option>Execution Plan</option>
                      <option>Assignment</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
                      How many
                    </label>
                    <select
                      value={linkHowMany}
                      onChange={(e) => setLinkHowMany(e.target.value)}
                      className="w-full px-3 py-2 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.2)] focus:border-[hsl(var(--primary))]"
                    >
                      <option>Many</option>
                      <option>One</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1.5">
                      Link behaviour
                    </label>
                    <div className="rounded-lg overflow-hidden border border-[hsl(var(--border))]">
                      {LINK_BEHAVIOURS.map((b, i) => {
                        const isSelected = linkBehaviour === b;
                        return (
                          <button
                            key={b}
                            onClick={() => setLinkBehaviour(b)}
                            className={cn(
                              "w-full flex items-center justify-between px-3.5 py-2.5 text-sm transition-colors text-left",
                              i > 0 && "border-t border-[hsl(var(--border))]",
                              isSelected
                                ? "bg-[#0e5a6f] text-white font-medium"
                                : "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.5)]",
                            )}
                          >
                            <span>{b}</span>
                            {isSelected && (
                              <ChevronDown className="w-4 h-4 rotate-180" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">
                      Seven behaviours, drawn from the seven flowcharts. A link
                      may carry more than one.
                    </p>
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold tracking-wider text-[hsl(var(--muted-foreground))] uppercase mb-2">
                      Also on this link
                    </p>
                    <div className="space-y-2 text-sm">
                      {[
                        {
                          label:
                            "Child's due date must fall on or before the parent's",
                          checked: true,
                        },
                        {
                          label: "Allow a parent in another subsystem",
                          checked: true,
                        },
                        {
                          label: "Inherit the parent's classification",
                          checked: false,
                        },
                        {
                          label:
                            "Create one automatically when the parent opens",
                          checked: false,
                        },
                      ].map((o) => (
                        <label
                          key={o.label}
                          className="flex items-start gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            defaultChecked={o.checked}
                            className="mt-0.5 w-4 h-4 accent-[#0e5a6f]"
                          />
                          <span className="text-[hsl(var(--foreground))]">
                            {o.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 text-sm text-[hsl(var(--foreground))] leading-relaxed">
                    <span className="text-amber-700 dark:text-amber-400 font-medium">
                      !
                    </span>{" "}
                    With this on, a Directive cannot reach{" "}
                    <span className="font-semibold">Closed</span> while any Task
                    under it is open. The gate appears on the States tab and
                    cannot be removed there.
                  </div>
                </div>
                <div className="px-5 py-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] flex items-center gap-3">
                  <button className="px-4 py-2 rounded-lg bg-[#0e5a6f] hover:bg-[#0c4e60] text-white text-sm font-medium">
                    Save link
                  </button>
                  <button className="px-4 py-2 rounded-lg text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.5)]">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : activeTab === "states-transitions" ? (
            <div className="px-8 py-6 space-y-6">
              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                      States
                    </h3>
                    <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                      One initial, five normal, one terminal. Each carries its
                      own SLA and its own view and edit roles.
                    </p>
                  </div>
                  <button className="px-3 py-1.5 rounded-lg border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.4)]">
                    Add state
                  </button>
                </div>
                <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[hsl(var(--muted)/0.4)] border-b border-[hsl(var(--border))]">
                        {[
                          "State",
                          "Code",
                          "Type",
                          "SLA",
                          "Viewable by",
                          "Editable by",
                        ].map((h) => (
                          <th
                            key={h}
                            className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-4 py-3"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--card))]">
                      {DIRECTIVE_STATES.map((s) => (
                        <tr key={s.id}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={cn(
                                  "w-2.5 h-2.5 rounded-full",
                                  s.color,
                                )}
                              />
                              <span className="font-medium text-[hsl(var(--foreground))]">
                                {s.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">
                            {s.code}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium",
                                s.kind === "initial"
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                  : s.kind === "terminal"
                                    ? "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                                    : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]",
                              )}
                            >
                              {s.kind}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--foreground))]">
                            {s.sla}
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--foreground))]">
                            {s.viewableBy}
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--foreground))]">
                            {s.editableBy}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                      Transitions
                    </h3>
                    <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                      Each move carries its own roles, its requirements, and the
                      messages it sends.
                    </p>
                  </div>
                  <button className="px-3 py-1.5 rounded-lg border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.4)]">
                    Add transition
                  </button>
                </div>
                <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[hsl(var(--muted)/0.4)] border-b border-[hsl(var(--border))]">
                        {[
                          "Transition",
                          "From → To",
                          "Allowed roles",
                          "Requirements",
                          "Actions",
                        ].map((h) => (
                          <th
                            key={h}
                            className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-4 py-3"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--card))]">
                      {DIRECTIVE_TRANSITIONS.map((tr) => (
                        <tr
                          key={tr.id}
                          onClick={() =>
                            tr.id === "final_close" &&
                            setTransitionDetailId(tr.id)
                          }
                          className={cn(
                            "transition-colors",
                            tr.highlight
                              ? "bg-sky-50/50 dark:bg-sky-900/10 cursor-pointer"
                              : "hover:bg-[hsl(var(--muted)/0.3)]",
                          )}
                        >
                          <td
                            className={cn(
                              "px-4 py-3 font-medium",
                              tr.highlight
                                ? "text-[#0e5a6f]"
                                : "text-[hsl(var(--foreground))]",
                            )}
                          >
                            {tr.name}
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--muted-foreground))] font-mono text-xs">
                            {tr.from} → {tr.to}
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--foreground))]">
                            {tr.roles}
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--foreground))]">
                            {tr.requirements}
                            {tr.requirementsHighlight && (
                              <>
                                ,{" "}
                                <span className="text-amber-600 dark:text-amber-400 font-medium">
                                  {tr.requirementsHighlight}
                                </span>
                              </>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--foreground))]">
                            {tr.actions}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-start gap-3 px-5 py-4 rounded-lg bg-sky-50 border border-sky-100 dark:bg-sky-900/20 dark:border-sky-900/40">
                <Info className="w-4 h-4 mt-0.5 text-[#0e5a6f] shrink-0" />
                <p className="text-sm text-[hsl(var(--foreground))]">
                  There is no separate closure gate. A sub-type link becomes a{" "}
                  <span className="font-semibold">
                    requirement on the transition
                  </span>{" "}
                  into the terminal state, alongside feedback, comment, rating
                  and attachment — the same list the workflow module already
                  has.{" "}
                  <button
                    onClick={() => setTransitionDetailId("final_close")}
                    className="text-[#0e5a6f] underline underline-offset-2 hover:no-underline font-medium"
                  >
                    Open Final close
                  </button>{" "}
                  to see the shape.
                </p>
              </div>
            </div>
          ) : (
            <div className="px-8 py-16 text-center text-sm text-[hsl(var(--muted-foreground))]">
              {TABS.find((t) => t.key === activeTab)?.label} settings are not
              built yet.
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showRecordDemo}
        onClose={() => setShowRecordDemo(false)}
        size="4xl"
        showCloseButton
      >
        <div className="px-8 pt-6 pb-4 border-b border-[hsl(var(--border))] shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="px-2.5 py-0.5 rounded-md bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 text-sm font-medium font-mono">
                  EO-DIR-2027-001
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-sm font-medium">
                  In execution
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] text-sm font-medium">
                  Confidential
                </span>
              </div>
              <h2 className="text-2xl font-semibold text-[hsl(var(--foreground))]">
                Cut the time to issue a building permit to five working days
              </h2>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                Directive · owned by Permits Agency · due 31 March 2027
              </p>
            </div>
            <button className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm font-medium text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted)/0.4)] cursor-not-allowed shrink-0 me-10">
              Close directive
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[hsl(var(--muted)/0.25)]">
          <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
            <div className="space-y-5">
              <div className="flex items-start gap-3 px-5 py-4 rounded-xl bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-900/40">
                <span className="text-amber-700 dark:text-amber-400 text-lg mt-0.5">
                  🔒
                </span>
                <div>
                  <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                    This directive cannot be closed yet
                  </p>
                  <p className="text-sm text-[hsl(var(--foreground))] mt-1">
                    One Assignment and two Tasks are still open. The gate comes
                    from the links on the Directive type, not from this record.
                  </p>
                </div>
              </div>

              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                      Execution Plan
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs font-medium">
                      blocks closure
                    </span>
                  </div>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    1 of 1
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                      Four-stage plan to shorten permit issue
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 font-mono">
                      EO-DIR-2027-001-P · approved 12 Jan
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-medium shrink-0">
                    Approved
                  </span>
                </div>
              </div>

              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                      Assignments
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs font-medium">
                      blocks closure
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 text-xs font-medium">
                      dates inside the parent's
                    </span>
                  </div>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    3 — 1 open
                  </span>
                </div>
                <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[hsl(var(--muted)/0.4)] border-b border-[hsl(var(--border))]">
                        {["Assignment", "Owner", "Due", "Status"].map((h) => (
                          <th
                            key={h}
                            className="text-left font-medium text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-4 py-3"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--border))] bg-[hsl(var(--card))]">
                      {[
                        {
                          name: "Rewrite the inspection step",
                          owner: "Permits Agency",
                          due: "10 Feb",
                          status: "Verified",
                          statusColor:
                            "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
                          late: false,
                        },
                        {
                          name: "Legal review of the bylaw change",
                          owner: "Legal",
                          due: "24 Feb",
                          status: "Verified",
                          statusColor:
                            "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
                          late: false,
                        },
                        {
                          name: "Online submission portal",
                          owner: "IT",
                          due: "12 Mar",
                          dueDetail: "8 days late",
                          status: "Escalated · level 2",
                          statusColor:
                            "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
                          late: true,
                        },
                      ].map((a) => (
                        <tr
                          key={a.name}
                          className={cn(
                            a.late && "bg-amber-50/50 dark:bg-amber-900/10",
                          )}
                        >
                          <td className="px-4 py-3 text-[hsl(var(--foreground))]">
                            {a.name}
                          </td>
                          <td className="px-4 py-3 text-[hsl(var(--foreground))]">
                            {a.owner}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                a.late
                                  ? "text-rose-600 dark:text-rose-400 font-medium"
                                  : "text-[hsl(var(--foreground))]",
                              )}
                            >
                              {a.due}
                            </span>
                            {a.dueDetail && (
                              <span className="text-[hsl(var(--muted-foreground))] text-xs ms-1">
                                · {a.dueDetail}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium",
                                a.statusColor,
                              )}
                            >
                              {a.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-violet-50/40 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-900/40 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-[hsl(var(--foreground))]">
                      Tasks
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs font-medium">
                      blocks closure
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-xs font-medium">
                      from other subsystems
                    </span>
                  </div>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    7 — 2 open
                  </span>
                </div>
                <div className="space-y-3">
                  {[
                    {
                      name: "Publish the new service standard",
                      meta: "TSK-2027-00412 · raised from this directive",
                    },
                    {
                      name: "Permits fully online by Q2",
                      metaJsx: (
                        <>
                          from{" "}
                          <span className="font-semibold">MED-2027-073</span>,
                          promised on air
                        </>
                      ),
                      metaPrefix: "TSK-2027-00488 · ",
                    },
                  ].map((t) => (
                    <div
                      key={t.name}
                      className="flex items-start justify-between gap-4"
                    >
                      <div>
                        <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                          {t.name}
                        </p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 font-mono">
                          {t.metaPrefix}
                          {t.meta}
                          {t.metaJsx}
                        </p>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs font-medium shrink-0">
                        Open
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
                <p className="text-[11px] font-semibold tracking-wider text-[hsl(var(--muted-foreground))] uppercase mb-3">
                  Closure checklist
                </p>
                <ul className="space-y-2.5 text-sm">
                  <li className="flex items-center gap-2 text-[hsl(var(--foreground))]">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ✓
                    </span>
                    Execution Plan approved
                  </li>
                  <li className="flex items-center gap-2 text-[hsl(var(--foreground))] font-semibold">
                    <span className="text-rose-500">✕</span>1 Assignment still
                    open
                  </li>
                  <li className="flex items-center gap-2 text-[hsl(var(--foreground))] font-semibold">
                    <span className="text-rose-500">✕</span>2 Tasks still open
                  </li>
                  <li className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
                    <span>○</span>
                    Verification by the Executive Office
                  </li>
                </ul>
              </div>

              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-5">
                <p className="text-[11px] font-semibold tracking-wider text-[hsl(var(--muted-foreground))] uppercase mb-3">
                  Escalation history
                </p>
                <ol className="list-decimal ps-5 space-y-1.5 text-sm text-[hsl(var(--foreground))]">
                  <li>9 Mar — owner warned, 3 days before</li>
                  <li>15 Mar — direct manager told</li>
                  <li>19 Mar — grade above told</li>
                </ol>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-3">
                  Next: Executive Office on 26 March.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isAddFieldOpen}
        onClose={() => setIsAddFieldOpen(false)}
        size="lg"
        showCloseButton={false}
      >
        <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0e5a6f] to-cyan-500 flex items-center justify-center shadow-sm">
              <PlusSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                Add New Field
              </h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
                Define a new data attribute for the Execution Plan schema.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsAddFieldOpen(false)}
            className="p-1.5 -m-1.5 rounded-lg text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6 space-y-5">
          <div>
            <label className="block text-[11px] font-semibold tracking-wider text-[hsl(var(--muted-foreground))] uppercase mb-2">
              Label
            </label>
            <input
              type="text"
              value={addFieldForm.label}
              onChange={(e) =>
                setAddFieldForm((f) => ({ ...f, label: e.target.value }))
              }
              placeholder="e.g., Review Notes"
              className="w-full px-4 py-2.5 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[#0e5a6f]/20 focus:border-[#0e5a6f] transition-colors"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="block text-[11px] font-semibold tracking-wider text-[hsl(var(--muted-foreground))] uppercase">
                Handle
              </label>
              <span className="text-xs text-[hsl(var(--muted-foreground))] font-mono">
                Snake_case system identifier
              </span>
            </div>
            <input
              type="text"
              value={addFieldForm.handle}
              onChange={(e) =>
                setAddFieldForm((f) => ({ ...f, handle: e.target.value }))
              }
              placeholder="e.g., review_notes"
              className="w-full px-4 py-2.5 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm font-mono text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[#0e5a6f]/20 focus:border-[#0e5a6f] transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold tracking-wider text-[hsl(var(--muted-foreground))] uppercase mb-2">
              Field type
            </label>
            <div className="relative">
              <select
                value={addFieldForm.type}
                onChange={(e) =>
                  setAddFieldForm((f) => ({
                    ...f,
                    type: e.target.value as FieldType,
                  }))
                }
                className="w-full appearance-none px-4 py-2.5 pr-10 bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[#0e5a6f]/20 focus:border-[#0e5a6f] transition-colors"
              >
                {FIELD_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))] pointer-events-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label
              className={cn(
                "flex items-start justify-between gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                addFieldForm.required
                  ? "border-[#0e5a6f] bg-[#0e5a6f]/5"
                  : "border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted)/0.4)]",
              )}
            >
              <div>
                <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  Required
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  Mandatory before saving
                </p>
              </div>
              <input
                type="checkbox"
                checked={addFieldForm.required}
                onChange={(e) =>
                  setAddFieldForm((f) => ({ ...f, required: e.target.checked }))
                }
                className="mt-0.5 w-4 h-4 accent-[#0e5a6f] cursor-pointer"
              />
            </label>
            <label
              className={cn(
                "flex items-start justify-between gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                addFieldForm.multi
                  ? "border-[#0e5a6f] bg-[#0e5a6f]/5"
                  : "border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted)/0.4)]",
              )}
            >
              <div>
                <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  Multi-value (Array)
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                  Allows multiple inputs
                </p>
              </div>
              <input
                type="checkbox"
                checked={addFieldForm.multi}
                onChange={(e) =>
                  setAddFieldForm((f) => ({ ...f, multi: e.target.checked }))
                }
                className="mt-0.5 w-4 h-4 accent-[#0e5a6f] cursor-pointer"
              />
            </label>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.25)] flex items-center justify-end gap-2">
          <button
            onClick={() => setIsAddFieldOpen(false)}
            className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm font-medium text-[hsl(var(--foreground))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted)/0.5)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submitAddField}
            disabled={!addFieldForm.label.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-[#0e5a6f] to-cyan-600 hover:from-[#0c4e60] hover:to-cyan-700 text-white text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Bookmark className="w-4 h-4" />
            Add Field
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default TicketTypePage;
