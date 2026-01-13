
import { QuotaService } from './quota-service';

// Mock vscode to avoid runtime errors when accessing vscode.workspace
jest.mock('vscode', () => ({
    workspace: {
        workspaceFolders: []
    }
}), { virtual: true });

describe('QuotaService', () => {
    let service: QuotaService;

    beforeEach(() => {
        service = new QuotaService();
    });

    describe('getQuotaModelName', () => {
        it('should normalize Sonnet 4.5 model ID', () => {
            const result = service.getQuotaModelName('claude-sonnet-4-5-20250929');
            expect(result).toBe('Sonnet 4.5');
        });

        it('should normalize Opus 4.5 model ID', () => {
            const result = service.getQuotaModelName('claude-opus-4-5-20251101');
            expect(result).toBe('Opus 4.5');
        });

        it('should normalize Haiku 4.5 model ID', () => {
            const result = service.getQuotaModelName('claude-haiku-4-5');
            expect(result).toBe('Haiku 4.5');
        });

        it('should handle IDs without dates', () => {
            const result = service.getQuotaModelName('claude-sonnet-4-5');
            expect(result).toBe('Sonnet 4.5');
        });

        it('should format version numbers correctly (not 4 5)', () => {
            const result = service.getQuotaModelName('claude-sonnet-4-5');
            expect(result).not.toBe('Sonnet 4 5');
            expect(result).toBe('Sonnet 4.5');
        });

        it('should remove marketing suffixes', () => {
            const result = service.getQuotaModelName('claude-sonnet-4-5 · Best For Everyday Tasks');
            expect(result).toBe('Sonnet 4.5');
        });
    });

    describe('normalizeProjectPath', () => {
        it('should normalize Mac/Linux paths', () => {
            const input = '/Users/test/project';
            const expected = '-Users-test-project';
            expect(service.normalizeProjectPath(input)).toBe(expected);
        });

        it('should normalize Windows paths with backslashes', () => {
            const input = 'C:\\Users\\test\\project';
            // Logic: replaces \ with - and ensures it starts with -
            // C:\Users\test\project -> C--Users-test-project -> -C--Users-test-project (if replaced simply)
            // Wait, replace(/[\\/]/g, '-') will make: C:-Users-test-project
            // Then prepend -: -C:-Users-test-project ?

            // Let's verify the actual implementation logic:
            // let safeName = projectRoot.replace(/[\\/]/g, '-');
            // C:\Users... -> C:-Users... (colon remains)
            // Claude CLI usually handles the drive colon by ignoring it or replacing it too?
            // The current implementation ONLY replaces / and \. It does NOT replace :
            // So 'C:\Users' becomes 'C:-Users'.
            // Then checks startWith '-': adds it -> '-C:-Users'.

            // If the user's real Claude logs show something else, we might need to adjust.
            // But for now we test AS IMPLEMENTED.
            const expected = '-C:-Users-test-project';
            expect(service.normalizeProjectPath(input)).toBe(expected);
        });

        it('should handle mixed separators', () => {
            const input = 'C:/Users\\test/project';
            const expected = '-C:-Users-test-project';
            expect(service.normalizeProjectPath(input)).toBe(expected);
        });

        it('should not add double dash if already exists', () => {
            // Logic: if (!safeName.startsWith('-')) safeName = '-' + safeName;
            // If path starts with /, safeName starts with -
            const input = '/Users/foo';
            // replace -> -Users-foo
            // startsWith('-') is true. no change.
            expect(service.normalizeProjectPath(input)).toBe('-Users-foo');
        });
    });
});
