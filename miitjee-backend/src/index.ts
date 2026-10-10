import {
	registerDeviceHandler,
	startCbtSessionHandler,
	syncBatchHandler,
	auditLogHandler,
	adminRecoveryHandler,
} from "./endpoints/cbt";

interface Env {
	SUPABASE_URL: string;
	SUPABASE_SERVICE_KEY: string;
	R2_BUCKET: R2Bucket;
	GEMINI_API_KEY?: string;
	GEMINI_MODEL?: string;
	ENVIRONMENT?: string;
}

type BBox = [number, number, number, number];

type IncomingQuestion = {
	question: string;
	options: string[];
	correct_answer?: string | null;
	correct_option?: string | null;
	type: string;
	explanation: string | null;
	image_url?: string | null;
	has_image?: boolean;
	invalid?: boolean;
	skipped?: boolean;
	bbox?: BBox;
	page_image?: string;
};

type NormalizedQuestion = {
	question: string;
	options: string[];
	correct_answer: string;
	type: string;
	explanation: string;
	image_url: string | null;
	has_image: boolean;
	bbox?: BBox;
	page_image?: string;
};

type SetId = string | number;

type NormalizedRequest = {
	set_id: SetId;
	questions: NormalizedQuestion[];
};

type CreateQuestionSetRequest = {
	pdf_name?: unknown;
	questions?: unknown;
	set_id?: unknown;
};

type PngImage = {
	width: number;
	height: number;
	rgba: Uint8Array<ArrayBufferLike>;
};

type OptionLabel = {
	label: string;
	start: number;
	valueStart: number;
};

type GeneratedQuestionType = "mcq" | "integer";

type SafeGeneratedQuestion = {
	question: string;
	options: string[];
	correct_answer: string | null;
	explanation: string | null;
	type: GeneratedQuestionType;
	has_image: boolean;
	raw_text: string;
};

type GeneratedQuestionResponse = SafeGeneratedQuestion & {
	invalid?: boolean;
	skipped?: boolean;
	errors?: string[];
};

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const OPTION_LABEL_PATTERN = /(?:^|\s)(?:\(?[A-Da-d]\)?[).:-])/;

function json(data: unknown, status = 200): Response {
	return Response.json(data, { status });
}

function getBearerToken(request: Request) {
	const authorization = request.headers.get("Authorization") ?? request.headers.get("authorization");
	if (!authorization?.toLowerCase().startsWith("bearer ")) {
		return null;
	}

	return authorization.slice(7).trim();
}

function isValidSetId(value: unknown): value is SetId {
	return (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.trim() !== "");
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isBBox(value: unknown): value is BBox {
	return Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === "number");
}

function extractIntegerValue(value: unknown): number | null {
	const raw = typeof value === "number" ? String(value) : asTrimmedString(value);
	if (!raw) return null;

	const match = raw.match(/-?\d+/);
	if (!match) return null;

	const parsed = Number(match[0]);
	return Number.isInteger(parsed) ? parsed : null;
}

function inferGeneratedQuestionType(rawType: unknown, options: string[], correctAnswer: unknown): GeneratedQuestionType | null {
	const normalizedType = asTrimmedString(rawType).toLowerCase();
	if (isGeneratedQuestionType(normalizedType)) {
		return normalizedType;
	}

	if (options.length === 0) {
		return extractIntegerValue(correctAnswer) !== null ? "integer" : "integer";
	}

	return "mcq";
}

function normalizeQuestion(value: unknown): NormalizedQuestion | string {
	if (!value || typeof value !== "object") {
		return "Each question must be a JSON object";
	}

	const question = value as Partial<IncomingQuestion>;
	const correctAnswer = question.correct_answer ?? question.correct_option ?? "";
	const options = cleanOptions(question.options);
	const uniqueOptions = uniqueOptionList(options);
	const type = inferGeneratedQuestionType(question.type, uniqueOptions, correctAnswer);

	if (typeof question.question !== "string" || question.question.trim() === "") {
		return "question must be a non-empty string";
	}
	if (question.options !== undefined && !isStringArray(question.options)) {
		return "options must be an array of strings";
	}
	if (correctAnswer !== null && typeof correctAnswer !== "string") {
		return "correct_answer must be a string or null";
	}
	if (!type) {
		return "type must be mcq or integer";
	}
	if (type === "mcq" && uniqueOptions.length !== 4) {
		return "mcq options must contain exactly 4 unique strings";
	}
	if (question.explanation !== null && question.explanation !== undefined && typeof question.explanation !== "string") {
		return "explanation must be a string or null";
	}
	if (question.image_url !== undefined && question.image_url !== null && typeof question.image_url !== "string") {
		return "image_url must be a string or null";
	}
	if (question.bbox !== undefined && !isBBox(question.bbox)) {
		return "bbox must be [x1, y1, x2, y2]";
	}
	if (question.page_image !== undefined && typeof question.page_image !== "string") {
		return "page_image must be a base64 string";
	}

	return {
		question: question.question.trim(),
		options: type === "mcq" ? uniqueOptions : [],
		correct_answer: normalizeCorrectAnswer(correctAnswer, type === "mcq" ? uniqueOptions : [], type) ?? "",
		type,
		explanation: question.explanation?.trim() ?? "",
		image_url: question.image_url ?? null,
		has_image: Boolean(question.has_image),
		bbox: question.bbox,
		page_image: question.page_image,
	};
}

function normalizeRequestBody(body: unknown): NormalizedRequest | string {
	if (!body || typeof body !== "object") {
		return "Request body must be a JSON object";
	}

	const payload = body as { set_id?: unknown; questions?: unknown; question?: unknown };
	if (!isValidSetId(payload.set_id)) {
		return "set_id must be a number or non-empty string";
	}

	const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [payload];
	if (rawQuestions.length === 0) {
		return "questions must contain at least one question";
	}

	const questions: NormalizedQuestion[] = [];
	for (const rawQuestion of rawQuestions) {
		const questionRecord = asRecord(rawQuestion);
		if (questionRecord?.invalid === true || questionRecord?.skipped === true) {
			console.warn("Skipped invalid question before insert", {
				set_id: payload.set_id,
				question: asTrimmedString(questionRecord.question),
				errors: questionRecord.errors,
			});
			continue;
		}

		const normalized = normalizeQuestion(rawQuestion);
		if (typeof normalized === "string") {
			console.warn("Skipped invalid question before insert", {
				set_id: payload.set_id,
				error: normalized,
				question: asTrimmedString(questionRecord?.question),
			});
			continue;
		}
		questions.push(normalized);
	}

	if (questions.length === 0) {
		return "questions must contain at least one valid question";
	}

	return {
		set_id: typeof payload.set_id === "string" ? payload.set_id.trim() : payload.set_id,
		questions,
	};
}

function resolveNumericSetId(value: SetId): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string" && /^\d+$/.test(value.trim())) {
		return Number(value.trim());
	}

	return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asTrimmedString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\s+/g, " ").trim();
}

function normalizeMathSymbols(value: string): string {
	return value
		.replace(/<=/g, "\u2264")
		.replace(/>=/g, "\u2265");
}

function repairImportedMathMojibake(value: string): string {
	return value
		.replace(/Â²/g, "²")
		.replace(/Â³/g, "³")
		.replace(/â‰¤/g, "≤")
		.replace(/â‰¥/g, "≥")
		.replace(/âˆž/g, "∞")
		.replace(/âˆ’/g, "−")
		.replace(/â€“|â€”/g, "-")
		.replace(/â‹…/g, "·")
		.replace(/Î¼|Âµ/g, "μ")
		.replace(/Ï/g, "ρ")
		.replace(/Î¸/g, "θ")
		.replace(/Î»/g, "λ")
		.replace(/Î±/g, "α")
		.replace(/Î²/g, "β")
		.replace(/Î”|âˆ†/g, "Δ")
		.replace(/Ï‰/g, "ω");
}

function normalizeDimensionExpression(value: string): string {
	return value
		.replace(/\s+/g, "")
		.replace(/([A-Za-zΑ-Ωα-ωμΩ])(-?\d+)(?=[A-Za-zΑ-Ωα-ωμΩ]|$)/g, "$1^$2");
}

function normalizeDimensionBrackets(value: string): string {
	return value.replace(/\[([^[\]]+)\]/g, (_, expression: string) => `[${normalizeDimensionExpression(expression)}]`);
}

function normalizeInlineMathPowers(value: string): string {
	return value.replace(
		/(^|[^A-Za-z0-9])([A-Za-zΑ-Ωα-ωμΩ])([23])(?=\s*(?:[/=+*\-),\].:;]))/g,
		"$1$2^$3",
	);
}

function normalizeGreekZero(value: string): string {
	return value.replace(/([μρλθω])o\b/gi, "$10");
}

function normalizeImportedExamText(value: string): string {
	return normalizeGreekZero(
		normalizeInlineMathPowers(
			normalizeDimensionBrackets(
				repairImportedMathMojibake(
					normalizeMathSymbols(normalizeWhitespace(value)),
				),
			),
		),
	);
}

function isGeneratedQuestionType(value: string): value is GeneratedQuestionType {
	return value === "mcq" || value === "integer";
}

function stripCodeFence(value: string): string {
	const trimmed = value.trim();
	return trimmed
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
}

function parseJsonLike(value: unknown): unknown | null {
	if (!value) return null;
	if (typeof value !== "string") return value;

	const cleaned = stripCodeFence(value);
	try {
		return JSON.parse(cleaned);
	} catch {
		const objectStart = cleaned.indexOf("{");
		const objectEnd = cleaned.lastIndexOf("}");
		if (objectStart >= 0 && objectEnd > objectStart) {
			try {
				return JSON.parse(cleaned.slice(objectStart, objectEnd + 1));
			} catch {
				return null;
			}
		}
	}

	return null;
}

function getQuestionRecord(value: unknown): Record<string, unknown> | null {
	const parsed = parseJsonLike(value);
	if (Array.isArray(parsed)) {
		return asRecord(parsed[0]);
	}

	const record = asRecord(parsed);
	if (!record) return null;

	if (Array.isArray(record.questions)) {
		return asRecord(record.questions[0]);
	}

	return record;
}

function cleanOption(value: string): string {
	return normalizeImportedExamText(value)
		.replace(/^\(?[A-Da-d]\)?[).:-]\s*/, "")
		.trim();
}

function cleanOptions(value: unknown): string[] {
	if (!Array.isArray(value)) return [];

	return value
		.filter((option): option is string => typeof option === "string")
		.map(cleanOption)
		.filter(Boolean);
}

function uniqueOptionList(options: string[]): string[] {
	const seen = new Set<string>();
	const uniqueOptions: string[] = [];

	for (const option of options) {
		if (seen.has(option)) continue;
		seen.add(option);
		uniqueOptions.push(option);
	}

	return uniqueOptions;
}

function hasDuplicateOptions(options: string[]): boolean {
	return uniqueOptionList(options).length !== options.length;
}

function optionExistsInOriginalText(option: string, originalText: string): boolean {
	const cleanedOption = cleanOption(option);
	if (!cleanedOption) return false;

	const normalizedOriginal = normalizeMathSymbols(normalizeWhitespace(originalText));
	return normalizedOriginal.includes(cleanedOption);
}

function filterOptionsToOriginalText(options: string[], originalText: string): string[] {
	return uniqueOptionList(options.map(cleanOption).filter((option) => optionExistsInOriginalText(option, originalText)));
}

function optionListsMatch(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((option, index) => option === right[index]);
}

function hasOptionLabel(value: string): boolean {
	return OPTION_LABEL_PATTERN.test(value);
}

function detectImageWords(value: string): boolean {
	return /\b(diagram|figure|graph|chart|table|image)\b/i.test(value);
}

function findMetaStart(value: string): number {
	const match = value.match(/\b(?:correct\s*answer|answer|ans|explanation|solution)\s*[:\-]/i);
	return match?.index ?? -1;
}

function stripAnswerAndExplanation(value: string): string {
	const metaStart = findMetaStart(value);
	return metaStart >= 0 ? value.slice(0, metaStart).trim() : value.trim();
}

function findLetterOptionLabels(value: string): OptionLabel[] {
	const labels: OptionLabel[] = [];
	const pattern = /(^|[\s\n\r])\(?([A-Da-d])\)?[).:-]\s*/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(value)) !== null) {
		const prefix = match[1] ?? "";
		const label = (match[2] ?? "").toUpperCase();
		labels.push({
			label,
			start: match.index + prefix.length,
			valueStart: match.index + match[0].length,
		});
	}

	return labels;
}

function findNumberedOptionLabels(value: string): OptionLabel[] {
	const labels: OptionLabel[] = [];
	const pattern = /(^|[\s\n\r])\(?([1-4])\)?[).:-]\s*/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(value)) !== null) {
		const prefix = match[1] ?? "";
		const label = match[2] ?? "";
		labels.push({
			label,
			start: match.index + prefix.length,
			valueStart: match.index + match[0].length,
		});
	}

	if (labels.length > 4 && labels[0]?.start === 0 && labels.slice(1).some((label) => label.label === "1")) {
		return labels.slice(1);
	}

	return labels;
}

function findOptionLabels(value: string): OptionLabel[] {
	const letterLabels = findLetterOptionLabels(value);
	if (letterLabels.length >= 2) return letterLabels;

	const numberedLabels = findNumberedOptionLabels(value);
	return numberedLabels.length >= 2 ? numberedLabels : [];
}

function optionLabelsAreNumbered(labels: OptionLabel[]): boolean {
	return labels.some((label) => /^\d$/.test(label.label));
}

function cleanQuestionText(value: string): string {
	const withoutMeta = stripAnswerAndExplanation(value);
	const labels = findOptionLabels(withoutMeta);
	const firstLabel = labels[0];
	const question = firstLabel ? withoutMeta.slice(0, firstLabel.start) : withoutMeta;

	return normalizeWhitespace(question)
		.replace(/^\d+\s*[).:-]\s*/, "")
		.trim();
}

function firstSentence(value: string): string {
	const cleaned = normalizeWhitespace(stripAnswerAndExplanation(value));
	const match = cleaned.match(/^(.+?[.?!])(?:\s|$)/);
	return (match?.[1] ?? cleaned.split("\n")[0] ?? "").trim();
}

function extractRawAnswer(value: string): string | null {
	const match = value.match(/\b(?:correct\s*answer|answer|ans)\s*[:\-]\s*([^\n]+)/i);
	const rawAnswer = match?.[1]?.split(/\b(?:explanation|solution)\s*[:\-]/i)[0]?.trim() ?? "";
	return rawAnswer || null;
}

function extractExplanation(value: string): string | null {
	const match = value.match(/\b(?:explanation|solution)\s*[:\-]\s*([\s\S]+)/i);
	const explanation = match?.[1]?.trim() ?? "";
	return explanation ? normalizeWhitespace(explanation) : null;
}

function extractOptionsFromText(value: string): string[] {
	const labels = findOptionLabels(value);
	if (labels.length < 2) return [];

	const byLabel = new Map<string, string>();
	for (let index = 0; index < labels.length; index += 1) {
		const label = labels[index];
		if (!label || byLabel.has(label.label)) continue;

		const next = labels[index + 1];
		const rawOption = value.slice(label.valueStart, next?.start ?? value.length);
		const option = cleanOption(stripAnswerAndExplanation(rawOption));
		if (option) byLabel.set(label.label, option);
	}

	const expectedLabels = optionLabelsAreNumbered(labels) ? ["1", "2", "3", "4"] : ["A", "B", "C", "D"];

	return expectedLabels
		.map((label) => byLabel.get(label))
		.filter((option): option is string => Boolean(option));
}

function normalizeQuestionType(value: unknown): GeneratedQuestionType {
	const type = asTrimmedString(value).toLowerCase();
	return type === "integer" ? "integer" : "mcq";
}

function normalizeCorrectAnswer(value: unknown, options: string[], type: GeneratedQuestionType, keepUnmatched = false): string | null {
	const raw = asTrimmedString(value);
	if (!raw) return null;

	const letterMatch = raw.match(/^\(?([A-Da-d])\)?(?:[).:-])?$/);
	if (letterMatch && type === "mcq") {
		const label = letterMatch[1];
		if (!label) return keepUnmatched ? raw : null;
		const index = label.toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
		return options[index] ?? (keepUnmatched ? raw : null);
	}

	const withLeadingLetter = raw.match(/^\(?([A-Da-d])\)?[).:-]\s*(.+)$/);
	if (withLeadingLetter && type === "mcq") {
		const label = withLeadingLetter[1];
		if (!label) return keepUnmatched ? cleanOption(raw) || raw : null;
		const index = label.toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
		return options[index] ?? (keepUnmatched ? cleanOption(raw) || raw : null);
	}

	const cleaned = cleanOption(raw);
	if (!cleaned) return null;

	if (type === "integer") return cleaned;

	return options.find((option) => option === cleaned)
		?? options.find((option) => option.toLowerCase() === cleaned.toLowerCase())
		?? (keepUnmatched ? cleaned : null);
}

function parseManualQuestion(originalText: string): SafeGeneratedQuestion {
	const options = uniqueOptionList(extractOptionsFromText(originalText));
	const question = cleanQuestionText(originalText) || firstSentence(originalText);

	return {
		question,
		options,
		correct_answer: normalizeCorrectAnswer(extractRawAnswer(originalText), options, "mcq"),
		explanation: extractExplanation(originalText),
		type: "mcq",
		has_image: detectImageWords(originalText),
		raw_text: originalText,
	};
}

function normalizeGeneratedQuestion(rawValue: unknown, originalText: string): SafeGeneratedQuestion {
	const record = getQuestionRecord(rawValue) ?? {};
	const type = normalizeQuestionType(record.type);
	const extractedOptions = type === "mcq" ? uniqueOptionList(extractOptionsFromText(originalText)) : [];
	const geminiOptions = type === "mcq" ? cleanOptions(record.options) : [];
	const options = type === "mcq" ? extractedOptions : [];
	const rawQuestion = asTrimmedString(record.question) || asTrimmedString(record.prompt);
	const rawExplanation = record.explanation ?? record.solution;
	const geminiOptionsMismatch = type === "mcq" && geminiOptions.length > 0 && !optionListsMatch(geminiOptions, extractedOptions);

	if (geminiOptionsMismatch) {
		console.warn("Ignoring Gemini-generated options due to mismatch with source text", {
			extracted_options: extractedOptions,
			gemini_options: geminiOptions,
			text_preview: originalText.slice(0, 300),
		});
	}

	return {
		question: cleanQuestionText(rawQuestion),
		options,
		correct_answer: normalizeCorrectAnswer(
			record.correct_answer ?? record.correctAnswer ?? record.correct_option ?? record.answer,
			extractedOptions,
			type,
			true,
		),
		explanation: asTrimmedString(rawExplanation) ? normalizeWhitespace(asTrimmedString(rawExplanation)) : null,
		type,
		has_image: Boolean(record.has_image) || detectImageWords(originalText) || detectImageWords(rawQuestion),
		raw_text: originalText,
	};
}

function applyManualFallback(candidate: SafeGeneratedQuestion, originalText: string): SafeGeneratedQuestion {
	const manual = parseManualQuestion(originalText);
	const options = manual.options;
	const type = candidate.type === "integer" && options.length === 0 ? "integer" : "mcq";
	const question = !hasOptionLabel(candidate.question) && candidate.question ? candidate.question : manual.question;
	const rawAnswer = candidate.correct_answer ?? extractRawAnswer(originalText);

	return {
		question: cleanQuestionText(question) || manual.question,
		options: type === "mcq" ? options : [],
		correct_answer: normalizeCorrectAnswer(rawAnswer, type === "mcq" ? options : [], type),
		explanation: candidate.explanation || manual.explanation,
		type,
		has_image: candidate.has_image || manual.has_image,
		raw_text: originalText,
	};
}

function shouldUseManualFallback(candidate: SafeGeneratedQuestion, originalText: string, errors: string[]): boolean {
	if (errors.length > 0) return true;

	const sourceOptions = uniqueOptionList(extractOptionsFromText(originalText));
	if (candidate.type === "integer") {
		return sourceOptions.length > 0;
	}

	return sourceOptions.length !== 4 || !optionListsMatch(candidate.options, sourceOptions);
}

function validateGeneratedQuestion(question: SafeGeneratedQuestion): string[] {
	const errors: string[] = [];

	if (!question.question.trim()) {
		errors.push("question is empty");
	}
	if (hasOptionLabel(question.question)) {
		errors.push("question contains option labels");
	}
	if (question.type !== "mcq" && question.type !== "integer") {
		errors.push("type must be mcq or integer");
	}

	if (question.type === "mcq") {
		if (!Array.isArray(question.options) || question.options.length !== 4) {
			errors.push("mcq options must contain exactly 4 strings");
		}
		if (question.options.some((option) => typeof option !== "string" || option.trim() === "")) {
			errors.push("mcq options must be non-empty strings");
		}
		if (question.options.some(hasOptionLabel)) {
			errors.push("options contain option labels");
		}
		if (hasDuplicateOptions(question.options)) {
			errors.push("mcq options must be unique");
		}
		if (question.options.length === 4 && question.options.every((option, index) => option.trim().toUpperCase() === ["A", "B", "C", "D"][index])) {
			errors.push("options are only labels");
		}
		if (question.options.length < 4) {
			errors.push("fewer than 4 options extracted from source text");
		}
		if (question.correct_answer !== null && !question.options.includes(question.correct_answer)) {
			errors.push("correct_answer does not match any option");
		}
	}

	return errors;
}

function getGeminiApiKey(env: Env): string {
	const key = env.GEMINI_API_KEY?.trim() || (typeof process !== "undefined" ? process.env?.GEMINI_API_KEY?.trim() : undefined);
	if (key) {
		return key;
	}
	throw new Error("GEMINI_API_KEY is not configured. Please set GEMINI_API_KEY in Cloudflare Worker secrets or environment variables.");
}

function buildGeminiPrompt(text: string): string {
	return `You are an expert exam question parser.

Convert the raw OCR/text into one clean JSON object only.

Rules:
- question: main question only, no A./B./C./D. options.
- options: actual option values only. For MCQ, return exactly 4 option strings.
- options must be copied from INPUT TEXT only; never invent or rewrite options.
- options must be unique after trimming.
- Standardize option symbols by using \u2264 for <= and \u2265 for >=.
- correct_answer: null if missing. If answer is A/B/C/D, map it to the option text.
- explanation: null if empty or missing.
- type: "mcq" or "integer".
- has_image: true when diagram, figure, graph, chart, table, or image is present.
- Preserve math symbols exactly.

Return only:
{"question":"","options":[],"correct_answer":null,"explanation":null,"type":"mcq","has_image":false}

INPUT TEXT:
${text}`;
}

async function callGeminiQuestionParser(text: string, env: Env): Promise<unknown | null> {
	const apiKey = env.GEMINI_API_KEY?.trim();
	if (!apiKey) return null;

	const model = env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
	try {
		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				contents: [
					{
						parts: [
							{
								text: buildGeminiPrompt(text),
							},
						],
					},
				],
				generationConfig: {
					responseMimeType: "application/json",
				},
			}),
		});

		if (!response.ok) {
			console.warn("Gemini question parser failed", {
				status: response.status,
				details: await response.text(),
			});
			return null;
		}

		const payload = asRecord(await response.json());
		const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
		const firstCandidate = asRecord(candidates[0]);
		const content = asRecord(firstCandidate?.content);
		const parts = Array.isArray(content?.parts) ? content.parts : [];
		const responseText = parts
			.map((part) => asTrimmedString(asRecord(part)?.text))
			.filter(Boolean)
			.join("\n");

		return responseText ? parseJsonLike(responseText) : null;
	} catch (error) {
		console.warn("Gemini question parser failed", error instanceof Error ? error.message : error);
		return null;
	}
}

function base64ToBytes(value: string): Uint8Array {
	const base64 = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}

async function decompressDeflate(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function compressDeflate(data: Uint8Array): Promise<Uint8Array> {
	const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readUint32(data: Uint8Array, offset: number): number {
	const b0 = data[offset] ?? 0;
	const b1 = data[offset + 1] ?? 0;
	const b2 = data[offset + 2] ?? 0;
	const b3 = data[offset + 3] ?? 0;

	return (
		(b0 << 24) |
		(b1 << 16) |
		(b2 << 8) |
		b3
	) >>> 0;
}

function writeUint32(data: Uint8Array, offset: number, value: number): void {
	data[offset] = (value >>> 24) & 255;
	data[offset + 1] = (value >>> 16) & 255;
	data[offset + 2] = (value >>> 8) & 255;
	data[offset + 3] = value & 255;
}

function paeth(left: number, above: number, upperLeft: number): number {
	const estimate = left + above - upperLeft;
	const leftDistance = Math.abs(estimate - left);
	const aboveDistance = Math.abs(estimate - above);
	const upperLeftDistance = Math.abs(estimate - upperLeft);

	if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
	if (aboveDistance <= upperLeftDistance) return above;
	return upperLeft;
}

function unfilterScanline(filter: number, row: Uint8Array, previous: Uint8Array, bytesPerPixel: number): Uint8Array {
	const output = new Uint8Array(row.length);

	for (let index = 0; index < row.length; index += 1) {
		const value = row[index] ?? 0;
		const left = index >= bytesPerPixel ? output[index - bytesPerPixel] ?? 0 : 0;
		const above = previous[index] ?? 0;
		const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] ?? 0 : 0;

		if (filter === 0) output[index] = value;
		else if (filter === 1) output[index] = (value + left) & 255;
		else if (filter === 2) output[index] = (value + above) & 255;
		else if (filter === 3) output[index] = (value + Math.floor((left + above) / 2)) & 255;
		else if (filter === 4) output[index] = (value + paeth(left, above, upperLeft)) & 255;
		else throw new Error(`Unsupported PNG filter: ${filter}`);
	}

	return output;
}

async function decodePng(data: Uint8Array): Promise<PngImage> {
	if (!PNG_SIGNATURE.every((byte, index) => data[index] === byte)) {
		throw new Error("page_image must be a PNG image");
	}

	let offset = PNG_SIGNATURE.length;
	let width = 0;
	let height = 0;
	let bitDepth = 0;
	let colorType = 0;
	let interlace = 0;
	const idatChunks: Uint8Array[] = [];

	while (offset < data.length) {
		const length = readUint32(data, offset);
		const type = String.fromCharCode(...data.slice(offset + 4, offset + 8));
		const chunkData = data.slice(offset + 8, offset + 8 + length);
		offset += 12 + length;

		if (type === "IHDR") {
			width = readUint32(chunkData, 0);
			height = readUint32(chunkData, 4);
			bitDepth = chunkData[8] ?? 0;
			colorType = chunkData[9] ?? 0;
			interlace = chunkData[12] ?? 0;
		} else if (type === "IDAT") {
			idatChunks.push(chunkData);
		} else if (type === "IEND") {
			break;
		}
	}

	if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
		throw new Error("Only non-interlaced 8-bit RGB/RGBA PNG images are supported");
	}

	const sourceBytesPerPixel = colorType === 6 ? 4 : 3;
	const idatLength = idatChunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const idat = new Uint8Array(idatLength);
	let idatOffset = 0;
	for (const chunk of idatChunks) {
		idat.set(chunk, idatOffset);
		idatOffset += chunk.length;
	}

	const inflated = await decompressDeflate(idat);
	const rowLength = width * sourceBytesPerPixel;
	const rgba = new Uint8Array(width * height * 4);
	let inputOffset = 0;
	let previous: Uint8Array<ArrayBufferLike> = new Uint8Array(rowLength);

	for (let y = 0; y < height; y += 1) {
		const filter = inflated[inputOffset] ?? 0;
		const row = inflated.slice(inputOffset + 1, inputOffset + 1 + rowLength);
		const unfiltered = unfilterScanline(filter, row, previous, sourceBytesPerPixel);
		inputOffset += 1 + rowLength;
		previous = unfiltered;

		for (let x = 0; x < width; x += 1) {
			const source = x * sourceBytesPerPixel;
			const target = (y * width + x) * 4;
			rgba[target] = unfiltered[source] ?? 0;
			rgba[target + 1] = unfiltered[source + 1] ?? 0;
			rgba[target + 2] = unfiltered[source + 2] ?? 0;
			rgba[target + 3] = colorType === 6 ? unfiltered[source + 3] ?? 255 : 255;
		}
	}

	return { width, height, rgba };
}

function makeCrcTable(): Uint32Array {
	const table = new Uint32Array(256);

	for (let index = 0; index < 256; index += 1) {
		let value = index;
		for (let bit = 0; bit < 8; bit += 1) {
			value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[index] = value >>> 0;
	}

	return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;

	for (const byte of data) {
		crc = (CRC_TABLE[(crc ^ byte) & 255] ?? 0) ^ (crc >>> 8);
	}

	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
	const typeBytes = new TextEncoder().encode(type);
	const chunk = new Uint8Array(12 + data.length);

	writeUint32(chunk, 0, data.length);
	chunk.set(typeBytes, 4);
	chunk.set(data, 8);
	writeUint32(chunk, 8 + data.length, crc32(chunk.slice(4, 8 + data.length)));

	return chunk;
}

async function encodePng(image: PngImage): Promise<Uint8Array> {
	const ihdr = new Uint8Array(13);
	writeUint32(ihdr, 0, image.width);
	writeUint32(ihdr, 4, image.height);
	ihdr[8] = 8;
	ihdr[9] = 6;
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	const rowLength = image.width * 4;
	const raw = new Uint8Array((rowLength + 1) * image.height);

	for (let y = 0; y < image.height; y += 1) {
		const rowStart = y * (rowLength + 1);
		raw[rowStart] = 0;
		raw.set(image.rgba.slice(y * rowLength, (y + 1) * rowLength), rowStart + 1);
	}

	const idat = await compressDeflate(raw);
	const chunks = [
		PNG_SIGNATURE,
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", idat),
		pngChunk("IEND", new Uint8Array()),
	];
	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const png = new Uint8Array(totalLength);
	let offset = 0;

	for (const chunk of chunks) {
		png.set(chunk, offset);
		offset += chunk.length;
	}

	return png;
}

async function cropPng(pageImage: string, bbox: BBox): Promise<Uint8Array> {
	const source = await decodePng(base64ToBytes(pageImage));
	const x1 = Math.max(0, Math.floor(Math.min(bbox[0], bbox[2])));
	const y1 = Math.max(0, Math.floor(Math.min(bbox[1], bbox[3])));
	const x2 = Math.min(source.width, Math.ceil(Math.max(bbox[0], bbox[2])));
	const y2 = Math.min(source.height, Math.ceil(Math.max(bbox[1], bbox[3])));
	const width = x2 - x1;
	const height = y2 - y1;

	if (width <= 0 || height <= 0) {
		throw new Error("bbox is outside the page image");
	}

	const rgba = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const sourceOffset = ((y1 + y) * source.width + x1 + x) * 4;
			const targetOffset = (y * width + x) * 4;
			rgba.set(source.rgba.slice(sourceOffset, sourceOffset + 4), targetOffset);
		}
	}

	return encodePng({ width, height, rgba });
}

async function buildQuestionRows(payload: NormalizedRequest, env: Env, origin: string) {
	const rows = [];
	const imageErrors: Array<{ index: number; error: string }> = [];

	for (const [index, question] of payload.questions.entries()) {
		let imageUrl: string | null = typeof question.image_url === "string" && question.image_url.trim() ? question.image_url.trim() : null;

		if (imageUrl && imageUrl.startsWith("http://127.0.0.1") || (imageUrl && imageUrl.startsWith("http://localhost"))) {
			try {
				const parsed = new URL(imageUrl);
				imageUrl = parsed.pathname + parsed.search;
			} catch {
				// Keep raw URL if unparseable
			}
		}

		if (!imageUrl && question.has_image && question.bbox && question.page_image) {
			try {
				const key = `diagrams/${payload.set_id}/q_${index + 1}.png`;
				const png = await cropPng(question.page_image, question.bbox);
				if (env.R2_BUCKET) {
					await env.R2_BUCKET.put(key, png, {
						httpMetadata: {
							contentType: "image/png",
						},
					});
				}
				imageUrl = `/api/pdf/diagram/${payload.set_id}/q_${index + 1}.png`;
			} catch (error) {
				imageErrors.push({
					index: index + 1,
					error: error instanceof Error ? error.message : "Image crop failed",
				});
			}
		}

		rows.push({
			set_id: payload.set_id,
			position: index + 1,
			question: question.question,
			options: question.options,
			type: question.type,
			correct_answer: question.correct_answer,
			explanation: question.explanation,
			image_url: imageUrl,
		});
	}

	return { rows, imageErrors };
}

async function insertQuestions(rows: unknown[], env: Env, authToken?: string | null) {
	const { url: supabaseUrl, serviceKey } = getSupabaseConfig(env);
	const authHeader = authToken ? `Bearer ${authToken}` : `Bearer ${serviceKey}`;
	const response = await fetch(`${supabaseUrl}/rest/v1/questions`, {
		method: "POST",
		headers: {
			apikey: serviceKey,
			Authorization: authHeader,
			"Content-Type": "application/json",
			Prefer: "return=representation",
		},
		body: JSON.stringify(rows),
	});

	if (!response.ok) {
		const details = await response.text();
		return {
			ok: false as const,
			status: response.status,
			details,
		};
	}

	return {
		ok: true as const,
		data: (await response.json()) as unknown[],
	};
}

async function doesSetIdExist(setId: number, env: Env): Promise<boolean> {
	const { url: supabaseUrl, serviceKey } = getSupabaseConfig(env);
	const response = await fetch(`${supabaseUrl}/rest/v1/questions?select=set_id&set_id=eq.${setId}&limit=1`, {
		headers: {
			apikey: serviceKey,
			Authorization: `Bearer ${serviceKey}`,
		},
	});

	if (!response.ok) {
		throw new Error(`Unable to verify set_id ${setId}.`);
	}

	const rows = await response.json() as Array<{ set_id?: number }>;
	return rows.length > 0;
}

async function getNextSetId(env: Env): Promise<number> {
	const { url: supabaseUrl, serviceKey } = getSupabaseConfig(env);
	const response = await fetch(`${supabaseUrl}/rest/v1/questions?select=set_id&order=set_id.desc&limit=1`, {
		headers: {
			apikey: serviceKey,
			Authorization: `Bearer ${serviceKey}`,
		},
	});

	if (!response.ok) {
		throw new Error("Unable to generate next set_id.");
	}

	const rows = await response.json() as Array<{ set_id?: number }>;
	const currentMax = rows[0]?.set_id;
	return typeof currentMax === "number" && Number.isFinite(currentMax) ? currentMax + 1 : 1;
}

async function getQuestionsBySetId(setId: number, env: Env, includeAnswers = false) {
	const { url: supabaseUrl, serviceKey } = getSupabaseConfig(env);
	const select = includeAnswers
		? "id,question,options,type,image_url,correct_answer,position"
		: "id,question,options,type,image_url,position";
	const response = await fetch(
		`${supabaseUrl}/rest/v1/questions?select=${select}&set_id=eq.${setId}&order=position.asc,id.asc`,
		{
			headers: {
				apikey: serviceKey,
				Authorization: `Bearer ${serviceKey}`,
			},
		},
	);

	if (!response.ok) {
		const details = await response.text();
		return {
			ok: false as const,
			status: response.status,
			details,
		};
	}

	return {
		ok: true as const,
		data: (await response.json()) as Array<{
			id: number;
			question: string;
			options: unknown;
			type: string;
			image_url: string | null;
			correct_answer?: string;
		}>,
	};
}

async function insertQuestionSetMetadata(setId: number, pdfName: string, questionCount: number, env: Env, authToken?: string | null) {
	const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, "");
	const authHeader = authToken ? `Bearer ${authToken}` : `Bearer ${env.SUPABASE_SERVICE_KEY}`;
	const response = await fetch(`${supabaseUrl}/rest/v1/question_sets`, {
		method: "POST",
		headers: {
			apikey: env.SUPABASE_SERVICE_KEY,
			Authorization: authHeader,
			"Content-Type": "application/json",
			Prefer: "return=representation",
		},
		body: JSON.stringify([
			{
				set_id: setId,
				pdf_name: pdfName,
				question_count: questionCount,
			},
		]),
	});

	if (!response.ok) {
		throw new Error("Unable to save question set metadata.");
	}

	return await response.json();
}

function getSupabaseConfig(env: Env) {
	const url = (env.SUPABASE_URL || "https://uwuzdggimbbbfgcauzho.supabase.co").replace(/\/$/, "");
	const serviceKey = env.SUPABASE_SERVICE_KEY || "sb_publishable_2hMbPMAYceagP86WVmzZEQ_BDkMMXLp";
	return { url, serviceKey };
}

async function getQuestionSets(env: Env) {
	const { url: supabaseUrl, serviceKey } = getSupabaseConfig(env);
	const response = await fetch(`${supabaseUrl}/rest/v1/question_sets?select=set_id,pdf_name,question_count,created_at&order=created_at.desc`, {
		headers: {
			apikey: serviceKey,
			Authorization: `Bearer ${serviceKey}`,
		},
	});

	if (!response.ok) {
		throw new Error("Unable to load question sets.");
	}

	return await response.json() as Array<{
		set_id: number;
		pdf_name: string;
		question_count: number;
		created_at: string;
	}>;
}

async function deleteQuestionSetHandler(request: Request, env: Env): Promise<Response> {
	if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
		return json({ error: "Supabase environment is not configured" }, 500);
	}

	const adminError = await requireApprovedAdmin(request, env);
	if (adminError) {
		return adminError;
	}

	const url = new URL(request.url);
	const rawSetId = url.searchParams.get("set_id");
	const setId = rawSetId === null ? null : resolveNumericSetId(rawSetId);
	if (setId === null) {
		return json({ error: "set_id query param is required and must be a number" }, 400);
	}

	const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, "");

	await fetch(`${supabaseUrl}/rest/v1/questions?set_id=eq.${setId}`, {
		method: "DELETE",
		headers: {
			apikey: env.SUPABASE_SERVICE_KEY,
			Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
		},
	});

	await fetch(`${supabaseUrl}/rest/v1/question_sets?set_id=eq.${setId}`, {
		method: "DELETE",
		headers: {
			apikey: env.SUPABASE_SERVICE_KEY,
			Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
		},
	});

	return json({ success: true, set_id: setId });
}

async function requireAuthenticatedUser(request: Request, env: Env): Promise<{ user?: { id: string }; response?: Response }> {
	const token = getBearerToken(request);
	if (!token) {
		return { response: json({ error: "Missing Authorization header" }, 401) };
	}

	const { url: supabaseUrl, serviceKey } = getSupabaseConfig(env);
	const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
		headers: {
			apikey: serviceKey,
			Authorization: `Bearer ${token}`,
		},
	});

	if (!userResponse.ok) {
		return { response: json({ error: "Invalid session" }, 401) };
	}

	const user = await userResponse.json() as { id?: string };
	if (!user.id) {
		return { response: json({ error: "Invalid session" }, 401) };
	}

	return { user: { id: user.id } };
}

async function requireApprovedAdmin(request: Request, env: Env): Promise<Response | null> {
	const authResult = await requireAuthenticatedUser(request, env);
	if (authResult.response) {
		return authResult.response;
	}

	const { url: supabaseUrl, serviceKey } = getSupabaseConfig(env);
	const profileResponse = await fetch(
		`${supabaseUrl}/rest/v1/profiles?select=role,approval_status&id=eq.${encodeURIComponent(authResult.user!.id)}&limit=1`,
		{
			headers: {
				apikey: serviceKey,
				Authorization: `Bearer ${serviceKey}`,
			},
		},
	);

	if (!profileResponse.ok) {
		return json({ error: "Unable to verify admin access" }, 500);
	}

	const profiles = await profileResponse.json() as Array<{ role?: string; approval_status?: string }>;
	const profile = profiles[0];
	if (!profile || profile.role !== "admin" || profile.approval_status !== "approved") {
		return json({ error: "Admin access required" }, 403);
	}

	return null;
}

async function addQuestion(request: Request, env: Env): Promise<Response> {
	if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
		return json({ success: false, error: "Supabase environment is not configured" }, 500);
	}
	if (!env.R2_BUCKET) {
		return json({ success: false, error: "R2 bucket binding is not configured" }, 500);
	}

	const adminError = await requireApprovedAdmin(request, env);
	if (adminError) {
		return adminError;
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: "Invalid JSON body" }, 400);
	}

	const payload = normalizeRequestBody(body);
	if (typeof payload === "string") {
		return json({ success: false, error: payload }, 400);
	}

	const origin = new URL(request.url).origin;
	const token = getBearerToken(request);
	const { rows, imageErrors } = await buildQuestionRows(payload, env, origin);
	const result = await insertQuestions(rows, env, token);

	if (!result.ok) {
		return json(
			{
				success: false,
				error: "Failed to insert questions",
				status: result.status,
				details: result.details,
				image_errors: imageErrors,
			},
			502,
		);
	}

	return json(
		{
			success: true,
			data: Array.isArray(body) || (typeof body === "object" && body !== null && Array.isArray((body as { questions?: unknown }).questions))
				? result.data
				: result.data[0] ?? null,
			image_errors: imageErrors,
		},
		201,
	);
}

async function createQuestionSet(request: Request, env: Env): Promise<Response> {
	if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
		return json({ success: false, error: "Supabase environment is not configured" }, 500);
	}
	if (!env.R2_BUCKET) {
		return json({ success: false, error: "R2 bucket binding is not configured" }, 500);
	}

	const adminError = await requireApprovedAdmin(request, env);
	if (adminError) {
		return adminError;
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: "Invalid JSON body" }, 400);
	}

	const payload = body as CreateQuestionSetRequest;
	const pdfName = asTrimmedString(payload.pdf_name);
	if (!pdfName) {
		return json({ success: false, error: "pdf_name is required" }, 400);
	}

	const normalizedBody = normalizeRequestBody({
		set_id: payload.set_id ?? await getNextSetId(env),
		questions: payload.questions,
	});
	if (typeof normalizedBody === "string") {
		return json({ success: false, error: normalizedBody }, 400);
	}

	const origin = new URL(request.url).origin;
	const token = getBearerToken(request);
	const { rows, imageErrors } = await buildQuestionRows(normalizedBody, env, origin);
	const result = await insertQuestions(rows, env, token);

	if (!result.ok) {
		return json(
			{
				success: false,
				error: "Failed to insert questions",
				status: result.status,
				details: result.details,
				image_errors: imageErrors,
			},
			502,
		);
	}

	await insertQuestionSetMetadata(resolveNumericSetId(normalizedBody.set_id) ?? 0, pdfName, result.data.length, env, token);

	return json({
		success: true,
		set_id: resolveNumericSetId(normalizedBody.set_id),
		pdf_name: pdfName,
		question_count: result.data.length,
		image_errors: imageErrors,
	}, 201);
}

async function getR2Object(pathname: string, env: Env): Promise<Response> {
	const key = pathname.replace(/^\/+/, "");
	const object = await env.R2_BUCKET.get(key);

	if (!object) {
		return json({ error: "Not found" }, 404);
	}

	return new Response(object.body, {
		headers: {
			"Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname.replace(/\/$/, "") || "/";

		console.log("PATH:", url.pathname);
		console.log("NORMALIZED:", path);
		console.log("METHOD:", request.method);

		if (request.method === "GET" && path === "/") {
			return new Response("Backend is running", {
				headers: {
					"Content-Type": "text/plain; charset=utf-8",
				},
			});
		}

		if (request.method === "GET" && path === "/hello") {
			return json({
				message: "Hello from backend",
			});
		}

		if (request.method === "GET" && path === "/question-sets") {
			const sets = await getQuestionSets(env);
			return json(sets);
		}

		if (request.method === "GET" && path === "/get-questions") {
			const rawSetId = url.searchParams.get("set_id");
			const setId = rawSetId === null ? null : resolveNumericSetId(rawSetId);
			if (setId === null) {
				return json({ error: "set_id query param is required and must be a number" }, 400);
			}

			const includeAnswers = url.searchParams.get("include_answers") === "true";
			if (includeAnswers) {
				const adminError = await requireApprovedAdmin(request, env);
				if (adminError) {
					return adminError;
				}
			}

			const result = await getQuestionsBySetId(setId, env, includeAnswers);
			if (!result.ok) {
				return json(
					{
						error: "Failed to fetch questions",
						status: result.status,
						details: result.details,
					},
					502,
				);
			}

			const cleanedData = result.data.map((q) => ({
				...q,
				image_url: q.image_url ? q.image_url.replace(/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::8787)?/i, "") : null,
			}));
			return json(cleanedData);
		}

		if ((request.method === "DELETE" || request.method === "POST") && path === "/delete-question-set") {
			return deleteQuestionSetHandler(request, env);
		}

		if (request.method === "GET" && path.startsWith("/sets/")) {
			return getR2Object(path, env);
		}

		if (path === "/generate-question" && request.method === "POST") {
			try {
				const body = asRecord(await request.json()) ?? {};
				const text = typeof body.text === "string" ? body.text.trim() : "";

				if (!text) {
					const invalidResponse: GeneratedQuestionResponse = {
						question: "",
						options: [],
						correct_answer: null,
						explanation: null,
						type: "mcq",
						has_image: false,
						raw_text: text,
						invalid: true,
						skipped: true,
						errors: ["text is empty"],
					};
					console.warn("Skipped invalid generated question", invalidResponse);
					return json(invalidResponse, 200);
				}

				const providedGeminiResponse = body.gemini_response ?? body.geminiResponse ?? body.response;
				const geminiResponse = providedGeminiResponse ?? await callGeminiQuestionParser(text, env);
				const generatedQuestion = normalizeGeneratedQuestion(geminiResponse, text);
				const initialErrors = validateGeneratedQuestion(generatedQuestion);
				const safeQuestion = shouldUseManualFallback(generatedQuestion, text, initialErrors)
					? applyManualFallback(generatedQuestion, text)
					: generatedQuestion;
				const errors = validateGeneratedQuestion(safeQuestion);

				if (errors.length > 0) {
					const invalidResponse: GeneratedQuestionResponse = {
						...safeQuestion,
						invalid: true,
						skipped: true,
						errors,
					};
					console.warn("Skipped invalid generated question", {
						errors,
						text_preview: text.slice(0, 300),
						question: safeQuestion.question,
						options: safeQuestion.options,
					});
					return json(invalidResponse, 200);
				}

				return json(safeQuestion);
			} catch {
				return Response.json({ error: "Invalid JSON" }, { status: 400 });
			}
		}

		if (request.method === "POST" && path === "/add-question") {
			return addQuestion(request, env);
		}

		if (request.method === "POST" && path === "/create-question-set") {
			return createQuestionSet(request, env);
		}

		if (request.method === "GET" && (path.startsWith("/api/pdf/diagram/") || path.startsWith("/pdf/diagram/"))) {
			try {
				const relPath = path.replace(/^\/(?:api\/)?pdf\/diagram\//, "");
				const parts = relPath.split("/");
				const setId = parts[0] ?? "";
				const filename = parts.length > 1 ? parts.slice(1).join("/") : parts[0] ?? "";

				const candidateKeys = [
					`diagrams/${setId}/${filename}`,
					`diagrams/${filename}`,
					`${setId}/${filename}`,
					relPath,
					filename,
					`images/${filename}`,
				];

				let object: R2ObjectBody | null = null;
				for (const key of candidateKeys) {
					try {
						const res = await env.R2_BUCKET.get(key);
						if (res) {
							object = res;
							break;
						}
					} catch {
						// Continue candidate keys search
					}
				}

				if (object) {
					const headers = new Headers();
					object.writeHttpMetadata(headers);
					headers.set("etag", object.httpEtag);
					const isJpg = relPath.endsWith(".jpg") || relPath.endsWith(".jpeg");
					headers.set("Content-Type", object.httpMetadata?.contentType || (isJpg ? "image/jpeg" : "image/png"));
					headers.set("Access-Control-Allow-Origin", "*");
					headers.set("Cache-Control", "public, max-age=31536000, immutable");

					return new Response(object.body, { headers });
				}

				// Fallback to Supabase Storage exam-assets bucket
				const supabaseStorageUrls = [
					`https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/${relPath}`,
					`https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/${filename}`,
					`https://uwuzdggimbbbfgcauzho.supabase.co/storage/v1/object/public/exam-assets/images/${filename}`,
				];

				for (const sUrl of supabaseStorageUrls) {
					try {
						const supRes = await fetch(sUrl);
						if (supRes.ok) {
							const bytes = await supRes.arrayBuffer();
							const headers = new Headers();
							const isJpg = relPath.endsWith(".jpg") || relPath.endsWith(".jpeg");
							headers.set("Content-Type", supRes.headers.get("content-type") || (isJpg ? "image/jpeg" : "image/png"));
							headers.set("Access-Control-Allow-Origin", "*");
							headers.set("Cache-Control", "public, max-age=31536000, immutable");
							return new Response(bytes, { headers });
						}
					} catch {
						// Continue fallback search
					}
				}

				return Response.json({ error: `Diagram not found: ${relPath}` }, { status: 404 });
			} catch (err) {
				return Response.json({ error: err instanceof Error ? err.message : "Diagram fetch error" }, { status: 500 });
			}
		}

		// CBT Windows & Desktop Gateway Routes
		if (request.method === "POST" && path === "/cbt/device/register") {
			const authResult = await requireAuthenticatedUser(request, env);
			if (authResult.response) {
				return authResult.response;
			}
			return registerDeviceHandler(request, env, authResult.user!.id);
		}

		if (request.method === "POST" && path === "/cbt/session/start") {
			const authResult = await requireAuthenticatedUser(request, env);
			if (authResult.response) {
				return authResult.response;
			}
			return startCbtSessionHandler(request, env, authResult.user!.id);
		}

		if (request.method === "POST" && path === "/cbt/sync/batch") {
			const authResult = await requireAuthenticatedUser(request, env);
			if (authResult.response) {
				return authResult.response;
			}
			return syncBatchHandler(request, env, authResult.user!.id);
		}

		if (request.method === "POST" && path === "/cbt/audit/log") {
			const authResult = await requireAuthenticatedUser(request, env);
			if (authResult.response) {
				return authResult.response;
			}
			return auditLogHandler(request, env, authResult.user!.id);
		}

		if (request.method === "POST" && path === "/cbt/admin/recovery") {
			const adminError = await requireApprovedAdmin(request, env);
			if (adminError) {
				return adminError;
			}
			return adminRecoveryHandler(request, env);
		}

		if (request.method === "GET" && (path === "/api/version" || path === "/version")) {
			return json({
				latestVersion: "1.2.0",
				minRequiredVersion: "1.0.0",
				downloadUrl: "https://miitjee.com",
				forceUpdate: false,
				releaseNotes: "Updated web app icon to match Android, fixed question set deletion, and performance improvements.",
				title: "New Update Available! 🚀"
			});
		}

		return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
	},
};
