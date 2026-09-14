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
      scheduled_at: null,
      notes: old?.notes ?? "",
      planned_equipment_ids: old ? JSON.parse(old.planned_equipment_ids) : [],
    }),
    [error, setError] = useState<string | null>(null);
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
          onPress={() => {
            try {
              repo.saveShoot(form, id);
              refresh();
              router.replace({ pathname: "/", params: { tab: "Shoots" } });
            } catch (e) {
              setError(humanError(e));
            }
          }}
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
