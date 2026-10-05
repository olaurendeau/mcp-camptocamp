# Tool reference

The server registers 13 read-only tools, one search and one detail tool per kind of Camptocamp document, plus a shortcut for a user's outings. Every tool takes `lang`, the language of titles and texts (`fr` by default).

Each page gives the tool's purpose, its inputs and the tools to call before or after it. The Inputs section is generated from the input schema the server registers, so its parameters, types, defaults, bounds and allowed values match the code.

## Routes

| Tool                                | What it does                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [`search_routes`](search_routes.md) | Search routes by keyword, area, waypoint, activity, rating, elevation gain, route type or configuration; paged. |
| [`get_route`](get_route.md)         | One route by ID: ratings, elevation, practical facts, description, areas, books, waypoints and recent outings.  |

## Waypoints

| Tool                                      | What it does                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [`search_waypoints`](search_waypoints.md) | Search summits, huts, passes, crags and other waypoints by name and/or area, optionally narrowed to one type; paged. |
| [`get_waypoint`](get_waypoint.md)         | One waypoint by ID: altitude, GPS coordinates, hut details, access, areas, routes, books and outings.                |

## Outings

| Tool                                            | What it does                                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`search_outings`](search_outings.md)           | Search trip reports by keyword, area, activity, ratings, conditions, elevation, dates, routes, waypoint or user. |
| [`search_user_outings`](search_user_outings.md) | The outings a Camptocamp user is listed on, by user ID; an alias of `search_outings`.                            |
| [`get_outing`](get_outing.md)                   | One outing by ID: reported ratings and conditions, weather, report text, participants and routes.                |

## Areas

| Tool                              | What it does                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`search_areas`](search_areas.md) | Search ranges, administrative subdivisions and countries by name; the ID is reusable as `area_id`. |
| [`get_area`](get_area.md)         | One area by ID: type, summary and description.                                                     |

## Books

| Tool                              | What it does                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`search_books`](search_books.md) | Search guidebooks and other books by title, book type and activity; author and ISBN searches are unreliable. |
| [`get_book`](get_book.md)         | One book by ID: author, editor, date, ISBN, languages, and the routes, waypoints and articles it covers.     |

## Articles

| Tool                                    | What it does                                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`search_articles`](search_articles.md) | Search articles (gear, technique, environment, stories) by keyword, category, type and activity.            |
| [`get_article`](get_article.md)         | One article by ID: text, author, type, and the routes, waypoints, articles, outings and books linked to it. |

## Keeping the pages in sync

The Inputs section of each page sits between `<!-- generated:inputs start -->` and `<!-- generated:inputs end -->`. After changing a tool's input schema, run `npm run docs:tools` to regenerate it; `make check` fails while a page differs from the registered schema, when a registered tool has no page, or when this index does not list exactly the registered tools. Everything outside the markers is written by hand.
