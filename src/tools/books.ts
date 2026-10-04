import { z } from "zod";
import { DETAIL_LANG_NOTE, LANG_NOTE, documentId, langInput, searchOffset, searchQuery } from "./inputs.js";
import { assertResultWindow, formatSearchPage, PAGING_NOTE, quote } from "./paging.js";
import { searchBooks, getBook } from "../api/camptocamp.js";
import type { BookDetail } from "../api/camptocamp.js";
import {
  pickLocale,
  pickTitle,
  joinList,
  formatHeader,
  formatAssociatedRouteLine,
  formatWaypointLine,
  formatTitledLine,
  formatBookLine,
  formatListItems,
  formatLanguageLine,
  formatOtherLanguagesLine,
} from "./format.js";
import { formatUserTexts, SUMMARY_AND_DESCRIPTION, USER_TEXT_NOTE } from "./text.js";
import { ACTIVITIES, BOOK_TYPES, enumValue } from "./enums.js";
import type { Lang } from "./enums.js";

export const searchBooksSchema = z.object({
  query: searchQuery("Search query matched against book titles (e.g. 'Vallot', 'Mont Blanc')", { allowBlank: false }),
  limit: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of results"),
  offset: searchOffset(),
  lang: langInput(),
  book_type: enumValue(BOOK_TYPES)
    .optional()
    .describe(`Book type, one of: ${BOOK_TYPES.join(", ")} (topo = guidebook)`),
  activity: enumValue(ACTIVITIES)
    .optional()
    .describe(`Activity covered by the book, one of: ${ACTIVITIES.join(", ")}`),
});

export const getBookSchema = z.object({
  id: documentId("Book ID from Camptocamp"),
  lang: langInput(),
});

export type SearchBooksInput = z.infer<typeof searchBooksSchema>;
export type GetBookInput = z.infer<typeof getBookSchema>;

function formatBookDetail(book: BookDetail, lang?: Lang): string {
  const locale = pickLocale(book.locales, lang);
  const lines: string[] = [
    ...formatHeader(pickTitle(book.locales, lang), book.document_id, "books"),
    ...formatLanguageLine(book.locales, lang),
    ...formatOtherLanguagesLine(book.locales, locale, SUMMARY_AND_DESCRIPTION),
  ];

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

  lines.push(...formatUserTexts(locale, SUMMARY_AND_DESCRIPTION));

  const routes = book.associations?.routes;
  if (routes && routes.length > 0) {
    lines.push("\n## Associated routes", ...formatListItems(routes, (route) => formatAssociatedRouteLine(route, lang)));
  }

  const waypoints = book.associations?.waypoints;
  if (waypoints && waypoints.length > 0) {
    lines.push("\n## Associated waypoints", ...waypoints.map((waypoint) => formatWaypointLine(waypoint, { lang })));
  }

  const articles = book.associations?.articles;
  if (articles && articles.length > 0) {
    lines.push("\n## Associated articles", ...formatListItems(articles, (article) => formatTitledLine(article, lang)));
  }

  return lines.join("\n");
}

export async function handleSearchBooks(input: SearchBooksInput): Promise<string> {
  const { query, limit, offset, book_type, activity } = input;
  assertResultWindow(offset, limit);

  const response = await searchBooks(input);
  const filters = [`query ${quote(query)}`];
  if (book_type !== undefined) filters.push(`book type ${book_type}`);
  if (activity !== undefined) filters.push(`activity ${activity}`);
  return formatSearchPage({
    kind: "book",
    total: response.total,
    offset,
    limit,
    lines: formatListItems(response.documents, (book) => formatBookLine(book, input.lang)),
    filters,
  });
}

export async function handleGetBook(input: GetBookInput): Promise<string> {
  const book = await getBook(input.id);
  return formatBookDetail(book, input.lang);
}

export const bookToolDefinitions = [
  {
    name: "search_books",
    title: "Search books",
    description:
      "Search books (guidebooks/topos, history, novels, photo books, technique) on Camptocamp.org by title keyword. The query matches book TITLES only: searching by author name or ISBN is unreliable and can return unrelated books or nothing, so an empty result does not mean the book does not exist. book_type and activity narrow the search (e.g. book_type topo with activity skitouring for ski touring guidebooks). Returns ID, title, author, book types and activities, after a header giving the total, the offset and the filters; use get_book for editor, date, ISBN and covered routes/waypoints. " +
      `${PAGING_NOTE} ${LANG_NOTE}`,
    inputSchema: searchBooksSchema,
    handler: handleSearchBooks,
  },
  {
    name: "get_book",
    title: "Get book details",
    description:
      "Get full details of a specific book from Camptocamp.org by its ID: author, editor, publication date, ISBN, pages, languages, website, book types, activities, summary, description, the routes and waypoints it covers, and its related articles (with IDs for get_route, get_waypoint and get_article). Labelled fields are shown as Camptocamp stores them; missing fields are left out. The second line is the document's camptocamp.org URL, to cite as the source. " +
      `${LANG_NOTE} ${DETAIL_LANG_NOTE} ${USER_TEXT_NOTE}`,
    inputSchema: getBookSchema,
    handler: handleGetBook,
  },
];
