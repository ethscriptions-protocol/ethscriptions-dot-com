import { ChangeEvent, ReactNode, useCallback } from "react";

export interface CommonInputProps<T = string> {
  value: T;
  onChange: (newValue: T) => void;
  name?: string;
  placeholder?: string;
}

type InputBaseProps<T> = CommonInputProps<T> & {
  error?: boolean;
  disabled?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
};

export const InputBase = <T extends { toString: () => string } = string>({
  name,
  value,
  onChange,
  placeholder,
  error,
  disabled,
  prefix,
  suffix,
}: InputBaseProps<T>) => {
  let modifier = "";
  if (error) {
    modifier = "border-error";
  } else if (disabled) {
    modifier = "border-disabled bg-base-300";
  }

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value as unknown as T);
    },
    [onChange],
  );

  return (
    <div className={`flex border border-gray-300 bg-gray-100 rounded-md text-gray-800 ${modifier}`}>
      {prefix}
      <input
        className="input input-ghost focus:outline-none focus:bg-transparent h-[2.2rem] min-h-[2.2rem] px-4 border w-full font-medium placeholder:text-gray/50 text-gray-800"
        placeholder={placeholder}
        name={name}
        value={value?.toString()}
        onChange={handleChange}
        disabled={disabled}
        autoComplete="off"
      />
      {suffix}
    </div>
  );
};
