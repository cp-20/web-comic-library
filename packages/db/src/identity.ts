import type { IdentityRepository, SessionIdentity } from '@web-comic-library/application';
import type { AccountProfile, CatalogAdminActor } from '@web-comic-library/domain';
import postgres from 'postgres';
import type { Sql } from 'postgres';

type ProfileRow = Readonly<{
  accountStatus: AccountProfile['accountStatus'];
  bio: string | null;
  displayName: string;
  iconUrl: string | null;
  userId: string;
  userUuid: string;
  visibility: AccountProfile['visibility'];
}>;

export class PostgresIdentity implements IdentityRepository {
  readonly #client: Sql;

  constructor(databaseUrl: string) {
    this.#client = postgres(databaseUrl);
  }

  async findProfileByPublicId(publicId: string): Promise<AccountProfile | null> {
    return this.#findProfile('profile.public_id', publicId);
  }

  async findProfileByUserUuid(userUuid: string): Promise<AccountProfile | null> {
    return this.#findProfile('profile.user_id', userUuid);
  }

  async #findProfile(
    field: 'profile.public_id' | 'profile.user_id',
    value: string,
  ): Promise<AccountProfile | null> {
    const condition =
      field === 'profile.public_id'
        ? this.#client`profile.public_id = ${value}`
        : this.#client`profile.user_id = ${value}`;
    const rows = await this.#client<ProfileRow[]>`
      select profile.account_status as "accountStatus", profile.bio, "user".name as "displayName",
        profile.icon_url as "iconUrl", profile.public_id as "userId", "user".id as "userUuid",
        profile.default_visibility as visibility
      from profiles as profile
      join "user" on "user".id = profile.user_id
      where ${condition}
    `;
    return rows[0] ?? null;
  }

  async findSessionIdentity(token: string): Promise<SessionIdentity | null> {
    const rows = await this.#client<SessionIdentity[]>`
      select profile.account_status as "accountStatus",
        case
          when session_assurance.session_id is null then 'none'
          else session_assurance.assurance::text
        end as assurance,
        "user".email, "user".id as "userUuid"
      from session
      join "user" on "user".id = session.user_id
      join profiles as profile on profile.user_id = "user".id
      left join session_assurances as session_assurance
        on session_assurance.session_id = session.id and session_assurance.expires_at > now()
      where session.token = ${token} and session.expires_at > now()
    `;
    return rows[0] ?? null;
  }

  async findCatalogAdminActor(token: string): Promise<CatalogAdminActor | null> {
    const rows = await this.#client<CatalogAdminActor[]>`
      select case
          when session_assurance.session_id is null then 'none'
          else session_assurance.assurance::text
        end as assurance,
        "user".id, "user".role::text as role
      from session
      join "user" on "user".id = session.user_id
      join profiles as profile on profile.user_id = "user".id
      left join session_assurances as session_assurance
        on session_assurance.session_id = session.id and session_assurance.expires_at > now()
      where session.token = ${token} and session.expires_at > now()
        and profile.account_status = 'active'
    `;
    return rows[0] ?? null;
  }

  async isFollower(followerUserUuid: string, followedUserUuid: string): Promise<boolean> {
    const rows = await this.#client<{ found: boolean }[]>`
      select exists(
        select 1 from profile_followers
        where follower_user_id = ${followerUserUuid} and followed_user_id = ${followedUserUuid}
      ) as found
    `;
    return rows[0]?.found ?? false;
  }

  async saveProfile(profile: AccountProfile): Promise<AccountProfile> {
    const rows = await this.#client<ProfileRow[]>`
      insert into profiles (
        user_id, public_id, bio, icon_url, default_visibility, account_status, updated_at
      ) values (
        ${profile.userUuid}, ${profile.userId}, ${profile.bio}, ${profile.iconUrl},
        ${profile.visibility}::visibility, ${profile.accountStatus}::account_status, now()
      ) on conflict (user_id) do update
      set public_id = excluded.public_id, bio = excluded.bio, icon_url = excluded.icon_url,
          default_visibility = excluded.default_visibility, account_status = excluded.account_status,
          updated_at = now()
      returning account_status as "accountStatus", bio, ${profile.displayName}::text as "displayName",
        icon_url as "iconUrl", public_id as "userId", user_id as "userUuid", default_visibility as visibility
    `;
    const saved = rows[0];
    if (!saved) throw new Error('profile save did not return a profile');
    await this.#client`update "user" set name = ${profile.displayName}, image = ${profile.iconUrl}, updated_at = now() where id = ${profile.userUuid}`;
    return saved;
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresIdentity = (databaseUrl: string): PostgresIdentity => {
  return new PostgresIdentity(databaseUrl);
};
