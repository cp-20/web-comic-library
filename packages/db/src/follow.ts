import type {
  FollowRepository,
  FollowSettings,
  TransactionContext,
} from '@web-comic-library/application';
import type { SubscriptionPublication, UserSourcePreference } from '@web-comic-library/domain';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import type { PostgresFoundation } from './foundation';

export class PostgresFollow implements FollowRepository {
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async findFollowSettings(userUuid: string, workId: string): Promise<FollowSettings | null> {
    const rows = await this.#client<FollowSettings[]>`
      select
        user_id as "userUuid",
        resolve_catalog_redirect('work'::catalog_redirect_resource, work_id)::text as "workId",
        mode
      from work_follow_settings
      where user_id = ${userUuid}
        and resolve_catalog_redirect('work'::catalog_redirect_resource, work_id)
          = resolve_catalog_redirect('work'::catalog_redirect_resource, ${workId}::uuid)
      order by updated_at desc
      limit 1
    `;
    return rows[0] ?? null;
  }

  async listSourcePreferences(userUuid: string): Promise<readonly UserSourcePreference[]> {
    return this.#client<UserSourcePreference[]>`
      select user_id as "userUuid", source_id::text as "sourceId", position
      from user_source_preferences where user_id = ${userUuid} order by position
    `;
  }

  async listSubscriptionPublicationIds(
    userUuid: string,
    workId: string,
  ): Promise<readonly string[]> {
    const rows = await this.#client<{ publicationId: string }[]>`
      select publication_id::text as "publicationId"
      from subscription_publications
      where user_id = ${userUuid}
        and resolve_catalog_redirect('work'::catalog_redirect_resource, work_id)
          = resolve_catalog_redirect('work'::catalog_redirect_resource, ${workId}::uuid)
      order by publication_id
    `;
    return rows.map((row) => row.publicationId);
  }

  async replaceSourcePreferences(
    context: TransactionContext,
    userUuid: string,
    sourceIds: readonly string[],
  ): Promise<readonly UserSourcePreference[]> {
    return this.#foundation.withSession(context, async (session) => {
      await session`delete from user_source_preferences where user_id = ${userUuid}`;
      if (sourceIds.length === 0) return [];
      await session`
        insert into user_source_preferences (user_id, source_id, position)
        select ${userUuid}, source_id::uuid, position::integer - 1
        from unnest(${[...sourceIds]}::text[]) with ordinality as preference(source_id, position)
      `;
      return sourceIds.map((sourceId, position) => ({ position, sourceId, userUuid }));
    });
  }

  async replaceSubscriptionPublications(
    context: TransactionContext,
    userUuid: string,
    workId: string,
    publicationIds: readonly string[],
  ): Promise<readonly SubscriptionPublication[]> {
    return this.#foundation.withSession(context, async (session) => {
      await session`
        delete from subscription_publications
        where user_id = ${userUuid}
          and resolve_catalog_redirect('work'::catalog_redirect_resource, work_id)
            = resolve_catalog_redirect('work'::catalog_redirect_resource, ${workId}::uuid)
      `;
      if (publicationIds.length === 0) return [];
      await session`
        insert into subscription_publications (user_id, work_id, publication_id)
        select
          ${userUuid},
          resolve_catalog_redirect('work'::catalog_redirect_resource, ${workId}::uuid),
          publication_id::uuid
        from unnest(${[...publicationIds]}::text[]) as selection(publication_id)
      `;
      return publicationIds.map((publicationId) => ({ publicationId, userUuid, workId }));
    });
  }

  async saveFollowSettings(context: TransactionContext, settings: FollowSettings): Promise<void> {
    await this.#foundation.withSession(
      context,
      (session) => session`
      insert into work_follow_settings (user_id, work_id, mode)
      values (
        ${settings.userUuid},
        resolve_catalog_redirect('work'::catalog_redirect_resource, ${settings.workId}::uuid),
        ${settings.mode}::follow_mode
      )
      on conflict (user_id, work_id) do update
      set mode = excluded.mode, updated_at = now()
    `,
    );
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresFollow = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresFollow => new PostgresFollow(databaseUrl, foundation);
