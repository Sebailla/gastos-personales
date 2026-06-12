import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, setPrismaClient, __resetPrismaForTests } from './prisma';

describe('prisma singleton', () => {
  beforeEach(() => {
    __resetPrismaForTests();
  });

  it('returns the same instance on consecutive calls', () => {
    const a = prisma();
    const b = prisma();
    expect(a).toBe(b);
  });

  it('exposes a test override hook that swaps the client', () => {
    const fake = { id: 'fake-client' } as unknown as ReturnType<typeof prisma>;
    setPrismaClient(fake);
    expect(prisma()).toBe(fake);
  });

  it('is callable from multiple import sites without divergence', async () => {
    const { prisma: prismaA } = await import('./prisma');
    const { prisma: prismaB } = await import('./prisma');
    expect(prismaA()).toBe(prismaB());
  });
});
