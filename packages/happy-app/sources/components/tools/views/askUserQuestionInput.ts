export interface QuestionOption {
    label: string;
    description?: string;
}

export interface Question {
    question: string;
    header?: string;
    options: QuestionOption[];
    multiSelect?: boolean;
}

export interface AskUserQuestionInput {
    questions: Question[];
}

export type NormalizedAskUserQuestion = {
    question: string;
    header?: string;
    options: QuestionOption[];
    multiSelect: boolean;
};

function normalizeText(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeAskUserQuestions(input: unknown): NormalizedAskUserQuestion[] {
    const questions = (input as AskUserQuestionInput | undefined)?.questions;
    if (!Array.isArray(questions)) {
        return [];
    }

    return questions.flatMap((rawQuestion): NormalizedAskUserQuestion[] => {
        const question = normalizeText(rawQuestion?.question);
        if (!question || !Array.isArray(rawQuestion?.options)) {
            return [];
        }

        const options = rawQuestion.options.flatMap((rawOption): QuestionOption[] => {
            const label = normalizeText(rawOption?.label);
            if (!label) {
                return [];
            }
            const description = normalizeText(rawOption?.description);
            return [{
                label,
                ...(description ? { description } : {}),
            }];
        });

        if (options.length === 0) {
            return [];
        }

        const header = normalizeText(rawQuestion.header);
        return [{
            question,
            ...(header ? { header } : {}),
            options,
            multiSelect: rawQuestion.multiSelect === true,
        }];
    });
}
