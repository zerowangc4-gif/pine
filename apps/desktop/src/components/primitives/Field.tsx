/**
 * Form controls.
 *
 * Each one is a labelled row that reports its value through a plain callback,
 * so the configuration panel stays declarative and no control owns state.
 */

import type { ChangeEvent, ReactNode } from "react";
import styled from "styled-components";
import { Row, Stack, Text } from "./Surface.tsx";

// ---------------------------------------------------------------------------
// Shared shell
// ---------------------------------------------------------------------------

const Label = styled.label`
	display: flex;
	flex-direction: column;
	gap: ${({ theme }) => theme.space[1]};
	min-width: 0;
`;

const LabelText = styled.span`
	font-size: ${({ theme }) => theme.fontSize.sm};
	font-weight: ${({ theme }) => theme.fontWeight.medium};
	color: ${({ theme }) => theme.colors.text};
`;

const Hint = styled.span`
	font-size: ${({ theme }) => theme.fontSize.xs};
	color: ${({ theme }) => theme.colors.textFaint};
	line-height: ${({ theme }) => theme.lineHeight.normal};
`;

const inputStyles = `
	width: 100%;
	min-width: 0;
	border-radius: 4px;
	transition: border-color 120ms;
`;

const Input = styled.input<{ $mono?: boolean }>`
	${inputStyles}
	padding: ${({ theme }) => `${theme.space[2]} ${theme.space[2]}`};
	background: ${({ theme }) => theme.colors.background};
	border: 1px solid ${({ theme }) => theme.colors.border};
	color: ${({ theme }) => theme.colors.text};
	font-family: ${({ theme, $mono }) => ($mono ? theme.font.mono : theme.font.sans)};
	font-size: ${({ theme, $mono }) => ($mono ? theme.fontSize.sm : theme.fontSize.md)};

	&::placeholder {
		color: ${({ theme }) => theme.colors.textFaint};
	}
	&:hover:not(:disabled) {
		border-color: ${({ theme }) => theme.colors.borderStrong};
	}
	&:disabled {
		background: ${({ theme }) => theme.colors.sunken};
		color: ${({ theme }) => theme.colors.textFaint};
	}
`;

const TextArea = styled.textarea`
	${inputStyles}
	padding: ${({ theme }) => theme.space[2]};
	background: ${({ theme }) => theme.colors.background};
	border: 1px solid ${({ theme }) => theme.colors.border};
	color: ${({ theme }) => theme.colors.text};
	font-family: ${({ theme }) => theme.font.mono};
	font-size: ${({ theme }) => theme.fontSize.sm};
	line-height: ${({ theme }) => theme.lineHeight.normal};
	resize: vertical;

	&:hover:not(:disabled) {
		border-color: ${({ theme }) => theme.colors.borderStrong};
	}
`;

const Select = styled.select`
	${inputStyles}
	padding: ${({ theme }) => `${theme.space[2]} ${theme.space[2]}`};
	background: ${({ theme }) => theme.colors.background};
	border: 1px solid ${({ theme }) => theme.colors.border};
	color: ${({ theme }) => theme.colors.text};
	font-size: ${({ theme }) => theme.fontSize.md};
	cursor: pointer;

	&:hover:not(:disabled) {
		border-color: ${({ theme }) => theme.colors.borderStrong};
	}
`;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export interface TextFieldProps {
	label: string;
	value: string;
	onChange: (value: string) => void;
	hint?: string;
	placeholder?: string;
	/** Renders as a password box; the value is still sent in clear text. */
	secret?: boolean;
	mono?: boolean;
	disabled?: boolean;
}

export function TextField({ label, value, onChange, hint, placeholder, secret, mono, disabled }: TextFieldProps) {
	return (
		<Label>
			<LabelText>{label}</LabelText>
			<Input
				type={secret ? "password" : "text"}
				value={value}
				placeholder={placeholder}
				disabled={disabled}
				spellCheck={false}
				$mono={mono}
				onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
			/>
			{hint ? <Hint>{hint}</Hint> : null}
		</Label>
	);
}

export interface TextAreaFieldProps {
	label: string;
	value: string;
	onChange: (value: string) => void;
	rows?: number;
	hint?: string;
	placeholder?: string;
}

export function TextAreaField({ label, value, onChange, rows = 6, hint, placeholder }: TextAreaFieldProps) {
	return (
		<Label>
			<LabelText>{label}</LabelText>
			<TextArea
				value={value}
				rows={rows}
				placeholder={placeholder}
				spellCheck={false}
				onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
			/>
			{hint ? <Hint>{hint}</Hint> : null}
		</Label>
	);
}

// ---------------------------------------------------------------------------
// Number
// ---------------------------------------------------------------------------

export interface NumberFieldProps {
	label: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	hint?: string;
	disabled?: boolean;
}

export function NumberField({ label, value, onChange, min, max, step, hint, disabled }: NumberFieldProps) {
	return (
		<Label>
			<LabelText>{label}</LabelText>
			<Input
				type="number"
				value={Number.isFinite(value) ? value : 0}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				onChange={(event: ChangeEvent<HTMLInputElement>) => {
					const next = Number(event.target.value);
					// An empty or half-typed number must not become NaN in the config.
					onChange(Number.isFinite(next) ? next : 0);
				}}
			/>
			{hint ? <Hint>{hint}</Hint> : null}
		</Label>
	);
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

export interface SelectOption<T extends string> {
	value: T;
	label: string;
}

export interface SelectFieldProps<T extends string> {
	label: string;
	value: T;
	options: SelectOption<T>[];
	onChange: (value: T) => void;
	hint?: string;
	disabled?: boolean;
}

export function SelectField<T extends string>({
	label,
	value,
	options,
	onChange,
	hint,
	disabled,
}: SelectFieldProps<T>) {
	return (
		<Label>
			<LabelText>{label}</LabelText>
			<Select
				value={value}
				disabled={disabled}
				onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as T)}
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</Select>
			{hint ? <Hint>{hint}</Hint> : null}
		</Label>
	);
}

// ---------------------------------------------------------------------------
// Toggle
// ---------------------------------------------------------------------------

const ToggleTrack = styled.button<{ $on: boolean }>`
	position: relative;
	flex: 0 0 auto;
	width: 32px;
	height: 18px;
	padding: 0;
	border: 1px solid ${({ theme, $on }) => ($on ? theme.colors.accent : theme.colors.borderStrong)};
	border-radius: ${({ theme }) => theme.radius.pill};
	background: ${({ theme, $on }) => ($on ? theme.colors.accent : theme.colors.background)};
	cursor: pointer;
	transition: background ${({ theme }) => theme.duration.fast};

	&::after {
		content: "";
		position: absolute;
		top: 2px;
		left: ${({ $on }) => ($on ? "16px" : "2px")};
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: ${({ theme, $on }) => ($on ? theme.colors.textInverted : theme.colors.textMuted)};
		transition: left ${({ theme }) => theme.duration.fast};
	}

	&:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
`;

const ToggleRow = styled.div`
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: ${({ theme }) => theme.space[3]};
	min-width: 0;
`;

export interface ToggleFieldProps {
	label: string;
	value: boolean;
	onChange: (value: boolean) => void;
	hint?: string;
	disabled?: boolean;
}

export function ToggleField({ label, value, onChange, hint, disabled }: ToggleFieldProps) {
	return (
		<ToggleRow>
			<Stack $gap={1}>
				<LabelText>{label}</LabelText>
				{hint ? <Hint>{hint}</Hint> : null}
			</Stack>
			<ToggleTrack
				type="button"
				role="switch"
				aria-checked={value}
				aria-label={label}
				$on={value}
				disabled={disabled}
				onClick={() => onChange(!value)}
			/>
		</ToggleRow>
	);
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const ListItem = styled(Row)`
	& > input {
		flex: 1 1 auto;
	}
`;

export interface ListFieldProps {
	label: string;
	values: string[];
	onChange: (values: string[]) => void;
	placeholder?: string;
	hint?: string;
	addLabel: string;
	removeLabel: string;
}

/**
 * Editable list of strings, for directory lists and regex patterns.
 *
 * Rows are keyed by index because the values are user-editable free text with
 * no stable identity. Empty rows are kept while editing — removing a row the
 * moment it is cleared would fight the user's cursor.
 */
export function ListField({ label, values, onChange, placeholder, hint, addLabel, removeLabel }: ListFieldProps) {
	return (
		<Stack $gap={2}>
			<LabelText>{label}</LabelText>
			{values.map((entry, index) => (
				// eslint-disable-next-line react/no-array-index-key
				<ListItem key={index} $gap={2}>
					<Input
						value={entry}
						placeholder={placeholder}
						spellCheck={false}
						$mono
						onChange={(event: ChangeEvent<HTMLInputElement>) => {
							const next = [...values];
							next[index] = event.target.value;
							onChange(next);
						}}
					/>
					<RemoveButton
						type="button"
						aria-label={removeLabel}
						onClick={() => onChange(values.filter((_, position) => position !== index))}
					>
						×
					</RemoveButton>
				</ListItem>
			))}
			<AddButton type="button" onClick={() => onChange([...values, ""])}>
				+ {addLabel}
			</AddButton>
			{hint ? <Hint>{hint}</Hint> : null}
		</Stack>
	);
}

const RemoveButton = styled.button`
	flex: 0 0 auto;
	width: 24px;
	height: 24px;
	padding: 0;
	border: 1px solid ${({ theme }) => theme.colors.border};
	border-radius: ${({ theme }) => theme.radius.md};
	background: transparent;
	color: ${({ theme }) => theme.colors.textMuted};
	font-size: ${({ theme }) => theme.fontSize.lg};
	line-height: 1;
	cursor: pointer;

	&:hover {
		border-color: ${({ theme }) => theme.colors.danger};
		color: ${({ theme }) => theme.colors.danger};
	}
`;

const AddButton = styled.button`
	align-self: flex-start;
	padding: ${({ theme }) => `${theme.space[1]} ${theme.space[2]}`};
	border: 1px dashed ${({ theme }) => theme.colors.border};
	border-radius: ${({ theme }) => theme.radius.md};
	background: transparent;
	color: ${({ theme }) => theme.colors.textMuted};
	font-size: ${({ theme }) => theme.fontSize.sm};
	cursor: pointer;

	&:hover {
		border-color: ${({ theme }) => theme.colors.borderStrong};
		color: ${({ theme }) => theme.colors.text};
	}
`;

// ---------------------------------------------------------------------------
// Read-only display
// ---------------------------------------------------------------------------

export interface ReadOnlyFieldProps {
	label: string;
	children: ReactNode;
}

/** Labelled value for facts the user cannot edit, like a session id. */
export function ReadOnlyField({ label, children }: ReadOnlyFieldProps) {
	return (
		<Stack $gap={1}>
			<Text $size="xs" $tone="muted" $weight="medium">
				{label}
			</Text>
			{children}
		</Stack>
	);
}
