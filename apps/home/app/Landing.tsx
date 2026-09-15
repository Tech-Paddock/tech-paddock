"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Glance } from "@/lib/glance";
import { APPS, selectedIndexFrom } from "./Chrome";
import GlancePanel from "./GlancePanel";

/**
 * What the landing route renders inside the chrome: the glance and the tiles,
 * or the selected tool in an iframe.
 *
 * The chrome around this lives in the (shell) layout, so nothing here draws the
 * topbar or sidebar. Selection is read from `?app=` rather than held as state,
 * so the sidebar and this component agree without either owning the other.
 */
function Body({ glance }: { glance: Glance }) {
  const params = useSearchParams();
  const selected = selectedIndexFrom(params.get("app"));

  if (selected === null) {
    return (
      <div className="landing">
        <GlancePanel glance={glance} />
        <div className="app-buttons">
          {APPS.map((a) => (
            <Link
              key={a.slug}
              className={`app-button tone-${a.tone}`}
              href={`/?app=${a.slug}`}
              replace
            >
              <span className="app-button-icon icon">{a.icon}</span>
              {a.name}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <iframe
      // Keyed so switching tools remounts rather than reusing the frame, which
      // would leave the previous tool's page showing while the next one loads.
      key={APPS[selected].href}
      src={APPS[selected].href}
      title={APPS[selected].name}
      className="app-frame"
    />
  );
}

export default function Landing({ glance }: { glance: Glance }) {
  return (
    <Suspense fallback={null}>
      <Body glance={glance} />
    </Suspense>
  );
}
