/** PSX's XD / XB / XR session markers, written out instead of shown as bare codes. */
const FLAG_LABELS: Record<string, string> = { XD: "Ex-dividend", XB: "Ex-bonus", XR: "Ex-rights" };

export function flagInfo(code: string): { label: string } {
  return { label: FLAG_LABELS[code] ?? code };
}
