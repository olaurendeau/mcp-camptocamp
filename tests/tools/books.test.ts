import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleSearchBooks,
  handleGetBook,
  searchBooksSchema,
  getBookSchema,
  bookToolDefinitions,
} from "../../src/tools/books.js";
import * as api from "../../src/api/camptocamp.js";

vi.mock("../../src/api/camptocamp.js");

const mockSearchBooks = vi.mocked(api.searchBooks);
const mockGetBook = vi.mocked(api.getBook);

const FORBIDDEN = ["undefined", "null", "Unknown", "N/A"];

function expectNoPlaceholder(text: string) {
  for (const word of FORBIDDEN) expect(text).not.toContain(word);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// The live GET /books?q=mont blanc&limit=2&lang=fr response (2026-10-03), complete.
const MONT_BLANC_SEARCH = {
  documents: [
    {
      document_id: 373877,
      version: 2,
      locales: [
        { version: 10, lang: "it", title: "Monte Bianco Classico & Plaisir", summary: null },
        { version: 7, lang: "fr", title: "Mont Blanc Classique & Plaisir", summary: null },
        { version: 5, lang: "en", title: "Mont Blanc Classic & Plaisir", summary: null },
      ],
      quality: "medium",
      author: "Marco Romelli",
      activities: ["mountain_climbing", "snow_ice_mixed"],
      book_types: ["topo"],
      available_langs: ["it", "fr", "en"],
      protected: false,
      type: "b",
    },
    {
      document_id: 658365,
      version: 1,
      locales: [
        { version: 2, lang: "en", title: "Around Mont Blanc - Via the footpaths", summary: null },
        { version: 2, lang: "fr", title: "Massif du Mont-Blanc - Le tour par les sentiers", summary: null },
      ],
      quality: "medium",
      author: "François-Eric Cormier",
      activities: ["hiking"],
      book_types: ["topo"],
      available_langs: ["en", "fr"],
      protected: false,
      type: "b",
    },
  ],
  total: 79,
};

// Document 14592 as returned by the live GET /books?q=100 plus belles courses&limit=10&lang=fr
// (2026-10-03, total 15); the other 9 documents are dropped.
const BOOK_14592_SEARCH_DOC = {
  document_id: 14592,
  version: 3,
  locales: [
    { version: 1, lang: "es", title: "El Macizo del Mont Blanc: Las 100 Mejores Ascensiones", summary: null },
    {
      version: 42,
      lang: "fr",
      title: "Le massif du Mont-Blanc - Les 100 plus belles courses",
      summary:
        "Ouvrage de référence pour le Massif du Mont-Blanc. Les descriptions datent un peu, les cotations sont un peu sèches, mais ça donne de bonnes idées de courses.",
    },
  ],
  quality: "medium",
  author: "Gaston Rébuffat",
  activities: ["mountain_climbing", "snow_ice_mixed"],
  book_types: ["topo"],
  available_langs: ["es", "fr"],
  protected: false,
  type: "b",
};

// The live GET /books?q=Les Cris du Volcan&limit=10&lang=fr response (2026-10-03), complete.
const CRIS_DU_VOLCAN_SEARCH = {
  documents: [
    {
      document_id: 14747,
      version: 1,
      locales: [{ version: 3, lang: "fr", title: "Les Cris du Volcan", summary: null }],
      quality: "medium",
      author: "Stanley Williams et Fen Montaigne",
      activities: null,
      book_types: ["historical", "photos-art", "novel"],
      available_langs: ["fr"],
      protected: false,
      type: "b",
    },
  ],
  total: 1,
};

// The live GET /books?q=Over The Top&limit=10&lang=fr response (2026-10-03), complete.
const OVER_THE_TOP_SEARCH = {
  documents: [
    {
      document_id: 314584,
      version: 1,
      locales: [{ version: 1, lang: "fr", title: "Over The Top : Humorous Mountaineering Tales", summary: null }],
      quality: "medium",
      author: null,
      activities: null,
      book_types: ["historical", "biography"],
      available_langs: ["fr"],
      protected: false,
      type: "b",
    },
  ],
  total: 1,
};

// The live GET /books?q=Finale Climbing&limit=10&lang=fr response (2026-10-03), complete.
const FINALE_CLIMBING_SEARCH = {
  documents: [
    {
      document_id: 1049839,
      version: 2,
      locales: [{ version: 1, lang: "en", title: "Finale Climbing", summary: null }],
      quality: "draft",
      author: "Marco Tomassini",
      activities: ["rock_climbing"],
      book_types: ["topo"],
      available_langs: ["en"],
      protected: false,
      type: "b",
    },
  ],
  total: 1,
};

describe("handleSearchBooks", () => {
  it("forwards query and limit and prints the total header", async () => {
    mockSearchBooks.mockResolvedValueOnce(MONT_BLANC_SEARCH);

    const result = await handleSearchBooks({ query: "mont blanc", limit: 2 });

    expect(mockSearchBooks).toHaveBeenCalledWith({ query: "mont blanc", limit: 2 });
    expect(result.startsWith("Found 79 book(s). Showing 2:")).toBe(true);
    expect(result).toContain(
      "- [373877] Mont Blanc Classique & Plaisir | Author: Marco Romelli | Types: topo | Activities: mountain_climbing, snow_ice_mixed",
    );
    expect(result).toContain("- [658365] Massif du Mont-Blanc - Le tour par les sentiers");
  });

  it("writes one line with the fr title, author, raw types and activities", async () => {
    mockSearchBooks.mockResolvedValueOnce({ documents: [BOOK_14592_SEARCH_DOC], total: 15 });

    const result = await handleSearchBooks({ query: "100 plus belles courses", limit: 10 });

    expect(result).toContain(
      "- [14592] Le massif du Mont-Blanc - Les 100 plus belles courses | Author: Gaston Rébuffat | Types: topo | Activities: mountain_climbing, snow_ice_mixed",
    );
  });

  it("lists every book type in API order", async () => {
    mockSearchBooks.mockResolvedValueOnce(CRIS_DU_VOLCAN_SEARCH);

    const result = await handleSearchBooks({ query: "Les Cris du Volcan", limit: 10 });

    expect(result).toContain("Types: historical, photos-art, novel");
  });

  it("leaves out a null author and null activities", async () => {
    mockSearchBooks.mockResolvedValueOnce(OVER_THE_TOP_SEARCH);

    const result = await handleSearchBooks({ query: "Over The Top", limit: 10 });

    expect(result).toContain("- [314584] Over The Top : Humorous Mountaineering Tales | Types: historical, biography");
    expect(result).not.toContain("Author:");
    expect(result).not.toContain("Activities:");
    expectNoPlaceholder(result);
  });

  it("falls back to the first locale, then to Untitled", async () => {
    mockSearchBooks.mockResolvedValueOnce(FINALE_CLIMBING_SEARCH);
    expect(await handleSearchBooks({ query: "Finale Climbing", limit: 10 })).toContain("- [1049839] Finale Climbing");

    // No sampled book has empty locales: this is the 1049839 document with `locales` emptied.
    const noLocale = { ...FINALE_CLIMBING_SEARCH.documents[0], locales: [] };
    mockSearchBooks.mockResolvedValueOnce({ documents: [noLocale], total: 1 });
    expect(await handleSearchBooks({ query: "Finale Climbing", limit: 10 })).toContain("- [1049839] Untitled");
  });

  it("returns exactly 'No books found.' for an empty result", async () => {
    // The live GET /books?q=9782207220108&limit=10&lang=fr response (2026-10-03): an ISBN matches nothing.
    mockSearchBooks.mockResolvedValueOnce({ documents: [], total: 0 });

    expect(await handleSearchBooks({ query: "9782207220108", limit: 10 })).toBe("No books found.");
  });
});

describe("book tool definitions", () => {
  it("registers search_books and get_book with their schemas", () => {
    expect(bookToolDefinitions.map((t) => t.name)).toEqual(["search_books", "get_book"]);
    expect(bookToolDefinitions[0].inputSchema).toBe(searchBooksSchema);
    expect(bookToolDefinitions[1].inputSchema).toBe(getBookSchema);
  });

  it("says get_book returns related articles that get_article can follow", () => {
    expect(bookToolDefinitions[1].description).toContain("related articles");
    expect(bookToolDefinitions[1].description).toContain("get_article");
  });

  it("says search_books matches titles and warns about author and ISBN searches", () => {
    const description = bookToolDefinitions[0].description;
    expect(description).toContain("TITLES only");
    expect(description).toContain("author name or ISBN is unreliable");
    expect(description).toContain("an empty result does not mean the book does not exist");
  });

  it("bounds limit to 1-50 with a default of 10", () => {
    expect(searchBooksSchema.parse({ query: "vallot" })).toEqual({ query: "vallot", limit: 10 });
    expect(searchBooksSchema.safeParse({ query: "vallot", limit: 0 }).success).toBe(false);
    expect(searchBooksSchema.safeParse({ query: "vallot", limit: 51 }).success).toBe(false);
    expect(searchBooksSchema.safeParse({ limit: 10 }).success).toBe(false);
  });

  it("rejects a blank query", () => {
    for (const query of ["", "   "]) {
      const parsed = searchBooksSchema.safeParse({ query });
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues).toEqual([
        expect.objectContaining({ path: ["query"], message: "must not be blank" }),
      ]);
    }
  });

  it("accepts only a positive integer id", () => {
    expect(getBookSchema.parse({ id: 373877 })).toEqual({ id: 373877 });
    for (const id of [0, -1, 1.5]) expect(getBookSchema.safeParse({ id }).success).toBe(false);
  });
});

// Trimmed from the live GET /books/373877?lang=fr response (2026-10-03): 1 of 28 routes kept, with only
// document_id and each locale's lang, title and title_prefix; the 3 images removed.
const BOOK_373877 = {
  document_id: 373877,
  version: 2,
  locales: [
    {
      version: 10,
      lang: "it",
      title: "Monte Bianco Classico & Plaisir",
      description:
        "[img=373948 right]Monte Bianco classico & plaisir[/img]\n\nCon 67 itinerari, su difficoltà comprese tra PD e D, questa guida \"fa il giro\" del massiccio del Bianco partendo dall'area svizzera del nord-est, passando poi per Chamonix e il versante italiano e tornando al limite orientale con il Mont Dolent, punto d'unione dei confini di Francia, Italia e Svizzera. Ci sono proposte per ogni stagione: le vie descritte comprendono itinerari tipicamente estivi su roccia, percorsi su neve o misto classico e linee di ghiaccio con caratteristiche prevalentemente invernali e avvicinamento consigliato in sci. Ad ogni capitolo corrisponde un'area identificata per accesso e caratteristiche fondamentali, con consigli riguardo alla stagione ideale di frequentazione e alle possibilità di concatenamento tra le vie. Ogni itinerario è descritto in modo il più possibile dettagliato, con fotografie e schizzi aggiornati all'ultima ripetizione dell'autore. \nLa difficoltà moderata delle vie proposte e l'organizzazione in aree fanno di questa guida lo strumento ideale per approfondire la conoscenza del Monte Bianco con un approccio graduale, per approfittare al meglio della bellezza dell'ambiente senza lo stress delle alte difficoltà.\n\nCon prefazione di Patrick Gabarrou.\n\n## Info \n- http://romelli-marco-illustrazione.blogspot.it/ \n- [Estratto](https://www.vienormali.it/images/prodotti/Estratto-Monte-Bianco-Classic-Plaisir.pdf) (pdf)",
      summary: null,
      topic_id: null,
    },
    {
      version: 7,
      lang: "fr",
      title: "Mont Blanc Classique & Plaisir",
      description:
        "[img=373947 right]Mont Blanc classique & plaisir[/img]\r\n\r\nAvec 67 itinéraires entre PD et D, ce topoguide \"fait le tour\" du Massif du Mont Blanc à partir de la région suisse du nord-est, en passant par Chamonix et le côté italien et en revenant enfin à la limite orientale de la chaîne avec le Mont Dolent, où se rejoignent la France, la Suisse et l’Italie. Il y a des idées pour toutes saisons: grandes voies en rocher, parcours en neige ou mixte classiques et aussi des lignes en glace à caractère plutôt hivernal, avec approche conseillée à ski. Chaque chapitre correspond à une zone identifiée selon son accès et ses caractéristiques. Pour chaque zone, on a spécifié la saison idéale  et des possibilités d'enchaînement des itinéraires. Les descriptions des voies sont très détaillées, avec photos et croquis récents. \r\nLe niveau moyen des voies proposées et son organisation en secteurs font de ce guide  un outil fondamental pour approfondir graduellement sa connaissance du Mont Blanc, pour profiter au mieux de la beauté de l'ambiance sans le stress des hautes difficultés. \r\nLe livre est disponible en français, italien et anglais.\r\n\r\nAvec préface de Patrick Gabarrou.\r\n\r\n## Info \r\nhttp://romelli-marco-illustrazione.blogspot.it/ ",
      summary: null,
      topic_id: null,
    },
    {
      version: 5,
      lang: "en",
      title: "Mont Blanc Classic & Plaisir",
      description:
        "[img=373950 right]Mont Blanc classic & plaisir[/img]\r\n\r\nThe Mont Blanc range is one of great ascents, where important pages in mountaineering history have been written.\r\nHowever, alongside the hard routes climbable by but a few, there is a plethora of more accessible routes to be discovered, combining beautiful climbing and incredible surroundings. This guidebook allows you a taste of Mont Blanc without worrying too much about sporting performance.\r\n\r\n67 routes of Rock, Ice and Mixed.\r\n\r\nEditions also available in Italian and French. \r\n\r\n## Info \r\nhttp://romelli-marco-illustrazione.blogspot.it/ ",
      summary: null,
      topic_id: null,
    },
  ],
  quality: "medium",
  author: "Marco Romelli",
  editor: "Ideamontagna",
  activities: ["mountain_climbing", "snow_ice_mixed"],
  url: "http://www.ideamontagna.it/",
  isbn: "978-88-97299-21-9",
  book_types: ["topo"],
  nb_pages: 286,
  publication_date: "2012",
  langs: ["fr", "it", "en"],
  available_langs: ["it", "fr", "en"],
  protected: false,
  type: "b",
  associations: {
    routes: [
      {
        document_id: 53781,
        locales: [
          { lang: "it", title: "Monte Bianco via Bossesgrat", title_prefix: "Monte Bianco" },
          { lang: "fr", title: "Arête des Bosses", title_prefix: "Mont Blanc" },
          { lang: "es", title: "Por la arista de las Bosses", title_prefix: "Mont Blanc" },
          { lang: "de", title: "Bossesgrat", title_prefix: "Mont Blanc" },
          { lang: "en", title: "Arête des Bosses", title_prefix: "Mont Blanc" },
        ],
      },
    ],
    waypoints: [],
    articles: [],
    images: [],
  },
};

// Trimmed from the live GET /books/1925012?lang=fr response (2026-10-03): the first 2 of 36 routes kept,
// with only document_id and each locale's lang, title and title_prefix; the 1 image removed.
const BOOK_1925012 = {
  document_id: 1925012,
  version: 1,
  locales: [
    {
      version: 1,
      lang: "fr",
      title: "Trail Chamonix & Mont-Blanc",
      description:
        "(English below)\n\nDans ce topo trail autour de Chamonix et du Mont-Banc, retrouvez une sélection de 30 sorties (et 15 variantes) pour parcourir les sentiers des Fiz, des Aiguilles Rouges, du Mont-Blanc et du Tour du Mont-Blanc (TMB).\n\n \n\nPour chaque sortie, retrouvez une fiche technique, une carte, un profil, des photos et le parcours détaillé.\n\n------\n\nIn this trail guide around Chamonix and Mont Blanc, discover a selection of 30 outings (and 15 variants) to explore the trails of the Fiz, the Aiguilles Rouges, Mont Blanc, and the Tour du Mont Blanc (TMB).\n\n \n\nFor each outing, you will find a technical data sheet, a map, an elevation profile, photos, and a detailed route description.",
      summary: "30 sorties trail autour de Chamonix.",
      topic_id: null,
    },
  ],
  quality: "great",
  author: "Clément Guillot / Astrid Renet",
  editor: "Editions Vamos",
  activities: ["hiking"],
  url: "https://www.topos-vamos.com/product-page/trail-chamonix-mont-blanc",
  isbn: "9782910672409",
  book_types: ["topo"],
  nb_pages: 224,
  publication_date: "Juin 2026",
  langs: ["fr", "en"],
  available_langs: ["fr"],
  protected: false,
  type: "b",
  associations: {
    routes: [
      {
        document_id: 46381,
        locales: [{ lang: "fr", title: "Traversée Brévent - Aiguillette des Houches", title_prefix: "" }],
      },
      {
        document_id: 46657,
        locales: [{ lang: "fr", title: "Depuis le Bettey", title_prefix: "Aiguillette des Houches" }],
      },
    ],
    waypoints: [],
    articles: [],
    images: [],
  },
};

// The live GET /books/14746?lang=fr response (2026-10-03), complete.
const BOOK_14746 = {
  document_id: 14746,
  version: 1,
  locales: [
    {
      version: 2,
      lang: "fr",
      title: "Hugo et le Mont Blanc",
      description:
        "Il avait vingt-trois ans, Hugo n’était pas encore un géant, le Mont Blanc l’était déjà. Hugo voulais voir cet endroit extraordinaire et surtout il voulait connaître l'homme (Balmat) qui avait fait la première ascension.\nIl ramena de son voyage une relation en prose et deux poème. Les voici pour la première fois rassemblés dans le même ouvrage.\nColette Cosnier est professeur d'Université, elle a retrouvé ces textes et établi cette édition.\nÀ partir des carnets de comptes de Hugo, du récit de sa femme Adèle et de beaucoup d'autres documents, elle a reconstitué les conditions - rocambolesques - du voyage Paris-Chamonix.\n\n\"un jour les pommes de terre arrivent saupoudrées de mouches grillées...\nVictor Hugo cherchait laborieusement à recomposer une mouche :\n- Charles, vous devez avoir quelque part la patte de mon aile.\n- Des pattes ! disait (Charles Nodier), je vous en donneai tant que vous voudrez des pattes ! j'en ai cinq de trop. Seulement je manque de têtes. Auriez-vous vu ma tête ?\nPendant que cette minutieuse étude avait lieu, Monsieur Gué plongé dans de profondes réflexions contemplait son assiette :\n- Ô Fortune, murmurait-il ! Avoir passé par où elles sont passées, et qu'il soit encore possible de reconnaître que celle-là était blonde...\nLes femmes en courroux finirent par imposer silence à cette démonstration horrible.\"\n\n195 pages\n11€\n\nCollection : Petite collection",
      summary: null,
      topic_id: null,
    },
  ],
  quality: "medium",
  author: "Colette Cosnier",
  editor: "Editions Guérin",
  activities: null,
  url: "http://www.editionsguerin.com/",
  isbn: "2 911755  57 X",
  book_types: ["novel"],
  nb_pages: null,
  publication_date: null,
  langs: ["fr"],
  available_langs: ["fr"],
  associations: { waypoints: [], routes: [], images: [], articles: [] },
  protected: false,
  type: "b",
};

// Trimmed from the live GET /books/209293?lang=fr response (2026-10-03): 1 of 23 routes and 2 of 38
// waypoints kept, with only document_id, locale lang/title(/title_prefix), waypoint_type and elevation;
// the 1 image removed.
const BOOK_209293 = {
  document_id: 209293,
  version: 2,
  locales: [
    {
      version: 3,
      lang: "fr",
      title: "La chaîne du Mont Blanc, Guide Vallot : I - Mont-Blanc - Trélatête",
      description:
        "1<sup>re</sup> édition 1947, 2<sup>e</sup> édition 1951, addendum en 1955, 3<sup>e</sup> édition en 19736, 4<sup>e</sup> et dernière édition 1978",
      summary: null,
      topic_id: null,
    },
  ],
  quality: "medium",
  author: "Lucien Devies, Pierre Henry",
  editor: "Arthaud",
  activities: ["mountain_climbing", "snow_ice_mixed"],
  url: null,
  isbn: null,
  book_types: ["topo"],
  nb_pages: null,
  publication_date: "1978",
  langs: ["fr"],
  available_langs: ["fr"],
  protected: false,
  type: "b",
  associations: {
    routes: [
      {
        document_id: 53781,
        locales: [
          { lang: "it", title: "Monte Bianco via Bossesgrat", title_prefix: "Monte Bianco" },
          { lang: "fr", title: "Arête des Bosses", title_prefix: "Mont Blanc" },
          { lang: "es", title: "Por la arista de las Bosses", title_prefix: "Mont Blanc" },
          { lang: "de", title: "Bossesgrat", title_prefix: "Mont Blanc" },
          { lang: "en", title: "Arête des Bosses", title_prefix: "Mont Blanc" },
        ],
      },
    ],
    waypoints: [
      {
        document_id: 37295,
        locales: [{ lang: "fr", title: "Dômes de Miage - Sommet W" }],
        waypoint_type: "summit",
        elevation: 3670,
      },
      {
        document_id: 37586,
        locales: [
          { lang: "it", title: "Aiguille des Glaciers" },
          { lang: "fr", title: "Aiguille des Glaciers" },
        ],
        waypoint_type: "summit",
        elevation: 3817,
      },
    ],
    articles: [],
    images: [],
  },
};

// The document_id of each of the 143 routes of the live GET /books/194348?lang=fr response
// (2026-10-03), in API order. The test builds a book with these routes, the book's fr title and a placeholder
// fr route title; the other book and route fields are dropped.
const BOOK_194348_ROUTE_IDS = [
  45632, 45696, 46088, 46099, 46560, 46712, 46768, 46855, 46874, 46905, 46909, 46911, 46944, 47894, 48056, 48144, 48221,
  48445, 48600, 49501, 49517, 49519, 49844, 50606, 50817, 51816, 51840, 51854, 51860, 52782, 52896, 53170, 53657, 53723,
  53807, 53811, 53820, 53822, 53880, 53907, 53923, 54031, 54032, 54040, 54044, 54053, 54120, 54182, 54353, 54374, 54390,
  54399, 54400, 54422, 54454, 54510, 54591, 54849, 54887, 54943, 54954, 54962, 54966, 55000, 55002, 55005, 55010, 55035,
  55057, 55146, 55180, 55271, 55502, 55511, 55524, 55532, 55858, 56006, 56466, 56609, 56649, 56740, 57177, 57182, 57316,
  57332, 57466, 57505, 57668, 58051, 115760, 121232, 126541, 131046, 148038, 148572, 160698, 163468, 197106, 197535,
  197871, 197952, 198238, 215905, 222917, 245051, 255059, 256662, 263904, 267882, 270883, 275755, 295099, 310220,
  313105, 329599, 395575, 405779, 407547, 431168, 431444, 432560, 472987, 479999, 503714, 522330, 525637, 529141,
  568703, 638819, 788596, 845943, 874313, 1061008, 1068895, 1104987, 1223914, 1274258, 1279189, 1285399, 1646467,
  1738666, 1765387,
];

// Trimmed from the live GET /books/14592?lang=fr response (2026-10-03): each locale's description removed;
// 1 of 90 routes kept, with only document_id and each locale's lang, title and title_prefix; the 2 images
// removed. The waypoints list (empty) and the 1 article association are kept as returned.
const BOOK_14592 = {
  document_id: 14592,
  version: 3,
  locales: [
    {
      version: 1,
      lang: "es",
      title: "El Macizo del Mont Blanc: Las 100 Mejores Ascensiones",
      summary: null,
      topic_id: null,
    },
    {
      version: 42,
      lang: "fr",
      title: "Le massif du Mont-Blanc - Les 100 plus belles courses",
      summary:
        "Ouvrage de référence pour le Massif du Mont-Blanc. Les descriptions datent un peu, les cotations sont un peu sèches, mais ça donne de bonnes idées de courses.",
      topic_id: 334425,
    },
  ],
  quality: "medium",
  author: "Gaston Rébuffat",
  editor: "Denoël",
  activities: ["mountain_climbing", "snow_ice_mixed"],
  url: null,
  isbn: "9782207220108",
  book_types: ["topo"],
  nb_pages: 240,
  publication_date: "1973",
  langs: ["fr", "en", "es"],
  available_langs: ["es", "fr"],
  protected: false,
  type: "b",
  associations: {
    waypoints: [],
    routes: [
      {
        document_id: 45528,
        locales: [
          {
            lang: "sl",
            title: "SV pobočje",
            title_prefix: "Les Courtes",
          },
          {
            lang: "fr",
            title: "Face NE",
            title_prefix: "Les Courtes",
          },
          {
            lang: "en",
            title: "NE Slope",
            title_prefix: "Les Courtes",
          },
          {
            lang: "de",
            title: "NE-Wand",
            title_prefix: "Les Courtes",
          },
          {
            lang: "it",
            title: "Parete NE",
            title_prefix: "Les Courtes",
          },
        ],
      },
    ],
    articles: [
      {
        document_id: 108642,
        version: 16,
        locales: [
          {
            version: 19,
            lang: "fr",
            title: "100 plus belles : la liste des titres et la cote en occasion",
            summary: null,
          },
        ],
        quality: "medium",
        categories: ["topoguide_supplements"],
        activities: ["mountain_climbing", "snow_ice_mixed", "hiking", "skitouring", "rock_climbing", "ice_climbing"],
        article_type: "collab",
        available_langs: ["fr"],
        protected: false,
        type: "c",
      },
    ],
  },
};

// Trimmed from the live GET /books/1303412?lang=fr response (2026-10-03): the fr description removed; the
// first of 3 routes and the first of 3 waypoints kept, with only document_id, each locale's lang, title
// (and title_prefix), waypoint_type and elevation; the 2 images removed. The 1 article association (en
// locale only) is kept as returned.
const BOOK_1303412 = {
  document_id: 1303412,
  version: 1,
  locales: [
    {
      version: 5,
      lang: "fr",
      title:
        "Montagnes et tourisme. Essai sur la concurrence des territoires, des Alpes du nord aux Pyrénées centrales",
      summary: null,
      topic_id: null,
    },
  ],
  quality: "fine",
  author: "André Suchet",
  editor: "Editions universitaires du Sud",
  activities: [
    "skitouring",
    "snow_ice_mixed",
    "mountain_climbing",
    "rock_climbing",
    "ice_climbing",
    "hiking",
    "snowshoeing",
  ],
  url: "https://www.mollat.com/livres/2521027/andre-suchet-montagnes-et-tourisme-essai-sur-la-concurrence-des-territoires-des-alpes-du-nord-aux-pyrenees-centrales",
  isbn: "9782722701540",
  book_types: ["historical", "photos-art", "tourism"],
  nb_pages: null,
  publication_date: "2021",
  langs: ["fr"],
  available_langs: ["fr"],
  protected: false,
  type: "b",
  associations: {
    waypoints: [
      {
        document_id: 114681,
        locales: [{ lang: "fr", title: "Gavarnie Village" }],
        waypoint_type: "access",
        elevation: 1375,
      },
    ],
    routes: [
      {
        document_id: 46071,
        locales: [
          { lang: "es", title: "Normal Norte (descenso por Barrancs)", title_prefix: "Aneto" },
          { lang: "fr", title: "Par le refuge de la Rencluse (Voie Normale)", title_prefix: "Aneto" },
          { lang: "ca", title: "camí normal pel refugi de la Renclusa", title_prefix: "Aneto" },
        ],
      },
    ],
    articles: [
      {
        document_id: 812610,
        version: 3,
        locales: [
          {
            version: 19,
            lang: "en",
            title: "Portail Mont Blanc  Climbing, Mountaineering and skiing",
            summary:
              "Dear english-speaking fellows, here is some useful information for your trip in Mont-Blanc! Do not hesitate to ask on forum if you need any help.",
          },
        ],
        quality: "medium",
        categories: ["topoguide_supplements"],
        activities: [
          "mountain_climbing",
          "snow_ice_mixed",
          "hiking",
          "paragliding",
          "snowshoeing",
          "skitouring",
          "rock_climbing",
          "ice_climbing",
        ],
        article_type: "collab",
        available_langs: ["en"],
        protected: false,
        type: "c",
      },
    ],
  },
};

describe("handleGetBook", () => {
  it("prints the fr heading and the nine labelled lines with API values", async () => {
    mockGetBook.mockResolvedValueOnce(BOOK_373877);

    const result = await handleGetBook({ id: 373877 });

    expect(mockGetBook).toHaveBeenCalledWith(373877);
    expect(result).toContain(
      [
        "# Mont Blanc Classique & Plaisir (ID: 373877)",
        "",
        "**Author**: Marco Romelli",
        "**Editor**: Ideamontagna",
        "**Publication date**: 2012",
        "**ISBN**: 978-88-97299-21-9",
        "**Pages**: 286",
        "**Languages**: fr, it, en",
        "**Website**: http://www.ideamontagna.it/",
        "**Book types**: topo",
        "**Activities**: mountain_climbing, snow_ice_mixed",
      ].join("\n"),
    );
  });

  it("prints the fr description verbatim, markup included", async () => {
    mockGetBook.mockResolvedValueOnce(BOOK_373877);

    const result = await handleGetBook({ id: 373877 });

    expect(result).toContain(`\n## Description\n${BOOK_373877.locales[1].description}`);
    expect(result).not.toContain("## Summary");
    expect(result).not.toContain("Monte Bianco classico");
  });

  it("prints free-text values unchanged and shows only langs as languages", async () => {
    mockGetBook.mockResolvedValueOnce(BOOK_1925012);

    const result = await handleGetBook({ id: 1925012 });

    expect(result).toContain("**Publication date**: Juin 2026\n");
    expect(result).toContain("**Author**: Clément Guillot / Astrid Renet\n");
    expect(result).toContain("**Languages**: fr, en\n");
    expect(result).toContain("\n## Summary\n30 sorties trail autour de Chamonix.\n");
  });

  it("writes a route line without prefix when title_prefix is empty", async () => {
    mockGetBook.mockResolvedValueOnce(BOOK_1925012);

    const result = await handleGetBook({ id: 1925012 });

    expect(result).toContain(
      "## Associated routes\n- [46381] Traversée Brévent - Aiguillette des Houches\n- [46657] Aiguillette des Houches : Depuis le Bettey",
    );
  });

  it("keeps the double space of a free-text ISBN and leaves out null fields", async () => {
    mockGetBook.mockResolvedValueOnce(BOOK_14746);

    const result = await handleGetBook({ id: 14746 });

    expect(result).toBe(
      [
        "# Hugo et le Mont Blanc (ID: 14746)",
        "",
        "**Author**: Colette Cosnier",
        "**Editor**: Editions Guérin",
        "**ISBN**: 2 911755  57 X",
        "**Languages**: fr",
        "**Website**: http://www.editionsguerin.com/",
        "**Book types**: novel",
        "",
        "## Description",
        BOOK_14746.locales[0].description,
      ].join("\n"),
    );
    expectNoPlaceholder(result);
  });

  it("keeps only the heading when every displayed field is null", async () => {
    // Derived from the 14746 fixture: the fr locale keeps only lang and title, with summary and description
    // set to null (version and topic_id dropped); author, editor, url, isbn, book_types and langs set to
    // null (nb_pages, publication_date and activities are already null live); `associations` set to
    // undefined. available_langs stays ["fr"], since it is never displayed.
    mockGetBook.mockResolvedValueOnce({
      ...BOOK_14746,
      locales: [{ lang: "fr", title: "Hugo et le Mont Blanc", summary: null, description: null }],
      author: null,
      editor: null,
      url: null,
      isbn: null,
      book_types: null,
      langs: null,
      associations: undefined,
    });

    const result = await handleGetBook({ id: 14746 });

    expect(result).toBe("# Hugo et le Mont Blanc (ID: 14746)");
  });

  it("leaves out Summary and Description when they are empty strings", async () => {
    // Derived from the 14746 fixture with an empty summary and description.
    mockGetBook.mockResolvedValueOnce({
      ...BOOK_14746,
      locales: [{ lang: "fr", title: "Hugo et le Mont Blanc", summary: "", description: "" }],
    });

    const result = await handleGetBook({ id: 14746 });

    expect(result).not.toContain("## Summary");
    expect(result).not.toContain("## Description");
  });

  it("lists routes with their summit prefix and waypoints with elevation", async () => {
    mockGetBook.mockResolvedValueOnce(BOOK_209293);

    const result = await handleGetBook({ id: 209293 });

    expect(result).toContain("\n## Description\n1<sup>re</sup> édition 1947,");
    expect(result).toContain("3<sup>e</sup> édition en 19736,");
    expect(result).toContain("\n## Associated routes\n- [53781] Mont Blanc : Arête des Bosses\n");
    expect(result).toContain(
      "\n## Associated waypoints\n- [37295] Dômes de Miage - Sommet W (summit) | 3670m\n- [37586] Aiguille des Glaciers (summit) | 3817m",
    );
    expect(result).not.toContain("ISBN");
    expect(result).not.toContain("Website");
  });

  it("leaves out the elevation of a waypoint that has none", async () => {
    // No waypoint linked to the sampled books lacks an elevation: this is the 209293 fixture with the
    // elevation of 37586 set to null.
    const [first, second] = BOOK_209293.associations.waypoints;
    mockGetBook.mockResolvedValueOnce({
      ...BOOK_209293,
      associations: { ...BOOK_209293.associations, waypoints: [first, { ...second, elevation: null }] },
    });

    const result = await handleGetBook({ id: 209293 });

    expect(result).toContain("- [37586] Aiguille des Glaciers (summit)");
    expect(result).not.toContain("- [37586] Aiguille des Glaciers (summit) |");
  });

  it("looks up the fr title of a waypoint whose first locale is another language", async () => {
    // Derived: waypoint 37355 of the live 209293 response, with only its live it ("Monte Bianco") and fr
    // ("Mont Blanc") locales, put in it-then-fr order (live order is fr first), and its live elevation.
    mockGetBook.mockResolvedValueOnce({
      ...BOOK_209293,
      associations: {
        waypoints: [
          {
            document_id: 37355,
            locales: [
              { lang: "it", title: "Monte Bianco" },
              { lang: "fr", title: "Mont Blanc" },
            ],
            waypoint_type: "summit",
            elevation: 4805,
          },
        ],
      },
    });

    const result = await handleGetBook({ id: 209293 });

    expect(result).toContain("- [37355] Mont Blanc (summit) | 4805m");
    expect(result).not.toContain("Monte Bianco");
  });

  it("lists all 143 routes", async () => {
    const routes = BOOK_194348_ROUTE_IDS.map((document_id) => ({
      document_id,
      locales: [{ lang: "fr", title: `Route ${document_id}`, title_prefix: "Sommet" }],
    }));
    mockGetBook.mockResolvedValueOnce({
      document_id: 194348,
      locales: [{ lang: "fr", title: "Ascensions en Neige et Mixte - Tome 1 : Écrins Est, Cerces, Queyras" }],
      associations: { routes },
    });

    const result = await handleGetBook({ id: 194348 });

    const routeLines = result.split("\n").filter((line) => line.startsWith("- ["));
    expect(routeLines).toHaveLength(143);
    expect(routeLines[0]).toBe("- [45632] Sommet : Route 45632");
    expect(routeLines[142]).toBe("- [1765387] Sommet : Route 1765387");
  });

  it("leaves out every association heading when lists are empty or missing", async () => {
    // The live 14746 associations (all lists empty), then two derived variants: an empty `associations`
    // object and no `associations` at all.
    for (const associations of [BOOK_14746.associations, {}, undefined]) {
      mockGetBook.mockResolvedValueOnce({ ...BOOK_14746, associations });

      const result = await handleGetBook({ id: 14746 });

      expect(result).not.toContain("## Associated");
    }
  });

  it("lists associated articles after the routes, with the fr title", async () => {
    mockGetBook.mockResolvedValueOnce(BOOK_14592);

    const result = await handleGetBook({ id: 14592 });

    expect(result).toContain(
      "\n## Associated routes\n- [45528] Les Courtes : Face NE\n\n## Associated articles\n- [108642] 100 plus belles : la liste des titres et la cote en occasion",
    );
    expect(result.endsWith("- [108642] 100 plus belles : la liste des titres et la cote en occasion")).toBe(true);
    expect(result).not.toContain("## Associated waypoints");
  });

  it("lists articles after routes and waypoints, with the title of an en-only article", async () => {
    mockGetBook.mockResolvedValueOnce(BOOK_1303412);

    const result = await handleGetBook({ id: 1303412 });

    expect(result).toContain(
      [
        "## Associated routes",
        "- [46071] Aneto : Par le refuge de la Rencluse (Voie Normale)",
        "",
        "## Associated waypoints",
        "- [114681] Gavarnie Village (access) | 1375m",
        "",
        "## Associated articles",
        "- [812610] Portail Mont Blanc  Climbing, Mountaineering and skiing",
      ].join("\n"),
    );
    expect(result.endsWith("- [812610] Portail Mont Blanc  Climbing, Mountaineering and skiing")).toBe(true);
  });

  it("shows Untitled for an article association without locales", async () => {
    // No sampled article association has empty locales: this is the 1303412 fixture with the locales of
    // article 812610 emptied.
    const [article] = BOOK_1303412.associations.articles;
    mockGetBook.mockResolvedValueOnce({ ...BOOK_1303412, associations: { articles: [{ ...article, locales: [] }] } });

    const result = await handleGetBook({ id: 1303412 });

    expect(result).toContain("\n## Associated articles\n- [812610] Untitled");
    expectNoPlaceholder(result);
  });

  it("leaves out the articles heading when the list is empty or missing", async () => {
    // The live 373877 associations (articles: [] next to a route), then the 14592 fixture with its
    // `articles` key removed (derived).
    const { waypoints, routes } = BOOK_14592.associations;
    const withoutArticles = { waypoints, routes };
    for (const book of [BOOK_373877, { ...BOOK_14592, associations: withoutArticles }]) {
      mockGetBook.mockResolvedValueOnce(book);

      const result = await handleGetBook({ id: book.document_id });

      expect(result).toContain("## Associated routes");
      expect(result).not.toContain("## Associated articles");
    }
  });

  it("passes an API error through unchanged", async () => {
    mockGetBook.mockRejectedValueOnce(new Error("Camptocamp API error: 404 Not Found"));

    await expect(handleGetBook({ id: 999999999 })).rejects.toThrow("Camptocamp API error: 404 Not Found");
  });
});
