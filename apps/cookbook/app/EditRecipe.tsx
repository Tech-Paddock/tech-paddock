"use client";

import { useState } from "react";
import { useToast } from "./Toast";
import { MetaFields, formFromMeta, type MetaForm } from "./Meta";
import { changesThePot, cleanIngredients } from "@/lib/edit";
import { MODELS, type ModelId } from "@/lib/models";
import type { Recipe } from "@/lib/recipes";

/**
 * Editing a kept recipe, in place on its card (Joel, 2026-09-26). The rules —
 * what re-prices and why a failed re-price writes nothing — are in `lib/edit.ts`.
 *
 * **The button says what the save will do.** "Save and re-price" when the
 * ingredients differ, because that is a model call and a new set of numbers;
 * plain "Save" otherwise. **A failed save leaves the form as you left it**, so
 * nothing typed is lost, and says "Not saved" — it never closes the editor.
 */
export default function EditRecipe({
  recipe,
  model,
  onModel,
  onSaved,
  onCancel,
}: {
  recipe: Recipe;
  model: ModelId;
  onModel: (model: ModelId) => void;
  onSaved: (recipe: Recipe, repriced: boolean) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(recipe.name);
  const [servings, setServings] = useState(String(recipe.servings));
  const [ingredients, setIngredients] = useState(recipe.ingredients.join("\n"));
  const [method, setMethod] = useState(recipe.method ?? "");
  const [meta, setMeta] = useState<MetaForm>(formFromMeta(recipe));
  const [saving, setSaving] = useState(false);

  const lines = cleanIngredients(ingredients);
  const reprices = changesThePot(recipe, { ingredients: lines });
  const ready = name.trim() !== "" && lines.length > 0 && Number.isInteger(Number(servings)) && Number(servings) >= 1;

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/recipes/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: recipe.id,
          model,
          edit: { name, servings: Number(servings), ingredients: lines, method, meta },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.recipe) throw new Error(body.error ?? "Couldn't save that.");
      onSaved(body.recipe as Recipe, body.repriced === true);
    } catch (e) {
      toast.error(`Not saved. ${e instanceof Error ? e.message : "Couldn't save that."}`);
    } finally {
      setSaving(false);
    }
  }

  const field = "rounded-lg border border-line bg-surface p-3 text-base";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Recipe name"
          className={`min-w-0 flex-1 ${field}`}
        />
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-soft">
          makes
          <input
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            inputMode="numeric"
            aria-label="Servings"
            className={`w-20 ${field}`}
          />
        </label>
      </div>
      <textarea
        value={ingredients}
        onChange={(e) => setIngredients(e.target.value)}
        rows={Math.min(12, Math.max(4, lines.length + 1))}
        aria-label="Ingredients, one per line"
        className={field}
      />
      <textarea
        value={method}
        onChange={(e) => setMethod(e.target.value)}
        rows={5}
        placeholder="How you make it (optional)"
        aria-label="Method"
        className={field}
      />
      <MetaFields value={meta} onChange={setMeta} open />

      <p className="text-xs text-ink-soft">
        {reprices
          ? "The ingredients changed, so saving works the macros out again — one call, and the new numbers replace the old."
          : "Changing the servings re-divides the same pot; nothing is re-priced. Grocery lines already on your list keep what they say."}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50">
          Cancel
        </button>
        {reprices ? (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-soft">
            <span>Model</span>
            <select
              value={model}
              onChange={(e) => onModel(e.target.value as ModelId)}
              className="rounded border border-line bg-surface px-2 py-1 text-xs"
            >
              {Object.entries(MODELS).map(([id, spec]) => (
                <option key={id} value={id}>
                  {spec.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={save}
          disabled={!ready || saving}
          className={`${reprices ? "" : "ml-auto "}rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50`}
        >
          {saving ? (reprices ? "Re-pricing…" : "Saving…") : reprices ? "Save and re-price" : "Save"}
        </button>
      </div>
    </div>
  );
}
