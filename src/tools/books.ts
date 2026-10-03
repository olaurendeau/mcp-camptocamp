import { z } from "zod";
import { searchBooks, getBook } from "../api/camptocamp.js";
import type { BookSearchResponse, BookDetail } from "../api/camptocamp.js";

export const searchBooksSchema = z.object({
  query: z.string().describe("Search query matched against book titles (e.g. 'Vallot', 'Mont Blanc')"),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
});

export const getBookSchema = z.object({
  id: z.number().int().positive().describe("Book ID from Camptocamp"),
});

export type SearchBooksInput = z.infer<typeof searchBooksSchema>;
export type GetBookInput = z.infer<typeof getBookSchema>;

// The detail response does not always list `fr` first (book 373877 returns it, fr, en), so look it up.
function pickLocale<T extends { lang: string }>(locales: T[]): T | undefined {
  return locales.find((l) => l.lang === "fr") ?? locales[0];
}

function joinList(values?: string[] | null): string | undefined {
  return values && values.length > 0 ? values.join(", ") : undefined;
}

function formatBookSearchResult(response: BookSearchResponse): string {
  if (response.documents.length === 0) {
    return "No books found.";
  }

  const lines: string[] = [`Found ${response.total} book(s). Showing ${response.documents.length}:\n`];

  for (const book of response.documents) {
    const title = pickLocale(book.locales)?.title ?? "Untitled";
    const types = joinList(book.book_types);
    const activities = joinList(book.activities);
    const parts = [`- [${book.document_id}] ${title}`];
    if (book.author) parts.push(`Author: ${book.author}`);
    if (types) parts.push(`Types: ${types}`);
    if (activities) parts.push(`Activities: ${activities}`);
    lines.push(parts.join(" | "));
  }

  return lines.join("\n");
}

function formatBookDetail(book: BookDetail): string {
  const locale = pickLocale(book.locales);
  const lines: string[] = [`# ${locale?.title ?? "Untitled"} (ID: ${book.document_id})`];

  const fields: Array<[string, string | number | null | undefined]> = [
    ["Author", book.author],
    ["Editor", book.editor],
    ["Publication date", book.publication_date],
    ["ISBN", book.isbn],
    ["Pages", book.nb_pages],
    ["Languages", joinList(book.langs)],
    ["Website", book.url],
    ["Book types", joinList(book.book_types)],
    ["Activities", joinList(book.activities)],
  ];
  const labelled = fields
    .filter(([, value]) => (typeof value === "number" ? true : Boolean(value)))
    .map(([label, value]) => `**${label}**: ${value}`);
  if (labelled.length > 0) {
    lines.push("", ...labelled);
  }

  if (locale?.summary) {
    lines.push(`\n## Summary\n${locale.summary}`);
  }

  if (locale?.description) {
    lines.push(`\n## Description\n${locale.description}`);
  }

  const routes = book.associations?.routes;
  if (routes && routes.length > 0) {
    lines.push("\n## Associated routes");
    for (const route of routes) {
      const routeLocale = pickLocale(route.locales);
      const title = routeLocale?.title ?? "Untitled";
      const name = routeLocale?.title_prefix ? `${routeLocale.title_prefix} : ${title}` : title;
      lines.push(`- [${route.document_id}] ${name}`);
    }
  }

  const waypoints = book.associations?.waypoints;
  if (waypoints && waypoints.length > 0) {
    lines.push("\n## Associated waypoints");
    for (const wp of waypoints) {
      const title = pickLocale(wp.locales)?.title ?? "Untitled";
      const elevation = wp.elevation != null ? ` | ${wp.elevation}m` : "";
      lines.push(`- [${wp.document_id}] ${title} (${wp.waypoint_type})${elevation}`);
    }
  }

  const articles = book.associations?.articles;
  if (articles && articles.length > 0) {
    lines.push("\n## Associated articles");
    for (const article of articles) {
      lines.push(`- [${article.document_id}] ${pickLocale(article.locales)?.title ?? "Untitled"}`);
    }
  }

  return lines.join("\n");
}

export async function handleSearchBooks(input: SearchBooksInput): Promise<string> {
  const response = await searchBooks(input.query, input.limit);
  return formatBookSearchResult(response);
}

export async function handleGetBook(input: GetBookInput): Promise<string> {
  const book = await getBook(input.id);
  return formatBookDetail(book);
}

export const bookToolDefinitions = [
  {
    name: "search_books",
    description:
      "Search books (guidebooks/topos, history, novels, photo books, technique) on Camptocamp.org by title keyword. The query matches book TITLES only: searching by author name or ISBN is unreliable and can return unrelated books or nothing, so an empty result does not mean the book does not exist. Returns ID, title, author, book types and activities; use get_book for editor, date, ISBN and covered routes/waypoints.",
    inputSchema: searchBooksSchema,
    handler: handleSearchBooks,
  },
  {
    name: "get_book",
    description:
      "Get full details of a specific book from Camptocamp.org by its ID: author, editor, publication date, ISBN, pages, languages, website, book types, activities, summary, description, the routes and waypoints it covers, and its related articles (with IDs for get_route, get_waypoint and get_article). Values are shown exactly as Camptocamp stores them; missing fields are left out.",
    inputSchema: getBookSchema,
    handler: handleGetBook,
  },
];
