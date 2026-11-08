import { describe, expect, it } from 'vitest';
import { lemmaKey, lemmatizeWord, tokenizeEn } from '../../src/main/modules/glossary/lemmatize';

describe('tokenizeEn', () => {
  it('splits words, splits hyphens and drops punctuation', () => {
    const tokens = tokenizeEn('Pulse Width Modulation (PWM), on-chip.');
    expect(tokens.map((t) => t.raw)).toEqual(['Pulse', 'Width', 'Modulation', 'PWM', 'on', 'chip']);
  });

  it('keeps character offsets', () => {
    const tokens = tokenizeEn('duty cycle');
    expect(tokens[0]).toMatchObject({ raw: 'duty', start: 0, end: 4 });
    expect(tokens[1]).toMatchObject({ raw: 'cycle', start: 5, end: 10 });
  });

  it('keeps dotted version numbers intact', () => {
    const tokens = tokenizeEn('v3.5 and 1.2');
    expect(tokens.map((t) => t.raw)).toEqual(['v3.5', 'and', '1.2']);
  });

  it('trims trailing hyphens and apostrophes', () => {
    const tokens = tokenizeEn('PWM- output');
    expect(tokens.map((t) => t.raw)).toEqual(['PWM', 'output']);
  });
});

describe('lemmatizeWord', () => {
  it('handles irregular forms', () => {
    expect(lemmatizeWord('indices')).toBe('index');
    expect(lemmatizeWord('children')).toBe('child');
    expect(lemmatizeWord('does')).toBe('do');
  });

  it('handles -ies and -ied', () => {
    expect(lemmatizeWord('duties')).toBe('duty');
    expect(lemmatizeWord('studied')).toBe('study');
  });

  it('handles -es plurals', () => {
    expect(lemmatizeWord('classes')).toBe('class');
    expect(lemmatizeWord('watches')).toBe('watch');
    expect(lemmatizeWord('boxes')).toBe('box');
  });

  it('handles plain plurals but not -ss / -us / -is', () => {
    expect(lemmatizeWord('registers')).toBe('register');
    expect(lemmatizeWord('process')).toBe('process');
    expect(lemmatizeWord('status')).toBe('status');
    expect(lemmatizeWord('analysis')).toBe('analysis');
  });

  it('handles -ing / -ed including doubled consonants', () => {
    expect(lemmatizeWord('running')).toBe('run');
    expect(lemmatizeWord('stopped')).toBe('stop');
    expect(lemmatizeWord('processed')).toBe('process');
    expect(lemmatizeWord('called')).toBe('call');
  });

  it('never lemmatizes acronyms, short words or identifiers', () => {
    expect(lemmatizeWord('PWM')).toBe('pwm');
    expect(lemmatizeWord('ESP32')).toBe('esp32');
    expect(lemmatizeWord('use')).toBe('use');
  });
});

describe('lemmaKey', () => {
  it('produces a stable multi-word key', () => {
    expect(lemmaKey('Duty Cycles')).toBe('duty cycle');
    expect(lemmaKey('registers')).toBe('register');
  });
});
