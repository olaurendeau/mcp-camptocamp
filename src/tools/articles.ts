import { z } from "zod";
import { documentId, searchOffset, searchQuery } from "./inputs.js";
import { assertResultWindow, formatSearchPage, PAGING_NOTE, quote } from "./paging.js";
import { searchArticles, getArticle } from "../api/camptocamp.js";
import type { ArticleSearchResult, ArticleDetail } from "../api/camptocamp.js";
import {
  pickLocale,
  pickTitle,
  joinList,
  formatHeader,
  formatAssociatedRouteLine,
  formatWaypointLine,
  formatTitledLine,
  formatListItems,
} from "./format.js";
import { formatUserText, USER_TEXT_NOTE } from "./text.js";

export const searchArticlesSchema = z.object({
  query: searchQuery("Search query (e.g. 'crampons', 'avalanche', 'rappel')", { allowBlank: false }),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
  offset: searchOffset(),
});

export const getArticleSchema = z.object({
  id: documentId("Article ID from Camptocamp"),
});

export type SearchArticlesInput = z.infer<typeof searchArticlesSchema>;
export type GetArticleInput = z.infer<typeof getArticleSchema>;

type Associations = NonNullable<ArticleDetail["associations"]>;

function formatArticleSearchLine(article: ArticleSearchResult): string {
  const categories = joinList(article.categories);
  const activities = joinList(article.activities);
  const parts = [`- [${article.document_id}] ${pickTitle(article.locales)}`];
  if (article.article_type) parts.push(`Type: ${article.article_type}`);
  if (categories) parts.push(`Categories: ${categories}`);
  if (activities) parts.push(`Activities: ${activities}`);
  return parts.join(" | ");
}

function formatArticleDetail(article: ArticleDetail): string {
  const locale = pickLocale(article.locales);
  const lines: string[] = formatHeader(pickTitle(article.locales), article.document_id, "articles");

  // A collab article has many editors, so its creator is not labelled as the author (#11, D3).
  const authorLabel = article.article_type === "personal" ? "Author" : "Created by";
  const author = article.author ? `${article.author.name} (user ID: ${article.author.user_id})` : "";

  const fields: Array<[string, string | null | undefined]> = [
    ["Language", locale?.lang],
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
    lines.push("\n## Associated routes", ...formatListItems(routes, formatAssociatedRouteLine));
  }

  const waypoints = associations?.waypoints;
  if (waypoints && waypoints.length > 0) {
    lines.push("\n## Associated waypoints", ...formatListItems(waypoints, (waypoint) => formatWaypointLine(waypoint)));
  }

  const titled: Array<[string, Associations["articles"]]> = [
    ["articles", associations?.articles],
    ["outings", associations?.outings],
    ["books", associations?.books],
  ];
  for (const [kind, documents] of titled) {
    if (documents && documents.length > 0) {
      lines.push(`\n## Associated ${kind}`, ...formatListItems(documents, formatTitledLine));
    }
  }

  return lines.join("\n");
}

export async function handleSearchArticles(input: SearchArticlesInput): Promise<string> {
  const { query, limit, offset } = input;
  assertResultWindow(offset, limit);

  const response = await searchArticles(input);
  return formatSearchPage({
    kind: "article",
    total: response.total,
    offset,
    limit,
    lines: formatListItems(response.documents, formatArticleSearchLine),
    filters: [`query ${quote(query)}`],
  });
}

export async function handleGetArticle(input: GetArticleInput): Promise<string> {
  const article = await getArticle(input.id);
  return formatArticleDetail(article);
}

export const articleToolDefinitions = [
  {
    name: "search_articles",
    title: "Search articles",
    description:
      "Search Camptocamp.org articles by keyword. Articles cover gear, climbing and mountaineering techniques, mountain environment (avalanches, snow, weather), stories, and topoguide supplements (route lists, useful links). Each result shows article_type: `collab` (community-edited reference) or `personal` (one author's view, not community consensus), plus categories and activities. A header gives the total, the offset and the filters. Use get_article for the full text and linked routes, waypoints, articles, outings and books. " +
      PAGING_NOTE,
    inputSchema: searchArticlesSchema,
    handler: handleSearchArticles,
  },
  {
    name: "get_article",
    title: "Get article details",
    description:
      "Get a Camptocamp.org article by ID: text, summary, author, type (collab/personal), categories, activities, quality, and the IDs of associated routes, waypoints, articles, outings and books, which can be followed with get_route, get_waypoint, get_article, get_outing and get_book. The Language line gives the language of the returned text (fr when available, otherwise another locale). The second line is the document's camptocamp.org URL, to cite as the source. " +
      USER_TEXT_NOTE,
    inputSchema: getArticleSchema,
    handler: handleGetArticle,
  },
];
