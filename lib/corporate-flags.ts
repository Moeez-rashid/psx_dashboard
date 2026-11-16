/** PSX's XD / XB / XR session markers and what each one means, in one short line. */
const FLAG_MEANINGS: Record<string, string> = {
  XD: "Ex-dividend: buying now won't get you the latest dividend",
  XB: "Ex-bonus: buying now won't get you the latest bonus shares",
  XR: "Ex-rights: buying now won't get you the latest right shares",
};

export function flagInfo(code: string): { meaning: string } {
  return { meaning: FLAG_MEANINGS[code] ?? code };
}
