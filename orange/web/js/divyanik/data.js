// DivyaNik sample content. DivyaNik's own passage, question and mission libraries can replace these:
// typing passages are also read from /DivyaNik/Typing passages.txt in the box (one passage per paragraph).

export const PATHWAYS = [['junior', 'Junior', 'Ages 7–12'], ['academic', 'Academic', 'Ages 13–18'], ['professional', 'Professional', 'College and work']];
export const DIMS = [['comprehension', 'Comprehension'], ['vocabulary', 'Vocabulary'], ['critical', 'Critical thinking'], ['retention', 'Retention']];

const Q = (d, q, ...a) => ({ d, q, a, c: 0 });   // the first answer is the right one; answers are shuffled when shown
export const PASSAGES = [
  { id: 'kite', path: 'junior', title: 'The Kite Festival', text: `Every January, the sky above Meena's town turns into a rainbow. It is the kite festival. Meena and her grandfather wake up before sunrise to prepare. Grandfather checks the string, called manja, for knots, while Meena ties a long paper tail to her red kite. "A good tail keeps the kite steady," he explains.

By eight o'clock, the rooftops are crowded with families. People shout and laugh as kites dip and dive. Meena's kite climbs slowly at first. Then a strong breeze lifts it higher than the water tank and the temple tower.

Suddenly, a green kite crosses her string. Meena pulls gently instead of tugging hard, just as Grandfather taught her. The green kite drifts away, and her red kite keeps flying. At sunset, Meena is tired but happy. Her kite has stayed up all day, and she has learned that patience can be stronger than force.`,
    qs: [Q('comprehension', 'What does Meena tie to her kite?', 'A long paper tail', 'A small bell', 'A cloth ribbon', 'A flag'), Q('comprehension', 'What colour is Meena\'s kite?', 'Red', 'Green', 'Yellow', 'Blue'),
      Q('vocabulary', 'In the story, "manja" means…', 'The kite string', 'A kind of sweet', 'The kite\'s tail', 'A rooftop'), Q('critical', 'Why did Meena pull gently when the green kite crossed her string?', 'Her grandfather taught her that patience works better than force', 'She was too tired to pull', 'She wanted the green kite to win', 'Her string was broken'),
      Q('retention', 'When does the kite festival happen?', 'In January', 'In June', 'In October', 'Every week'), Q('critical', 'What is the main lesson of the story?', 'Patience can be stronger than force', 'Red kites are the best', 'Festivals are noisy', 'Kites need no wind')] },
  { id: 'bees', path: 'junior', title: 'How Honeybees Talk', text: `Honeybees cannot speak, but they still share important news. When a worker bee finds a field full of flowers, she flies back to the hive and performs a dance.

If the flowers are close by, she runs in a small circle. This is called the round dance. If the flowers are far away, she does a waggle dance. She walks in a straight line while shaking her body from side to side, then loops back and repeats. The direction of the straight line tells the other bees which way to fly, using the sun as a guide. The longer she waggles, the farther away the flowers are.

The other bees touch her with their antennae and smell the flowers on her body. Then they leave the hive and find the food themselves. Scientists spent many years watching bees before they understood this clever language.`,
    qs: [Q('comprehension', 'What does a bee do when flowers are close to the hive?', 'A round dance', 'A waggle dance', 'A buzzing song', 'Nothing at all'), Q('comprehension', 'What do bees use as a guide for direction?', 'The sun', 'The moon', 'The wind', 'Trees'),
      Q('vocabulary', '"Antennae" are…', 'Feelers on an insect\'s head', 'Wings', 'Legs', 'Flowers'), Q('critical', 'A long waggle dance most likely means…', 'The flowers are far away', 'The bee is tired', 'The flowers are close', 'It will rain'),
      Q('retention', 'How do other bees learn which flowers were found?', 'They smell the flowers on the dancer', 'The queen tells them', 'They read a map', 'They guess'), Q('critical', 'Why is the bee dance called a "language"?', 'It shares information others understand', 'Bees use words', 'It has an alphabet', 'Bees learn it at school')] },
  { id: 'stepwell', path: 'academic', title: 'The Stepwell Engineers', text: `Long before taps and pipelines, people in the dry regions of western India faced a hard question: how do you store water through months without rain? One brilliant answer was the stepwell. A stepwell is a deep well reached by long flights of stone steps. During the monsoon, rainwater filled the well. As the dry season went on and the water level fell, people simply walked further down the steps to reach it.

Stepwells did more than store water. Because they went deep underground, the air at the bottom stayed cool even in summer, so travellers rested there and communities gathered to talk. Many were decorated with carved pillars and patterns that still impress visitors today. Chand Baori in Rajasthan is one of the deepest, with about 3,500 narrow steps arranged in a criss-cross pattern over thirteen levels. Rani ki Vav in Gujarat, built in the eleventh century, is now a UNESCO World Heritage Site and is famous for its hundreds of sculptures.

Over time, many stepwells were abandoned as piped water arrived and silt filled them. Today, engineers and local groups are restoring some of them, not only to protect history but also to help recharge groundwater. The old builders understood something we are relearning: saving rain where it falls is one of the smartest ways to survive a dry year.`,
    qs: [Q('comprehension', 'What problem did stepwells solve?', 'Storing water through dry months', 'Keeping animals safe', 'Growing rice', 'Building roads'), Q('vocabulary', 'In the passage, "abandoned" means…', 'Left and no longer used', 'Decorated', 'Repaired', 'Filled with water'),
      Q('critical', 'Why did people walk further down the steps as the dry season went on?', 'The water level was falling', 'The lower steps were cooler', 'It was a festival custom', 'The upper steps were broken'), Q('retention', 'About how many steps does Chand Baori have?', 'About 3,500', 'About 350', 'About 35,000', 'About 13'),
      Q('critical', 'Which idea does the author most want readers to take away?', 'Saving rain where it falls is still smart', 'Stepwells are only for tourists', 'Pipelines should be removed', 'Rajasthan has no rain'), Q('comprehension', 'Besides storing water, how were stepwells useful?', 'They were cool places to rest and meet', 'They were gold markets', 'They were prisons', 'They held boat races')] },
  { id: 'forget', path: 'academic', title: 'Why We Forget', text: `In the 1880s, a German psychologist named Hermann Ebbinghaus ran an unusual experiment on himself. He memorised lists of meaningless syllables, such as "DAX" and "BOK", and then tested how many he could remember after different amounts of time. His results showed a pattern now called the forgetting curve: we lose much of what we learn very quickly, often within a day, and then the rate of forgetting slows down.

The good news is that the curve can be flattened. Each time we review information, especially just as we are about to forget it, the memory becomes stronger and fades more slowly. This idea is called spaced repetition. Instead of reading notes ten times in one evening, a student who reviews them after one day, then three days, then a week, will usually remember far more with less total effort. Testing yourself helps even more than rereading, because pulling an answer out of memory strengthens the path to it.

Sleep matters too: during deep sleep, the brain replays and organises the day's learning. So the next time an exam is coming, the smartest plan is not one long night of cramming, but short, spread-out sessions, quick self-tests and a good night's rest.`,
    qs: [Q('comprehension', 'What did Ebbinghaus memorise in his experiment?', 'Meaningless syllables', 'Poems', 'Phone numbers', 'Maps'), Q('vocabulary', '"Cramming" means…', 'Studying a lot just before a test', 'Taking neat notes', 'Sleeping early', 'Reading slowly'),
      Q('critical', 'Why does self-testing help more than rereading?', 'Recalling an answer strengthens the memory', 'It takes less time', 'Tests are more fun', 'Rereading damages memory'), Q('retention', 'When is forgetting fastest, according to the forgetting curve?', 'Soon after learning', 'After a week', 'After a month', 'Only during sleep'),
      Q('critical', 'Which study plan fits the passage best?', 'Short reviews spread over several days', 'One long session the night before', 'Reading notes ten times in a row', 'Studying without sleep'), Q('comprehension', 'What does the brain do during deep sleep?', 'Replays and organises learning', 'Deletes old memories', 'Stops working', 'Learns new languages')] },
  { id: 'twominute', path: 'professional', title: 'The Two-Minute Rule at Work', text: `Most workplaces suffer from the same quiet problem: small tasks pile up until they feel large. An unanswered email, a form waiting for a signature, a file that needs renaming. Each one takes almost no time, yet together they create a constant background stress.

One practical habit for handling them is the two-minute rule, popularised by the productivity writer David Allen. The rule is simple: if a task will take less than two minutes, do it now rather than adding it to a list. Writing it down, reading it again later and remembering the context often costs more time than the task itself.

The rule has limits. It works best for genuinely tiny tasks and should not be used to avoid deep work. If you spend the whole morning on two-minute jobs, the important project that needs two quiet hours never moves forward. Many professionals therefore combine it with time blocking: they reserve fixed periods for focused work, and handle quick tasks in short batches between those blocks. Used this way, the two-minute rule keeps small things from growing, while protecting time for the work that matters most.`,
    qs: [Q('comprehension', 'What does the two-minute rule say?', 'If a task takes under two minutes, do it now', 'Take a two-minute break every hour', 'Reply to emails within two minutes', 'Plan for two minutes a day'), Q('vocabulary', '"Popularised" means…', 'Made widely known', 'Invented in secret', 'Banned', 'Forgotten'),
      Q('critical', 'What is the main risk of using the rule too much?', 'Important deep work gets pushed aside', 'Emails get longer', 'Lists get shorter', 'Meetings are cancelled'), Q('retention', 'Which habit do many professionals combine with the rule?', 'Time blocking', 'Working weekends', 'Multitasking', 'Daily meetings'),
      Q('critical', 'Why can writing a small task down cost more than doing it?', 'You must reread it and recall the context later', 'Paper is expensive', 'Lists are not allowed', 'Writing is slow'), Q('comprehension', 'What creates "background stress" in the passage?', 'Many small unfinished tasks', 'Large projects', 'Long holidays', 'Loud offices')] },
  { id: 'listen', path: 'professional', title: 'Listening in Meetings', text: `In many meetings, people are not really listening; they are waiting for their turn to talk. Active listening is the skill of giving full attention to the speaker so that you understand the message, not just the words. It starts with small signals: looking at the speaker, putting the phone away and not interrupting.

The next step is to check your understanding. A short summary such as "So the main concern is the delivery date, not the cost?" gives the speaker a chance to correct you before a misunderstanding grows. Good listeners also ask open questions, which begin with words like "how" or "what", instead of questions that can only be answered with yes or no. Open questions invite people to share details they might otherwise keep to themselves.

Finally, active listening means noticing what is not said. A colleague who agrees quickly but looks uncertain may have doubts worth exploring after the meeting. Teams that listen well make fewer mistakes, solve problems faster and trust each other more. The habit takes practice, but it costs nothing and can be improved in every conversation.`,
    qs: [Q('comprehension', 'What is active listening?', 'Giving full attention to understand the message', 'Talking more in meetings', 'Only taking notes', 'Agreeing with everyone'), Q('vocabulary', 'An "open question" is one that…', 'Invites a detailed answer', 'Can only be answered yes or no', 'Is asked in public', 'Has no answer'),
      Q('critical', 'Why does the writer suggest summarising what the speaker said?', 'To catch misunderstandings early', 'To end the meeting faster', 'To show you are the leader', 'To avoid questions'), Q('retention', 'Which word could begin an open question?', 'How', 'Is', 'Did', 'Can'),
      Q('critical', 'A colleague agrees quickly but looks unsure. What does the passage suggest?', 'Explore their doubts later', 'Ignore it', 'Ask them to leave', 'Change the topic'), Q('comprehension', 'Which benefit of listening well is mentioned?', 'Teams trust each other more', 'Meetings get longer', 'Fewer meetings are needed', 'Salaries rise')] },
];

// Typing: five levels; two passing attempts unlock the next one.
export const LEVELS = [
  { n: 1, name: 'Starter', wpm: 15, acc: 85 }, { n: 2, name: 'Explorer', wpm: 25, acc: 88 }, { n: 3, name: 'Achiever', wpm: 35, acc: 92 },
  { n: 4, name: 'Expert', wpm: 45, acc: 94 }, { n: 5, name: 'Master', wpm: 60, acc: 96 },
];
export const DURATIONS = [[30, '30 sec'], [60, '1 min'], [180, '3 min'], [300, '5 min'], [600, '10 min']];
export const TYPING = {
  1: ['a sad lad had a fall', 'ask dad for a glass of milk', 'the cat sat on the mat and had a nap', 'we go to the park to play and run', 'the sun is hot and the sky is blue'],
  2: ['My friend and I ride our bikes to school every morning.', 'The little bird sat on the wall and sang a happy song.', 'Please put the books back on the shelf after you read them.', 'We planted ten seeds and watered them every day.'],
  3: ['Reading every day builds a strong vocabulary, and a strong vocabulary makes reading easier. It is a circle that keeps getting better.', 'The library was quiet, except for the soft sound of pages turning. Ravi found a book about volcanoes and forgot the time.', 'Good typists keep their eyes on the screen, not the keyboard. Their fingers rest on the home row and return there after each key.'],
  4: ['On 15 August 1947, India became independent. Every year, schools, offices and homes celebrate the day with flags, songs and speeches.', 'Our train left Chennai Central at 6:40 a.m. and reached Bengaluru by 11:55 a.m., covering about 360 kilometres in just over five hours.', 'Mount Everest is 8,849 metres tall. Climbers need weeks to adjust to the thin air, and most expeditions start in April or May.'],
  5: ['Effective communication is not just about choosing the right words; it is about timing, tone and attention. A message delivered at the wrong moment, however clear, may never be heard.', 'Renewable energy (solar, wind and hydro) supplied a growing share of India\'s electricity this decade, but storage, grid stability and financing remain the "hard problems" for engineers and planners.', 'Before submitting any report, check three things: are the numbers correct, are the sources cited, and would a reader who knows nothing about the project understand the conclusion?'],
  cert: ['Typing is a practical skill that grows with steady practice. Accuracy comes first, because every mistake costs time to correct. Speed follows naturally when the fingers learn where every key lives.', 'A good certificate test measures what you can do without help. Sit comfortably, keep your wrists relaxed, and let your eyes stay on the text while your fingers find the keys.'],
};

// QuestVerse: age bands and the mission templates from the scope, with a sample monthly edition.
export const AGE_BANDS = ['4–6', '7–9', '10–12', '13–15', '16–18', '19–25', '26+'];
export const TIERS = [['PRISM Explorer', 1, '🧭'], ['PRISM Voyager', 3, '🛶'], ['PRISM Champion', 5, '🏅'], ['PRISM Master', 7, '👑']];
export const RUBRIC = [['Idea', 'Is the idea clear and interesting?'], ['Effort', 'Did they put real care into it?'], ['Explanation', 'Do they explain why or how?'], ['Originality', 'Is it their own fresh thinking?']];
const young = band => AGE_BANDS.indexOf(band) <= 1;
export const EDITION = {
  name: 'November edition', theme: 'Look closer: the world around you',
  missions: [
    { id: 'observer', title: 'The Silent Observer', kind: 'order', skill: 'Observation and sequencing', icon: '🔍', how: 'Put the steps in the order they really happen.',
      versions: band => (young(band)
        ? [['🌱 Plant a seed', '💧 Water it', '🌿 A shoot comes up', '🌻 A flower opens'], ['🥚 An egg', '🐛 A caterpillar', '🛏️ A cocoon', '🦋 A butterfly'], ['☁️ Clouds gather', '🌧️ Rain falls', '☀️ The sun comes out', '🌈 A rainbow appears']]
        : [['Wash the rice until the water runs clear', 'Soak it for twenty minutes', 'Boil water with a pinch of salt', 'Add the rice and cover the pot', 'Simmer until the water is absorbed', 'Rest it for five minutes, then fluff it'],
           ['Notice a problem in your street', 'Talk to neighbours about it', 'Collect facts and photos', 'Write a short proposal', 'Share it with the local council', 'Follow up on the response'],
           ['Water evaporates from the sea', 'Vapour rises and cools', 'Droplets form clouds', 'Clouds grow heavy', 'Rain falls on the land', 'Rivers carry water back to the sea']]) },
    { id: 'architect', title: 'The Word Architect', kind: 'build', skill: 'Language and grammar', icon: '🏗️', how: 'Tap the word blocks to build a correct sentence.',
      versions: band => (young(band)
        ? ['The cat is on the mat.', 'I can see a red ball.', 'We like to play outside.']
        : ['The museum opens at ten every morning.', 'Curious students ask questions before they answer.', 'Rainwater can be stored in tanks for dry months.', 'Our team finished the project ahead of time.']) },
    { id: 'heritage', title: 'The Heritage Time Detective', kind: 'quiz', skill: 'Heritage and knowledge', icon: '🕵️', how: 'Solve the clues about India\'s heritage.',
      versions: band => (young(band)
        ? [['Which one is a diya (lamp)?', '🪔', '🎈', '⚽', '🍎'], ['Which animal is India\'s national animal?', '🐅', '🐘', '🐄', '🐒'], ['Which one is a peacock?', '🦚', '🦆', '🐓', '🦜'], ['Which fruit is India\'s national fruit?', '🥭', '🍎', '🍌', '🍇'], ['Which one is a lotus?', '🪷', '🌻', '🌹', '🌵']]
        : [['The Taj Mahal is in which city?', 'Agra', 'Delhi', 'Jaipur', 'Mumbai'], ['Who designed India\'s national flag?', 'Pingali Venkayya', 'Rabindranath Tagore', 'B. R. Ambedkar', 'Sarojini Naidu'], ['The Brihadeeswarar Temple in Thanjavur was built by…', 'Raja Raja Chola I', 'Ashoka', 'Akbar', 'Krishnadevaraya'],
           ['Which ancient city had a famous Great Bath?', 'Mohenjo-daro', 'Hampi', 'Pataliputra', 'Madurai'], ['Ajanta and Ellora caves are in which state?', 'Maharashtra', 'Kerala', 'Odisha', 'Punjab'], ['Kathakali is a dance form from…', 'Kerala', 'Gujarat', 'Assam', 'Bihar']]) },
    { id: 'ecocity', title: 'The 24-Hour Eco City', kind: 'allocate', skill: 'Planning and reasoning', icon: '🏙️', how: 'You have 100 points to make a city greener in one day. Share them out (the total must be exactly 100), then explain your plan.',
      versions: () => [[['🌳 Trees', 0], ['☀️ Solar power', 0], ['🚌 Buses', 0], ['💧 Saving water', 0], ['♻️ Recycling', 0], ['🚲 Cycle lanes', 0]]] },
    { id: 'inventor', title: 'The Second-Life Inventor', kind: 'submit', media: 'photo', skill: 'Creativity and reuse', icon: '♻️', how: 'Give something old a second life. Take a photo of what you made, add it from your Pictures, and describe it.' },
    { id: 'idea90', title: 'The Idea in 90 Seconds', kind: 'submit', media: 'audio or video', timer: 90, skill: 'Speaking and confidence', icon: '🎤', how: 'Plan a 90-second talk about one idea that could make your school or street better. Use the timer to practise, record it on any device, add the file from your box, and write your main points.' },
    { id: 'connected', title: 'The Connected Mind', kind: 'reflect', minWords: 60, skill: 'Reflection and writing', icon: '🧠', how: 'Think of two things you learned this month that turned out to be connected. Write how they link together.' },
  ],
};
