"use client";

import { OPEN_PROFILE } from "@/lib/profile";

/**
 * The app's icon in the app bar, in place of the word "Lando" (TEC-260). Tapping it opens Profile: it says so by
 * event, which `Journal` (it holds the data Profile reads) listens for. A 44px tap target named "Profile"; the icon
 * itself is the app's own `icon.svg`, so it needs no new asset.
 */
export default function ProfileButton() {
  return (
    <button
      type="button"
      aria-label="Profile"
      title="Profile"
      onClick={() => window.dispatchEvent(new Event(OPEN_PROFILE))}
      className="-ml-1 grid h-[44px] w-[44px] shrink-0 place-items-center rounded-xl focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-pinstripe"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={36} height={36} className="h-9 w-9 rounded-lg" />
    </button>
  );
}
