import type { Dict } from './es';

export const en: Dict = {
  meta: {
    title: 'Retoños del Edén · Pistachios, lavender & bees in Uruguay',
    description:
      "Uruguay's first pistachio plantation, organic and planted by hand. Fly with Meli the bee across the farm: story, products, workshops and clay houses.",
  },
  nav: {
    historia: 'Story',
    pistacho: 'Pistachios',
    lavanda: 'Lavender',
    abejas: 'Bees',
    chacra: 'The farm',
    herbario: 'Herbarium',
    productos: 'Products',
    talleres: 'Workshops',
    visita: 'Visit us',
    contacto: 'Contact',
    menu: 'Menu',
    closeMenu: 'Close menu',
    libro: 'The book',
    skip: 'Skip to content',
  },
  hero: {
    kicker: "Uruguay's first pistachio plantation",
    title: 'Retoños del Edén',
    sub: 'Organic pistachios, lavender, calendula and bees: a project for generations in southern Uruguay.',
    scroll: 'Scroll, we fly together',
    saltar: 'Skip',
  },
  intro: {
    bubble1: "Hi! I'm Meli, a worker bee at Retoños del Edén.",
    bubble2:
      'I know every flower on these five hectares. Coming along? Let me show you how an Eden gets planted.',
    hint: 'Meli stays by your side for the whole journey.',
  },
  timeline: {
    kicker: 'Since 2025',
    title: 'Our story, told in flight',
    chapters: [
      {
        year: '2025',
        title: 'The soil says yes',
        text: 'We test the earth and the news is sweet: pistachios can grow here. The fields are plowed and six hundred holes are drilled, one by one, each waiting for its tree.',
      },
      {
        year: 'Late 2025',
        title: "600 pistachios, the country's first",
        text: "At year's end, 600 pistachio trees go into the ground: Uruguay's first commercial plantation. Organic and certified to the European standard from day one: no chemicals, everything by hand. Six hundred is the most this land can care for well, and that's where it stays.",
      },
      {
        year: '2026 to 2029',
        title: 'While the pistachios grow',
        text: 'Between the rows, lavender blooms for oils and soaps; calendula gets its own corner for tea. The hives arrive (my family!) and the second clay house rises, soon available to rent. The third one is already a dream with a floor plan.',
      },
      {
        year: '~2030',
        title: 'The first harvest',
        text: 'A pistachio tree takes about five years to bear its first real fruit. Patience is like honey: slow, and worth every drop.',
      },
    ],
  },
  map: {
    kicker: 'From west to east',
    title: 'A flight over the farm',
    intro:
      'Five long hectares sloping gently to the east. Tap each stop, or just let me guide you.',
    tapHint: 'Tap the dots to discover every corner',
    close: 'Close',
    status: { listo: 'Ready', enObra: 'Under construction', planeado: 'Planned' },
    stations: [
      {
        name: 'The gate',
        desc: 'The entrance, on the western edge. Every path, and every visit, starts here.',
      },
      {
        name: 'The fugus avenue',
        desc: 'Slender trees planted in 2015 line the way in, like a welcome committee standing in file.',
      },
      {
        name: 'The loop path',
        desc: 'The trail opens into a wide ring. In its middle, an orchard of fruit trees will grow.',
      },
      {
        name: 'Pistachios & lavender',
        desc: 'North and south of the ring, 600 pistachios in rows; between them, waves of lavender protecting the soil.',
      },
      {
        name: 'Bees & calendula',
        desc: 'My neighborhood: the northwest corner. Hives beside a field of orange calendula grown for tea.',
      },
      {
        name: 'Clay house 2',
        desc: "Built from the land's own clay. Soon you'll be able to spend the night here.",
      },
      {
        name: 'Clay house 3',
        desc: 'The third house, still a blueprint and a dream, on the southern stretch of the ring.',
      },
      {
        name: 'The lookout',
        desc: 'Some shade, a few benches, and a panoramic view of the whole farm. The best sunset of the tour.',
      },
      {
        name: 'Clay house 1',
        desc: 'The first building, finished and fully ecological. Above it, an elder tree that has been here from the start.',
      },
      {
        name: 'The pond',
        desc: "The water at the land's east end, near house 1. Currently being expanded; the dragonflies approve.",
      },
    ],
    border:
      'The whole perimeter is hugged by a belt of eucalyptus trees, with beeches along some stretches.',
  },
  products: {
    kicker: 'Harvests on their way',
    title: 'What this land will give',
    intro:
      'All organic, all from here. The first things arrive with the flowers; the pistachios make us wait a little longer.',
    items: [
      {
        name: 'Pistachios',
        desc: "Uruguay's first, certified organic to the European standard.",
        badge: 'First harvest ~2030',
      },
      {
        name: 'Lavender oil & soaps',
        desc: 'Distilled from the rows that bloom between the pistachio trees.',
        badge: 'From the first blooms',
      },
      {
        name: 'Calendula tea',
        desc: 'Orange blossoms dried in the sun, from the northwest corner of the farm.',
        badge: 'Yearly harvest',
      },
      {
        name: 'Honey',
        desc: 'Made by my family from lavender, calendula and native bush. My masterpiece.',
        badge: 'From our hives',
      },
    ],
  },
  workshops: {
    kicker: 'Learn with your hands',
    title: 'Workshops on the farm',
    intro:
      'Real ecotourism and bee tourism: half a day among hives, lavender, clay and pistachios. Small groups, unhurried pace.',
    perPerson: 'per person',
    duration: 'Duration',
    hours: 'h',
    group: 'Up to',
    people: 'people',
    nextDates: 'Next dates',
    book: 'Book a spot',
    demoNote: 'Demo: bookings are not charged or confirmed for real yet.',
    booking: {
      title: 'Book',
      steps: ['Date', 'Details', 'Confirm'],
      date: 'Pick a date',
      people: 'Number of people',
      name: 'Your name',
      email: 'Your email',
      next: 'Next',
      back: 'Back',
      summary: 'Your booking',
      total: 'Total',
      confirm: 'Confirm booking (demo)',
      successTitle: 'Done! Demo booking created',
      successText:
        'This is a demo: nothing was sent and nothing was charged. In the final version, an email with all the details would land in your inbox.',
      close: 'Close',
      errRequired: 'Please fill in this field.',
      errEmail: "That email doesn't look complete.",
    },
  },
  stay: {
    kicker: 'Ecotourism & bee tourism',
    title: 'Sleep among lavender and bees',
    intro:
      'The clay houses are built from the earth of the land itself: cool in summer, warm in winter, ecological always. Staying the night is part of the journey.',
    casas: [
      {
        name: 'Clay House 1',
        status: 'listo',
        desc: 'The very first house of the project, finished and lived in. Living proof that clay is the future.',
      },
      {
        name: 'Clay House 2',
        status: 'enObra',
        desc: 'Under construction near the ring. Made for guests: coming soon to Airbnb.',
      },
      {
        name: 'Clay House 3',
        status: 'planeado',
        desc: 'The next of the clan, on the southern stretch. The clay workshop helps raise it.',
      },
    ],
    cta: 'Ask about stays',
  },
  contact: {
    kicker: "Let's talk",
    title: 'Write to us',
    intro:
      'Workshops, stays, pistachios, press, or plain curiosity? We love mail almost as much as nectar.',
    name: 'Name',
    email: 'Email',
    message: 'Message',
    send: 'Send message',
    successTitle: 'Thank you!',
    successText: "We'll get back to you soon. (Demo: the message wasn't actually sent.)",
    whereTitle: 'Where we are',
    where: 'Southern Uruguay · 34°42′00.4″S 55°03′39.4″W',
    foundersTitle: 'Who we are',
    founders:
      'Catalina Marzorati and Stefan Strauß, plus some 60,000 bees with strong opinions.',
  },
  footer: {
    tagline: 'An Eden growing slowly, at the pace of the bees.',
    demo: 'Demo site: contents, prices and dates are examples.',
    rights: 'Retoños del Edén',
    design: 'Design system',
  },
  pistacho: {
    title: 'The pistachio, our star',
    intro: 'A stubborn, generous tree that is brand new to this country. Everything we learned loving it, right here.',
    crackHint: 'Tap the pistachio to crack it open',
    crackAria: 'Crack the pistachio open and see fun facts',
    facts: [
      'A pistachio tree can live for centuries. Ours, 600 in total, are just getting started.',
      'There are male trees and female trees. The wind plays postman between them.',
      'The shell splits open on its own when the fruit is ready. Here we say it smiles.',
      'It is a cousin of mango and cashew: tropical family, dryland heart.',
    ],
    cycleTitle: 'A pistachio year',
    cycleIntro: 'Every season has its job. Pick one and I will tell you.',
    seasons: [
      {
        name: 'Winter',
        months: 'June to August',
        title: 'The long rest',
        text: 'The tree sleeps and collects cold: it needs hundreds of chilly hours to wake up strong. No good winter, no good harvest.',
      },
      {
        name: 'Spring',
        months: 'September to November',
        title: 'Flowers on the wind',
        text: 'Males and females bloom separately, with no showy petals: the pollen travels by wind, not by bees. I supervise anyway.',
      },
      {
        name: 'Summer',
        months: 'December to February',
        title: 'The kernel fills',
        text: 'Under strong sun, the green kernel slowly fills its shell. Below, the lavender blooms, shading the soil and keeping my family busy.',
      },
      {
        name: 'Autumn',
        months: 'March and April',
        title: 'The harvest',
        text: 'The shells split open to say they are ready. Picked by hand, dried in the sun, and the best seeds go back into the ground.',
      },
    ],
    usesTitle: 'What can you make with pistachios?',
    uses: [
      'Artisan ice cream',
      'Sicilian pesto',
      'Pistachio cream',
      'Cold-pressed oil',
      'Cake flour',
      'Sea-salt roasted',
      'Granola & bars',
      'Sauces & fillings',
    ],
    benefitsTitle: 'Small but mighty',
    benefits: [
      {
        t: 'Plant protein',
        d: 'About 20 grams per 100 grams: more than two eggs.',
      },
      {
        t: 'Filling fiber',
        d: 'Close to 10 grams per 100. A snack that actually satisfies.',
      },
      {
        t: 'Good fats',
        d: 'Mostly unsaturated, like the ones in olive oil.',
      },
      {
        t: 'Green inside',
        d: 'Lutein and zeaxanthin, the antioxidants that care for your eyes, give it its color.',
      },
    ],
  },
  lavanda: {
    title: 'Lavender, the downstairs neighbor',
    intro: 'While the pistachios grow, the lavender works: it covers the soil, feeds bees and already yields its first products.',
    whyTitle: 'Why between the pistachios?',
    why: [
      {
        t: 'It protects the soil',
        d: 'Its roots hold the earth and its shade keeps moisture between the young rows.',
      },
      {
        t: 'It feeds my family',
        d: 'Blossoms full of nectar right when the hive is at its busiest.',
      },
      {
        t: 'It harvests early',
        d: 'It gives oil and soaps years before the first pistachio harvest.',
      },
    ],
    processTitle: 'From blossom to soap',
    processHint: 'Follow the path, step by step.',
    process: [
      {
        t: 'Harvest',
        d: 'The spikes are cut by hand early in the morning, when the oil is at its peak.',
      },
      {
        t: 'Distillation',
        d: 'Steam passes through the blossoms and carries the essential oil away with it.',
      },
      {
        t: 'Oil',
        d: 'A few golden drops for every armful of flowers. Pure, intense, concentrated.',
      },
      {
        t: 'Soap',
        d: 'The oil is blended with plant oils and rests for six weeks until cured.',
      },
    ],
    rubHint: 'Run your finger over the lavender to release its scent',
  },
  abejas: {
    title: 'The bees, the humming heart',
    intro: 'We are 60,000 workers per hive and without us there is no farm. Bee tourism starts here, in my neighborhood.',
    cycleTitle: 'The circle that binds us',
    cycleHint: 'Tap each station of the circle.',
    cycle: [
      {
        t: 'Flowers',
        d: 'Lavender, calendula and native bush take turns blooming almost all year.',
      },
      {
        t: 'Visits',
        d: 'We fly flower to flower, gathering nectar and pollen for the hive.',
      },
      {
        t: 'Pollination',
        d: 'Without meaning to, we carry pollen from bloom to bloom: fruits and seeds are born.',
      },
      {
        t: 'More life',
        d: 'More fruit, more seeds, more plants: the whole farm grows more fertile.',
      },
      {
        t: 'Honey',
        d: 'And from all that work, the sweetest part remains, for you and for us.',
      },
    ],
    honeyTitle: 'What comes out of the hive',
    honeyItems: ['Lavender honey', 'Native bush honey', 'Beeswax candles', 'Propolis'],
    gameTitle: 'Play: pollinate the farm',
    gameHint: 'Tap the flowers and send me to work.',
    gameDone: 'Five flowers pollinated! Now you know what a hive day feels like.',
    gameCount: 'flowers pollinated',
  },
  herbario: {
    title: 'The farm herbarium',
    intro: 'Not just pistachios: over 300 trees and a whole garden live here. Tap each plant to meet it.',
    plants: [
      {
        n: 'Elder',
        d: 'The old guardian above house 1, there since the very first year. Blossoms for tea, shade for the siesta.',
      },
      {
        n: 'Fruit trees',
        d: 'The future orchard in the middle of the ring: fresh fruit for guests and birds alike.',
      },
      {
        n: 'Fugus',
        d: 'The welcome avenue, planted in 2015. Slim, tall and lined up like a friendly guard.',
      },
      {
        n: 'Eucalyptus',
        d: 'The belt hugging the whole perimeter: it cuts the wind and scents the air.',
      },
      {
        n: 'Beeches',
        d: 'They join the eucalyptus along some stretches of the border. Copper leaves in autumn.',
      },
      {
        n: 'Arrayanes',
        d: 'Native shrubs planned below house 1, with cinnamon bark and white blossoms.',
      },
      {
        n: 'Calendula',
        d: 'The orange field in the northwest: blossoms dried in the sun that end up as tea.',
      },
      {
        n: 'Roses & iris',
        d: 'Color and perfume around the houses, and extra food for pollinators.',
      },
      {
        n: 'Saffron',
        d: 'The most expensive spice in the world, harvested blossom by blossom, by hand.',
      },
      {
        n: 'Hyssop & cornflower',
        d: 'Herbs and blue blossoms between the beds: old medicine, new nectar.',
      },
    ],
  },
  quiz: {
    title: 'The worker bee exam',
    intro: 'Three short questions. Get them all and you earn a place in my hive.',
    of: 'of',
    questions: [
      {
        q: 'Who carries the pistachio pollen?',
        options: ['The bees', 'The wind', 'The hummingbirds'],
        correct: 1,
        right: 'Exactly! Pistachios are wind-pollinated. I take care of the lavender.',
        wrong: 'Surprise: it is the wind. The pistachio does not need me. The lavender does.',
      },
      {
        q: 'How long until a pistachio tree gives its first real harvest?',
        options: ['One year', 'About five years', 'Twenty years'],
        correct: 1,
        right: 'Yes! About five years. Patience is like honey.',
        wrong: 'Close: about five years. That is why the lavender works in the meantime.',
      },
      {
        q: 'What grows between the pistachio rows?',
        options: ['Lavender', 'Corn', 'Nothing, clean soil'],
        correct: 0,
        right: 'Right! Lavender: it protects the soil and feeds me.',
        wrong: 'It is lavender: it protects the soil and feeds my family.',
      },
    ],
    next: 'Next question',
    seeResult: 'See result',
    scoreTitle: 'Your result',
    scoreOf: 'correct out of 3',
    badge: 'Honorary worker bee',
    perfect: 'Three out of three! You are officially part of the hive.',
    good: 'Not bad. One workshop on the farm and you are in the hive.',
    cta: 'Keep learning in a workshop',
    restart: 'Play again',
  },
  libroTeaser: {
    kicker: "Catalina's story",
    title: 'Luna y el secreto de la colmena',
    bubble: 'Want to know how I became a guide? It is written in a book.',
    text: 'Catalina, the same person who planted the first pistachio trees, wrote a story about a girl who shrinks to the size of a bee. I am the one who shows her around in there.',
    cta: 'Enter the story',
    badge: 'Reading sample',
  },
};
