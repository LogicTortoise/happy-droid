import { describe, expect, it } from 'vitest';
import { normalizeAskUserQuestions } from './askUserQuestionInput';

describe('normalizeAskUserQuestions', () => {
    it('accepts Telegram-compatible optional header, description, and multiSelect fields', () => {
        expect(normalizeAskUserQuestions({
            questions: [{
                question: ' Continue? ',
                options: [
                    { label: ' Yes ' },
                    { label: ' No ', description: ' Stop here ' },
                ],
            }],
        })).toEqual([{
            question: 'Continue?',
            options: [
                { label: 'Yes' },
                { label: 'No', description: 'Stop here' },
            ],
            multiSelect: false,
        }]);
    });

    it('preserves multi-select questions with headers and filters invalid options', () => {
        expect(normalizeAskUserQuestions({
            questions: [{
                header: ' Scope ',
                question: 'Pick targets',
                multiSelect: true,
                options: [
                    { label: ' App ' },
                    { label: '   ' },
                    { description: 'missing label' },
                    { label: ' CLI ' },
                ],
            }],
        })).toEqual([{
            header: 'Scope',
            question: 'Pick targets',
            multiSelect: true,
            options: [
                { label: 'App' },
                { label: 'CLI' },
            ],
        }]);
    });

    it('drops malformed questions that cannot render as buttons', () => {
        expect(normalizeAskUserQuestions({
            questions: [
                { question: '', options: [{ label: 'A' }] },
                { question: 'Missing options' },
                { question: 'No labels', options: [{ label: ' ' }] },
            ],
        })).toEqual([]);
    });
});
