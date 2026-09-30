import React, { useState } from "react";
import { Badge, Body, Button, Card, ErrorMessage, Heading, Screen } from "../src/ui/components";
import { useStore } from "../src/ui/Store";
import { shareNotes } from "../src/media/media";
import { humanError } from "../src/domain/schema";

export default function Backup() {
  const { repo } = useStore();
  const [error, setError] = useState<string | null>(null);
  const setups = repo.setups();
  return (
    <Screen back title="Data & backup" subtitle="Keep an honest copy of the records this build can export.">
      <ErrorMessage message={error} />
      <Card>
        <Badge tone="warning">FULL BACKUP NOT YET AVAILABLE</Badge>
        <Heading>Stored on this device</Heading>
        <Body>{setups.length} active setups · {repo.equipment().length} equipment items · {repo.shoots().length} shoots</Body>
        <Body muted>
          This build can export setup notes and history as JSON. Photo files are
          not included, and importing a full workspace is not implemented, so
          LightGuide does not describe this as a complete backup.
        </Body>
      </Card>
      {setups.map((setup) => (
        <Card key={setup.id}>
          <Heading>{setup.title}</Heading>
          {repo.isExampleSetup(setup.id) && <Badge>EXAMPLE SETUP · DEMO</Badge>}
          <Button
            title="Export setup notes"
            kind="secondary"
            onPress={() => shareNotes(repo, setup.id).catch((e) => setError(humanError(e)))}
          />
        </Card>
      ))}
      <Card>
        <Heading>Before uninstalling</Heading>
        <Body muted>
          Uninstalling or clearing app storage removes setups and photographs.
          Do not rely on notes export as a photo backup.
        </Body>
      </Card>
    </Screen>
  );
}
