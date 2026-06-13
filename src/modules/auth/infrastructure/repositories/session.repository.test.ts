import { describe, it, expect, vi } from 'vitest';
import { SessionRepository } from './session.repository';

const buildFakePrisma = () => {
  const session = {
    findUnique: vi.fn(),
    delete: vi.fn(),
  };
  return { session };
};

describe('SessionRepository', () => {
  it('findByToken returns the userId and expires on a hit', async () => {
    const { session } = buildFakePrisma();
    session.findUnique.mockResolvedValue({
      userId: 'u1',
      expires: new Date('2026-07-12T00:00:00Z'),
    });
    const repo = new SessionRepository({
      session: session as unknown as ConstructorParameters<typeof SessionRepository>[0]['session'],
    });

    const result = await repo.findByToken('sess-abc');
    expect(result).toEqual({
      userId: 'u1',
      expires: new Date('2026-07-12T00:00:00Z'),
    });
  });

  it('findByToken returns null on a miss', async () => {
    const { session } = buildFakePrisma();
    session.findUnique.mockResolvedValue(null);
    const repo = new SessionRepository({
      session: session as unknown as ConstructorParameters<typeof SessionRepository>[0]['session'],
    });

    expect(await repo.findByToken('sess-missing')).toBeNull();
  });

  it('delete removes the row by sessionToken', async () => {
    const { session } = buildFakePrisma();
    session.delete.mockResolvedValue({});
    const repo = new SessionRepository({
      session: session as unknown as ConstructorParameters<typeof SessionRepository>[0]['session'],
    });

    await repo.delete('sess-abc');

    const callArg = session.delete.mock.calls[0]?.[0] as { where: { sessionToken: string } };
    expect(callArg.where.sessionToken).toBe('sess-abc');
  });
});
