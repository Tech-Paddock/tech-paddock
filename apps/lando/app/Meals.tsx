"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * "Meals today: N" in the app bar (TEC-142). The bar is drawn by the page
 * (a server component) and the count comes from the journal `Journal` reads,
 * so the two meet here: `Journal` reports the count, the bar shows it. Nothing
 * shows until the journal has loaded, so it never says 0 for "not known yet".
 */
type Meals = { count: number | null; set: (n: number | null) => void };

const MealsContext = createContext<Meals>({ count: null, set: () => {} });

export function MealsProvider({ children }: { children: React.ReactNode }) {
  const [count, set] = useState<number | null>(null);
  return <MealsContext.Provider value={{ count, set }}>{children}</MealsContext.Provider>;
}

/** Report the count of today's meals (null while unknown). */
export function useReportMeals(count: number | null) {
  const { set } = useContext(MealsContext);
  useEffect(() => {
    set(count);
  }, [count, set]);
}

export function MealsBadge() {
  const { count } = useContext(MealsContext);
  if (count === null) return null;
  return <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums">Meals today: {count}</span>;
}
