import { z } from "zod";
import { searchArticles, getArticle } from "../api/camptocamp.js";
import type { ArticleSearchResponse, ArticleDetail } from "../api/camptocamp.js";

export const searchArticlesSchema = z.object({
  query: z.string().describe("Search query (e.g. 'crampons', 'avalanche', 'rappel')"),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
});

export const getArticleSchema = z.object({
  id: z.number().int().positive().describe("Article ID from Camptocamp"),
});

export type SearchArticlesInput = z.infer<typeof searchArticlesSchema>;
export type GetArticleInput = z.infer<typeof getArticleSchema>;

type Associations = NonNullable<ArticleDetail["associations"]>;
type RouteAssociation = NonNullable<Associations["routes"]>[number];

// `lang=fr` does not filter locales: 716039 lists `en` before `fr`, and some articles have no `fr` at all.
function pickLocale<T extends { lang: string }>(locales: T[]): T | undefined {
  return locales.find((l) => l.lang === "fr") ?? locales[0];
}

function joinList(values?: string[] | null): string {
  return values && values.length > 0 ? values.join(", ") : "";
}

function formatRouteLine(route: RouteAssociation): string {
  const locale = pickLocale(route.locales);
  const title = locale?.title ?? "Untitled";
  const name = locale?.title_prefix ? `${locale.title_prefix} : ${title}` : title;
  return `- [${route.document_id}] ${name}`;
}

function formatArticleSearchResult(response: ArticleSearchResponse): string {
  if (response.documents.length === 0) {
    return "No articles found.";
  }

  const lines: string[] = [`Found ${response.total} article(s). Showing ${response.documents.length}:\n`];

  for (const article of response.documents) {
    const title = pickLocale(article.locales)?.title ?? "Untitled";
    const categories = joinList(article.categories);
    const activities = joinList(article.activities);
    const parts = [`- [${article.document_id}] ${title}`];
    if (article.article_type) parts.push(`Type: ${article.article_type}`);
    if (categories) parts.push(`Categories: ${categories}`);
    if (activities) parts.push(`Activities: ${activities}`);
    lines.push(parts.join(" | "));
  }

  return lines.join("\n");
}

function formatArticleDetail(article: ArticleDetail): string {
  const locale = pickLocale(article.locales);
  const lines: string[] = [`# ${locale?.title ?? "Untitled"} (ID: ${article.document_id})`];

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

  if (locale?.summary) {
    lines.push(`\n## Summary\n${locale.summary}`);
  }

  if (locale?.description) {
    lines.push(`\n## Description\n${locale.description}`);
  }

  const associations = article.associations;

  const routes = associations?.routes;
  if (routes && routes.length > 0) {
    lines.push("\n## Associated routes", ...routes.map(formatRouteLine));
  }

  const waypoints = associations?.waypoints;
  if (waypoints && waypoints.length > 0) {
    lines.push("\n## Associated waypoints");
    for (const wp of waypoints) {
      const title = pickLocale(wp.locales)?.title ?? "Untitled";
      const elevation = wp.elevation != null ? ` | ${wp.elevation}m` : "";
      lines.push(`- [${wp.document_id}] ${title} (${wp.waypoint_type})${elevation}`);
    }
  }

  const titled: Array<[string, Associations["articles"]]> = [
    ["articles", associations?.articles],
    ["outings", associations?.outings],
    ["books", associations?.books],
  ];
  for (const [kind, documents] of titled) {
    if (documents && documents.length > 0) {
      lines.push(`\n## Associated ${kind}`);
      for (const doc of documents) {
        lines.push(`- [${doc.document_id}] ${pickLocale(doc.locales)?.title ?? "Untitled"}`);
      }
    }
  }

  return lines.join("\n");
}

export async function handleSearchArticles(input: SearchArticlesInput): Promise<string> {
  const response = await searchArticles(input.query, input.limit);
  return formatArticleSearchResult(response);
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
      "Search Camptocamp.org articles by keyword. Articles cover gear, climbing and mountaineering techniques, mountain environment (avalanches, snow, weather), stories, and topoguide supplements (route lists, useful links). Each result shows article_type: `collab` (community-edited reference) or `personal` (one author's view, not community consensus), plus categories and activities. Use get_article for the full text and linked routes, waypoints, articles, outings and books.",
    inputSchema: searchArticlesSchema,
    handler: handleSearchArticles,
  },
  {
    name: "get_article",
    title: "Get article details",
    description:
      "Get a Camptocamp.org article by ID: full text (Camptocamp markup kept as is), summary, author, type (collab/personal), categories, activities, quality, and the IDs of associated routes, waypoints, articles, outings and books, which can be followed with get_route, get_waypoint, get_article, get_outing and get_book. The Language line gives the language of the returned text (fr when available, otherwise another locale).",
    inputSchema: getArticleSchema,
    handler: handleGetArticle,
  },
];
