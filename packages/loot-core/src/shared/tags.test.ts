import { normalizeTagName, removeTagFromNotes, renameTagInNotes } from './tags';

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

describe('removeTagFromNotes', () => {
  it('removes the tag and the space before it', () => {
    expect(removeTagFromNotes('Groceries #new', 'new')).toBe('Groceries');
    expect(removeTagFromNotes('a #new b', 'new')).toBe('a b');
    expect(removeTagFromNotes('#new Groceries', 'new')).toBe('Groceries');
  });

  it('returns null when only the tag was there', () => {
    expect(removeTagFromNotes('#new', 'new')).toBeNull();
    expect(removeTagFromNotes(' #new #new ', 'new')).toBeNull();
  });

  it('leaves notes without the tag untouched', () => {
    expect(removeTagFromNotes(null, 'new')).toBeNull();
    expect(removeTagFromNotes(undefined, 'new')).toBeNull();
    expect(removeTagFromNotes('  keep  spacing ', 'new')).toBe(
      '  keep  spacing ',
    );
  });

  it('keeps escaped and longer tags', () => {
    expect(removeTagFromNotes('##new #new-old #new', 'new')).toBe(
      '##new #new-old',
    );
  });

  it('keeps other tags next to it', () => {
    expect(removeTagFromNotes('#food #new #fun', 'new')).toBe('#food #fun');
  });

  it('treats special characters in the tag literally', () => {
    expect(removeTagFromNotes('x #a.b #axb', 'a.b')).toBe('x #axb');
  });
});
