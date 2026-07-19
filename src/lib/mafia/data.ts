export type Role =
  | "Godfather"
  | "Mafia"
  | "Civilian"
  | "Doctor"
  | "Detective"
  | "Jailer"
  | "Terrorist";

export type Alignment = "town" | "mafia" | "neutral";

export type ActionCard = [string, string];

export const ROLE_TABLE: Record<number, Partial<Record<Role, number>>> = {
  6:  { Godfather: 1, Civilian: 2, Mafia: 2, Doctor: 1 },
  7:  { Godfather: 1, Civilian: 3, Mafia: 2, Doctor: 1 },
  8:  { Godfather: 1, Civilian: 2, Mafia: 2, Detective: 1, Terrorist: 1, Doctor: 1 },
  9:  { Godfather: 1, Civilian: 2, Mafia: 2, Detective: 1, Terrorist: 1, Jailer: 1, Doctor: 1 },
  10: { Godfather: 1, Civilian: 3, Mafia: 2, Detective: 1, Terrorist: 1, Jailer: 1, Doctor: 1 },
  11: { Godfather: 1, Civilian: 3, Mafia: 3, Detective: 1, Terrorist: 1, Jailer: 1, Doctor: 1 },
  12: { Godfather: 1, Civilian: 4, Mafia: 3, Detective: 1, Terrorist: 1, Jailer: 1, Doctor: 1 },
  13: { Godfather: 1, Civilian: 4, Mafia: 4, Detective: 1, Terrorist: 1, Jailer: 1, Doctor: 1 },
  14: { Godfather: 1, Civilian: 5, Mafia: 4, Detective: 1, Terrorist: 1, Jailer: 1, Doctor: 1 },
  15: { Godfather: 1, Civilian: 6, Mafia: 4, Detective: 1, Terrorist: 1, Jailer: 1, Doctor: 1 },
  16: { Godfather: 1, Civilian: 6, Mafia: 5, Detective: 1, Terrorist: 1, Jailer: 1, Doctor: 1 },
  17: { Godfather: 1, Civilian: 7, Mafia: 5, Detective: 1, Terrorist: 1, Jailer: 1, Doctor: 1 },
  18: { Godfather: 1, Civilian: 8, Mafia: 5, Detective: 1, Terrorist: 1, Jailer: 1, Doctor: 1 },
  19: { Godfather: 1, Civilian: 8, Mafia: 6, Detective: 1, Terrorist: 1, Jailer: 1, Doctor: 1 },
  20: { Godfather: 1, Civilian: 9, Mafia: 6, Detective: 1, Terrorist: 1, Jailer: 1, Doctor: 1 },
};

export const DOCTOR_CHANCES: Record<number, number> = {
  6: 2, 7: 2, 8: 2, 9: 3, 10: 4, 11: 4, 12: 4, 13: 5, 14: 6, 15: 6, 16: 6, 17: 6, 18: 6, 19: 6, 20: 6,
};

export const ROLE_INFO: Record<Role, string> = {
  Godfather:
    "You run the game. You don't win or lose with either side — your job is to narrate the Night Phase, keep everyone honest, and announce eliminations. Once every player has their own case file, you reveal yourself and break the final seal to see the full roster and the script.",
  Mafia:
    "You and the other Mafia know each other. Each night you silently agree on one player to eliminate. By day, blend in and cast doubt on the innocent.",
  Civilian:
    "You have no special power except your judgment. Watch, listen, and vote to eliminate whoever you believe is Mafia or the Terrorist.",
  Doctor:
    "Each night you may save the player the Mafia targeted, simply by nodding when the Godfather points at them. You only have a limited number of saves — spend them wisely.",
  Detective:
    "Each night, silently point to one player. The Godfather will signal, without words, whether your suspicion about their role is correct.",
  Jailer:
    "Each night, before the Mafia acts, silently choose one player to lock up. That player skips all action for the night.",
  Terrorist:
    "You're aligned with the Mafia but play alone. At any point during a Day Phase, you may sacrifice yourself to instantly eliminate one other player of your choice.",
};

export const ALIGNMENT: Record<Role, Alignment> = {
  Godfather: "neutral",
  Mafia: "mafia",
  Terrorist: "mafia",
  Civilian: "town",
  Doctor: "town",
  Detective: "town",
  Jailer: "town",
};

export const OPTIONAL_ROLES = ["Doctor", "Detective", "Jailer", "Terrorist"] as const;
export type OptionalRole = (typeof OPTIONAL_ROLES)[number];

export const ACTION_CARDS: ActionCard[] = [
  ["Protection", "Declare yourself immune from elimination for this round's vote."],
  ["Double Vote", "Cast two votes instead of one in this round's voting phase."],
  ["Silencer", "Pick a player — they can't speak or take part in discussion this round."],
  ["Sabotage", "Pick a player — they can't use their action card this round."],
  ["No Vote", "Sit this round's vote out entirely, if you'd rather not commit."],
  ["Mind Control", "Pick a player — they must vote exactly how you tell them to."],
  ["Time Warp", "Cancel everything that's happened this Day Phase and restart it from scratch."],
  ["Tiebreaker Authority", "If the vote ends in a tie, you alone decide who's eliminated."],
  ["Guardian Angel", "Pick a player — they cannot be voted out this round, no matter the count."],
  ["Night Standoff", "Pick a player — their role ability is switched off for the next Night Phase."],
  ["Last Minute Rescue", "The instant a player is voted out, you may save them from elimination."],
  ["Surprise Capture", "Blindly take another player's action card without knowing what it is first."],
  ["Undercover Inquiry", "Secretly ask the Godfather if a chosen player does or doesn't hold a specific role."],
  ["Lifeline", "If you end up with the most votes against you, play this to save yourself."],
  ["Secret Messenger", "Send a private message to another player, relayed silently through the Godfather."],
  ["Just Say No", "Cancel any other action card the moment it's played, before it takes effect."],
];

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildCardPool(count: number, source: ActionCard[]): ActionCard[] {
  const src = source.length ? source : ACTION_CARDS;
  let pool: ActionCard[] = [];
  while (pool.length < count) pool = pool.concat(shuffle(src));
  return shuffle(pool).slice(0, count);
}
