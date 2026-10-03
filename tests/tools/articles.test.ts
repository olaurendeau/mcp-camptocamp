import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  handleSearchArticles,
  handleGetArticle,
  searchArticlesSchema,
  getArticleSchema,
  articleToolDefinitions,
} from "../../src/tools/articles.js";
import * as api from "../../src/api/camptocamp.js";
import type { ArticleDetail } from "../../src/api/camptocamp.js";

vi.mock("../../src/api/camptocamp.js");

const mockSearchArticles = vi.mocked(api.searchArticles);
const mockGetArticle = vi.mocked(api.getArticle);

function expectNoPlaceholder(text: string) {
  for (const word of ["undefined", "null"]) expect(text).not.toContain(word);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Every fixture below copies a live Camptocamp response, minus, at any depth, the fields no tool reads:
// `version`, `protected`, `type`, `available_langs` and `topic_id`. Detail fixtures other than 193302 also drop
// their empty association lists. Each comment states any further trimming.

// The live GET /articles?q=crampons&limit=10&lang=fr response (2026-10-03).
const CRAMPONS_SEARCH = {
  documents: [
    {
      document_id: 226838,
      locales: [{ lang: "fr", title: "Les crampons", summary: null }],
      quality: "great",
      categories: ["gear"],
      activities: ["mountain_climbing", "snow_ice_mixed", "hiking", "snowshoeing", "skitouring", "ice_climbing"],
      article_type: "collab",
    },
    {
      document_id: 314504,
      locales: [{ lang: "fr", title: "Chaussures avec crampons intégrés (article à completer)", summary: null }],
      quality: "medium",
      categories: ["gear"],
      activities: ["rock_climbing", "snow_ice_mixed", "ice_climbing"],
      article_type: "collab",
    },
    {
      document_id: 665710,
      locales: [{ lang: "fr", title: "Affuter et mettre ses vieux crampons à neuf", summary: null }],
      quality: "fine",
      categories: ["gear"],
      activities: ["snow_ice_mixed", "ice_climbing"],
      article_type: "personal",
    },
  ],
  total: 3,
};

// The live GET /articles?q=rappel&limit=10&lang=fr response (2026-10-03, total 5), with 3 of its 5 documents
// kept: 716039, 713810 and 193302 (377904 and 129038 removed).
const RAPPEL_SEARCH = {
  documents: [
    {
      document_id: 716039,
      locales: [
        { lang: "en", title: "Rappelling (source Petzl)", summary: null },
        { lang: "fr", title: "Descendre en rappel (source Petzl)", summary: null },
        { lang: "de", title: "Abseilen (Quelle Petzl)", summary: null },
        { lang: "es", title: "Descender en rápel (fuente Petzl)", summary: null },
        { lang: "it", title: "Discesa in doppia (provenienza Petzl)", summary: null },
      ],
      quality: "fine",
      categories: ["technical"],
      activities: ["mountain_climbing", "snow_ice_mixed", "rock_climbing", "ice_climbing"],
      article_type: "personal",
    },
    {
      document_id: 713810,
      locales: [
        { lang: "en", title: "Rappelling on an abalakov (Petzl source)", summary: null },
        { lang: "de", title: "Abseilen an Abalakov-Eisuhr (Quelle Petzl)", summary: null },
        { lang: "es", title: "Descender en rápel desde un abalakov (origen Petzl)", summary: null },
        { lang: "fr", title: "Descendre en rappel sur abalakov (source Petzl)", summary: null },
        { lang: "it", title: "Discesa in doppia su abalakov (provenienza Petzl)", summary: null },
      ],
      quality: "fine",
      categories: ["technical"],
      activities: ["snow_ice_mixed", "ice_climbing"],
      article_type: "personal",
    },
    {
      document_id: 193302,
      locales: [{ lang: "fr", title: "Du lointain nous nous rappellons", summary: null }],
      quality: "medium",
      categories: ["stories"],
      activities: null,
      article_type: "personal",
    },
  ],
  total: 5,
};

// The live GET /articles?q=Less difficult alpine routes&limit=10&lang=fr response (2026-10-03).
const LESS_DIFFICULT_SEARCH = {
  documents: [
    {
      document_id: 302774,
      locales: [{ lang: "en", title: "Less difficult alpine routes in the Mont Blanc region", summary: null }],
      quality: "medium",
      categories: ["topoguide_supplements"],
      activities: ["mountain_climbing", "snow_ice_mixed"],
      article_type: "collab",
    },
  ],
  total: 1,
};

// The live GET /articles?q=Valanghe in video&limit=10&lang=fr response (2026-10-03).
const VALANGHE_SEARCH = {
  documents: [
    {
      document_id: 110093,
      locales: [{ lang: "it", title: "Valanghe in video", summary: null }],
      quality: "medium",
      categories: ["mountain_environment"],
      activities: ["skitouring"],
      article_type: "collab",
    },
  ],
  total: 1,
};

describe("handleSearchArticles", () => {
  it("forwards query and limit and prints the total header", async () => {
    mockSearchArticles.mockResolvedValueOnce(CRAMPONS_SEARCH);

    const result = await handleSearchArticles({ query: "crampons", limit: 10 });

    expect(mockSearchArticles).toHaveBeenCalledWith("crampons", 10);
    expect(result.startsWith("Found 3 article(s). Showing 3:\n")).toBe(true);
  });

  it("writes one line per article with the raw type, categories and activities", async () => {
    mockSearchArticles.mockResolvedValueOnce(CRAMPONS_SEARCH);

    const result = await handleSearchArticles({ query: "crampons", limit: 10 });

    expect(result).toBe(
      [
        "Found 3 article(s). Showing 3:\n",
        "- [226838] Les crampons | Type: collab | Categories: gear | Activities: mountain_climbing, snow_ice_mixed, hiking, snowshoeing, skitouring, ice_climbing",
        "- [314504] Chaussures avec crampons intégrés (article à completer) | Type: collab | Categories: gear | Activities: rock_climbing, snow_ice_mixed, ice_climbing",
        "- [665710] Affuter et mettre ses vieux crampons à neuf | Type: personal | Categories: gear | Activities: snow_ice_mixed, ice_climbing",
      ].join("\n"),
    );
  });

  it("prints a topoguide_supplements category unchanged and falls back to the only locale", async () => {
    mockSearchArticles.mockResolvedValueOnce(LESS_DIFFICULT_SEARCH);

    const result = await handleSearchArticles({ query: "Less difficult alpine routes", limit: 10 });

    expect(result).toContain(
      "- [302774] Less difficult alpine routes in the Mont Blanc region | Type: collab | Categories: topoguide_supplements | Activities: mountain_climbing, snow_ice_mixed",
    );
  });

  it("takes the fr title even when fr is not the first locale", async () => {
    mockSearchArticles.mockResolvedValueOnce(RAPPEL_SEARCH);

    const result = await handleSearchArticles({ query: "rappel", limit: 10 });

    expect(result).toContain("- [716039] Descendre en rappel (source Petzl) | Type: personal");
    expect(result).toContain("- [713810] Descendre en rappel sur abalakov (source Petzl) | Type: personal");
    expect(result).not.toContain("Rappelling");
  });

  it("falls back to the it title, then to Untitled", async () => {
    mockSearchArticles.mockResolvedValueOnce(VALANGHE_SEARCH);
    expect(await handleSearchArticles({ query: "Valanghe in video", limit: 10 })).toContain(
      "- [110093] Valanghe in video | Type: collab",
    );

    // Derived: no live article has empty locales; this is the 110093 document with `locales` emptied.
    const noLocale = { ...VALANGHE_SEARCH.documents[0], locales: [] };
    mockSearchArticles.mockResolvedValueOnce({ documents: [noLocale], total: 1 });
    expect(await handleSearchArticles({ query: "Valanghe in video", limit: 10 })).toContain("- [110093] Untitled |");
  });

  it("leaves out null activities and empty categories", async () => {
    mockSearchArticles.mockResolvedValueOnce(RAPPEL_SEARCH);

    const live = await handleSearchArticles({ query: "rappel", limit: 10 });

    expect(live.endsWith("\n- [193302] Du lointain nous nous rappellons | Type: personal | Categories: stories")).toBe(
      true,
    );
    expectNoPlaceholder(live);

    // Derived: no live article has empty categories; this is the 193302 document with `categories: []`.
    const noCategories = { ...RAPPEL_SEARCH.documents[2], categories: [] };
    mockSearchArticles.mockResolvedValueOnce({ documents: [noCategories], total: 1 });
    const derived = await handleSearchArticles({ query: "rappel", limit: 10 });

    expect(derived).toContain("- [193302] Du lointain nous nous rappellons | Type: personal");
    expect(derived).not.toContain("Categories");
    expect(derived).not.toContain("Activities");
    expectNoPlaceholder(derived);
  });

  it("returns exactly 'No articles found.' for an empty result", async () => {
    // The live GET /articles?q=zzzqqqxxx&limit=10&lang=fr response (2026-10-03).
    mockSearchArticles.mockResolvedValueOnce({ documents: [], total: 0 });

    expect(await handleSearchArticles({ query: "zzzqqqxxx", limit: 10 })).toBe("No articles found.");
  });
});

describe("article tool definitions", () => {
  it("registers search_articles and get_article with their schemas", () => {
    expect(articleToolDefinitions.map((t) => t.name)).toEqual(["search_articles", "get_article"]);
    expect(articleToolDefinitions[0].inputSchema).toBe(searchArticlesSchema);
    expect(articleToolDefinitions[1].inputSchema).toBe(getArticleSchema);
  });

  it("describes the article topics and the two article types", () => {
    const description = articleToolDefinitions[0].description;
    for (const word of ["gear", "technique", "mountain environment", "stories", "topoguide supplements"]) {
      expect(description).toContain(word);
    }
    expect(description).toContain("`collab` (community-edited");
    expect(description).toContain("`personal` (one author's view");
  });

  it("bounds limit to 1-50 with a default of 10", () => {
    expect(searchArticlesSchema.parse({ query: "crampons" })).toEqual({ query: "crampons", limit: 10 });
    expect(searchArticlesSchema.safeParse({ query: "crampons", limit: 0 }).success).toBe(false);
    expect(searchArticlesSchema.safeParse({ query: "crampons", limit: 51 }).success).toBe(false);
    expect(searchArticlesSchema.safeParse({ limit: 10 }).success).toBe(false);
  });

  it("accepts only a positive integer id", () => {
    expect(getArticleSchema.parse({ id: 226838 })).toEqual({ id: 226838 });
    for (const id of [0, -1, 1.5]) expect(getArticleSchema.safeParse({ id }).success).toBe(false);
  });
});

// The live GET /articles/226838?lang=fr response (2026-10-03), with its 5 images removed and its article
// association reduced to document_id and locale lang/title.
const ARTICLE_226838 = {
  document_id: 226838,
  locales: [
    {
      lang: "fr",
      title: "Les crampons",
      description:
        "[toc]\n\n## Le nombre de pointes\n#### 4 ou 6 pointes\nPeu utilisés, ils sont destinés aux randonneurs, et se fixent sous l'avant du pied.\n\n#### 10, 11 ou 12 pointes\nHormis quelques crampons à 10 pointes, les 12 pointes sont la norme en terrain neigeux et glaciaire.\nEn cascade de glace, il existe des crampons \"mono-pointe\" à 10 pointes latérales et 1 pointe frontale, soit 11 pointes.\n\n####Avantages et inconvénients du mono-pointe en escalade sur glace\nL'intérêt des crampons mono-pointe en cascade de glace se révèle essentiellement au-delà du grade 5-6, notamment dans les structures \"fragiles\" où la précision du monopointe est un plus important. Il n'y a pas de grande différences d'usage entre bi-pointes et mono-pointe dans les grades 4 à 5.\n\n- Avantages : le mono-pointe est plus précis dans le planté. Il permet plus facilement une gestuel se rapprochant de l'escalade (prise de carre, lolotte etc. ). Il éclate moins la glace avec une meilleur pénétration de la dent. La précision permet d'utiliser les trous des piolets pour les crampons, de coincer la pointe dans les fissures, une plus grande précision en grattonage.\n- Inconvénients : le mono-pointe a moins de stabilité latérale. C'est donc plus exigeant plus les chevilles. \n\n## Les matériaux utilisés\n[img=269880 right]Crampons alu / acier[/img]\n#### Crampons en aluminium\nLégers, environ 200g le crampon, ils sont utilisés en appoint par les randonneurs à pied ou à skis. \n\nOn trouve dans les crampons aluminium comme dans les crampons acier les différents systèmes de fixation.\n\n#### Crampons en acier\nPlus lourds, ils sont plus rigides et plus résistants.\n\n*Sur la photo, de gauche à droite, crampon alu à attache rapide, crampon alu à lanière pour chaussure de marche, crampon acier à lanière pour chaussure de marche.*\n\n## La rigidité\n#### Crampons semi-rigides\nPrincipalement utilisés en dehors de la cascade de glace, les semi-rigides sont constitués de deux parties (avant et arrière) reliés par une tige métallique axiale. Ils sont aussi appelés \"articulés\".\n\n#### Crampons rigides\nIls sont utilisés pour la cascade de glace\n\n## Les systèmes de fixation\n[img=249113 right]Crampons avec fixations à lanière, semi-automatique et automatique[/img]\n#### Crampons à lanières\nUn tel crampon n'est solidarisé à la chaussure que par le biais d'une ou de sangle(s) plate(s). Il est utilisable sur tout type de chaussure.\n\n#### Crampons semi-automatiques\nUn crampon semi-automatique nécessite une chaussure adaptée : il dispose en général d'un système mécanique de serrage sur le talon qui s'adapte à une encoche spécifique sur le talon de la chaussure, tandis que l'avant du crampon est serré par une sangle.\n\n#### Crampons automatiques\nIls nécessitent des chaussures particulièrement conçues pour recevoir des crampons à serrage mécanique tant à l'avant qu'à l'arrière.\n\n## Les antibott\n[img=269699 left]Anti-bott \"maison\"[/img]\n\nLes antibott sont un accessoire fixé sous le crampon et destiné à empêcher l'accumulation de neige qui ferait perdre leur efficacité aux crampons.\n#### Les antibott du commerce\nVendus par les fabricants de crampons, ils sont souvent destinés à leur propre gamme. Ils sont fabriqués en plastique caoutchouteux. Leur durée de vie est de quelques années.\n\n#### Les \"antibott maison\"\nÀ partir de \"duct tape\", il est facile de fabriquer des antibott maison. Leur durée de vie est d'une dizaine-vingtaine de courses en fonction du terrain. Ils sont très légers.\nhttp://www.pbase.com/chatnoir_chatbleu/image/118868460\n\n## Les \"pieuvres\" ou protègent-crampons\n[img=269700 small right no_border no_legend/]\n\nCet accessoire caoutchouteux est destiné à recouvrir les pointes lorsque les crampons ne sont pas utilisés, afin de protéger pendant leur transport les autres matériels (notamment le sac) et les personnes.\n\n## Les fabricants\n[[articles/229207|Black Diamond]]\n[[articles/229269|Camp]]\n[[articles/229265|Cassin]]\n[[articles/231155|DMM]]\n[[articles/229270|Grivel]]\n[[articles/229264|Petzl]]\n[[articles/244675|Raveltik]]\n[[articles/229263|Simond]]\n\n[[articles/345095|Fabriquants produisant en France]]\n\n## Historique\nUn [article sur l'histoire des crampons](http://alpen.sac-cas.ch/fr/archiv/2010/201009/af_2010_09_03.pdf), écrit par Mario Volken, a paru dans la revue Les Alpes du CAS, en septembre 2010.",
      summary: null,
    },
  ],
  quality: "great",
  categories: ["gear"],
  activities: ["mountain_climbing", "snow_ice_mixed", "hiking", "snowshoeing", "skitouring", "ice_climbing"],
  article_type: "collab",
  associations: { articles: [{ document_id: 1204346, locales: [{ lang: "fr", title: "Portail Matériel" }] }] },
  author: { name: "Thomas Ribière", user_id: 4060 },
};

// Trimmed from the live GET /articles/716039?lang=fr response (2026-10-03): the description of each of the
// 5 locales removed; 1 of 8 images kept, with only document_id, locale lang/title and filename; the user
// association reduced to document_id, name and forum_username; the 2 article associations reduced to
// document_id and locale lang/title.
const ARTICLE_716039 = {
  document_id: 716039,
  locales: [
    { lang: "en", title: "Rappelling (source Petzl)", summary: null },
    { lang: "fr", title: "Descendre en rappel (source Petzl)", summary: null },
    { lang: "de", title: "Abseilen (Quelle Petzl)", summary: null },
    { lang: "es", title: "Descender en rápel (fuente Petzl)", summary: null },
    { lang: "it", title: "Discesa in doppia (provenienza Petzl)", summary: null },
  ],
  quality: "fine",
  categories: ["technical"],
  activities: ["mountain_climbing", "snow_ice_mixed", "rock_climbing", "ice_climbing"],
  article_type: "personal",
  associations: {
    users: [{ document_id: 726690, name: "Petzl", forum_username: "Petzl" }],
    images: [
      {
        document_id: 716040,
        locales: [{ lang: "fr", title: "Descendre en rappel - 1" }],
        filename: "1453928079_1797272333.png",
      },
    ],
    articles: [
      {
        document_id: 713233,
        locales: [
          { lang: "en", title: "Petzl Technical Documentations" },
          { lang: "es", title: "Documentación técnica Petzl" },
          { lang: "de", title: "Petzl technische Informationsmaterial" },
          { lang: "fr", title: "Documentations techniques Petzl" },
          { lang: "it", title: "Documentazione tecnica Petzl" },
        ],
      },
      {
        document_id: 715946,
        locales: [
          { lang: "it", title: "Assicurazione e discesa su vie lunghe con corda singola (provenienza Petzl)" },
          { lang: "fr", title: "Assurer et descendre en grande voie sur corde à simple (source Petzl)" },
          { lang: "de", title: "Sichern und Abseilen in Mehrseillängenrouten mit einem Einfachseil (Quelle Petzl)" },
          { lang: "en", title: "Belaying and descending on multi-pitch climbs on a single rope (source Petzl)" },
          { lang: "es", title: "Asegurar y descender en grandes itinerarios con cuerda simple (fuente Petzl)" },
        ],
      },
    ],
  },
  author: { name: "Frédéric Bunoz", user_id: 288 },
};

// The live GET /articles/193302?lang=fr response (2026-10-03), with its user association reduced to
// document_id, name and forum_username.
const ARTICLE_193302 = {
  document_id: 193302,
  locales: [
    {
      lang: "fr",
      title: "Du lointain nous nous rappellons",
      description:
        "\r\n\r\nLa route est longue au soir tombant,\r\nle vent qui roule ses buissons ardents\r\nle sable levé fouette la voiture\r\nsalie des poussières d'ocres.\r\n\r\nLe soleil flamboie sur la ligne droite\r\ndes heures durant la parcourant\r\nle long de ces blancheurs étincelantes\r\nsalée, en prise de vitesse halucinante\r\nDes gemmes pures ramassées à la main,\r\nsont toutes prêtes à déguster.\r\n\r\nDe ces bassins d'eau qui s'évapore,\r\ndisposés dans l'interminable platitude.\r\nDe ces espaces bordant des îlots montagneux,\r\ndes tables de verdures, enneigées\r\nentourées par la désolation\r\n\r\nDe ces bras des pierres figées,\r\nciselés en arches délicates\r\nprés de Moab,\r\nDe nos propres bras cotoyant ces sables pétrifiés\r\naprès la longue marche, \r\nassoiffée de nature brûlante.\r\n\r\nDe ces polyhèdres aux faces miroitantes\r\ncouleur de sang mélé de soleil\r\nlancant des courses folles à l'équilibre\r\npointant des interrogations vers le ciel\r\nau coeur des vallées monumentales.\r\n\r\nDe ces dômes arrondis\r\nau milieu des champs de Tuolumne,\r\nau flancs baignées des larmes \r\ndes vertes prairies\r\noù coule l'ondée glacée\r\noù se déploie la ligne brisée\r\noù nos amis se coincent dans les interstices\r\net nous offrent la sécurité.\r\n\r\nDe ce progrés vers la vie,\r\ndans se sentiment de l'existence,\r\nentourés des béatitudes verticales,\r\ndans ces enchantements granitiques du Yosemite,\r\napaisés et flottant dans la pesanteur\r\nque nos mains et nos pieds retient\r\n\r\nDe ces arbres jaillisant du sol,\r\nen canopées millénaires,\r\noffrant à la hauteur\r\nses senteurs résineuses\r\noffrant à nos enlacements\r\nune impossible amplitude \r\ntournant ses pollens aux papillons\r\nbercés par les braises des vents estivaux.\r\n\r\nDe ces arbres devenant pierres\r\nperdus dans les sables du désert\r\nau pied des larmes du sang du Christ,\r\njonchant d'humble buttes grises\r\nstriées de rigoles régulières\r\nfruit des rares pluies\r\nqui n'ont que la mémoire d'antan\r\n\r\nDe ces jets d'eau brûlants et fidèles,\r\nde ces vasques sulfureuses,\r\nde ces myriades colorées,\r\nsoufflant des entrailles terreuses.\r\nDe ces flots de l'enfer,\r\nbaignant des rives de paradis,\r\noù paissent des buffles paisibles.\r\n\r\nDe ces sourires francs et sincères\r\nde ces salutations sans malices\r\nde cette naîveté de l'existence\r\nau bon vent de l'ouest,\r\nde cette liberté ressentie\r\ndu fait des trops rares êtres\r\npeuplant l'immensité.\r\n\r\nAlors mon ami lecteur,\r\nAlors que notre voyage s'achève\r\nrappellons-nous ....\r\n\r\n",
      summary: null,
    },
  ],
  quality: "medium",
  categories: ["stories"],
  activities: null,
  article_type: "personal",
  associations: {
    waypoints: [],
    routes: [],
    users: [{ document_id: 136499, name: "henri leveque", forum_username: "LiquidTensionExperiment" }],
    images: [],
    articles: [],
    outings: [],
    books: [],
    xreports: [],
  },
  author: { name: "henri leveque", user_id: 136499 },
};

// Trimmed from the live GET /articles/107228?lang=fr response (2026-10-03): only the fr locale kept (ca, es and
// it removed), with its 22,463-character description whole; 2 of 7 article associations kept (1204299 and
// 1257569), reduced to document_id and locale lang/title.
const ARTICLE_107228 = {
  document_id: 107228,
  locales: [
    {
      lang: "fr",
      title: "Préparation de votre course - liens Utiles : Météo, Bulletin Avalanche, Neige,...",
      description:
        "[toc]\n\n\n\n## Météo\n\n### France \n - [National](http://france.meteofrance.com/france/accueil)\n - [Alpes du N (RA)](http://www.meteofrance.com/FR/mameteo/prevReg.jsp?LIEUID=REG18) ([montagne](http://france.meteofrance.com/france/montagne?MONTAGNE_PORTLET.path=montagneprevisionmassif%252FALPES-NORD))\n - [Alpes du S (PACA)](http://www.meteofrance.com/FR/mameteo/prevReg.jsp?LIEUID=REG19) ([montagne](http://france.meteofrance.com/france/montagne?MONTAGNE_PORTLET.path=montagneprevisionmassif%252FALPES-SUD))\n - [Pyrénées E](http://france.meteofrance.com/france/montagne?MONTAGNE_PORTLET.path=montagneprevisionmassif%252FPYRENEES-EST)\n - [Pyrénées W](http://france.meteofrance.com/france/montagne?MONTAGNE_PORTLET.path=montagneprevisionmassif%252FPYRENEES-OUEST)\n    \n### Autres Bulletins France \n - [GRIMMs - Centralisation des bulletins météo france montagne montagne payant](https://grimms.fr)\n - [Météo Chamonix](https://meteo-chamonix.org/)\n - [Chamonix-météo](http://chamonix-meteo.com/) (moins développé que le précédent)\n - [Caplain (Isère & Savoie)](http://mto38.free.fr)\n - [Infoclimat (Alpes Maritimes)](http://www.infoclimat.fr/previsions-regionales/alpes_maritimes.php)\n - [observations en temps réel de Météociel](http://www.meteociel.fr/accueil/temps-reel.php)\n - [Avalanche-net, prévisions et temps réel](http://www.avalanche-net.com)\n - [Réseau de stations météo automatiques Romma](http://www.romma.fr/index.php)\n - [meteoblue](http://www.meteoblue.com/fr_FR/meteo/previsions/semaine/grenoble_fr_31635) avec un graphe de nébulosité notamment (Diagrames et Outils > Meteogram > All In One)\n -  [Meteo alpe](https://www.meteoalpes.fr/bulletin/alpes-du-nord/)  \n### Suisse \n - [Météo Suisse](http://www.meteosuisse.ch/)\n - [Meteocentrale](http://www.meteocentrale.ch/index.php?id=10&L=2)\n    \n### Autriche \n - [Bulletin national de Wetter.at](http://www.wetter.at/wetter/oesterreich/)\n - Météo des stations de ski de [Wetter.at](http://www.wetter.at/wetter/sport-freizeit/ski-wetter/)\n    \n### Italie \n - [Nimbus](http://www.nimbus.it/italiameteo/italiameteo.htm)\n - [MeteoLive](http://meteolive.it/)\n - [IlMeteo](http://www.ilmeteo.it/portale/meteo-breve-termine)\n - [Dolomiti meteo](https://www.dolomitimeteo.it/)\n - [Meteo Aeronautica Militare](http://www.meteoam.it/previsioni/italia)\n - [Vallée d'Aoste - Montagne](https://cf.regione.vda.it/fr/meteo)\n    \n### Espagne \n - [Agencia Estatal de Meteorología - AEMET](http://www.aemet.es/) (voir [Montaña](http://www.aemet.es/es/eltiempo/prediccion/montana))\n    \n### Catalogne \n - [Meteo Catalunya](http://www.meteocat.com/prediccio/pirineu) \n    \n### Norvège\n - [yr](https://www.yr.no/)\n### Europe \n - [Wetterzentrale](http://www.wetterzentrale.de)\n - [Met Office](http://www.metoffice.gov.uk)\n - [P@r@2000](http://www.para2000.org/weather/index.html)\n - [Prévisions météo pour le Vol Libre](http://meteo-parapente.com/)\n    \n### Amérique du Nord \n - [Canada - Météomedia](http://www.meteomedia.com/)\n - [Environnement Canada](http://www.meteo.gc.ca/canada_f.html)\n    \n### Amérique du Sud \n - [[articles/139918|Andes centrales (Argentine et Chili)]]\n - [[articles/142584|Patagonie]]\n    \n### Asie \n - Certains sites listés dans les articles sur l'Amérique du Sud offrent aussi des prévisions pour l'Asie\n - [Expedition Weather](http://www.expeditionweather.info/index.php?page=200) (sélectionner la zone en haut à droite)\n    \n### Modèles numériques \n - [Météociel](http://www.meteociel.fr/modeles/index.php)\n - [Meteoblue](http://www.meteoblue.com/index.php?id=86&did=135)\n - [WestWind](http://www.westwind.ch)\n - [Meteoliguria.it](http://www.meteoliguria.it/level1/model.html)\n - [carte mondiale des vents](http://earth.nullschool.net/)\n - [prévisions des orages](http://www.keraunos.org/)\n - [Ventuski](https://www.ventusky.com)\n\n## Bulletins d’Estimation du Risque d’Avalanches (BERA)\n\nSite référençant tous les BERA mondialement: http://www.base-medical.com/avalanche-resource.html \n\n###  France\n[Tous les bulletins pour la France](https://donneespubliques.meteofrance.fr/?fond=produit&id_produit=265&id_rubrique=50)\n\n- [74](http://www.meteofrance.com/previsions-meteo-montagne/bulletin-avalanches/hautes-alpes/avdept74)\n- [73](http://www.meteofrance.com/previsions-meteo-montagne/bulletin-avalanches/hautes-alpes/avdept73) \n- [38](http://www.meteofrance.com/previsions-meteo-montagne/bulletin-avalanches/hautes-alpes/avdept38)\n- [06](http://www.meteofrance.com/previsions-meteo-montagne/bulletin-avalanches/hautes-alpes/avdept06)\n- [05](http://www.meteofrance.com/previsions-meteo-montagne/bulletin-avalanches/hautes-alpes/avdept05)\n- [04](http://www.meteofrance.com/previsions-meteo-montagne/bulletin-avalanches/hautes-alpes/avdept04) \n- [2a](http://www.meteofrance.com/previsions-meteo-montagne/bulletin-avalanches/hautes-alpes/avdept2A)\n- [2b](http://www.meteofrance.com/previsions-meteo-montagne/bulletin-avalanches/hautes-alpes/avdept2B)\n- [66](http://www.meteofrance.com/previsions-meteo-montagne/bulletin-avalanches/hautes-alpes/avdept66)\n- [65](http://www.meteofrance.com/previsions-meteo-montagne/bulletin-avalanches/hautes-alpes/avdept65)\n- [64](http://www.meteofrance.com/previsions-meteo-montagne/bulletin-avalanches/hautes-alpes/avdept64)\n- [31](http://www.meteofrance.com/previsions-meteo-montagne/bulletin-avalanches/hautes-alpes/avdept31)\n- [09](http://www.meteofrance.com/previsions-meteo-montagne/bulletin-avalanches/hautes-alpes/avdept09)\n\n### Europe\n- [European Avalanche Service](https://www.avalanches.org/)\n- [Bulletin CH](https://www.slf.ch/fr/bulletin-davalanches-et-situation-nivologique.html)\n- [Bulletin pour la Vallée d'Aoste](https://bollettinovalanghe.regione.vda.it/home)\n- [Bulletin IT](https://bollettini.aineva.it/bulletin/latest)\n- [Bulletin AT](https://www.lawinen.at/) (Autriche). Cliquer sur chaque région pour le détail ; les infos sont alors disponibles en anglais (picto en haut à droite).\n- [Bulletin CAT](https://bpa.icgc.cat/?lg=ca&em=1)\n- [Bulletin Val d'Aran](http://www.lauegi.conselharan.org/) (lien cassé)\n- [Bulletin ESP](http://www.aemet.es/es/eltiempo/prediccion/montana?w=2&p=arn1) (Navarre, Aragon)\n- [Ecosse](https://www.sais.gov.uk/)\n\n### Autres\n- [Québec : Haute-Gaspésie](https://avalanchequebec.ca/)\n- [Échelle internationale](https://www.avalanches.org/wp-content/uploads/2022/09/Echelle_de_danger_davalanche-EAWS.pdf)\n\n- [Glossaire neige et avalanches](http://www.avalanches.org/basics/glossar-fr/)\n- [Site de formation Avalanches](https://www.arva-equipment.com/fr/content/708-snow-safety-program) *(financé par ARVA)*\n\n\n## Neige\n\n[Connaissances de base sur la neige](https://www.anena.org/5292-nivologie-connaissances-de-base.htm) *(ANENA)*\n\n### France\n - [Nivôses](http://www.webcams-montagne.fr/nivoses.php)\n    \n### Norvège\n - [Carte d'observations nivo et météo](https://www.xgeo.no/index.html?p=snoskred) (nivôses et analyses du manteau)\n\n### Autriche \n- [Nivôses](http://www.lawine-steiermark.at/wetter/stationsdaten-lawis/)\n\n### Suisse\n- [Carte d'enneigement](http://www.slf.ch/schneeinfo/schneekarten/hstop/index_FR)\n- [Carte neige fraîche](http://www.slf.ch/schneeinfo/schneekarten/hn1d/index_FR)\n- [Carte neige 3 jours](http://www.slf.ch/schneeinfo/schneekarten/hn3d/index_FR)\n- [Carte du danger](http://www.slf.ch/lawinenbulletin/lawinengefahr/index_FR)\n- [Wochenbericht (de)](http://www.slf.ch/schneeinfo/wochenbericht/index_DE) dès jeudi 18h (en allemand)\n- [Rapport hebdomadaire (fr)](http://www.slf.ch/schneeinfo/wochenbericht/index_FR) dès vendredi 18h (en français)\n    \n\n\n\n\n## Outils\n* Le [cotomètre](http://paleo.blms.free.fr/cotometre/cotometre.php) pour évaluer la cotation ski d'une pente en fonction de son inclinaison.\n* La [carte de couverture réseau](https://reseaux.orange.fr/les-cartes-de-couverture/mobile-3g-4g-5g) pour savoir si le lieu de destination est couvert par le réseau mobile (en cas de problème).\n* La [carte des pentes](https://www.geoportail.gouv.fr/donnees/carte-des-pentes) pour la France.\n* La [carte des pentes](https://www.openslopemap.org/karte/) pour l'Autriche.\n\n\n## Webcams\n\n* Pour la France montagneuse: [Spotair](https://www.spotair.mobi/)\n* [Liste de webcams du réseau Romma : Alpes, Provence, Jura](https://www.romma.fr/weborama.php)\n* [Mont Blanc (74)](http://www.webcam-montblanc.com/webcam/)\n* Belledonne: [7 Laux](http://www.les7laux.com/contenu/contenu/webcams.html), [Allevard](http://www.allevard-les-bains.com/webcams-allevard-hiver.html) et [Chamrousse](http://www.chamrousse.com/www-webcam-33-hiver-fr-chamrousse-2.html) (Belledonne - 38)\n* Chartreuse: [Saint Hilaire du Touvet](http://www.prevol.com/index.php?action=affichepage&main=1&sujet=webcam), [Col de Marcieu](http://www.col-marcieu.com/) et [Saint Pierre de Chartreuse](http://www.skipass.com/stations/webcams_Saint-Pierre-de-Chartreuse.html) (Chartreuse - 38)\n* [Vercors](http://moucherolle.free.fr/)\n* [Alpe du Grand Serre](http://m.webcam-hd.com/alpe-du-grand-serre/village)\n* [La Grave (05)](http://la-grave.com/hiver/webcam.php)\n* [Oisans](http://www.tourisme-oisans.com/presse-montagne-53.html)\n* [La Grande Motte (73)](http://www.tignes.net/webcams.html#)\n* [Fort des Rousses (25)](http://www.webcam-ski.com/interfaces/lesrousses/interface.php?pk_interface=196&m=images&r=vue&pk_img_vue=2243)\n* [Puy Mary (15)](http://www.webcam-ski.com/interfaces/lioran/lioran_haut/images/zooms/puy_mary_1783_m.htm)\n* [Peter's Webcams (Suisse et alentours)](http://www.camscollection.ch/index1.php)\n* [Alpiwebcam (Suisse)](http://www.alpiwebcam.ch/)\n* [Vallée d'Aoste](https://www.lovevda.it/fr/avant-de-partir/webcams) \n\n\n## Stations automatiques\n\n### Stations \"nivôse\"\n\n[Les relevés des nivôses sont visibles ici.](www.webcams-montagne.fr/nivoses.php)\n\n\n### Stations \"Flowcapt\"\n\n*[Liste complète des Stations](http://www.iav-portal.com/index.php?nav=iodmisawlist&lang=fr)\n*[Clé de Lecture](http://pagesperso-orange.fr/duclos.transmontagne/FLOWCAPT%202009-11-06.pdf)\n\n#### France\n\n##### Savoie\n - [Bonneval-sur-Arc Les Lacs 2480m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=FBON1)  \n - [Celliers L'arpettaz 1924m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=FCEL1)\n - [Chevril La Davie 2869m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=FCHE1)\n - [St Martin de Belleville Montaulever 2280m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=FMON1)\n - [Pralognan Col du Biol 2419m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=FPRA1)\n - [Val Arly 713m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=FARL1)\n\n##### Isère\n - [La Bérarde 2390m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=FBER1)\n - [La Morte 2140m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=FMOR1)\n - [Grandes Rousses - Sardonne 2080m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=FHUE1)\n\n#### Suisse\n\n##### Valais\n - [Vollèges - Merdenson 1480m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=4VOL5)\n - [Chamoson - Tséné 1480m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=4CHM5)\n - [Zinal - Bonnard 2880m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=4ZIN5)\n - [Crans-Montana - Plaine-Morte](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=FPMO3)\n - [Evolene - Prélet Nord 2830m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=4EVO2)\n - [Evolene - Prélet Sud 2860m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=4EVO3)\n - [Illgraben - Illarb 2200m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=4ILL1)\n - [Aminona - Petit-Bonvin 2500m](http://www.isaw.ch/index.php?lang=en&nav=data_meteo_station&code=4AMI2)\n\n##### Canton de Vaud\n\n* ...\n\n#### Catalogne\n- [Bonaigua 2266 m, Boí 2535 m, Malniu 2230 m, Cadí Nord 2143 m, Núria 1967m](http://www.igc.cat/web/ca/allaus_gruix_neu.php?e=totes)\n\n#### Andorre\n#### Espagne\n#### Italie\n#### Chili\n\n## Cartographie en ligne\n\n* [Outil carto](/map)\n* [[articles/676486|Cet article]] regroupe les différentes cartes topographiques disponibles sur le web.\n* Edition de trace GPX : [GPXEditor](http://shamavideals.l-wa.org/GPXEditor1.1/)\n* [[articles/1604413|Inventaire des défauts dans les traces de Skitourenguru]]\n\n### Monde\n* Couverture satellite mondiale : [GoogleMap](http://maps.google.fr/)\n* Image satellite en direct: [Sentinel Playground](https://apps.sentinel-hub.com/sentinel-playground/?source=S2L2A&lat=45.462388171824045&lng=7.030134201049805&zoom=14&preset=1_TRUE_COLOR&layers=B01,B02,B03&maxcc=39.59&gain=1.0&gamma=1.0&time=2022-10-01%7C2023-04-04&atmFilter=&showDates=false)\n* [Pistes de ski (alpin et de fond) et remontées mécaniques](http://www.opensnowmap.org/) dans le monde entier, afin de savoir lorsqu'on planifie ses courses soit quels lieux éviter, soit quelles remontées et quelles pistes on peut utiliser pour diminuer l'effort.\n\n### Andorre\n[Ministeri d'Ordenament Territorial](http://www.mot.ad/ord_cartografia_muntanyesandorra.html) (fichiers PDF, échelle 1:10.000)\n\n### Autriche\n - [Austrianmap](http://www.austrianmap.at)\n - [Kompass](http://www.kompass.de/online-karte.html)\n\n### Espagne\n - [Instituto Geográfico Nacional](http://www2.ign.es/iberpix/visoriberpix/visorign.html)\n - Catalogne : [Institut Cartogràfic de Catalunya](http://www.icc.cat/vissir2/?lang=ca_ES)\n\n### Finlande\n- [MapSite](http://kansalaisen.karttapaikka.fi/kartanhaku/osoitehaku.html?lang=en-GB)\n\n### France\n- [Géoportail IGN](https://www.geoportail.gouv.fr/)\n\n### Islande\n- [National land survey of Iceland](https://kortasja.lmi.is/mapview/)\n\n### Italie \n- [Geoportale Nazionale](http://www.pcn.minambiente.it/viewer/)\n\n### Kirguizistan\nContacter le trekking union: http://www.tuk.kg/  . carte au 25 000 à Bichkek sur la région Ala Archa. sinon il existe des cartes à acheter sur internet avec des zooms au 50 000 sur les zones touristiques (marque terra quest).\n\n### Mount Vinson\n- [Landsat Image Mosaic Of Antarctica (LIMA)](http://lima.usgs.gov/antarctic_research_atlas/)\n\n### Norvège\n - [Skred Kart](http://skredkart.ngi.no/) : avec colorisation des pentes\n - [GodTur](http://www.godtur.no/default.aspx?gui=1&lang=1)\n - [ut.no](http://ut.no/kart/)\n - [norgeskart](https://norgeskart.net/)\n - [Svalbard (Spitzberg)](http://toposvalbard.npolar.no/)\n\n### Nouvelle-Zélande \n - [Central South Island Glacial Geomorphology](http://maps.gns.cri.nz/website/csigg/)\n - [Cartes officielles](http://newzealand.govt.nz/browse/environment-energy-conservation/maps/)\n\n### Royaume-Uni\n http://www.streetmap.co.uk/newmap.srf?x=215000&y=775000&z=3\n\n### Slovénie\n- [Geopedia](http://www.geopedia.si)\n\n### Suède\n- [Lantmäteriet](http://kso.lantmateriet.se/kartsok/kos/index.html)\n\n### Suisse\n - [geo.admin.ch](http://map.geo.admin.ch/)\n - [MapPlus](http://www.mapplus.ch/)\n - [SuisseMobile](http://map.schweizmobil.ch/?lang=fr)\n - [La Suisse à pied](http://map.wanderland.ch/)\n\n### Ex-URSS (georgie, tadjikistan...)\n**L'application \"maps offline\" permet de télécharger les cartes militaires russes sur smartphone pour toutes les régions de l’ancienne URRSS.**\n\n### États-Unis et Canada\n- [MyTopo](http://www.mytopo.com/maps/index.cfm)\n\n## Transport\n\n### Cartographie routière\n - [ViaMichelin](http://www.viamichelin.com/)\n - [Mappy](http://www.mappy.com/) \n - [Mapquest](http://www.mapquest.com/)   \n    \n### Transport en commun\n - [Deutsch Bahn (trains et bus en Europe)](http://www.bahn.de/international/view/fr/index.shtml) - le must !\n - [ Rome2rio : agrégateur d'infos TC](http://www.rome2rio.com/fr/)\n - [CFF (trains et bus Suisses)](http://www.cff.ch/)  \n - [TER (train régionaux français)](http://www.ter-sncf.com/)  \n - [SNCF (trains français)](http://www.sncf.com/)  \n - [FS trains italiens)](http://www.ferroviedellostato.it/)  \n - [Itinisère (Intermodal - Isère)](http://www.itinisere.fr)\n - [TransIsère (bus)](http://www.transisere.fr/)\n - [lihsa: lignes interurbaines de haute-savoie](http://infotransports.cg74.fr/)\n - [Viamontblanc (Intermodal - Mont-Blanc)](http://www.viamontblanc.com/)\n - [Mobisavoie (Intermodal - Savoie)](http://www.mobisavoie.fr)\n - [Les Hautes-Alpes en car](http://www.05voyageurs.com)\n - lignes régulières de [la Drôme](http://www.ladrome.fr/fr/les-services/transports/lignes-regulieres-et-horaires/index.html) et de [l'Ardèche](http://www.ardeche.fr/Transport/transports-collectifs/reseau-departemental)\n - [Corsicabus](http://www.corsicabus.org/)\n    \n### Information routière \n - [TCS (Suisse)](http://www.inforoute.ch/)\n - [Jura](http://www.cg39.fr/Outils-pratiques/Conditions-de-circulation)\n - [Haute-Savoie](http://www.cg74.fr/index.php?id=itemmenu_travauxRoutiers_267_1_1)\n - [Savoie](http://www.savoie-route.com/)                  \n - [Isère](http://www.isere.equipement.gouv.fr/infostrafic/routes38.htm)\n - [Hautes-Alpes](http://www.inforoute05.fr/cg05.html) et [webcams sur les principaux axes routiers du département](http://www.inforoute05.fr/wir3/cameras.html)\n - [Alpes de Haute-Provence](http://www.cg04.fr/routes-transports/reseau-routier/inforoute/index.html)\n - [Alpes Maritimes](http://www.inforoutes06.fr)\n - [Drôme](http://www.ladrome.fr/fr/les-services/routes-et-securite-routiere/se-deplacer-au-quotidien/index.html)\n - [Haute-Loire](http://www.inforoute-massif-central.fr/)\n - [Puy de Dôme](http://www.cg63.fr/Conditions_de_circulation-_88813.html?1=1 )\n - [Tunnel du Mont-Blanc](https://www.atmb.com/fr/info-trafic/prevision-trafic/tunnel-mont-blanc/)\n - [Ariège](CHOIX=CARTES&FICHE=infos%2Easp%3FTYPE%3DCOL&ANIM=carte%2Easp%3FCHOIX%3DCOLS)\n - [Accès aux cols français](http://www.bison-fute.equipement.gouv.fr/acces-aux-cols/index.do)\n - [Les sites départementaux de circulation routière (*France*)](http://www.info-routiere.net/serveurs_vocaux.html) \n\n\n\n## Cabanes - Refuges\n\n* [Rechercher un refuge](/huts/filter)\n* [Portail des refuges de la Vanoise](http://www.refuges-vanoise.com/)\n* [Cabanes CAS / CH](http://www.sac-cas.ch/index.php?id=416&L=1)\n* [Cabanes CH (CAS & Non CAS)](http://www.les-refuges.ch/)\n* [Refuges CAF](https://www.ffcam.fr/rechercher_refuge_chalet.html)\n* [Refuges.info (FR)](http://www.refuges.info)\n* [Rifugi CAI](http://rifugiebivacchi.cailugo.it/)\n* [Rifugi CAI (officiel)](http://www.cai.it/index.php?id=1406&L=0)\n* [Hütten Österreich](http://www.alpenverein.at/huettenHome/DE/index.php?navid=8)\n* [Les refuges du Tour du Mont Blanc, réservation en ligne](http://www.montourdumontblanc.com/fr/index.aspx)\n\n\n## Remontées Mécaniques\n\n* [Aiguille du Midi](http://www.compagniedumontblanc.fr/pages/excursions_horaires.html#aiguilledumidi)\n* [Train du Montenvers](http://www.compagniedumontblanc.fr/pages/excursions_horaires.html#montenvers)\n* [Tramway du Mont-Blanc](http://www.compagniedumontblanc.fr/pages/excursions_horaires.html#tramway)\n* [Grands Montets](http://www.compagniedumontblanc.fr/pages/glisse_horaires.html#grandsmontets)\n* [Brévents](http://www.compagniedumontblanc.fr/pages/glisse_horaires.html#brevent)\n* [Flégère](http://www.compagniedumontblanc.fr/pages/glisse_horaires.html#flegere)\n* [Balme](http://www.compagniedumontblanc.fr/pages/glisse_horaires.html#balme)\n* [La Grave](http://www.la-grave.com/tarifs.php)\n* [Saas-Fee](http://www.saas-fee.ch/en/mt_alltables.cfm)\n* [Gemmi](http://www.schwarenbach.ch/index.php?id=luftseilbahnen&L=2)\n*[[articles/153974|Les forfaits \"rando\" proposés par les stations de ski]] à actualiser\n\n## Conditions (compte-rendus de sortie)\n\n### Méta-moteurs de recherche\n - [Metaskirando](http://www.metaskirando.ovh/)    *(ski, surf)*\n - [aleaski](http://www.aleaski.info/)   *(ski, surf - recherche cartographique des conditions)*\n    \n### Ski, surf, randonnée, VTT\n - [Skitour](http://www.skitour.fr/)   *(ski, surf)*\n - [VTTour](http://www.vttour.fr/)   *(VTT)*\n - [Bivouak](http://www.bivouak.net/)   *(ski, surf, randonnée pédestre, parapente, VTT)*\n - [Altituderando](http://www.altituderando.com/)   *(randonnée pédestre)*\n - [Randozone](http://www.randozone.com/)   *(randonnée pédestre)*\n - [skirandonnenordique.com](http://www.skirandonnenordique.com/)   *(randonnée nordique)*\n - [Gulliver.it](http://www.gulliver.it/)   *(ski, surf, alpinisme - **IT**)*\n - [On-Ice.it](http://www2.on-ice.it/onice/onice_reports.php)   *(ski, surf, alpinisme - **IT**)*\n - [Over The Top](http://www.thetop.it/)   *(ski - **IT**)*\n - [lalpinistavirtuale.it](http://www.lalpinistavirtuale.it/Default.asp)   *(ski - **IT**)*\n - [bergtour.ch](http://www.bergtour.ch/) ou [skitouren.ch](http://www.skitouren.ch/) ou [gipfelbuch.ch](http://www.gipfelbuch.ch/)  *(ski, surf, alpinisme, randonnée pédestre - \n - Portail [[articles/1626932|Itinéraires pour surf et splitboard]]\n\n**DE**)*\n - [Data-avalanche](http://www.data-avalanche.org/)   *(avalanches)*\n - [[portals/579966|Infos avalanche]]   ([conditions](/outings/conditions/avdate/2-3-4-5/date/2W/perso/areas-cult-ifon/orderby/date/order/desc))\n - [[portals/312389|Ski de pente raide]]\n - [Freerando.org](http://www.freerando.org)   *(ski, surf)*\n - [Ma petite rando](https://mapetiterando.fr/)   *(randonnée pédestre)*\n    \n### Alpinisme, escalade\n - [La Chamoniarde](http://www.chamoniarde.com/?page_id=136)  *(ski, surf, alpinisme, cascade, randonnée pédestre - Chamonix)*\n - [Escalade en Dauphiné](http://www.promo-grimpe.com/v2/index.php)   *(escalade - Dauphiné)*\n - [[portals/378186|Alpinisme grandes courses]]\n - [[portals/378885|Terrain d'Aventure]]\n    \n### Cascades\n - [alpes-sud.net](http://www.alpes-sud.net) *(Alpes du Sud]*\n - [Ice-fall.com](http://www.ice-fall.com/)   *(Hautes Alpes)*\n - [montagne05.fr](http://glace.montagne05.fr)   *(Hautes Alpes autour de Gap)*\n - [bureau des guides de la Grave](http://www.guidelagrave.com/V2/hiver/infos-conditions-cascades-de-glace/) *(La Grave, Vallon du Diable etc.)*\n - [glacemaurienne](http://glacemaurienne.e-monsite.com/)    *(Savoie)*\n - [Rêves éphémères](http://www.reves-ephemeres.fr/conditions.php)    *(Savoie, Haute Savoie)*\n - [Ice climbing Cogne](http://www.iceclimbingcogne.com/)    *(Cogne - **EN**)*\n - [Icyways.ch](http://www.icyways.ch/conditions)    *(Suisse)*\n - [Cascades.jimdo.com](http://cascades.jimdo.com/)   *(Massif des Vosges)*\n - [escaladequebec.com](http://www.escaladequebec.com/) *(Québec)*\n - [neice.com](http://neice.com/) *(NE des États-Unis)*\n - [Ice-fall data](http://www.icefall-data.org/app/#/events-list)    *(effondrement des cascades)*\n - [[portals/245232|Camptocamp Cascade de glace]]\n - [[portals/581142|Dry-tooling]]",
      summary:
        "Liens utiles pour la préparation de vos futures courses en montagne.\n**Cette article demande une mise à jour permanente. Merci de signaler les liens obsolètes et si possible de les corriger**",
    },
  ],
  quality: "fine",
  categories: ["topoguide_supplements"],
  activities: [
    "mountain_climbing",
    "snow_ice_mixed",
    "hiking",
    "snowshoeing",
    "skitouring",
    "rock_climbing",
    "ice_climbing",
    "paragliding",
    "mountain_biking",
    "via_ferrata",
  ],
  article_type: "collab",
  associations: {
    articles: [
      {
        document_id: 1204299,
        locales: [
          { lang: "fr", title: "Le contenu du sac" },
          { lang: "sl", title: "V nahrbtniku" },
        ],
      },
      {
        document_id: 1257569,
        locales: [
          { lang: "en", title: "[YETI] Faq" },
          { lang: "de", title: "[YETI] FAQ" },
          { lang: "fr", title: "Application YETI - foire aux questions" },
        ],
      },
    ],
  },
  author: { name: "Pierric Deransart", user_id: 892 },
};

// Trimmed from the live GET /articles/302774?lang=fr response (2026-10-03): the en locale's description
// removed; 2 of 146 routes kept (45148, the first, and 53804, whose title_prefix is ""), with only
// document_id and locale lang/title/title_prefix; the article association reduced to document_id and
// locale lang/title.
const ARTICLE_302774 = {
  document_id: 302774,
  locales: [{ lang: "en", title: "Less difficult alpine routes in the Mont Blanc region", summary: null }],
  quality: "medium",
  categories: ["topoguide_supplements"],
  activities: ["mountain_climbing", "snow_ice_mixed"],
  article_type: "collab",
  associations: {
    routes: [
      {
        document_id: 45148,
        locales: [
          { lang: "en", title: "N face", title_prefix: "Le Portalet" },
          { lang: "fr", title: "Face N", title_prefix: "Le Portalet" },
        ],
      },
      {
        document_id: 53804,
        locales: [
          { lang: "fr", title: "Traversée Midi - Plan", title_prefix: "" },
          { lang: "en", title: "Midi - Plan traverse", title_prefix: "" },
          { lang: "es", title: "Travesía Midi-Plan", title_prefix: "" },
        ],
      },
    ],
    articles: [
      {
        document_id: 306206,
        locales: [{ lang: "en", title: "HELP: How to translate route descriptions in English?" }],
      },
    ],
  },
  author: { name: "Fabien Quétier", user_id: 12542 },
};

// The document_id of each of the 146 routes of the live GET /articles/302774?lang=fr response (2026-10-03), in
// API order. The test builds an article with these routes and a placeholder fr route title and prefix.
const ARTICLE_302774_ROUTE_IDS = [
  45148, 46737, 46950, 47976, 49477, 52981, 53763, 53775, 53780, 53781, 53783, 53788, 53790, 53791, 53804, 53806, 53825,
  53854, 53884, 53885, 53888, 53890, 53896, 53905, 53909, 53917, 53931, 53939, 54000, 54009, 54021, 54049, 54077, 54082,
  54098, 54115, 54122, 54151, 54157, 54177, 54180, 54206, 54211, 54214, 54223, 54239, 54257, 54309, 54333, 54391, 54394,
  54398, 54431, 54432, 54469, 54475, 54492, 54493, 54501, 54513, 54520, 54562, 54574, 54595, 54596, 54601, 54627, 54637,
  54641, 54643, 54657, 54684, 54691, 54725, 54730, 54733, 54837, 54867, 54920, 54936, 54940, 54992, 54994, 55198, 55228,
  55229, 55233, 55242, 55254, 55258, 55340, 55403, 55449, 55569, 55728, 55742, 55796, 55805, 55844, 55855, 55897, 55901,
  55942, 56004, 56065, 56087, 56242, 56324, 56600, 56752, 56763, 56772, 56774, 56791, 57081, 57101, 57687, 57739, 57765,
  57767, 57799, 57828, 57924, 58004, 126270, 132681, 133097, 137125, 137187, 137745, 142593, 164964, 173823, 176142,
  177227, 178651, 181855, 181857, 185704, 186443, 210010, 223499, 229222, 232863, 235560, 291696,
];

// The live GET /articles/110093?lang=fr response (2026-10-03), with the it description and the 17 images removed.
const ARTICLE_110093 = {
  document_id: 110093,
  locales: [{ lang: "it", title: "Valanghe in video", summary: null }],
  quality: "medium",
  categories: ["mountain_environment"],
  activities: ["skitouring"],
  article_type: "collab",
  associations: {},
  author: { name: "Franco Pecchio", user_id: 2000 },
};

// Trimmed from the live GET /articles/218311?lang=fr response (2026-10-03): the description removed; the first
// 2 of 8 waypoints kept, with only document_id, locale lang/title, waypoint_type and elevation; routes,
// articles and outings reduced to document_id and locale lang/title(/title_prefix); the user and the 18
// images removed.
const ARTICLE_218311 = {
  document_id: 218311,
  locales: [{ lang: "fr", title: "Marcel Demont: plus de 50 années d'ouverture de voies nouvelles", summary: null }],
  quality: "fine",
  categories: ["stories"],
  activities: ["rock_climbing"],
  article_type: "personal",
  associations: {
    waypoints: [
      {
        document_id: 41684,
        locales: [{ lang: "fr", title: "Pierre Qu'Abotse" }],
        waypoint_type: "summit",
        elevation: 2735,
      },
      {
        document_id: 102479,
        locales: [{ lang: "fr", title: "Aiguilles de Baulmes" }],
        waypoint_type: "climbing_outdoor",
        elevation: 1350,
      },
    ],
    routes: [
      {
        document_id: 55444,
        locales: [
          { lang: "fr", title: "Arête S", title_prefix: "Pierre Qu'Abotse" },
          { lang: "es", title: "arista sur", title_prefix: "Pierre Qu'Abotse" },
        ],
      },
      {
        document_id: 174251,
        locales: [
          { lang: "fr", title: "La Balade", title_prefix: "Haute Corde" },
          { lang: "es", title: "La balade", title_prefix: "Haute Corde" },
        ],
      },
    ],
    articles: [
      { document_id: 219065, locales: [{ lang: "fr", title: "La saga d'un haut refuge des Alpes (Marcel Demont)" }] },
      {
        document_id: 220929,
        locales: [{ lang: "fr", title: "Varappe, ski d'excursion et menées / gonfles (Marcel Demont)" }],
      },
      {
        document_id: 816616,
        locales: [{ lang: "fr", title: "Historique de la Société des Guides de montagne et Porteurs Vaudois" }],
      },
    ],
    outings: [{ document_id: 299675, locales: [{ lang: "fr", title: "Le Chaney " }] }],
  },
  author: { name: "Marcel Maurice Demont", user_id: 169325 },
};

// Trimmed from the live GET /articles/220929?lang=fr response (2026-10-03): the description removed; the 4
// waypoints, 4 articles, user and 11 images removed; the book reduced to document_id and locale lang/title.
const ARTICLE_220929 = {
  document_id: 220929,
  locales: [{ lang: "fr", title: "Varappe, ski d'excursion et menées / gonfles (Marcel Demont)", summary: null }],
  quality: "medium",
  categories: ["stories"],
  activities: ["skitouring", "snow_ice_mixed", "mountain_climbing", "rock_climbing"],
  article_type: "personal",
  associations: {
    books: [
      { document_id: 14761, locales: [{ lang: "fr", title: "Guides vaudois, des pros de la montagne racontent" }] },
    ],
  },
  author: { name: "Marcel Maurice Demont", user_id: 169325 },
};

describe("handleGetArticle", () => {
  it("prints the heading, the labelled lines with raw values, the description and linked articles", async () => {
    mockGetArticle.mockResolvedValueOnce(ARTICLE_226838);

    const result = await handleGetArticle({ id: 226838 });

    expect(mockGetArticle).toHaveBeenCalledWith(226838);
    expect(result).toBe(
      [
        "# Les crampons (ID: 226838)",
        "",
        "**Language**: fr",
        "**Type**: collab",
        "**Created by**: Thomas Ribière (user ID: 4060)",
        "**Categories**: gear",
        "**Activities**: mountain_climbing, snow_ice_mixed, hiking, snowshoeing, skitouring, ice_climbing",
        "**Quality**: great",
        "",
        "## Description",
        ARTICLE_226838.locales[0].description,
        "",
        "## Associated articles",
        "- [1204346] Portail Matériel",
      ].join("\n"),
    );
  });

  it("keeps Camptocamp markup unchanged", async () => {
    mockGetArticle.mockResolvedValueOnce(ARTICLE_226838);

    const result = await handleGetArticle({ id: 226838 });

    expect(result).toContain("[toc]");
    expect(result).toContain("[img=249113 right]");
    expect(result).toContain("[[articles/229207|Black Diamond]]");
  });

  it("keeps an internal route link unchanged", async () => {
    // Derived: no fetched article links route 45148 in its text; this is the 226838 fixture with
    // " [[routes/45148|Face N]]" appended to its fr description.
    const description = `${ARTICLE_226838.locales[0].description} [[routes/45148|Face N]]`;
    mockGetArticle.mockResolvedValueOnce({
      ...ARTICLE_226838,
      locales: [{ ...ARTICLE_226838.locales[0], description }],
    });

    const result = await handleGetArticle({ id: 226838 });

    expect(result).toContain(`\n## Description\n${description}\n`);
    expect(result).toContain("[[routes/45148|Face N]]");
  });

  it("names the fallback language when there is no fr locale", async () => {
    mockGetArticle.mockResolvedValueOnce(ARTICLE_110093);

    const result = await handleGetArticle({ id: 110093 });

    expect(result).toBe(
      [
        "# Valanghe in video (ID: 110093)",
        "",
        "**Language**: it",
        "**Type**: collab",
        "**Created by**: Franco Pecchio (user ID: 2000)",
        "**Categories**: mountain_environment",
        "**Activities**: skitouring",
        "**Quality**: medium",
      ].join("\n"),
    );
  });

  it("leaves out null activities and keeps the leading line breaks of a description", async () => {
    mockGetArticle.mockResolvedValueOnce(ARTICLE_193302);

    const result = await handleGetArticle({ id: 193302 });

    expect(result).toContain(
      [
        "**Language**: fr",
        "**Type**: personal",
        "**Author**: henri leveque (user ID: 136499)",
        "**Categories**: stories",
        "**Quality**: medium",
        "",
        "## Description",
        "\r\n\r\nLa route est longue au soir tombant,",
      ].join("\n"),
    );
    expect(result).not.toContain("Activities");
    expect(result).not.toContain("## Summary");
    expect(result).not.toContain("## Associated");
    expectNoPlaceholder(result);
  });

  it("leaves out the author line when there is no author", async () => {
    // Derived: every fetched article has an author; these are the 193302 (personal) and 110093 (collab)
    // fixtures with `author` set to null, then removed.
    for (const article of [
      { ...ARTICLE_193302, author: null },
      { ...ARTICLE_110093, author: undefined },
    ]) {
      mockGetArticle.mockResolvedValueOnce(article);

      const result = await handleGetArticle({ id: article.document_id });

      expect(result).not.toContain("**Author**");
      expect(result).not.toContain("**Created by**");
      expectNoPlaceholder(result);
    }
  });

  it("keeps only the heading when locales are empty and every displayed field is null", async () => {
    // Derived from the 193302 fixture: `locales` emptied; article_type, categories, quality and author set to
    // null (activities is already null live); `associations` removed.
    mockGetArticle.mockResolvedValueOnce({
      ...ARTICLE_193302,
      locales: [],
      article_type: null,
      categories: null,
      quality: null,
      author: null,
      associations: undefined,
    });

    expect(await handleGetArticle({ id: 193302 })).toBe("# Untitled (ID: 193302)");
  });

  it("prints a summary verbatim and a 22,463-character description whole", async () => {
    mockGetArticle.mockResolvedValueOnce(ARTICLE_107228);

    const result = await handleGetArticle({ id: 107228 });

    const locale = ARTICLE_107228.locales[0];
    expect(locale.description.length).toBe(22463);
    expect(result).toContain(`\n## Summary\n${locale.summary}\n\n## Description\n${locale.description}\n`);
    expect(result).toContain("**Categories**: topoguide_supplements\n");
    expect(result.endsWith("- [1204299] Le contenu du sac\n- [1257569] Application YETI - foire aux questions")).toBe(
      true,
    );
  });

  it("leaves out an empty-string summary", async () => {
    // Derived: no fetched article has a "" summary; this is the 107228 fixture with its fr summary set to "".
    mockGetArticle.mockResolvedValueOnce({
      ...ARTICLE_107228,
      locales: [{ ...ARTICLE_107228.locales[0], summary: "" }],
    });

    const result = await handleGetArticle({ id: 107228 });

    expect(result).not.toContain("## Summary");
    expect(result).toContain("## Description");
  });

  it("lists routes with their summit prefix, or the title alone without one", async () => {
    mockGetArticle.mockResolvedValueOnce(ARTICLE_302774);

    const result = await handleGetArticle({ id: 302774 });

    expect(result).toContain("**Language**: en\n");
    expect(result).toContain(
      "\n## Associated routes\n- [45148] Le Portalet : Face N\n- [53804] Traversée Midi - Plan\n\n## Associated articles\n- [306206] HELP: How to translate route descriptions in English?",
    );
  });

  it("lists waypoints, routes, articles and outings in order", async () => {
    mockGetArticle.mockResolvedValueOnce(ARTICLE_218311);

    const result = await handleGetArticle({ id: 218311 });

    expect(result).toContain(
      [
        "## Associated routes",
        "- [55444] Pierre Qu'Abotse : Arête S",
        "- [174251] Haute Corde : La Balade",
        "",
        "## Associated waypoints",
        "- [41684] Pierre Qu'Abotse (summit) | 2735m",
        "- [102479] Aiguilles de Baulmes (climbing_outdoor) | 1350m",
        "",
        "## Associated articles",
        "- [219065] La saga d'un haut refuge des Alpes (Marcel Demont)",
        "- [220929] Varappe, ski d'excursion et menées / gonfles (Marcel Demont)",
        "- [816616] Historique de la Société des Guides de montagne et Porteurs Vaudois",
        "",
        "## Associated outings",
        "- [299675] Le Chaney ",
      ].join("\n"),
    );
    expect(result).not.toContain("## Associated books");
  });

  it("shows an elevation of 0 and leaves out a null elevation", async () => {
    // Derived: both fetched waypoints have an elevation; this is the 218311 fixture with the elevation of
    // 41684 set to 0, then to null.
    const [first, second] = ARTICLE_218311.associations.waypoints;
    for (const [elevation, line] of [
      [0, "- [41684] Pierre Qu'Abotse (summit) | 0m\n"],
      [null, "- [41684] Pierre Qu'Abotse (summit)\n"],
    ] as const) {
      mockGetArticle.mockResolvedValueOnce({
        ...ARTICLE_218311,
        associations: { ...ARTICLE_218311.associations, waypoints: [{ ...first, elevation }, second] },
      });

      expect(await handleGetArticle({ id: 218311 })).toContain(line);
    }
  });

  it("lists associated books", async () => {
    mockGetArticle.mockResolvedValueOnce(ARTICLE_220929);

    const result = await handleGetArticle({ id: 220929 });

    expect(
      result.endsWith("\n\n## Associated books\n- [14761] Guides vaudois, des pros de la montagne racontent"),
    ).toBe(true);
    expect(result.match(/## Associated/g)).toHaveLength(1);
  });

  it("uses the fr locale of a personal article, labels its Author and hides images, users and xreports", async () => {
    // The 716039 fixture, with its live user and image entries, plus one derived xreports entry: the document_id
    // and fr title of the live GET /xreports/1953845?lang=fr response (no fetched article links an xreport).
    const article = {
      ...ARTICLE_716039,
      associations: {
        ...ARTICLE_716039.associations,
        xreports: [
          { document_id: 1953845, locales: [{ lang: "fr", title: "Chute avec hélitreuillage aux 3 Becs (Drôme)" }] },
        ],
      },
    } as unknown as ArticleDetail;
    mockGetArticle.mockResolvedValueOnce(article);

    const result = await handleGetArticle({ id: 716039 });

    // The whole output: no ID, title, name or heading from the user, image or xreport entries.
    expect(result).toBe(
      [
        "# Descendre en rappel (source Petzl) (ID: 716039)",
        "",
        "**Language**: fr",
        "**Type**: personal",
        "**Author**: Frédéric Bunoz (user ID: 288)",
        "**Categories**: technical",
        "**Activities**: mountain_climbing, snow_ice_mixed, rock_climbing, ice_climbing",
        "**Quality**: fine",
        "",
        "## Associated articles",
        "- [713233] Documentations techniques Petzl",
        "- [715946] Assurer et descendre en grande voie sur corde à simple (source Petzl)",
      ].join("\n"),
    );
  });

  it("leaves out association headings when lists are empty or missing", async () => {
    // The live 193302 associations (all lists empty), then two derived variants: an empty `associations`
    // object and no `associations` at all.
    for (const associations of [ARTICLE_193302.associations, {}, undefined]) {
      mockGetArticle.mockResolvedValueOnce({ ...ARTICLE_193302, associations });

      expect(await handleGetArticle({ id: 193302 })).not.toContain("## Associated");
    }
  });

  it("lists all 146 routes", async () => {
    const routes = ARTICLE_302774_ROUTE_IDS.map((document_id) => ({
      document_id,
      locales: [{ lang: "fr", title: `Route ${document_id}`, title_prefix: "Sommet" }],
    }));
    mockGetArticle.mockResolvedValueOnce({ ...ARTICLE_302774, associations: { routes } });

    const result = await handleGetArticle({ id: 302774 });

    const routeLines = result.split("\n").filter((line) => line.startsWith("- ["));
    expect(routeLines).toHaveLength(146);
    expect(routeLines[0]).toBe("- [45148] Sommet : Route 45148");
    expect(routeLines[145]).toBe("- [291696] Sommet : Route 291696");
  });

  it("passes an API error through unchanged", async () => {
    mockGetArticle.mockRejectedValueOnce(new Error("Camptocamp API error: 404 Not Found"));

    await expect(handleGetArticle({ id: 999999999 })).rejects.toThrow("Camptocamp API error: 404 Not Found");
  });
});
