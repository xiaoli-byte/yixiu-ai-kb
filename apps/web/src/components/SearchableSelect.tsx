"use client";
// 兼容封装：可搜索的下拉选择，统一委托给 components/ui/Select（searchable + clearable）
// 保留原有 API，避免调用点改动；新代码建议直接用 Select
import { Select } from "@/components/ui/Select";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  placeholder: string;
  value: string;
  options: SearchableSelectOption[];
  loading?: boolean;
  onChange: (value: string) => void;
  className?: string;
}

export function SearchableSelect({
  placeholder,
  value,
  options,
  loading,
  onChange,
  className,
}: SearchableSelectProps) {
  return (
    <Select
      ariaLabel={placeholder}
      placeholder={placeholder}
      value={value}
      options={options}
      loading={loading}
      onChange={onChange}
      size="sm"
      searchable
      clearable
      className={className}
    />
  );
}
