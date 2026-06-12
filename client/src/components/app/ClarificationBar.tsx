"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import type { ClarificationAnswer, PendingClarification } from "@/lib/chat-api";

function interactionLabel(type: PendingClarification["interaction_type"]): string {
  switch (type) {
    case "confirm":
      return "Confirm intent";
    case "input":
      return "More details needed";
    case "single_choice":
      return "Choose one";
    case "multi_choice":
      return "Choose options";
    default:
      return "Clarification";
  }
}

export function ClarificationBar({
  pending,
  busy,
  onRespond,
  className = "",
}: {
  pending: PendingClarification;
  busy?: boolean;
  onRespond: (answer: ClarificationAnswer) => void;
  className?: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);

  const submitInput = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    const value =
      pending.input_kind === "number" ? Number(trimmed) : trimmed;
    if (pending.input_kind === "number" && !Number.isFinite(value as number)) {
      return;
    }
    onRespond({ value });
    setInputValue("");
  };

  const toggleMultiOption = (optionId: string) => {
    setSelectedOptionIds((current) =>
      current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId],
    );
  };

  return (
    <div
      role="region"
      aria-labelledby="clarification-title"
      className={`rounded-3xl border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/10 p-5 shadow-[4px_4px_0_var(--hero-ink)] ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)]/25 text-[var(--hero-mint)]">
          <HelpCircle className="size-5" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            id="clarification-title"
            className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--hero-ink)]/50"
          >
            {interactionLabel(pending.interaction_type)}
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--hero-ink)]">
            {pending.question}
          </p>
          {pending.plan_preview ? (
            <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-[var(--hero-ink)]/15 bg-white/70 p-3 font-mono text-xs text-[var(--hero-ink)]/70">
              {pending.plan_preview}
            </pre>
          ) : null}

          {pending.interaction_type === "confirm" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onRespond({ confirm: "yes" })}
                className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] px-5 py-2 text-sm font-bold text-[var(--hero-ink)] shadow-[2px_2px_0_var(--hero-ink)] transition hover:translate-y-px hover:shadow-[1px_1px_0_var(--hero-ink)] disabled:opacity-50"
              >
                Yes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRespond({ confirm: "no" })}
                className="rounded-full border-2 border-[var(--hero-ink)] bg-white px-5 py-2 text-sm font-bold text-[var(--hero-ink)] shadow-[2px_2px_0_var(--hero-ink)] transition hover:translate-y-px hover:shadow-[1px_1px_0_var(--hero-ink)] disabled:opacity-50"
              >
                No
              </button>
            </div>
          ) : null}

          {pending.interaction_type === "input" ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                type={pending.input_kind === "number" ? "number" : "text"}
                inputMode={pending.input_kind === "number" ? "decimal" : "text"}
                value={inputValue}
                disabled={busy}
                placeholder={pending.placeholder ?? "Your answer"}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitInput();
                  }
                }}
                className="min-w-[10rem] flex-1 rounded-full border-2 border-[var(--hero-ink)] bg-white px-4 py-2 text-sm font-medium text-[var(--hero-ink)] outline-none focus:ring-2 focus:ring-[var(--hero-mint)]"
              />
              <button
                type="button"
                disabled={busy || !inputValue.trim()}
                onClick={submitInput}
                className="rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] px-5 py-2 text-sm font-bold text-[var(--hero-ink)] shadow-[2px_2px_0_var(--hero-ink)] transition hover:translate-y-px hover:shadow-[1px_1px_0_var(--hero-ink)] disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          ) : null}

          {pending.interaction_type === "single_choice" && pending.options?.length ? (
            <div className="mt-4 space-y-2">
              {pending.options.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--hero-ink)]/15 bg-white/70 px-3 py-2 text-sm text-[var(--hero-ink)]"
                >
                  <input
                    type="radio"
                    name={`clarify-${pending.id}`}
                    value={option.id}
                    checked={selectedOptionId === option.id}
                    disabled={busy}
                    onChange={() => setSelectedOptionId(option.id)}
                  />
                  {option.label}
                </label>
              ))}
              <button
                type="button"
                disabled={busy || !selectedOptionId}
                onClick={() => onRespond({ selected_option_id: selectedOptionId })}
                className="mt-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] px-5 py-2 text-sm font-bold text-[var(--hero-ink)] shadow-[2px_2px_0_var(--hero-ink)] transition hover:translate-y-px hover:shadow-[1px_1px_0_var(--hero-ink)] disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          ) : null}

          {pending.interaction_type === "multi_choice" && pending.options?.length ? (
            <div className="mt-4 space-y-2">
              {pending.options.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--hero-ink)]/15 bg-white/70 px-3 py-2 text-sm text-[var(--hero-ink)]"
                >
                  <input
                    type="checkbox"
                    value={option.id}
                    checked={selectedOptionIds.includes(option.id)}
                    disabled={busy}
                    onChange={() => toggleMultiOption(option.id)}
                  />
                  {option.label}
                </label>
              ))}
              <button
                type="button"
                disabled={busy || selectedOptionIds.length === 0}
                onClick={() => onRespond({ selected_option_ids: selectedOptionIds })}
                className="mt-2 rounded-full border-2 border-[var(--hero-ink)] bg-[var(--hero-mint)] px-5 py-2 text-sm font-bold text-[var(--hero-ink)] shadow-[2px_2px_0_var(--hero-ink)] transition hover:translate-y-px hover:shadow-[1px_1px_0_var(--hero-ink)] disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
