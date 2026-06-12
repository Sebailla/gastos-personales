import { describe, it, expect, vi } from 'vitest';
import { AccountRepository } from './account.repository';

const buildFakePrisma = () => {
  const account = {
    create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      id: 'a-new',
      ...args.data,
    })),
    findUnique: vi.fn(),
  };
  return { account };
};

describe('AccountRepository', () => {
  it('create returns the persisted row', async () => {
    const { account } = buildFakePrisma();
    const repo = new AccountRepository({
      account: account as unknown as ConstructorParameters<typeof AccountRepository>[0]['account'],
    });

    const created = await repo.create({
      userId: 'u1',
      type: 'oidc',
      provider: 'google',
      providerAccountId: 'sub-123',
    });

    expect(account.create).toHaveBeenCalledTimes(1);
    expect(created.id).toBe('a-new');
    expect(created.provider).toBe('google');
  });

  it('findUnique looks up by the (provider, providerAccountId) composite', async () => {
    const { account } = buildFakePrisma();
    const repo = new AccountRepository({
      account: account as unknown as ConstructorParameters<typeof AccountRepository>[0]['account'],
    });

    await repo.findUnique('google', 'sub-123');

    const callArg = account.findUnique.mock.calls[0]?.[0] as {
      where: { provider_providerAccountId: { provider: string; providerAccountId: string } };
    };
    expect(callArg.where.provider_providerAccountId).toEqual({
      provider: 'google',
      providerAccountId: 'sub-123',
    });
  });

  it('findUnique returns null for an unknown subject', async () => {
    const { account } = buildFakePrisma();
    account.findUnique.mockResolvedValue(null);
    const repo = new AccountRepository({
      account: account as unknown as ConstructorParameters<typeof AccountRepository>[0]['account'],
    });

    expect(await repo.findUnique('google', 'sub-unknown')).toBeNull();
  });
});
