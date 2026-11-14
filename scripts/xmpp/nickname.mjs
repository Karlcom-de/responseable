// The room-scoped identity supplies a stable suffix even when participants share a name.
export function roomNickname(name, user) {
  const cleaned = name.normalize('NFKC').replace(/[\p{C}\p{Z}]/gu, ' ').replace(/\s+/g, ' ').trim();
  const label = Array.from(cleaned).slice(0, 48).join('').trimEnd() || 'Participant';
  return label + ' · ' + user.slice(3, 15);
}
