import { z } from "zod";
import { DETAIL_LANG_NOTE, LANG_NOTE, documentId, langInput, searchOffset, searchQuery } from "./inputs.js";
import { assertResultWindow, formatSearchPage, PAGING_NOTE, quote } from "./paging.js";
import { searchArticles, getArticle } from "../api/camptocamp.js";
import type { ArticleSearchOptions, ArticleSearchResult, ArticleDetail } from "../api/camptocamp.js";
import {
  pickLocale,
  pickTitle,
  joinList,
  formatHeader,
  formatAssociatedRouteLine,
  formatWaypointLine,
  formatTitledLine,
  formatListItems,
  formatLanguageLine,
} from "./format.js";
import { ACTIVITIES, ARTICLE_CATEGORIES, ARTICLE_TYPES, enumValue } from "./enums.js";
import type { Lang } from "./enums.js";
import { formatUserText, USER_TEXT_NOTE } from "./text.js";

export const searchArticlesSchema = z.object({
  query: searchQuery("Search query (e.g. 'crampons', 'avalanche', 'rappel'); optional when a filter is given", {
    allowBlank: true,
  }).optional(),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
  offset: searchOffset(),
  lang: langInput(),
  category: enumValue(ARTICLE_CATEGORIES)
    .optional()
    .describe(`Article category, one of: ${ARTICLE_CATEGORIES.join(", ")}`),
  article_type: enumValue(ARTICLE_TYPES)
    .optional()
    .describe(`Article type, one of: ${ARTICLE_TYPES.join(", ")}`),
  activity: enumValue(ACTIVITIES)
    .optional()
    .describe(`Activity covered by the article, one of: ${ACTIVITIES.join(", ")}`),
});

export const getArticleSchema = z.object({
  id: documentId("Article ID from Camptocamp"),
  lang: langInput(),
});

export type SearchArticlesInput = z.infer<typeof searchArticlesSchema>;
export type GetArticleInput = z.infer<typeof getArticleSchema>;

type Associations = NonNullable<ArticleDetail["associations"]>;

function formatArticleSearchLine(article: ArticleSearchResult, lang?: Lang): string {
  const categories = joinList(article.categories);
  const activities = joinList(article.activities);
  const parts = [`- [${article.document_id}] ${pickTitle(article.locales, lang)}`];
  if (article.article_type) parts.push(`Type: ${article.article_type}`);
  if (categories) parts.push(`Categories: ${categories}`);
  if (activities) parts.push(`Activities: ${activities}`);
  return parts.join(" | ");
}

function formatArticleDetail(article: ArticleDetail, lang?: Lang): string {
  const locale = pickLocale(article.locales, lang);
  const lines: string[] = [
    ...formatHeader(pickTitle(article.locales, lang), article.document_id, "articles"),
    ...formatLanguageLine(article.locales, lang),
  ];

  // A collab article has many editors, so its creator is not labelled as the author (#11, D3).
  const authorLabel = article.article_type === "personal" ? "Author" : "Created by";
  const author = article.author ? `${article.author.name} (user ID: ${article.author.user_id})` : "";

  const fields: Array<[string, string | null | undefined]> = [
    ["Type", article.article_type],
    [authorLabel, author],
    ["Categories", joinList(article.categories)],
    ["Activities", joinList(article.activities)],
    ["Quality", article.quality],
  ];
  const labelled = fields.filter(([, value]) => Boolean(value)).map(([label, value]) => `**${label}**: ${value}`);
  if (labelled.length > 0) {
    lines.push("", ...labelled);
  }

  lines.push(...formatUserText("summary", "Summary", locale?.summary));
  lines.push(...formatUserText("description", "Description", locale?.description));

  const associations = article.associations;

  const routes = associations?.routes;
  if (routes && routes.length > 0) {
    lines.push("\n## Associated routes", ...formatListItems(routes, (route) => formatAssociatedRouteLine(route, lang)));
  }

  const waypoints = associations?.waypoints;
  if (waypoints && waypoints.length > 0) {
    lines.push("\n## Associated waypoints", ...waypoints.map((waypoint) => formatWaypointLine(waypoint, { lang })));
  }

  const titled: Array<[string, Associations["articles"]]> = [
    ["articles", associations?.articles],
    ["outings", associations?.outings],
    ["books", associations?.books],
  ];
  for (const [kind, documents] of titled) {
    if (documents && documents.length > 0) {
      lines.push(
        `\n## Associated ${kind}`,
        ...formatListItems(documents, (document) => formatTitledLine(document, lang)),
      );
    }
  }

  return lines.join("\n");
}

export async function handleSearchArticles(input: SearchArticlesInput): Promise<string> {
  // A blank query counts as missing: the API treats `q=` like no `q` and lists every article.
  const query = input.query?.trim() ? input.query : undefined;
  const { limit, offset, lang, category, article_type, activity } = input;
  if (query === undefined && category === undefined && article_type === undefined && activity === undefined) {
    throw new Error("search_articles needs a query or at least one filter: category, article_type, activity.");
  }
  assertResultWindow(offset, limit);

  // Only the keys that are set, so the client gets no `query: undefined` or `lang: undefined`.
  const options: ArticleSearchOptions = { limit, offset };
  if (query !== undefined) options.query = query;
  if (lang !== undefined) options.lang = lang;
  if (category !== undefined) options.category = category;
  if (article_type !== undefined) options.article_type = article_type;
  if (activity !== undefined) options.activity = activity;
  const response = await searchArticles(options);

  const filters: string[] = [];
  if (query !== undefined) filters.push(`query ${quote(query)}`);
  if (category !== undefined) filters.push(`category ${category}`);
  if (article_type !== undefined) filters.push(`article type ${article_type}`);
  if (activity !== undefined) filters.push(`activity ${activity}`);
  return formatSearchPage({
    kind: "article",
    total: response.total,
    offset,
    limit,
    lines: formatListItems(response.documents, (article) => formatArticleSearchLine(article, lang)),
    filters,
  });
}

export async function handleGetArticle(input: GetArticleInput): Promise<string> {
  const article = await getArticle(input.id);
  return formatArticleDetail(article, input.lang);
}

export const articleToolDefinitions = [
  {
    name: "search_articles",
    title: "Search articles",
    description:
      "Search Camptocamp.org articles by keyword, category, article_type and activity. Articles cover gear, climbing and mountaineering techniques, mountain environment (avalanches, snow, weather), stories, and topoguide supplements (route lists, useful links). Filters combine with AND; the query is optional when at least one filter is given, and a call with neither is refused. Keyword search often misses ('noeud' and 'nœud' both find nothing), so browsing by category is the surer way to find a topic. An article is listed when any of its categories or activities matches the value given. Categories, as Camptocamp names them: mountain_environment, gear, technical, topoguide_supplements, soft_mobility (car-free and bike travel), expeditions, stories, c2c_meetings (community meetups), tags, site_info (help pages about Camptocamp.org), association (Camptocamp association news). Each result shows article_type: `collab` (community-edited reference) or `personal` (one author's view, not community consensus), plus categories and activities. A header gives the total, the offset and the filters. Use get_article for the full text and linked routes, waypoints, articles, outings and books. " +
      `${PAGING_NOTE} ${LANG_NOTE}`,
    inputSchema: searchArticlesSchema,
    handler: handleSearchArticles,
  },
  {
    name: "get_article",
    title: "Get article details",
    description:
      "Get a Camptocamp.org article by ID: text, summary, author, type (collab/personal), categories, activities, quality, and the IDs of associated routes, waypoints, articles, outings and books, which can be followed with get_route, get_waypoint, get_article, get_outing and get_book. The second line is the document's camptocamp.org URL, to cite as the source. " +
      `${LANG_NOTE} ${DETAIL_LANG_NOTE} ${USER_TEXT_NOTE}`,
    inputSchema: getArticleSchema,
    handler: handleGetArticle,
  },
];
