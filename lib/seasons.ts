// The parade changes with the month, the way the Monday.com llamas did.
export type Season = { id: string; name: string; cast: string[] };

const SEASONS: Record<number, Season> = {
  1:  { id: "winter",  name: "Deep winter",   cast: ["⛄", "❄️", "🐧", "🧣", "☕"] },
  2:  { id: "hearts",  name: "Valentines",    cast: ["💗", "💌", "🌹", "🧸", "💘"] },
  3:  { id: "spring",  name: "St Patrick's",  cast: ["🍀", "🌈", "🌷", "☘️", "🪴"] },
  4:  { id: "easter",  name: "Easter",        cast: ["🐰", "🌸", "🥚", "🦆", "🌦️"] },
  5:  { id: "bloom",   name: "Late spring",   cast: ["🌼", "🐝", "🦋", "🌺", "🐞"] },
  6:  { id: "summer",  name: "Early summer",  cast: ["☀️", "🍉", "🕶️", "🏖️", "🐠"] },
  7:  { id: "july",    name: "Fourth of July", cast: ["🎆", "🎇", "🍦", "🗽", "🎈"] },
  8:  { id: "peach",   name: "Georgia summer", cast: ["🍑", "🌻", "🌴", "🍋", "🦩"] },
  9:  { id: "school",  name: "Back to school", cast: ["🍎", "📚", "✏️", "🍂", "🎒"] },
  10: { id: "spooky",  name: "Hallowe'en",    cast: ["🎃", "👻", "🦇", "🕸️", "🐈‍⬛"] },
  11: { id: "harvest", name: "Thanksgiving",  cast: ["🦃", "🍁", "🌽", "🥧", "🐿️"] },
  12: { id: "holiday", name: "The holidays",  cast: ["🎄", "🎁", "⛄", "🔔", "🦌"] },
};

export function seasonFor(d = new Date()): Season {
  return SEASONS[d.getMonth() + 1] || SEASONS[1];
}
export const ALL_SEASONS = Object.values(SEASONS);
