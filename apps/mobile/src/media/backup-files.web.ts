import * as Picker from "expo-document-picker";
export async function chooseBackup(): Promise<string | null> {
  const result = await Picker.getDocumentAsync({
    type: ["application/json", "text/plain"],
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0]!;
  if (!asset.file) throw new Error("Could not read this backup.");
  if (asset.file.size > 70 * 1024 * 1024)
    throw new Error("Choose a backup smaller than 70 MB.");
  return asset.file.text();
}
export async function shareBackup(text: string) {
  const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "lightguide-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
