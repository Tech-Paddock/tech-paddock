"use client";

import { OUT_MINUTES_CHIPS, outMinutesChip, outMinutesLabel } from "@/lib/events";
import Chip from "./Chip";

/**
 * Every length of time in the app (Potty's Time outside, Fun's Length, Training's Time) is these chips, never a number
 * box: 5, 15, 30, 45 and 60+ min, the same set on every form. A chip saves its own minutes (60+ saves 60). A stored
 * value that is not a chip's (10, 20) shows no chip picked, except that 60 or more shows 60+; the form keeps the
 * stored value until a chip is tapped. `optional` lets a tap on the picked chip clear it (Potty's Time outside is
 * optional; a walk's length is not). A local pattern.
 */
export default function DurationChips({
  label,
  value,
  optional = false,
  onPick,
}: {
  /** The field's name, said by a screen reader with "minutes". */
  label: string;
  value: number | null;
  optional?: boolean;
  onPick: (minutes: number | null) => void;
}) {
  const picked = outMinutesChip(value);
  return (
    <div role="group" aria-label={`${label}, minutes`} className="flex flex-wrap gap-x-1">
      {OUT_MINUTES_CHIPS.map((m) => (
        <Chip
          key={m}
          pressed={picked === m}
          onClick={() => {
            if (picked === m) {
              if (optional) onPick(null);
              return;
            }
            onPick(m);
          }}
        >
          {outMinutesLabel(m)}
        </Chip>
      ))}
    </div>
  );
}
