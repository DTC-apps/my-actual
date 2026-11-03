import { normalizeTagName, renameTagInNotes } from './tags';

describe('renameTagInNotes', () => {
  test('renames only whole, unescaped, case-sensitive tags', () => {
    expect(
      renameTagInNotes(
        '##Food #FoodCourt #food #Food#Work #Work#Food',
        'Food',
        'Groceries',
      ),
    ).toBe('##Food #FoodCourt #food #Groceries#Work #Work#Groceries');
  });

  test('treats regex and replacement characters literally', () => {
    expect(renameTagInNotes('#a.b #axb', 'a.b', '$&')).toBe('#$& #axb');
  });
});

describe('normalizeTagName', () => {
  it('strips surrounding whitespace and leading hashes', () => {
    expect(normalizeTagName('  #just-imported ')).toBe('just-imported');
    expect(normalizeTagName('##new')).toBe('new');
    expect(normalizeTagName('new')).toBe('new');
  });

  it('returns null for empty input', () => {
    expect(normalizeTagName(null)).toBeNull();
    expect(normalizeTagName(undefined)).toBeNull();
    expect(normalizeTagName('')).toBeNull();
    expect(normalizeTagName(' # ')).toBeNull();
  });

  it('returns null for input that is not a single tag', () => {
    expect(normalizeTagName('two words')).toBeNull();
    expect(normalizeTagName('one#two')).toBeNull();
  });
});
