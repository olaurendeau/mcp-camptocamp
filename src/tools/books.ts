import { z } from "zod";
import { documentId, searchQuery } from "./inputs.js";
import { searchBooks, getBook } from "../api/camptocamp.js";
import type { BookSearchResponse, BookDetail } from "../api/camptocamp.js";
import {
  pickLocale,
  pickTitle,
  joinList,
  formatHeader,
  formatRouteLine,
  formatWaypointLine,
  formatTitledLine,
} from "./format.js";

export const searchBooksSchema = z.object({
  query: searchQuery("Search query matched against book titles (e.g. 'Vallot', 'Mont Blanc')", { allowBlank: false }),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
});

export const getBookSchema = z.object({
  id: documentId("Book ID from Camptocamp"),
});

export type SearchBooksInput = z.infer<typeof searchBooksSchema>;
export type GetBookInput = z.infer<typeof getBookSchema>;

function formatBookSearchResult(response: BookSearchResponse): string {
  if (response.documents.length === 0) {
    return "No books found.";
  }

  const lines: string[] = [`Found ${response.total} book(s). Showing ${response.documents.length}:\n`];

  for (const book of response.documents) {
    const title = pickTitle(book.locales);
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
  const lines: string[] = formatHeader(pickTitle(book.locales), book.document_id, "books");

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
    lines.push("\n## Associated routes", ...routes.map(formatRouteLine));
  }

  const waypoints = book.associations?.waypoints;
  if (waypoints && waypoints.length > 0) {
    lines.push("\n## Associated waypoints", ...waypoints.map(formatWaypointLine));
  }

  const articles = book.associations?.articles;
  if (articles && articles.length > 0) {
    lines.push("\n## Associated articles", ...articles.map(formatTitledLine));
  }

  return lines.join("\n");
}

export async function handleSearchBooks(input: SearchBooksInput): Promise<string> {
  const response = await searchBooks(input);
  return formatBookSearchResult(response);
}

export async function handleGetBook(input: GetBookInput): Promise<string> {
  const book = await getBook(input.id);
  return formatBookDetail(book);
}

export const bookToolDefinitions = [
  {
    name: "search_books",
    title: "Search books",
    description:
      "Search books (guidebooks/topos, history, novels, photo books, technique) on Camptocamp.org by title keyword. The query matches book TITLES only: searching by author name or ISBN is unreliable and can return unrelated books or nothing, so an empty result does not mean the book does not exist. Returns ID, title, author, book types and activities; use get_book for editor, date, ISBN and covered routes/waypoints.",
    inputSchema: searchBooksSchema,
    handler: handleSearchBooks,
  },
  {
    name: "get_book",
    title: "Get book details",
    description:
      "Get full details of a specific book from Camptocamp.org by its ID: author, editor, publication date, ISBN, pages, languages, website, book types, activities, summary, description, the routes and waypoints it covers, and its related articles (with IDs for get_route, get_waypoint and get_article). Values are shown exactly as Camptocamp stores them; missing fields are left out. The second line is the document's camptocamp.org URL, to cite as the source.",
    inputSchema: getBookSchema,
    handler: handleGetBook,
  },
];
