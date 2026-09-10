import styled from "styled-components";

/**
 * Shared UI primitives. These are the single source of truth for the small
 * repeated controls used across features (modal actions, toggles, text fields).
 * Do not redefine them locally — import from here so the theme and spacing
 * stay consistent everywhere.
 */

// ── Buttons ─────────────────────────────────────────────────────────────

export const ModalButton = styled.button<{ $primary?: boolean; $danger?: boolean }>`
  padding: ${({ theme }) => `${theme.spaces["2"]} ${theme.spaces["4"]}`};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid
    ${({ theme, $primary, $danger }) => ($primary || $danger ? "transparent" : theme.colors.border)};
  background: ${({ theme, $primary, $danger }) =>
    $danger ? theme.colors.danger : $primary ? theme.gradients.accent : theme.colors.surface2};
  color: ${({ theme, $danger }) => ($danger ? theme.colors.accentText : theme.colors.text)};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity ${({ theme }) => theme.transition.fast};

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

// ── Toggle switch ───────────────────────────────────────────────────────

export const SwitchButton = styled.button<{ $on: boolean }>`
  flex: none;
  position: relative;
  width: 42px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: ${({ theme }) => theme.radius.full};
  background: ${({ theme, $on }) => ($on ? theme.colors.accent : theme.colors.borderStrong)};
  cursor: pointer;
  transition: background ${({ theme }) => theme.transition.fast};

  &:disabled {
    cursor: not-allowed;
    opacity: 0.75;
  }
`;

export const SwitchKnob = styled.span<{ $on: boolean }>`
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.accentText};
  transition: transform ${({ theme }) => theme.transition.fast};
  transform: ${({ $on }) => ($on ? "translateX(18px)" : "none")};
`;

// ── Form controls ───────────────────────────────────────────────────────

export const TextInput = styled.input`
  width: 100%;
  padding: ${({ theme }) => `${theme.spaces["2.5"]} ${theme.spaces["3.5"]}`};
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  outline: none;
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDim};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.accent};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.accentSoft};
  }
`;
