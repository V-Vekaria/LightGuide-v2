import { ShootCalendar } from "../src/ui/ShootCalendar";
import { dateKey, dateError, scheduledAt } from "../src/domain/shoot-dates";
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
    [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(dateKey(old?.scheduled_at));
  const [meta, setMeta] = useState(() =>
    repo.setting("shoot-plan:" + id, { location: "", setupId: "" }),
  );
  const save = () =>
    repo.atomic(() => {
      const key = repo.saveShoot(
        { ...form, scheduled_at: scheduledAt(date) },
        id,
      );
      repo.setSetting("shoot-plan:" + key, meta);
      return key;
    });
  const invalidDate = dateError(date, undefined, old?.scheduled_at);
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
        <ShootCalendar value={date} onChange={setDate} />
        <ErrorMessage message={invalidDate} />
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
        <Field
          label="Location (optional)"
          value={meta.location}
          onChange={(location) => setMeta({ ...meta, location })}
        />
        <Heading>Linked setup</Heading>
        <Button
          title={meta.setupId ? "No linked setup" : "Selected: no linked setup"}
          kind="secondary"
          onPress={() => setMeta({ ...meta, setupId: "" })}
        />
        {repo.setups().map((setup) => (
          <Button
            key={setup.id}
            title={
              (meta.setupId === setup.id ? "Selected: " : "") + setup.title
            }
            kind="secondary"
            onPress={() => setMeta({ ...meta, setupId: setup.id })}
          />
        ))}
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
          disabled={Boolean(invalidDate) || !form.name.trim()}
          onPress={() => {
            try {
              if (invalidDate) throw new Error(invalidDate);
              save();
              refresh();
              router.replace({ pathname: "/", params: { tab: "Shoots" } });
            } catch (e) {
              setError(humanError(e));
            }
          }}
        />
        {meta.setupId && (
          <Button
            title="Start recreation"
            disabled={Boolean(invalidDate) || !form.name.trim()}
            onPress={() => {
              try {
                if (invalidDate) throw new Error(invalidDate);
                const shootId = save();
                const setup = repo.setup(meta.setupId);
                const attempt = repo.startRecreation(
                  setup.current_version_id,
                  shootId,
                );
                refresh();
                router.replace({
                  pathname: "/recreate/[id]",
                  params: { id: attempt },
                });
              } catch (e) {
                setError(humanError(e));
              }
            }}
          />
        )}
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
