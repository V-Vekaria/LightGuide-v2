import React, { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "../src/ui/Store";
import {
  Body,
  Button,
  Card,
  Choice,
  Confirm,
  ErrorMessage,
  Field,
  Screen,
  Label,
} from "../src/ui/components";
import { humanError, type EquipmentInput } from "../src/domain/schema";
export default function Equipment() {
  const { repo, refresh } = useStore(),
    { id } = useLocalSearchParams<{ id?: string }>(),
    old = repo.equipment().find((e) => e.id === id);
  const [form, setForm] = useState<EquipmentInput>({
      kind: (old?.kind as EquipmentInput["kind"]) ?? "light",
      name: old?.name ?? "",
      manufacturer: old?.manufacturer ?? "",
      model: old?.model ?? "",
      notes: old?.notes ?? "",
      details: old ? JSON.parse(old.details) : {},
    }),
    [error, setError] = useState<string | null>(null),
    [remove, setRemove] = useState(false);
  const save = () => {
    try {
      repo.saveEquipment(form, id);
      refresh();
      router.replace({ pathname: "/", params: { tab: "Equipment" } });
    } catch (e) {
      setError(humanError(e));
    }
  };
  return (
    <Screen
      back
      title={id ? "Equipment details." : "Add your equipment."}
      subtitle="Save one record per item, then select it when creating a setup."
    >
      <ErrorMessage message={error} />
      <Card>
        <Label>Equipment type</Label>
        <Body muted>
          Choose what this item is. These buttons set its category.
        </Body>
        <Choice
          options={
            [
              "camera",
              "lens",
              "light",
              "modifier",
              "reflector",
              "other",
            ] as const
          }
          value={form.kind}
          onChange={(kind) => setForm({ ...form, kind })}
        />
        <Field
          label="Equipment name"
          value={form.name}
          onChange={(name) => setForm({ ...form, name })}
          placeholder={
            form.kind === "reflector"
              ? "Silver reflector — 80 cm"
              : form.kind === "lens"
                ? "Canon 50 mm lens"
                : "Main studio light"
          }
        />
        <Body muted>
          Name this specific item, not a quantity. For two reflectors, use names
          such as “Silver reflector” and “White reflector”.
        </Body>
        <Field
          label="Manufacturer (optional)"
          value={form.manufacturer ?? ""}
          onChange={(manufacturer) => setForm({ ...form, manufacturer })}
        />
        <Field
          label="Model (optional)"
          value={form.model ?? ""}
          onChange={(model) => setForm({ ...form, model })}
        />
        <Field
          label="Equipment notes"
          multiline
          value={form.notes ?? ""}
          onChange={(notes) => setForm({ ...form, notes })}
        />
        <Button title="Save equipment" onPress={save} />
        {id && (
          <Button
            title="Remove from inventory"
            kind="danger"
            onPress={() => setRemove(true)}
          />
        )}
      </Card>
      {remove && (
        <Confirm
          title="Remove this equipment?"
          message="This item will be removed from future shoot packing lists. Historical setups retain its recorded details."
          onCancel={() => setRemove(false)}
          onConfirm={() => {
            try {
              repo.removeEquipment(id!);
              refresh();
              router.replace({ pathname: "/", params: { tab: "Equipment" } });
            } catch (e) {
              setError(humanError(e));
              setRemove(false);
            }
          }}
        />
      )}
      <Body muted>
        Equipment specifications are your records. Compatibility is not
        automatically verified.
      </Body>
    </Screen>
  );
}
