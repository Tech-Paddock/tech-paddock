"use client";

import { useState } from "react";
import Book from "./Book";
import List from "./List";

/**
 * The two halves, and the one piece of state they share.
 *
 * Adding a recipe's ingredients to the list happens in the book and shows up in
 * the list, so something has to own the fact that the list is now stale. A
 * counter is the whole of it — the list refetches when it changes, which keeps
 * both components fetching their own data and neither one holding the other's.
 */
export default function Cookbook() {
  const [listVersion, setListVersion] = useState(0);

  return (
    <div className="flex flex-col gap-10">
      <Book onAddedToList={() => setListVersion((n) => n + 1)} />
      <List refreshKey={listVersion} />
    </div>
  );
}
