import { maxLength, minLength, object, optional, picklist, pipe, string, trim } from 'valibot';

const queryText = pipe(string(), trim(), minLength(1), maxLength(200));

export const catalogWorkParamsSchema = object({ workId: queryText });

export const searchCatalogWorksQuerySchema = object({
  kind: optional(picklist(['official', 'user_submission'])),
  q: optional(queryText),
  sort: optional(picklist(['recent', 'popular', 'new'])),
  source: optional(queryText),
  status: optional(picklist(['ongoing', 'hiatus', 'completed', 'unknown'])),
});
