/** "Nour El-Sayed" -> "Nour E." (privacy default). */
export function displayNameOf(fullName: string, showFullLastName: boolean): string {
  const parts = fullName.trim().split(/\s+/);
  if (showFullLastName || parts.length < 2) return fullName.trim();
  const last = parts[parts.length - 1]!;
  // Arabic family names usually start with the article "ال": "السيد" -> "س."
  const initial = last.startsWith('ال') && last.length > 2 ? last.charAt(2) : last.charAt(0).toUpperCase();
  return `${parts[0]} ${initial}.`;
}
