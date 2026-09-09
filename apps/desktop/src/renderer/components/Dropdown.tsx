import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { ChevronRightIcon } from "./icons";

export interface DropdownOption {
  value: string;
  label: string;
  hint?: string;
  group?: string;
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
  const [openUp, setOpenUp] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value);

  function handleToggle() {
    if (!open) {
      const trigger = triggerRef.current;
      if (trigger) {
        const rect = trigger.getBoundingClientRect();
        setOpenUp(window.innerHeight - rect.bottom < 320);
      }
    }
    setOpen(!open);
  }

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
      `${option.label} ${option.hint ?? ""} ${option.group ?? ""}`.toLowerCase().includes(keyword),
    );
  }, [options, query]);

  const groups = useMemo(() => {
    const grouped = new Map<string, DropdownOption[]>();
    for (const option of filtered) {
      const key = option.group ?? "";
      const list = grouped.get(key) ?? [];
      list.push(option);
      grouped.set(key, list);
    }
    return Array.from(grouped, ([name, items]) => ({ name: name || undefined, items }));
  }, [filtered]);

  return (
    <Root ref={rootRef}>
      <Trigger ref={triggerRef} type="button" disabled={disabled} $open={open} onClick={handleToggle}>
        <Value $muted={!selected}>{selected ? selected.label : placeholder}</Value>
        {selected?.hint && <Hint>{selected.hint}</Hint>}
        <Chevron $open={open}>
          <ChevronRightIcon />
        </Chevron>
      </Trigger>

      {open && (
        <Menu $up={openUp}>
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
            {groups.map((group) => (
              <Fragment key={group.name ?? "__ungrouped__"}>
                {group.name && <GroupHeader>{group.name}</GroupHeader>}
                {group.items.map((option) => (
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
              </Fragment>
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
  gap: ${({ theme }) => theme.spaces["2.5"]};
  width: 100%;
  padding: ${({ theme }) => theme.spaces["3"]} ${({ theme }) => theme.spaces["3.5"]};
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

const Menu = styled.div<{ $up?: boolean }>`
  position: absolute;
  ${({ $up }) => ($up ? "bottom: calc(100% + 8px);" : "top: calc(100% + 8px);")}
  left: 0;
  right: 0;
  z-index: ${({ theme }) => theme.z.dropdown};
  padding: ${({ theme }) => theme.spaces["2"]};
  border-radius: ${({ theme }) => theme.radius.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.bg};
  box-shadow: ${({ theme }) => theme.shadow.lg};
`;

const Search = styled.input`
  width: 100%;
  margin-bottom: ${({ theme }) => theme.spaces["2"]};
  padding: ${({ theme }) => theme.spaces["2.5"]} ${({ theme }) => theme.spaces["3"]};
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
  gap: ${({ theme }) => theme.spaces["0.5"]};
`;

const Item = styled.button<{ $selected?: boolean; $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spaces["2.5"]};
  width: 100%;
  padding: ${({ theme }) => theme.spaces["2.5"]} ${({ theme }) => theme.spaces["3"]};
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
  padding: ${({ theme }) => theme.spaces["4"]};
  text-align: center;
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 13px;
`;

const GroupHeader = styled.div`
  padding: ${({ theme }) => theme.spaces["2"]} ${({ theme }) => theme.spaces["3"]} ${({ theme }) => theme.spaces["1"]};
  color: ${({ theme }) => theme.colors.textDim};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;
