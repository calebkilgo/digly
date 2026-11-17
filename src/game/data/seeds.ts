// Category definitions. Answers live in data/answers/*.txt and are compiled by
// scripts/build_answers.py into answers.generated.ts. Rarity values there are
// starting estimates (1 = everyone says it, 100 = almost nobody does); the
// server replaces them with real find rates as players dig.
// Server only: never import this from client code.

import { ANSWERS } from "./answers.generated";

export type Theme = "geography" | "biology" | "culture" | "science" | "food" | "sports";

export interface ChallengeSeed {
  slug: string;
  title: string;
  level: 1 | 2 | 3; // which depth this category is dug at: deeper = harder
  theme: Theme;
  prompt: string;
  noun: string;
  rules: string[];
  scoringVersion: number;
  answers: string;
  since?: number; // first day number this category can be dug (default: any)
}

export const SEEDS: ChallengeSeed[] = [
  {
    slug: "dog-breeds",
    level: 1,
    theme: "biology",
    title: "Dog breeds",
    prompt: "Name as many dog breeds as you can.",
    noun: "dog breeds",
    rules: ["Recognized breeds only.", "Designer crosses like the labradoodle don't count."],
    scoringVersion: 1,
    answers: ANSWERS["dog-breeds"],
  },
  {
    slug: "elements",
    level: 3,
    theme: "science",
    title: "Chemical elements",
    prompt: "Name as many chemical elements as you can.",
    noun: "elements",
    rules: ["Full element names.", "Symbols like Fe or Au don't count."],
    scoringVersion: 1,
    answers: ANSWERS["elements"],
  },
  {
    slug: "african-countries",
    level: 2,
    theme: "geography",
    title: "African countries",
    prompt: "Name as many African countries as you can.",
    noun: "countries",
    rules: ["The 54 sovereign UN member states.", "Older names like Zaire still count."],
    scoringVersion: 1,
    answers: ANSWERS["african-countries"],
  },
  {
    slug: "fruits",
    level: 1,
    theme: "food",
    title: "Fruits",
    prompt: "Name as many fruits as you can.",
    noun: "fruits",
    rules: ["Culinary or botanical fruits.", "Nuts and vegetables don't count."],
    scoringVersion: 1,
    answers: ANSWERS["fruits"],
  },
  {
    slug: "instruments",
    level: 2,
    theme: "culture",
    title: "Musical instruments",
    prompt: "Name as many musical instruments as you can.",
    noun: "instruments",
    rules: ["Specific instruments, not families like 'brass'.", "Brand names don't count."],
    scoringVersion: 1,
    answers: ANSWERS["instruments"],
  },
  {
    slug: "cheeses",
    level: 2,
    theme: "food",
    title: "Cheeses",
    prompt: "Name as many cheeses as you can.",
    noun: "cheeses",
    rules: ["Named cheese varieties.", "Dishes like fondue don't count."],
    scoringVersion: 1,
    answers: ANSWERS["cheeses"],
  },
  {
    slug: "us-states",
    title: "US states",
    level: 1,
    theme: "geography",
    prompt: "Name as many US states as you can.",
    noun: "states",
    rules: ["The 50 states.", "DC and territories don't count."],
    scoringVersion: 1,
    answers: ANSWERS["us-states"],
  },
  {
    slug: "birds",
    title: "Birds",
    level: 1,
    theme: "biology",
    prompt: "Name as many kinds of birds as you can.",
    noun: "birds",
    rules: ["Common bird names.", "Fictional birds don't count."],
    scoringVersion: 1,
    answers: ANSWERS["birds"],
  },
  {
    slug: "european-countries",
    title: "European countries",
    level: 2,
    theme: "geography",
    prompt: "Name as many European countries as you can.",
    noun: "countries",
    rules: ["Sovereign countries in Europe, including transcontinental ones.", "England, Scotland and Wales count as the UK."],
    scoringVersion: 1,
    answers: ANSWERS["european-countries"],
  },
  {
    slug: "dances",
    title: "Dances",
    level: 2,
    theme: "culture",
    prompt: "Name as many dances or dance styles as you can.",
    noun: "dances",
    rules: ["Named dances and dance styles.", "Song titles only count if they're a dance."],
    scoringVersion: 1,
    answers: ANSWERS["dances"],
  },
  {
    slug: "languages",
    title: "Languages",
    level: 3,
    theme: "culture",
    prompt: "Name as many languages as you can.",
    noun: "languages",
    rules: ["Real human languages, living or dead.", "Programming and fictional languages don't count."],
    scoringVersion: 1,
    answers: ANSWERS["languages"],
  },
  {
    slug: "bones",
    title: "Bones of the body",
    level: 3,
    theme: "biology",
    prompt: "Name as many bones in the human body as you can.",
    noun: "bones",
    rules: ["Anatomical or common names.", "Groups like carpals count once."],
    scoringVersion: 1,
    answers: ANSWERS["bones"],
  },
  {
    slug: "greek-myth",
    title: "Greek mythology",
    level: 3,
    theme: "culture",
    prompt: "Name as many figures from Greek mythology as you can.",
    noun: "figures",
    rules: ["Gods, titans, heroes, monsters and mortals.", "Roman names count for their Greek match."],
    scoringVersion: 1,
    answers: ANSWERS["greek-myth"],
  },
];

const more = (slug: string, level: 1 | 2 | 3, theme: Theme, title: string, noun: string, rules: string[], prompt?: string): ChallengeSeed => ({
  slug,
  level,
  theme,
  title,
  prompt: prompt ?? `Name as many ${noun} as you can.`,
  noun,
  rules,
  scoringVersion: 1,
  answers: ANSWERS[slug],
});

SEEDS.push(
  more("vegetables", 1, "food", "Vegetables", "vegetables", ["Culinary vegetables count, including beans and roots.", "Fruits like apples don't."]),
  more("sports", 1, "sports", "Sports", "sports", ["Organized sports and athletic events.", "Board and card games don't count, chess aside."]),
  more("car-brands", 1, "culture", "Car brands", "car brands", ["Car makers, past or present.", "Model names like Mustang don't count."]),
  more("flowers", 1, "biology", "Flowers", "flowers", ["Common names of flowering plants."]),
  more("herbs-spices", 1, "food", "Herbs & spices", "herbs and spices", ["Single herbs, spices and named blends."]),
  more("cat-breeds", 2, "biology", "Cat breeds", "cat breeds", ["Recognized and well-known breeds."]),
  more("gemstones", 2, "science", "Gemstones & minerals", "gemstones and minerals", ["Gems and named minerals."]),
  more("cocktails", 2, "food", "Cocktails", "cocktails", ["Named mixed drinks.", "Plain spirits like vodka don't count."]),
  more("nfl-teams", 2, "sports", "NFL teams", "NFL teams", ["Current NFL teams. The nickname alone is enough."]),
  more("state-capitals", 2, "geography", "US state capitals", "US state capitals", ["Capitals of the 50 states.", "Washington, D.C. isn't a state capital."]),
  more("programming-languages", 2, "science", "Programming languages", "programming languages", ["Languages you can write programs in.", "Markup like HTML doesn't count."]),
  more("dinosaurs", 3, "biology", "Dinosaurs", "dinosaurs", ["Dinosaur genera.", "Pterosaurs and sea reptiles don't count."]),
  more("horse-breeds", 3, "biology", "Horse breeds", "horse breeds", ["Breeds and well-known types, ponies included."]),
  more("knots", 3, "culture", "Knots", "knots", ["Named knots, hitches and bends."]),
  more("constellations", 3, "science", "Constellations", "constellations", ["The 88 official constellations.", "Asterisms like the Big Dipper don't count."]),
  more("egyptian-gods", 3, "culture", "Egyptian gods", "Egyptian gods", ["Gods and goddesses of ancient Egypt."]),
);
