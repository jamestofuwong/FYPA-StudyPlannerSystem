import { isMpuUnit, readShowMpu, saveShowMpu, SHOW_MPU_STORAGE_KEY } from '../../web/lib/mpu';

describe('isMpuUnit', () => {
  test('a planner row is MPU by its category', () => {
    expect(isMpuUnit({ category: 'mpu', code: 'ABC1000' })).toBe(true);
  });

  test('a row is MPU by its code, whatever the field is called and however it is written', () => {
    expect(isMpuUnit({ code: 'MPU3312' })).toBe(true);
    expect(isMpuUnit({ courseId: ' mpu3142 ' })).toBe(true);
    expect(isMpuUnit({ unit_code: 'MPU3212' })).toBe(true);
  });

  test('other units and empty values are not MPU', () => {
    expect(isMpuUnit({ category: 'core', code: 'COS10009' })).toBe(false);
    expect(isMpuUnit({ courseId: 'COS10009' })).toBe(false);
    expect(isMpuUnit({})).toBe(false);
    expect(isMpuUnit(null)).toBe(false);
    expect(isMpuUnit(undefined)).toBe(false);
  });
});

describe('the remembered choice', () => {
  const makeStorage = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  };

  afterEach(() => { delete (globalThis as any).window; });

  test('is shown when nothing was saved, and follows what was saved', () => {
    (globalThis as any).window = { localStorage: makeStorage() };
    expect(readShowMpu()).toBe(true);
    saveShowMpu(false);
    expect((globalThis as any).window.localStorage.getItem(SHOW_MPU_STORAGE_KEY)).toBe('false');
    expect(readShowMpu()).toBe(false);
    saveShowMpu(true);
    expect(readShowMpu()).toBe(true);
  });

  test('is shown, and nothing throws, when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    (globalThis as any).window = { localStorage: blocked };
    expect(readShowMpu()).toBe(true);
    expect(() => saveShowMpu(false)).not.toThrow();
  });
});
