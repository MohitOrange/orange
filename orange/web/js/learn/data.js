// Learning content: English A–Z, Tamil letters (உயிர் + மெய்), numbers, and reading levels.
// Each item: [symbol, word, emoji, meaning?]

export const ENGLISH = [
  ['A', 'Apple', '🍎'], ['B', 'Ball', '⚽'], ['C', 'Cat', '🐱'], ['D', 'Dog', '🐶'], ['E', 'Elephant', '🐘'], ['F', 'Fish', '🐟'],
  ['G', 'Grapes', '🍇'], ['H', 'Hat', '🎩'], ['I', 'Ice cream', '🍦'], ['J', 'Juice', '🧃'], ['K', 'Kite', '🪁'], ['L', 'Lion', '🦁'],
  ['M', 'Moon', '🌙'], ['N', 'Nest', '🪺'], ['O', 'Orange', '🍊'], ['P', 'Parrot', '🦜'], ['Q', 'Queen', '👑'], ['R', 'Rabbit', '🐰'],
  ['S', 'Sun', '☀️'], ['T', 'Tiger', '🐯'], ['U', 'Umbrella', '☂️'], ['V', 'Van', '🚐'], ['W', 'Watch', '⌚'], ['X', 'X-ray', '🩻'],
  ['Y', 'Yo-yo', '🪀'], ['Z', 'Zebra', '🦓'],
];

// உயிர் எழுத்துக்கள் (vowels) + ஆய்த எழுத்து
export const TAMIL_VOWELS = [
  ['அ', 'அம்மா', '👩', 'mother'], ['ஆ', 'ஆடு', '🐐', 'goat'], ['இ', 'இலை', '🍃', 'leaf'], ['ஈ', 'ஈ', '🪰', 'fly'],
  ['உ', 'உலகம்', '🌍', 'world'], ['ஊ', 'ஊசி', '🪡', 'needle'], ['எ', 'எலி', '🐭', 'mouse'], ['ஏ', 'ஏணி', '🪜', 'ladder'],
  ['ஐ', 'ஐந்து', '5️⃣', 'five'], ['ஒ', 'ஒட்டகம்', '🐫', 'camel'], ['ஓ', 'ஓடம்', '⛵', 'boat'], ['ஔ', 'ஔவையார்', '👵', 'Avvaiyar'],
  ['ஃ', 'எஃகு', '🔩', 'steel'],
];

// மெய் எழுத்துக்கள் shown with அ sound (க, ங …). Words either start with the letter or contain it.
export const TAMIL_CONSONANTS = [
  ['க', 'கப்பல்', '🚢', 'ship'], ['ங', 'சங்கு', '🐚', 'conch'], ['ச', 'சட்டை', '👕', 'shirt'], ['ஞ', 'ஞாயிறு', '☀️', 'sun'],
  ['ட', 'டமாரம்', '🥁', 'drum'], ['ண', 'மணி', '🔔', 'bell'], ['த', 'தக்காளி', '🍅', 'tomato'], ['ந', 'நண்டு', '🦀', 'crab'],
  ['ப', 'பந்து', '⚽', 'ball'], ['ம', 'மரம்', '🌳', 'tree'], ['ய', 'யானை', '🐘', 'elephant'], ['ர', 'ரயில்', '🚂', 'train'],
  ['ல', 'லாரி', '🚚', 'lorry'], ['வ', 'வண்டு', '🐞', 'beetle'], ['ழ', 'பழம்', '🍎', 'fruit'], ['ள', 'வாள்', '⚔️', 'sword'],
  ['ற', 'பறவை', '🐦', 'bird'], ['ன', 'மீன்', '🐟', 'fish'],
];
export const TAMIL = [...TAMIL_VOWELS, ...TAMIL_CONSONANTS];

const EN_NUM = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const TA_NUM = ['ஒன்று', 'இரண்டு', 'மூன்று', 'நான்கு', 'ஐந்து', 'ஆறு', 'ஏழு', 'எட்டு', 'ஒன்பது', 'பத்து'];
const TA_DIGIT = ['௧', '௨', '௩', '௪', '௫', '௬', '௭', '௮', '௯', '௰'];
export const NUMBERS = EN_NUM.map((w, i) => [String(i + 1), w, '🔵'.repeat(Math.min(i + 1, 10)) + (i >= 10 ? ' +' + (i - 9) : ''), i < 10 ? `${TA_NUM[i]} · ${TA_DIGIT[i]}` : '']);

export const READING = {
  en: [
    { level: 1, name: 'Little words', items: ['CAT', 'DOG', 'SUN', 'BUS', 'PEN', 'HAT', 'CUP', 'BAG', 'RED', 'BOX', 'MAP', 'PIG'] },
    { level: 2, name: 'Bigger words', items: ['TREE', 'FISH', 'BOOK', 'MILK', 'APPLE', 'HOUSE', 'WATER', 'CHAIR', 'PLANT', 'HAPPY', 'TRAIN', 'SMILE'] },
    { level: 3, name: 'Short sentences', items: ['I like apples.', 'The cat is on the mat.', 'I can read a book.', 'The sun is hot.', 'My dog can run fast.', 'We play with a ball.'] },
    { level: 4, name: 'Longer sentences', items: ['The little bird sings in the morning.', 'I drink a glass of milk every day.', 'My friend and I go to school together.', 'The green frog jumps into the pond.'] },
  ],
  ta: [
    { level: 1, name: 'சிறிய சொற்கள்', items: ['அம்மா', 'அப்பா', 'பால்', 'மரம்', 'பூ', 'கண்', 'மீன்', 'நாய்', 'பூனை', 'வீடு'] },
    { level: 2, name: 'பெரிய சொற்கள்', items: ['தண்ணீர்', 'பள்ளிக்கூடம்', 'புத்தகம்', 'வாழைப்பழம்', 'கடிகாரம்', 'தக்காளி'] },
    { level: 3, name: 'சிறிய வாக்கியங்கள்', items: ['இது ஒரு மரம்.', 'நான் பால் குடிக்கிறேன்.', 'பூனை ஓடுகிறது.', 'வானம் நீலம்.', 'நான் புத்தகம் படிக்கிறேன்.'] },
  ],
};

export const LANGS = {
  en: { name: 'English', flag: '🔤', speech: 'en-IN', font: 'Sora, sans-serif', sets: [['letters', 'A to Z', ENGLISH]] },
  ta: { name: 'தமிழ் Tamil', flag: 'அ', speech: 'ta-IN', font: '"Nirmala UI", Latha, "Noto Sans Tamil", "Tamil Sangam MN", sans-serif', sets: [['vowels', 'உயிர் எழுத்துக்கள்', TAMIL_VOWELS], ['consonants', 'மெய் எழுத்துக்கள்', TAMIL_CONSONANTS]] },
  num: { name: 'Numbers 1–20', flag: '🔢', speech: 'en-IN', font: 'Sora, sans-serif', sets: [['numbers', '1 to 20', NUMBERS]] },
};
