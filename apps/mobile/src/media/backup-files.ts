import { File, Paths } from "expo-file-system";
import * as Picker from "expo-document-picker";
import * as Sharing from "expo-sharing";
export async function chooseBackup(): Promise<string | null> {
  const result = await Picker.getDocumentAsync({
    type: ["application/json", "text/plain"],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0]!;
  if ((asset.size ?? 0) > 70 * 1024 * 1024)
    throw new Error("Choose a backup smaller than 70 MB.");
  return new File(asset.uri).text();
}
export async function shareBackup(text: string) {
  const f = new File(Paths.cache, "lightguide-backup.json");
  f.write(text);
  if (!(await Sharing.isAvailableAsync()))
    throw new Error("File sharing is unavailable.");
  await Sharing.shareAsync(f.uri, {
    mimeType: "application/json",
    dialogTitle: "Save LightGuide backup",
  });
}
