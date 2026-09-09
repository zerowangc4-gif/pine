import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { ChevronRightIcon } from "./icons";

export interface DropdownOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}

export function Dropdown({ options, value, onChange, placeholder, disabled }: DropdownProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return options;
    }
    return options.filter((option) =>
      `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(keyword),
    );
  }, [options, query]);

  return (
    <Root ref={rootRef}>
      <Trigger type="button" disabled={disabled} $open={open} onClick={() => setOpen((isOpen) => !isOpen)}>
        <Value $muted={!selected}>{selected ? selected.label : placeholder}</Value>
        {selected?.hint && <Hint>{selected.hint}</Hint>}
        <Chevron $open={open}>
          <ChevronRightIcon />
        </Chevron>
      </Trigger>

      {open && (
        <Menu>
          {options.length > 8 && (
            <Search
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("common.search")}
            />
          )}
          <List>
            {filtered.length === 0 && <Empty>{t("login.noMatch")}</Empty>}
            {filtered.map((option) => (
              <Item
                key={option.value}
                $selected={option.value === value}
                $disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <Value>{option.label}</Value>
                {option.hint && <Hint>{option.hint}</Hint>}
              </Item>
            ))}
          </List>
        </Menu>
      )}
    </Root>
  );
}

const Root = styled.div`
  position: relative;
`;

const Trigger = styled.button<{ $open?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme, $open }) => ($open ? theme.colors.accent : theme.colors.border)};
  background: ${({ theme }) => theme.colors.surface2};
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text};
  text-align: left;
  transition: border-color ${({ theme }) => theme.transition.fast}, box-shadow ${({ theme }) => theme.transition.fast};

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.borderStrong};
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.accentSoft};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

const Value = styled.span<{ $muted?: boolean }>`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14.5px;
  color: ${({ theme, $muted }) => ($muted ? theme.colors.textDim : theme.colors.text)};
`;

const Hint = styled.span`
  flex: none;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 12px;
`;

const Chevron = styled.span<{ $open?: boolean }>`
  flex: none;
  display: inline-flex;
  color: ${({ theme }) => theme.colors.textDim};
  transition: transform ${({ theme }) => theme.transition.fast};
  transform: ${({ $open }) => ($open ? "rotate(90deg)" : "rotate(0deg)")};
`;

const Menu = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: ${({ theme }) => theme.z.dropdown};
  padding: 8px;
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bg};
  box-shadow: ${({ theme }) => theme.shadow.lg};
`;

const Search = styled.input`
  width: 100%;
  margin-bottom: 8px;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  outline: none;
  background: ${({ theme }) => theme.colors.surface2};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13.5px;

  &::placeholder {
    color: ${({ theme }) => theme.colors.textDim};
  }

  &:focus {
    border-color: ${({ theme }) => theme.colors.accent};
  }
`;

const List = styled.div`
  max-height: 280px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Item = styled.button<{ $selected?: boolean; $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  text-align: left;
  opacity: ${({ $disabled }) => ($disabled ? 0.45 : 1)};
  background: ${({ theme, $selected }) => ($selected ? theme.colors.accentSoft : "transparent")};
  color: ${({ theme, $selected }) => ($selected ? theme.colors.text : theme.colors.textMuted)};
  transition: background ${({ theme }) => theme.transition.fast};

  &:hover {
    background: ${({ theme, $disabled }) => ($disabled ? "transparent" : theme.colors.surfaceHover)};
  }
`;

const Empty = styled.div`
  padding: 16px;
  text-align: center;
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 13px;
`;
