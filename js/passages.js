// Reading passages. Each targets a different weakness of speech-to-text engines.
// Harvard sentences are from the IEEE "Recommended Practice for Speech Quality Measurements" (1969),
// the standard phonetically balanced set used in speech testing. Everything else is original.
window.PASSAGES = [
  {
    id: "harvard-1", category: "Phonetically balanced", name: "Harvard sentences · List 1",
    text: "The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background. It's easy to tell the depth of a well. These days a chicken leg is a rare dish. Rice is often served in round bowls. The juice of lemons makes fine punch. The box was thrown beside the parked truck. The hogs were fed chopped corn and garbage. Four hours of steady work faced us. A large size in stockings is hard to sell."
  },
  {
    id: "harvard-2", category: "Phonetically balanced", name: "Harvard sentences · List 2",
    text: "The boy was there when the sun rose. A rod is used to catch pink salmon. The source of the huge river is the clear spring. Kick the ball straight and follow through. Help the woman get back to her feet. A pot of tea helps to pass the evening. Smoky fires lack flame and heat. The soft cushion broke the man's fall. The salt breeze came across from the sea. The girl at the booth sold fifty bonds."
  },
  {
    id: "everyday", category: "Everyday", name: "Plain prose",
    text: "The quick brown fox jumps over the lazy dog while the morning sun climbs slowly above the quiet hills. A gentle breeze carries the smell of fresh bread from the bakery on the corner, and people begin to fill the streets."
  },
  {
    id: "conversational", category: "Everyday", name: "Conversational",
    text: "So I was thinking we could probably move the meeting to Thursday, because honestly Wednesday is already packed, and I would rather have a proper conversation than rush through everything in twenty minutes."
  },
  {
    id: "email", category: "Everyday", name: "Work email",
    text: "Hi team, thanks for joining the call this morning. Quick summary: the launch is moving to next Friday, design will share the final mockups by Tuesday, and I still need someone to own the customer announcement. Let me know if you have any questions."
  },
  {
    id: "numbers", category: "Tricky content", name: "Numbers, dates & money",
    text: "On the fourteenth of March, Doctor Katherine Okafor flew from Toronto to Lisbon with three hundred twenty dollars and a seven hour layover. She met her colleague Marcus at nine thirty, and they reviewed forty two pages of notes."
  },
  {
    id: "names", category: "Tricky content", name: "Names & places",
    text: "Siobhan and Nguyen drove from Worcester to Leicester before catching a train to Edinburgh. Along the way they called Joaquin in Albuquerque and Aoife in Dún Laoghaire to plan a reunion in Reykjavik."
  },
  {
    id: "technical", category: "Tricky content", name: "Developer jargon",
    text: "Open the terminal and run npm install, then start the server on port eight thousand. If the build fails, check the environment variables, restart the Docker container, and push your changes to the main branch on GitHub."
  },
  {
    id: "homophones", category: "Tricky content", name: "Homophones",
    text: "Their friends were over there, but they're not sure whether the weather will hold. I knew the new site would need two more weeks, so I wrote the right note to the whole team before the sale."
  },
  {
    id: "plosives", category: "Hard sounds", name: "Plosives (p, b, t, d, k, g)",
    text: "Before breakfast, Ben baked brown bread and put the pot by the back door. Tina told Dad to take the dog to the park, but the dark clouds kept getting closer, so Greg grabbed a coat and quickly called a cab."
  },
  {
    id: "openers", category: "Hard sounds", name: "Hard sentence openers",
    text: "Can you call Katie back today? Probably not until tonight. Please put the parcel by the door. Today the train to Glasgow got delayed again. Before we begin, does anybody need a break?"
  },
  {
    id: "twisters", category: "Hard sounds", name: "Tongue twisters",
    text: "She sells seashells by the seashore, and the shells she sells are surely seashells. Peter Piper picked a peck of pickled peppers, and a big black bug bit a big black bear."
  },
  {
    id: "long", category: "Endurance", name: "Long-form paragraph",
    text: "Most people underestimate how much of their day is spent typing. Messages, documents, search queries and notes all add up, and for many of us the keyboard has quietly become the slowest part of thinking. Speaking is roughly three times faster than typing, which is why dictation tools have become so popular. The catch is accuracy: a transcript that needs heavy editing can easily cost more time than it saves. The best way to know whether a tool works for you is to test it with your own voice, your own microphone and the kind of words you actually use."
  }
];
