// Broad topics for prompts, used for players' "best topics" and the admin
// segments. Safe to import from client code (no answers here).

export const TOPICS = [
  "geography",
  "history",
  "science",
  "nature",
  "food",
  "sports and games",
  "pop culture",
  "music and art",
  "language",
  "everyday objects",
] as const;

export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABEL: Record<Topic, string> = {
  geography: "Geography",
  history: "History & myth",
  science: "Science",
  nature: "Nature & animals",
  food: "Food & drink",
  "sports and games": "Sports & games",
  "pop culture": "Pop culture",
  "music and art": "Music & art",
  language: "Words & language",
  "everyday objects": "Everyday things",
};

export const isTopic = (t: string): t is Topic => (TOPICS as readonly string[]).includes(t);
