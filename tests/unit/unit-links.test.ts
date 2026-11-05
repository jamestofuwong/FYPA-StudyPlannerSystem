import { isOfficialUnitUrl, officialUnitUrl } from '../../core/shared/unitLinks';

describe('officialUnitUrl', () => {
  test('builds the official page from the first letter and the lower-case code', () => {
    expect(officialUnitUrl('COS10009')).toBe('https://www.swinburne.edu.au/course/unit/c/cos10009/');
    expect(officialUnitUrl('ICT20016')).toBe('https://www.swinburne.edu.au/course/unit/i/ict20016/');
    expect(officialUnitUrl('SWE30003')).toBe('https://www.swinburne.edu.au/course/unit/s/swe30003/');
  });

  test('ignores case, spaces and the *Optional marker', () => {
    expect(officialUnitUrl(' cos 10009 ')).toBe('https://www.swinburne.edu.au/course/unit/c/cos10009/');
    expect(officialUnitUrl('COS30019*Optional')).toBe('https://www.swinburne.edu.au/course/unit/c/cos30019/');
  });

  test('gives no link to MPU units, which have no unit page of their own', () => {
    expect(officialUnitUrl('MPU3212')).toBeNull();
    expect(officialUnitUrl('mpu3142')).toBeNull();
  });

  test('gives no link to something that is not a unit code', () => {
    for (const value of ['', '   ', '-', '?', 'Core', 'COS1', 'COS100099999', '../etc', 'COS10009/../x', null, undefined]) {
      expect(officialUnitUrl(value as string)).toBeNull();
    }
  });
});

describe('isOfficialUnitUrl', () => {
  test('accepts exactly what officialUnitUrl builds', () => {
    for (const code of ['COS10009', 'ICT20016', 'SWE30003', 'TNE10006']) {
      expect(isOfficialUnitUrl(officialUnitUrl(code)!)).toBe(true);
    }
  });

  test.each([
    ['another host', 'https://example.com/course/unit/c/cos10009/'],
    ['a look-alike host', 'https://www.swinburne.edu.au.evil.com/course/unit/c/cos10009/'],
    ['a sub-domain', 'https://evil.www.swinburne.edu.au/course/unit/c/cos10009/'],
    ['plain http', 'http://www.swinburne.edu.au/course/unit/c/cos10009/'],
    ['the Sarawak site', 'https://www.swinburne.edu.my/course/unit/c/cos10009/'],
    ['a user name in the address', 'https://user@www.swinburne.edu.au/course/unit/c/cos10009/'],
    ['a port', 'https://www.swinburne.edu.au:8443/course/unit/c/cos10009/'],
    ['another path on the site', 'https://www.swinburne.edu.au/study/'],
    ['a letter that does not match the code', 'https://www.swinburne.edu.au/course/unit/x/cos10009/'],
    ['an MPU unit', 'https://www.swinburne.edu.au/course/unit/m/mpu3212/'],
    ['extra path', 'https://www.swinburne.edu.au/course/unit/c/cos10009/../../x/'],
    ['a file path', 'file:///etc/passwd'],
    ['a script', 'javascript:alert(1)'],
    ['not a URL', 'cos10009'],
    ['empty', ''],
  ])('refuses %s', (_name, url) => {
    expect(isOfficialUnitUrl(url)).toBe(false);
  });
});
