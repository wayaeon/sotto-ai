export interface PracticeSignals {
  fillerRate: number;
  repeatedWords: number;
  wpm: number;
  vocabularyRichness: number;
}

export interface PracticeFocus {
  title: string;
  detail: string;
  prompt: string;
}

const SYNONYMS: Record<string, string[]> = {
  good: ["strong", "solid", "effective"],
  bad: ["rough", "weak", "unhelpful"],
  big: ["large", "major", "substantial"],
  small: ["brief", "limited", "compact"],
  thing: ["detail", "element", "part"],
  stuff: ["details", "materials", "work"],
  get: ["receive", "find", "understand"],
  make: ["create", "build", "prepare"],
  use: ["apply", "run", "work with"],
  want: ["prefer", "need", "aim for"],
  can: ["may", "could", "be able to"],
  please: ["kindly", "if you can", "I’d appreciate it if you could"],
  just: ["simply", "only", "exactly"],
  right: ["correct", "accurate", "appropriate"],
  now: ["currently", "at present", "immediately"],
  set: ["establish", "configure", "choose"],
  help: ["support", "guide", "assist"],
  show: ["demonstrate", "explain", "present"],
  think: ["believe", "consider", "suspect"],
  really: ["especially", "genuinely", "strongly"],
  important: ["essential", "key", "significant"],
  problem: ["issue", "constraint", "challenge"],
  change: ["adjust", "revise", "transform"],
  start: ["begin", "launch", "initiate"],
  finish: ["complete", "close", "wrap up"],
  look: ["appear", "seem", "review"],
};

export function synonymsForWord(word: string): string[] {
  const matches = SYNONYMS[word.trim().toLowerCase()];
  return matches ? [...matches] : [];
}

export function derivePracticeFocus(input: PracticeSignals): PracticeFocus {
  if (input.fillerRate === 0 && input.repeatedWords === 0 && input.wpm === 0 && input.vocabularyRichness === 0) {
    return {
      title: "Build your baseline",
      detail: "A few dictations will give this coach something real to learn from.",
      prompt: "Speak naturally for 30 seconds and finish each thought before starting the next.",
    };
  }
  if (input.fillerRate > 0.08) {
    return {
      title: "Create a cleaner pause",
      detail: "Filler words are your clearest current signal.",
      prompt: "Pause for one beat instead of saying ‘um’ or ‘like’.",
    };
  }
  if (input.repeatedWords > 0) {
    return {
      title: "Finish each thought once",
      detail: "Repeated words are showing up in recent sessions.",
      prompt: "Say the sentence once, then leave a short pause before continuing.",
    };
  }
  if (input.wpm > 170) {
    return {
      title: "Give important words room",
      detail: "Your recent pace is running high.",
      prompt: "Slow the next sentence slightly and land the final word.",
    };
  }
  if (input.vocabularyRichness < 0.2) {
    return {
      title: "Choose a more precise word",
      detail: "Your current vocabulary range is concentrated.",
      prompt: "Replace one familiar word with a more specific alternative.",
    };
  }
  return {
    title: "Keep your current rhythm",
    detail: "Your recent signals are steady.",
    prompt: "Keep one deliberate pause in the next thought.",
  };
}
