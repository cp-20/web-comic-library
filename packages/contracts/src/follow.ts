import { array, object, picklist, pipe, string, trim } from 'valibot';

const id = pipe(string(), trim());

export const setSourcePreferencesRequestSchema = object({ sourceIds: array(id) });

export const setFollowSettingsRequestSchema = object({
  mode: picklist(['fastest', 'source_priority', 'selected_publications', 'all_publications']),
  publicationIds: array(id),
  workId: id,
});
