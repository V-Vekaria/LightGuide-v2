import React, { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "../src/ui/Store";
import {
  Body,
  Button,
  Card,
  Choice,
  ErrorMessage,
  Field,
  Heading,
  Screen,
} from "../src/ui/components";
import { humanError, type ShootInput } from "../src/domain/schema";
export default function Shoot() {
  const { repo, refresh } = useStore(),
    { id } = useLocalSearchParams<{ id?: string }>(),
    old = repo.shoots().find((s) => s.id === id);
  const [form, setForm] = useState<ShootInput>({
      name: old?.name ?? "",
      category: old?.category ?? "portrait",
      status: (old?.status as ShootInput["status"]) ?? "draft",
      scheduled_at: old?.scheduled_at ?? null,
      notes: old?.notes ?? "",
      planned_equipment_ids: old ? JSON.parse(old.planned_equipment_ids) : [],
    }),
    [error, setError] = useState<string | null>(null),
    [date, setDate] = useState(old?.scheduled_at?.slice(0, 10) ?? "");
  const save = () => {
    try {
      let scheduled_at: string | null = null;
      if (date.trim()) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
          throw new Error("Enter the date as YYYY-MM-DD.");
        const day = new Date(`${date}T12:00:00`);
        if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== date)
          throw new Error("Enter a valid calendar date.");
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const selected = new Date(`${date}T00:00:00`);
        if (!id && form.status === "planned" && selected < today)
          throw new Error("Choose today or a future date for a new planned shoot.");
        scheduled_at = day.toISOString();
      }
      repo.saveShoot({ ...form, scheduled_at }, id);
      refresh();
      router.replace({ pathname: "/", params: { tab: "Shoots" } });
    } catch (e) {
      setError(humanError(e));
    }
  };
  return (
    <Screen
      back
      title={id ? "Your shoot plan." : "Plan a shoot."}
      subtitle="A name, a purpose and the equipment you want to bring."
    >
      <ErrorMessage message={error} />
      <Card>
        <Field
          label="Shoot name"
          value={form.name}
          onChange={(name) => setForm({ ...form, name })}
        />
        <Choice
          options={["portrait", "product"] as const}
          value={form.category}
          onChange={(category) => setForm({ ...form, category })}
        />
        <Field
          label="Shoot date (optional, YYYY-MM-DD)"
          value={date}
          onChange={setDate}
          placeholder="2026-10-12"
        />
        <Choice
          options={["draft", "planned", "active", "completed"] as const}
          value={form.status}
          onChange={(status) => setForm({ ...form, status })}
        />
        <Field
          label="Shoot notes"
          multiline
          value={form.notes ?? ""}
          onChange={(notes) => setForm({ ...form, notes })}
        />
        <Heading>Equipment to bring</Heading>
        {form.planned_equipment_ids.some(
          (item) => !repo.equipment().some((e) => e.id === item),
        ) && (
          <Body muted>
            Some equipment was removed from your inventory. Saving this plan
            will remove those unavailable items from its packing list.
          </Body>
        )}
        {repo.equipment().map((e) => (
          <Button
            key={e.id}
            title={
              (form.planned_equipment_ids.includes(e.id) ? "✓ " : "＋ ") +
              e.name
            }
            kind="secondary"
            onPress={() =>
              setForm({
                ...form,
                planned_equipment_ids: form.planned_equipment_ids.includes(e.id)
                  ? form.planned_equipment_ids.filter((i) => i !== e.id)
                  : [...form.planned_equipment_ids, e.id],
              })
            }
          />
        ))}
        <Button
          title="Save shoot"
          onPress={save}
        />
      </Card>
      {id &&
        repo
          .recreations()
          .filter((a) => a.shoot_id === id)
          .map((a) => (
            <Card key={a.id}>
              <Body>
                {a.status} ·{" "}
                {a.outcome?.replaceAll("_", " ") ?? "Outcome pending"}
              </Body>
              <Button
                title="Open recreation"
                kind="secondary"
                onPress={() =>
                  router.push({
                    pathname: "/recreate/[id]",
                    params: { id: a.id },
                  })
                }
              />
            </Card>
          ))}
    </Screen>
  );
}
