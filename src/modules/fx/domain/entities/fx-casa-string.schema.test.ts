import { describe, it, expect } from 'vitest';
import { fxCasaStringSchema, FX_CASAS, type FxCasaString } from './fx-casa-string.schema';

describe('fxCasaStringSchema', () => {
  it.each(FX_CASAS)('accepts lowercase "%s"', (casa) => {
    const parsed = fxCasaStringSchema.parse(casa);
    expect(parsed).toBe(casa);
  });

  it('rejects mixed-case "OfiCial"', () => {
    const result = fxCasaStringSchema.safeParse('OfiCial');
    expect(result.success).toBe(false);
  });

  it('rejects uppercase "BLUE"', () => {
    const result = fxCasaStringSchema.safeParse('BLUE');
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = fxCasaStringSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('exposes the exact union type at the type level', () => {
    // Compile-time check: the schema and the FX_CASAS tuple
    // share the same literal-union type. The runtime check
    // confirms `fxCasaStringSchema.options` matches FX_CASAS
    // element-for-element; a drift here would mean a typo in
    // either source.
    expect(fxCasaStringSchema.options).toEqual([...FX_CASAS]);
    const typed: FxCasaString = 'oficial';
    expect(typed).toBe('oficial');
  });
});
