/* ==========================================================================
   questions.js  —  EDIT THIS FILE to make the game yours.
   --------------------------------------------------------------------------
   • Only the Game Master page (index.html) loads this file.
     presentation.html deliberately does NOT, so guests can never find
     unrevealed answers by inspecting the TV page.

   • List each category's answers from #1 (top answer) down to the last one.
     The FIRST answer in the list is the #1 answer that the starting team
     must guess to take control of the board.

   • Points: give each answer a `points` number, or leave it out and the
     game uses DEFAULT_POINTS below based on rank (1st = 100, 2nd = 80, ...).
     A plain string works too:  "Pizza"  is the same as  { text: "Pizza" }.

   • Category icons: each category has an `image` (a PNG in the images/ folder).
     Save your own PNG with exactly that file name (square, 512×512,
     transparent background works best). If the file is missing or `image`
     is "", the `emoji` is shown instead.

   • You can add as many categories as you like and use 2–8 answers each.
   ========================================================================== */

window.GAME_CONFIG = {
  title: "How well do you know Chase?!",

  // Team names can also be changed live on the dashboard.
  teamNames: ["Team Pink", "Team Blue"],

    // Avatars teams can pick from (PNGs in images/avatars/)
  avatars: [
    { id: "avatar-1", name: "Avatar 1", image: "images/avatar-1.jpg", emoji: "🐱" },
    { id: "avatar-2", name: "Avatar 2", image: "images/avatar-2.jpg", emoji: "🐶" },
    { id: "avatar-3", name: "Avatar 3", image: "images/avatar-3.jpg", emoji: "🦊" },
    { id: "avatar-4", name: "Avatar 4", image: "images/avatar-4.jpg", emoji: "🐼" },
    { id: "avatar-5", name: "Avatar 5", image: "images/avatar-5.jpg", emoji: "🐰" },
    { id: "avatar-6", name: "Avatar 6", image: "images/avatar-6.jpg", emoji: "🐸" },
    { id: "avatar-7", name: "Avatar 7", image: "images/avatar-7.jpg", emoji: "🦄" },
    { id: "avatar-8", name: "Avatar 8", image: "images/avatar-8.jpg", emoji: "🐙" }
  ],

  // Points by rank, used whenever an answer has no explicit `points`.
  defaultPoints: [100, 80, 60, 40, 20, 10, 10, 10],

  // When the opposing team steals with a correct answer, does that stolen
  // answer's points count toward what they win?  true = yes (classic Feud).
  // false = they only win the points already on the board.
  stealAnswerCountsTowardPoints: true
};

window.GAME_CATEGORIES = [
  {
    id: "anime",
    name: "Anime",
    emoji: "🍥",
    image: "images/anime.png",
    question: "Name Chase's top 8 anime series",
    answers: [
      { text: "Haikyuu!!" },
      { text: "Ace of Diamond!" },
      { text: "The Apothecary Diaries" },
      { text: "Medalist!" },
      { text: "Ouran High School Host Club" },
      { text: "SK8 the Infinity" },
      { text: "Jujutsu Kaisen" },
      { text: "One Piece" }
    ]
  },
  {
    id: "gaming",
    name: "Gaming",
    emoji: "🎮",
    image: "images/gaming.png",
    question: "Name Chase's top 6 video game franchises",
    answers: [
      { text: "Pokémon" },
      { text: "The Legend of Zelda" },
      { text: "Resident Evil" },
      { text: "Animal Crossing" },
      { text: "Slime Rancher" },
      { text: "Five Nights at Freddy's" }
    ]
  },
  {
    id: "stray-kids",
    name: "Stray Kids",
    emoji: "🎤",
    image: "images/skz.png",
    question: "Name Chase's top 8 Stray Kids title tracks",
    answers: [
      { text: "Case 143" },
      { text: "S-Class" },
      { text: "DO IT" },
      { text: "Back Door" },
      { text: "THIS & THAT" },
      { text: "MANIAC" },
      { text: "God's Menu" },
      { text: "CHK CHK BOOM" }
    ]
  },
  {
    id: "hamilton",
    name: "Hamilton",
    emoji: "🎭",
    image: "images/hamilton.png",
    question: "Name Chase's top 8 favorite Hamilton songs",
    answers: [
      { text: "History Has Its Eyes on You" },
      { text: "Who Lives, Who Dies, Who Tells Your Story" },
      { text: "Non-Stop" },
      { text: "We Know" },
      { text: "The Room Where It Happens" },
      { text: "That Would Be Enough" },
      { text: "The Schuyler Sisters" },
      { text: "Wait for It" }
    ]
  },
  {
    id: "comfort-characters",
    name: "Comfort Characters",
    emoji: "💗",
    image: "images/comfort.png",
    question: "Name Chase's top 8 comfort characters",
    answers: [
      { text: "Ushijima Wakatoshi" },
      { text: "Leon S. Kennedy" },
      { text: "Maomao" },
      { text: "Link" },
      { text: "Penelope Eckhart" },
      { text: "Sylus" },
      { text: "Haruhi Fujioka" },
      { text: "Bucky Barnes" }
    ]
  },
  {
    id: "food",
    name: "Food",
    emoji: "🍜",
    image: "images/food.png",
    question: "Name Chase's top 8 favorite foods",
    answers: [
      { text: "7-11 Onigiri" },
      { text: "Cheesecake" },
      { text: "Char Siu" },
      { text: "Poke Bowl" },
      { text: "Japanese Curry" },
      { text: "Bahn Mi" },
      { text: "Fried Chicken" },
      { text: "Soup" }
    ]
  },
  {
    id: "movies-tv",
    name: "Movies & TV",
    emoji: "🎬",
    image: "images/movies.png",
    question: "Name Chase's top 8 favorite movies and shows",
    answers: [
      { text: "Toy Story" },
      { text: "Mission Impossible" },
      { text: "Captain America The Winter Soldier" },
      { text: "The Incredibles" },
      { text: "Spider-Man Across the Spider-Verse" },
      { text: "Arcane" },
      { text: "Top Gun Maverick" },
      { text: "Ninjago" }
    ]
  },
  {
    id: "hobbies",
    name: "Hobbies",
    emoji: "🎨",
    image: "images/hobbies.png",
    question: "Name Chase's top 8 favorite hobbies and sidequest activities",
    answers: [
      { text: "Journaling" },
      { text: "Video Games" },
      { text: "Karaoke" },
      { text: "Sleep" },
      { text: "Dye my hair" },
      { text: "Graphic Design" },
      { text: "Photobooths" },
      { text: "Listen to Music" }
    ]
  }
];