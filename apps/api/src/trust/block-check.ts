import { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'block'>;

/** True if either person has blocked the other. Blocks are symmetric in effect. */
export async function isBlockedEither(db: Db, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const hit = await db.block.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { blockerId: true },
  });
  return hit !== null;
}

/** Everyone the user has blocked or been blocked by. */
export async function blockedSet(db: Db, userId: string): Promise<Set<string>> {
  const rows = await db.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
}

/** SQL condition: no block between `viewer` and the user in `otherColumn` (for raw search queries). */
export const notBlockedSql = (viewerId: string, otherColumn: Prisma.Sql) => Prisma.sql`NOT EXISTS (
  SELECT 1 FROM blocks bl
  WHERE (bl.blocker_id = ${viewerId}::uuid AND bl.blocked_id = ${otherColumn})
     OR (bl.blocked_id = ${viewerId}::uuid AND bl.blocker_id = ${otherColumn})
)`;
