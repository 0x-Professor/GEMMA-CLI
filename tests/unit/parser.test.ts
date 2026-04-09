import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCommand } from '../../src/utils/parser.js';

describe('Command Parsing Harness', () => {
    it('should parse simple chat command', () => {
        expect(parseCommand('chat Hello world')).toEqual({ name: 'chat', args: ['Hello', 'world'] });
    });
    
    it('should handle empty or whitespace strings', () => {
        expect(parseCommand('   ')).toBeNull();
    });
    
    it('should extract options correctly', () => {
        expect(parseCommand('doctor --fix')).toEqual({ name: 'doctor', args: ['--fix'] });
    });
});
